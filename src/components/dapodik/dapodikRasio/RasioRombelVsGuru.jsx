import React, { useState, useEffect, useMemo } from 'react';
import { 
  MapPin, 
  Info, 
  Search, 
  Download, 
  Loader2, 
  Activity, 
  Layers, 
  GraduationCap, 
  Users, 
  Sparkles, 
  X, 
  FileText,
  School,
  RefreshCw 
} from 'lucide-react';
import { db } from '../../../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import ExcelJS from 'exceljs';

// --- TAMBAHAN LIBRARY UNTUK AI & CETAK PDF ---
import { GoogleGenerativeAI } from "@google/generative-ai";
import html2pdf from 'html2pdf.js';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';

// Inisialisasi API Key Gemini
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
let genAI = null;
if (apiKey) {
  genAI = new GoogleGenerativeAI(apiKey);
}

// =====================================================================
// UTILITY FUNCTIONS & PENGELOMPOKAN
// =====================================================================
const KABUPATEN_LIST = [
  "BENGKAYANG", "KAPUAS HULU", "KAYONG UTARA", "KETAPANG", 
  "KUBU RAYA", "LANDAK", "MELAWI", "MEMPAWAH", "PONTIANAK", 
  "SAMBAS", "SANGGAU", "SEKADAU", "SINGKAWANG", "SINTANG"
];

// PETA KOLOM DISESUAIKAN DENGAN OUTPUT ADMIN MESIN KALKULASI
const COLUMN_MAP = {
  'SEMUA': ['PAUD', 'SD', 'SMP', 'SMA', 'SMK', 'SLB (Inklusif)', 'NON FORMAL'],
  'PAUD': ['PAUD'],
  'DASAR': ['SD', 'SMP'],
  'MENENGAH': ['SMA', 'SMK'],
  'INKLUSIF': ['SLB (Inklusif)'],
  'NON FORMAL': ['NON FORMAL']
};

// Fungsi hitung angka rasio mentah (Jumlah Guru / Jumlah Rombel)
const getRawRatio = (rombelCount, guruCount) => {
  if (rombelCount === 0) return 0;
  return (guruCount / rombelCount);
};

// Fungsi render UI rasio dengan logika warna
const renderRatio = (rombelCount, guruCount) => {
  if (rombelCount === 0 && guruCount === 0) return <span className="text-gray-300 font-normal">-</span>;
  if (rombelCount === 0 && guruCount > 0) return <span className="text-red-500 font-bold text-[10px]">Error (0 Rombel)</span>;
  
  // Mencari tahu rata-rata guru per 1 rombel
  const ratio = getRawRatio(rombelCount, guruCount);
  
  let colorClass = 'text-emerald-600'; // IDEAL (Minimal 1 Guru per Rombel)
  
  if (ratio < 1.0) {
    colorClass = 'text-red-600'; // KURANG GURU (Rombel lebih banyak dari Guru)
  } else if (ratio > 2.0) {
    colorClass = 'text-blue-600'; // SURPLUS (Sangat berlebih, > 2 guru per rombel)
  }

  // Menggunakan pembulatan 1 angka di belakang koma
  return <span className={`font-black ${colorClass} tracking-wider`}>1 : {ratio.toFixed(1)}</span>;
};

// =====================================================================
// MAIN COMPONENT
// =====================================================================
export default function RasioRombelVsGuru({ selectedYear }) {
  const [activeKategori, setActiveKategori] = useState('SEMUA');
  const [filterWilayah, setFilterWilayah] = useState('SEMUA');
  const [filterStatusTab2, setFilterStatusTab2] = useState('SEMUA'); 
  
  // State untuk menampung raw data agregasi hasil dari AdminMesinKalkulasi
  const [rawTab2Data, setRawTab2Data] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState('');

  // STATE UNTUK MODAL AI
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiLastUpdated, setAiLastUpdated] = useState(null);

  // --- FETCH DATA PRE-CALCULATED DARI ADMIN ---
  useEffect(() => {
    const fetchAgregasiRasio = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Mengarah ke dokumen hasil kalkulasi admin
        const docRef = doc(db, 'dapodik_agregasi', `rasio_rombel_guru_${selectedYear}`);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
           const data = docSnap.data();
           
           if (data.tabel2 && Array.isArray(data.tabel2)) {
               setRawTab2Data(data.tabel2);
           } else {
               setRawTab2Data([]);
           }

           if (data.last_updated) {
              const d = new Date(data.last_updated);
              const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
              setLastUpdated(`${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()} - ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`);
           }
        } else {
           setError(`Data Rasio Rombel VS Guru tahun ${selectedYear} belum dikalkulasi.`);
           setRawTab2Data([]); 
        }
      } catch (err) {
        console.error("Gagal fetch rasio rombel vs guru:", err);
        setError("Gagal menarik data Rasio dari server.");
        setRawTab2Data([]); 
      } finally {
        setLoading(false);
      }
    };

    fetchAgregasiRasio();
  }, [selectedYear]);

  const isModeSemua = filterWilayah === 'SEMUA';
  const activeColumns = COLUMN_MAP[activeKategori] || COLUMN_MAP['SEMUA'];

  // --- ENGINE KOMPUTASI DINAMIS DARI TABEL 2 MENTAH ---
  const processedData = useMemo(() => {
    if (!rawTab2Data || rawTab2Data.length === 0) return { tab1: [], tab2: [] };

    const t1Map = new Map();
    activeColumns.forEach(k => t1Map.set(k, { jenjang: k, rombel_n: 0, guru_n: 0, rombel_s: 0, guru_s: 0, total_rombel: 0, total_guru: 0 }));

    const t2Map = new Map();

    rawTab2Data.forEach(row => {
       // Filter wilayah terlebih dahulu
       if (!isModeSemua && row.wilayah !== filterWilayah) return;

       // Tentukan grup (Jika SEMUA, grup per Kabupaten. Jika SPESIFIK, grup per Kecamatan)
       const groupKey = isModeSemua ? row.wilayah : row.kecamatan;

       if (!t2Map.has(groupKey)) {
           const init = { group_label: groupKey };
           activeColumns.forEach(k => {
               init[`${k}_rombel_n`] = 0; init[`${k}_guru_n`] = 0;
               init[`${k}_rombel_s`] = 0; init[`${k}_guru_s`] = 0;
           });
           t2Map.set(groupKey, init);
       }

       const t2Node = t2Map.get(groupKey);

       // Looping ke kolom jenjang pendidikan yang aktif saja
       activeColumns.forEach(k => {
           // Menarik data dari row mentah
           const rn = parseInt(row[`${k}_rombel_n`]) || 0;
           const gn = parseInt(row[`${k}_guru_n`]) || 0;
           const rs = parseInt(row[`${k}_rombel_s`]) || 0;
           const gs = parseInt(row[`${k}_guru_s`]) || 0;

           // Akumulasi Tabel 1
           const t1Node = t1Map.get(k);
           if (t1Node) {
               t1Node.rombel_n += rn;
               t1Node.guru_n += gn;
               t1Node.rombel_s += rs;
               t1Node.guru_s += gs;
               t1Node.total_rombel += (rn + rs);
               t1Node.total_guru += (gn + gs);
           }

           // Akumulasi Tabel 2
           t2Node[`${k}_rombel_n`] += rn;
           t2Node[`${k}_guru_n`] += gn;
           t2Node[`${k}_rombel_s`] += rs;
           t2Node[`${k}_guru_s`] += gs;
       });
    });

    const t1Arr = Array.from(t1Map.values());
    const t2Arr = Array.from(t2Map.values()).sort((a, b) => {
        if (isModeSemua) {
           const rankA = KABUPATEN_LIST.indexOf(a.group_label);
           const rankB = KABUPATEN_LIST.indexOf(b.group_label);
           return (rankA !== -1 ? rankA : 99) - (rankB !== -1 ? rankB : 99);
        } else {
           return a.group_label.localeCompare(b.group_label);
        }
    });

    return { tab1: t1Arr, tab2: t2Arr };
  }, [rawTab2Data, activeKategori, filterWilayah, isModeSemua, activeColumns]);

  const tab1Data = processedData.tab1;
  
  // Format data Tab 2 agar responsif terhadap filter Status Negeri/Swasta
  const tab2DataDisplay = useMemo(() => {
    return processedData.tab2.map(row => {
       const mapped = { group_label: row.group_label };
       activeColumns.forEach(k => {
           let rombel = 0; let guru = 0;
           if (filterStatusTab2 === 'SEMUA') {
               rombel = row[`${k}_rombel_n`] + row[`${k}_rombel_s`];
               guru = row[`${k}_guru_n`] + row[`${k}_guru_s`];
           } else if (filterStatusTab2 === 'NEGERI') {
               rombel = row[`${k}_rombel_n`];
               guru = row[`${k}_guru_n`];
           } else if (filterStatusTab2 === 'SWASTA') {
               rombel = row[`${k}_rombel_s`];
               guru = row[`${k}_guru_s`];
           }
           mapped[`${k}_rombel`] = rombel;
           mapped[`${k}_guru`] = guru;
       });
       return mapped;
    });
  }, [processedData.tab2, filterStatusTab2, activeColumns]);

  // --- LOGIKA GRAND TOTAL TABEL 1 ---
  const grandTotalTab1 = useMemo(() => {
    return tab1Data.reduce((acc, curr) => {
      acc.rombel_n += curr.rombel_n;
      acc.guru_n += curr.guru_n;
      acc.rombel_s += curr.rombel_s;
      acc.guru_s += curr.guru_s;
      acc.total_rombel += curr.total_rombel;
      acc.total_guru += curr.total_guru;
      return acc;
    }, { rombel_n: 0, guru_n: 0, rombel_s: 0, guru_s: 0, total_rombel: 0, total_guru: 0 });
  }, [tab1Data]);


  // --- EXCEL EXPORTS ---
  const handleUnduhTab1 = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ketersediaan Rombel vs Guru');

    worksheet.columns = [
      { header: 'Jenjang', key: 'jenjang', width: 20 },
      { header: 'Rombel (Negeri)', key: 'rombel_n', width: 18 },
      { header: 'Guru (Negeri)', key: 'guru_n', width: 15 },
      { header: 'Rombel (Swasta)', key: 'rombel_s', width: 18 },
      { header: 'Guru (Swasta)', key: 'guru_s', width: 15 },
      { header: 'Total Rombel', key: 'total_rombel', width: 18 },
      { header: 'Total Guru', key: 'total_guru', width: 18 },
    ];

    tab1Data.forEach(row => worksheet.addRow(row));

    const totalRow = worksheet.addRow({
      jenjang: 'TOTAL KESELURUHAN',
      ...grandTotalTab1
    });

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9333EA' } }; // Purple 600

    totalRow.font = { bold: true, color: { argb: 'FF581C87' } }; // Purple 900
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E8FF' } }; // Purple 100

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Rekap_Rombel_Guru_${activeKategori}_${filterWilayah}_${selectedYear}.xlsx`;
    link.click();
  };

  const handleUnduhTab2 = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Analisa Rasio Guru per Rombel');

    worksheet.columns = [
      { header: isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan', key: 'wilayah_label', width: 30 },
      ...activeColumns.map(k => ({ header: k, key: k, width: 15 })),
    ];

    tab2DataDisplay.forEach(row => {
      const excelRow = { wilayah_label: row.group_label };
      activeColumns.forEach(k => {
        const rombelCount = row[`${k}_rombel`];
        const guruCount = row[`${k}_guru`];
        
        if (rombelCount === 0 && guruCount === 0) excelRow[k] = '-';
        else if (rombelCount === 0 && guruCount > 0) excelRow[k] = 'Error (0 Rombel)';
        else {
          const ratio = guruCount / rombelCount;
          excelRow[k] = `1 : ${ratio.toFixed(1)}`;
        }
      });
      worksheet.addRow(excelRow);
    });

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9333EA' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Analisa_Rasio_Guru_per_Rombel_${activeKategori}_${filterWilayah}_${filterStatusTab2}_${selectedYear}.xlsx`;
    link.click();
  };


  // --- LOGIKA AI GEMINI (FALLBACK MODEL + JSON) ---
  const handleAnalisisAI = async (forceRefresh = false) => {
    if (!genAI) {
      alert("API Key Gemini belum disetting di .env (VITE_GEMINI_API_KEY)");
      return;
    }
    
    setIsModalOpen(true);
    setIsAnalyzing(true);
    setAiResult(null);

    const formatIdKategori = activeKategori.replace(/\s+/g, '');
    const formatIdWilayah = filterWilayah.replace(/\s+/g, '');
    const docId = `rombel_guru_${selectedYear}_${formatIdKategori}_${formatIdWilayah}_${filterStatusTab2}`;

    try {
      if (!forceRefresh) {
        const cachedRef = doc(db, 'laporan_ai_rasio_rombel_guru', docId);
        const cachedSnap = await getDoc(cachedRef);
        if (cachedSnap.exists()) {
           const data = cachedSnap.data();
           setAiResult(data.result);
           setAiLastUpdated(data.last_updated);
           setIsAnalyzing(false);
           return; 
        }
      }

      const payloadTabel1 = tab1Data.map(r => ({
        jenjang: r.jenjang,
        total_rombel: r.total_rombel,
        total_guru: r.total_guru,
        rasio_aktual: r.total_rombel > 0 ? (r.total_guru / r.total_rombel).toFixed(1) : 0
      }));

      const tipeWilayah = isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan';
      const payloadTabel2 = tab2DataDisplay.map(r => {
        let rowData = { wilayah: r.group_label };
        activeColumns.forEach(k => {
           rowData[`${k}_rombel`] = r[`${k}_rombel`];
           rowData[`${k}_guru`] = r[`${k}_guru`];
           rowData[`${k}_rasio`] = r[`${k}_rombel`] > 0 ? (r[`${k}_guru`] / r[`${k}_rombel`]).toFixed(1) : 0;
        });
        return rowData;
      });

      const prompt = `
        Kamu adalah AI Analis Data Pendidikan di aplikasi SITAKA 2026. Gunakan bahasa formal standar laporan eksekutif.
        Saya memiliki data Rasio Rombongan Belajar (Rombel) berbanding Tenaga Pendidik (Guru) untuk Provinsi Kalimantan Barat.
        Tahun Data: ${selectedYear}. Wilayah Filter saat ini: ${filterWilayah}. Kategori Jenjang: ${activeKategori}.
        
        Kriteria Regulasi Rasio Pemenuhan Tenaga Pendidik:
        - Rasio Ideal = Minimal ketersediaan 1 Guru untuk 1 Rombongan Belajar (1 : 1.0 atau lebih tinggi).
        - Kurang Guru = Rasio Aktual di bawah 1.0 (Jumlah rombel lebih besar dari jumlah guru pendukung).
        
        Berikut adalah data Tabel 1 (Ringkasan per Jenjang):
        ${JSON.stringify(payloadTabel1)}

        Berikut adalah data Tabel 2 (Sebaran per ${tipeWilayah}):
        ${JSON.stringify(payloadTabel2)}

        Berdasarkan data di atas, berikan analisa ringkas dan tajam dengan output format JSON murni.
        KEMBALIKAN HANYA FORMAT JSON YANG VALID TANPA MARKDOWN sesuai struktur berikut ini:
        {
          "kesimpulanUmum": "Dua paragraf padat tentang kondisi umum pemenuhan guru terhadap rombel belajar di wilayah aktif berdasarkan data menggunakan bahasa Indonesia formal laporan.",
          "jenjangTertinggi": [ { "jenjang": "Nama Jenjang", "alasan": "Penjelasan ringkas mengapa jenjang ini paling ideal/surplus guru terhadap rombel" } ],
          "jenjangTerendah": [ { "jenjang": "Nama Jenjang", "alasan": "Penjelasan ringkas mengapa jenjang ini paling tidak ideal/mengalami defisit atau kekurangan guru terhadap rombel" } ],
          "wilayahTertinggi": [ { "wilayah": "Nama Wilayah", "alasan": "Sebutkan alasan spesifik wilayah ini memiliki rasio rombel vs guru paling ideal/mencukupi" } ],
          "wilayahTerendah": [ { "wilayah": "Nama Wilayah", "alasan": "Sebutkan alasan spesifik wilayah ini mengalami rasio paling tidak ideal atau kritis kekurangan guru" } ]
        }
        Catatan Penting: 
        1. Setiap Array (jenjang/wilayah) standarnya berisi 3 data tertinggi/terendah. 
        2. ATURAN SERI (TIE-BREAKER): Jika terdapat beberapa jenjang atau wilayah dengan nilai rasio yang sama (seri) pada batas posisi ke-3, maka masukkan SEMUANYA meskipun array tersebut akhirnya berisi lebih dari 3 data (misal 4 atau 5).
      `;

      // DAFTAR MODEL CADANGAN
      const modelsToTry = [
        "gemini-2.5-flash", 
        "gemini-2.0-flash", 
        "gemini-1.5-pro", 
        "gemini-1.5-flash-latest"
      ];

      let responseText = "";
      let success = false;
      let lastError = null;

      // LOOPING MENCOBA MODEL SATU PER SATU
      for (const modelName of modelsToTry) {
        try {
          const model = genAI.getGenerativeModel({ 
            model: modelName,
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.2
            }
          });
          
          const result = await model.generateContent(prompt);
          responseText = result.response.text();
          success = true;
          break; 
        } catch (err) {
          lastError = err;
          if (err.message && (err.message.includes("API_KEY") || err.message.includes("403"))) {
            break; 
          }
        }
      }

      if (!success) {
        throw lastError || new Error("Semua model Gemini gagal diakses.");
      }
      
      // Sanitasi JSON murni
      responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsedData = JSON.parse(responseText);
      
      const timestamp = new Date().toISOString();
      await setDoc(doc(db, 'laporan_ai_rasio_rombel_guru', docId), {
         result: parsedData,
         last_updated: timestamp
      });

      setAiResult(parsedData);
      setAiLastUpdated(timestamp);

    } catch (error) {
      console.error("Gagal menganalisis data:", error);
      alert("Terjadi kesalahan saat menghubungi AI: " + error.message);
      setIsModalOpen(false);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDownloadPDF = () => {
    const element = document.getElementById('pdf-ai-content');
    const opt = {
      margin:       0.4,
      filename:     `Laporan_AI_Rasio_Rombel_Vs_Guru_${filterWilayah}_${selectedYear}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 opacity-60">
         <Loader2 size={64} className="text-purple-500 mb-4 animate-spin" />
         <p className="font-black text-xl text-purple-800 uppercase tracking-widest">Menarik Data Rasio Kapasitas...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-orange-50 rounded-3xl border-2 border-orange-200 border-dashed text-orange-600">
         <p className="font-black text-lg uppercase tracking-widest text-center mb-2">{error}</p>
         <p className="text-sm font-bold text-center">
            Harap minta Admin untuk masuk ke menu Master Data dan klik tombol <span className="text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded">Hitung {selectedYear}</span> pada modul <br/>
            <span className="text-indigo-700 underline underline-offset-4 decoration-indigo-300">Rombel VS Guru</span>.
         </p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-8 animate-in slide-in-from-bottom-8 duration-500">
      
      {/* HEADER & FILTER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
        <div>
          <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter">Rombel <span className="text-purple-500">VS</span> Guru</h2>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1 mb-2">Modul Analisa Pemenuhan Tenaga Pendidik</p>
          {/* Teks Penjelasan Baru dengan warna yang jelas */}
          <p className="text-sm font-bold text-purple-600 bg-purple-50 px-3 py-1.5 rounded-lg inline-block shadow-sm">
            Klik tombol Analisa Data untuk mendapatkan ringkasan dan hasil analisis data yang ditampilkan ini.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          
          {/* TOMBOL AI DENGAN HIGHLIGHT PULSE */}
          <button 
            onClick={() => handleAnalisisAI(false)}
            disabled={tab1Data.length === 0}
            className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black uppercase text-sm px-5 py-2.5 rounded-2xl hover:scale-105 transition-all shadow-[0_0_15px_rgba(147,51,234,0.5)] animate-pulse hover:animate-none focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed disabled:animate-none"
          >
            <Sparkles size={18} />
            Analisa Data
          </button>

          {/* FILTER JENJANG/KATEGORI BARU */}
          <div className="flex items-center bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2 shadow-sm w-full sm:w-auto focus-within:ring-2 focus-within:ring-purple-200">
            <GraduationCap size={18} className="text-purple-600 mr-3" />
            <select 
              value={activeKategori} 
              onChange={(e) => setActiveKategori(e.target.value)} 
              className="bg-transparent text-sm font-black uppercase text-gray-700 outline-none cursor-pointer min-w-[150px] w-full"
            >
              <option value="SEMUA">Semua Jenjang</option>
              <option value="PAUD">PAUD</option>
              <option value="DASAR">Pendidikan Dasar</option>
              <option value="MENENGAH">Pendidikan Menengah</option>
              <option value="INKLUSIF">Pendidikan Inklusif</option>
              <option value="NON FORMAL">Non Formal</option>
            </select>
          </div>

          <div className="flex items-center bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2 shadow-sm w-full sm:w-auto focus-within:ring-2 focus-within:ring-purple-200">
            <MapPin size={18} className="text-purple-600 mr-3" />
            <select 
              value={filterWilayah} 
              onChange={(e) => setFilterWilayah(e.target.value)} 
              className="bg-transparent text-sm font-black uppercase text-gray-700 outline-none cursor-pointer min-w-[150px] w-full"
            >
              <option value="SEMUA">SELURUH PROVINSI</option>
              {KABUPATEN_LIST.map(k => (
                <option key={k} value={k}>
                  {k === 'SINGKAWANG' || k === 'PONTIANAK' ? 'KOTA' : 'KAB.'} {k}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* TABEL 1: REKAPITULASI JUMLAH */}
      <div className="bg-white rounded-3xl shadow-md border border-gray-100 overflow-hidden">
        <div className="bg-gray-50 px-6 py-5 border-b border-gray-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Layers className="text-purple-600" size={24} />
            <h3 className="font-black text-lg text-gray-800 uppercase tracking-tighter">Tabel 1: Ketersediaan Data Utama</h3>
          </div>
          <button onClick={handleUnduhTab1} className="flex items-center gap-2 text-xs font-black uppercase text-purple-600 bg-purple-50 px-4 py-2 rounded-xl hover:bg-purple-100 transition-colors">
            <Download size={14} /> Unduh
          </button>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-center border-separate border-spacing-y-2">
            <thead className="sticky top-0 bg-white z-10 shadow-sm rounded-xl">
              <tr className="text-[10px] font-black uppercase text-gray-500 bg-gray-50">
                <th className="px-4 py-4 rounded-l-xl w-12">No</th>
                <th className="px-4 py-4 text-left">Jenjang</th>
                <th className="px-4 py-4 text-purple-600 border-l border-gray-200">Rombel (Negeri)</th>
                <th className="px-4 py-4 text-purple-600">Guru (Negeri)</th>
                <th className="px-4 py-4 text-orange-600 border-l border-gray-200">Rombel (Swasta)</th>
                <th className="px-4 py-4 text-orange-600">Guru (Swasta)</th>
                <th className="px-4 py-4 text-gray-800 border-l border-gray-200 bg-gray-100">Total Rombel</th>
                <th className="px-4 py-4 text-gray-800 rounded-r-xl bg-gray-100">Total Guru</th>
              </tr>
            </thead>
            <tbody>
              {tab1Data.map((row, idx) => (
                <tr key={idx} className="bg-white shadow-sm hover:shadow-md transition-all group">
                  <td className="px-4 py-3 rounded-l-xl font-bold text-gray-400 text-xs border-y border-l border-gray-100">{idx + 1}</td>
                  <td className="px-4 py-3 font-black text-gray-800 text-sm uppercase text-left border-y border-gray-100">{row.jenjang}</td>
                  <td className="px-4 py-3 font-bold text-purple-700 bg-purple-50/30 border-y border-l border-gray-100">{row.rombel_n.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-purple-700 bg-purple-50/30 border-y border-gray-100">{row.guru_n.toLocaleString()}</td>
                  <td className="px-4 py-3 font-bold text-orange-700 bg-orange-50/20 border-y border-l border-gray-100">{row.rombel_s.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-orange-700 bg-orange-50/20 border-y border-gray-100">{row.guru_s.toLocaleString()}</td>
                  <td className="px-4 py-3 font-bold text-gray-700 bg-gray-50 border-y border-l border-gray-100">{row.total_rombel.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-gray-800 text-base bg-gray-100 border-y border-r border-gray-100 rounded-r-xl">{row.total_guru.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            {/* TFOOT: BARIS GRAND TOTAL */}
            {tab1Data.length > 0 && (
              <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                <tr className="bg-purple-100 text-center font-black uppercase text-xs border-t-2 border-purple-200">
                  <td colSpan="2" className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-purple-200 text-purple-900">
                    TOTAL {isModeSemua ? 'KAL-BAR' : filterWilayah}
                  </td>
                  <td className="px-4 py-4 text-purple-800 border-y border-purple-200">{grandTotalTab1.rombel_n.toLocaleString()}</td>
                  <td className="px-4 py-4 text-purple-900 border-y border-purple-200">{grandTotalTab1.guru_n.toLocaleString()}</td>
                  <td className="px-4 py-4 text-orange-800 border-y border-purple-200">{grandTotalTab1.rombel_s.toLocaleString()}</td>
                  <td className="px-4 py-4 text-orange-900 border-y border-purple-200">{grandTotalTab1.guru_s.toLocaleString()}</td>
                  <td className="px-4 py-4 text-purple-950 border-y border-purple-200">{grandTotalTab1.total_rombel.toLocaleString()}</td>
                  <td className="px-4 py-4 text-purple-950 text-base border-y border-r border-purple-200 rounded-r-2xl bg-purple-200/50">{grandTotalTab1.total_guru.toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
          {/* INFO WAKTU UPDATE DAPODIK */}
          {lastUpdated && (
             <div className="mt-4 px-2 text-right text-xs font-bold italic text-gray-400">
                Sumber Kalkulasi Engine : {lastUpdated}
             </div>
          )}
        </div>
      </div>

      {/* TABEL 2: ANALISA RASIO */}
      <div className="bg-white rounded-3xl shadow-md border border-gray-100 overflow-hidden">
        <div className="bg-purple-700 px-6 py-5 border-b border-purple-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Activity className="text-purple-100" size={24} />
            <h3 className="font-black text-lg text-white uppercase tracking-tighter">Tabel 2: Hasil Analisa Kebutuhan Guru</h3>
          </div>
          
          {/* FILTER STATUS & TOMBOL UNDUH TABEL 2 */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex items-center bg-white/10 border border-purple-500/50 rounded-xl px-3 py-1.5 shadow-sm transition-all focus-within:ring-2 focus-within:ring-purple-400 w-full md:w-auto">
              <School size={16} className="text-purple-200 mr-2" />
              <select 
                value={filterStatusTab2} 
                onChange={(e) => setFilterStatusTab2(e.target.value)} 
                className="bg-transparent text-xs font-black uppercase text-white outline-none cursor-pointer w-full [&>option]:bg-purple-800 [&>option]:text-white"
              >
                <option value="SEMUA">Semua Status</option>
                <option value="NEGERI">Negeri</option>
                <option value="SWASTA">Swasta</option>
              </select>
            </div>
            <button onClick={handleUnduhTab2} className="flex items-center justify-center gap-2 text-xs font-black uppercase text-purple-900 bg-white px-4 py-2 rounded-xl hover:bg-purple-50 transition-colors w-full md:w-auto shrink-0 shadow-sm">
              <Download size={14} /> Unduh
            </button>
          </div>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-center border-collapse">
            <thead>
              <tr className="bg-purple-50/50 border-b border-gray-200">
                <th className="p-4 text-center font-black text-gray-500 text-xs w-16">No</th>
                <th className="p-4 font-black text-gray-500 text-xs text-left uppercase">{isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan'}</th>
                {activeColumns.map(k => (
                  <th key={k} className="p-4 text-center font-black text-purple-800 text-xs border-l border-purple-100 whitespace-nowrap">{k}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {tab2DataDisplay.map((row, idx) => (
                <tr key={idx} className="hover:bg-purple-50/30 transition-colors">
                  <td className="p-4 text-center text-sm font-bold text-gray-400">{idx + 1}</td>
                  <td className="p-4 text-sm font-black text-gray-700 text-left">{row.group_label}</td>
                  {activeColumns.map((k) => (
                    <td key={k} className="p-4 text-center text-sm font-medium border-l border-gray-50">
                      {renderRatio(row[`${k}_rombel`], row[`${k}_guru`], k)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          
          {tab2DataDisplay.length === 0 ? (
             <div className="py-20 flex flex-col items-center opacity-30 text-gray-500">
               <Search size={64} className="mb-4" />
               <p className="font-black uppercase tracking-widest text-xl">Tidak Ada Data</p>
             </div>
          ) : (
             <div className="mt-4 px-2 text-right text-xs font-bold italic text-gray-400">
                Data ditarik secara kilat dari Pre-Kalkulasi Admin.
             </div>
          )}
        </div>
      </div>

      {/* INFO BOX RUMUS KAPASITAS */}
      <div className="bg-purple-50 border border-purple-200 p-6 rounded-3xl flex flex-col md:flex-row items-start gap-6 shadow-sm mb-12">
        <div className="bg-purple-600 text-white p-3 rounded-2xl shrink-0 shadow-md"><Users size={28}/></div>
        <div className="text-sm text-purple-900 leading-relaxed w-full">
          <strong className="font-black text-base uppercase tracking-widest block mb-3 text-purple-800">Acuan Standar Minimum Jumlah Guru</strong>
          <p className="font-medium opacity-90 mb-3">
            Berdasarkan beban kerja ideal, diusahakan rasio minimal jumlah Guru terhadap jumlah Rombongan Belajar (Rombel) adalah 1 Guru per 1 Rombel.
          </p>
          <div className="grid grid-cols-1 font-bold opacity-90">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-purple-500"></div> Rasio Ideal = Minimal 1 Guru untuk 1 Rombongan Belajar (Rombel).</div>
          </div>
          <div className="mt-4 pt-4 border-t border-purple-200/50 text-xs italic opacity-80 font-bold">
            * Format Rasio <span className="text-purple-700 font-black">1 : X</span>. Angka <span className="text-purple-700 font-black">1</span> mewakili 1 Rombel, dan <span className="text-purple-700 font-black">X</span> adalah rasio ketersediaan Guru.<br/>
            Warna <span className="text-red-600 font-black">Merah</span> = Kurang Guru (Jumlah rombel lebih besar dari jumlah guru). Warna <span className="text-emerald-600 font-black">Hijau</span> = Ideal. Warna <span className="text-blue-600 font-black">Biru</span> = Sangat Berlebih (Lebih dari 2 Guru per Rombel).
          </div>
        </div>
      </div>

      {/* MODAL AI ANALISIS MENEMPEL DI HALAMAN INI */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative">
            
            {/* Header Modal AI */}
            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-indigo-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-purple-600 p-2 rounded-xl text-white"><Sparkles size={24} /></div>
                <div>
                  <h3 className="font-black text-xl text-purple-900 uppercase">Laporan Eksekutif</h3>
                  <p className="text-xs font-bold text-purple-600">SITAKA 2026 - Analisa Rasio Rombel VS Guru</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {aiResult && (
                  <button onClick={() => handleAnalisisAI(true)} title="Analisa Ulang" className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 text-xs font-bold px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors shadow-sm">
                    <RefreshCw size={16} className={isAnalyzing ? 'animate-spin' : ''} />
                  </button>
                )}
                {aiResult && (
                  <button onClick={handleDownloadPDF} className="flex items-center gap-2 bg-purple-600 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-purple-700 transition-colors shadow-md">
                    <FileText size={16} /> Unduh PDF
                  </button>
                )}
                <button onClick={() => setIsModalOpen(false)} className="p-2 bg-white rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all shadow-sm">
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Body Modal AI yang Bisa Di-scroll & Di-print ke PDF */}
            <div className="p-8 overflow-y-auto flex-1 bg-gray-50/50" id="pdf-ai-content">
              {isAnalyzing ? (
                <div className="flex flex-col items-center justify-center h-64 opacity-70">
                  <Sparkles size={64} className="text-purple-500 animate-pulse mb-4" />
                  <p className="font-black text-xl uppercase tracking-widest text-purple-800">Tunggu, Sedang Berpikir...</p>
                  <p className="text-sm font-bold text-gray-400 mt-2">Menganalisis Ketersediaan Tenaga Pendidik Terhadap Rombongan Belajar</p>
                </div>
              ) : aiResult ? (
                <div className="flex flex-col gap-8 pb-10">
                  
                  {/* KOP LAPORAN UNTUK PDF */}
                  <div className="text-center pb-4 border-b-2 border-purple-100">
                    <h2 className="text-2xl font-black text-purple-900 uppercase">Ringkasan Analitik Pemenuhan Guru</h2>
                    <p className="text-sm font-bold text-gray-500 mt-1">Data Agregasi Kebutuhan Guru per Rombongan Belajar ({selectedYear})</p>
                    <p className="text-xs font-medium text-gray-400 mt-1">Wilayah: {filterWilayah} | Kategori: {activeKategori}</p>
                  </div>

                  {/* Kesimpulan */}
                  <div className="bg-white p-6 rounded-2xl border border-purple-100 shadow-sm">
                    <h4 className="font-black text-lg text-purple-900 mb-3 flex items-center gap-2">
                       <Info size={20} /> KESIMPULAN UMUM
                    </h4>
                    <p className="text-gray-700 leading-relaxed font-medium text-justify whitespace-pre-wrap">{aiResult.kesimpulanUmum}</p>
                  </div>

                  {/* Grafik Tabel 1 (Recharts) dengan Dual Y-Axis */}
                  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm h-80">
                     <h4 className="font-black text-sm text-gray-800 mb-4 uppercase text-center">Grafik Perbandingan Rombel vs Guru per Jenjang</h4>
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={tab1Data} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                          <XAxis dataKey="jenjang" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 'bold' }} />
                          {/* Y-Axis Kiri untuk Rombel */}
                          <YAxis yAxisId="left" orientation="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#F97316' }} />
                          {/* Y-Axis Kanan untuk Guru */}
                          <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#8B5CF6' }} />
                          
                          <Tooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                          <Legend wrapperStyle={{ paddingTop: '20px', fontWeight: 'bold', fontSize: '12px' }} />
                          
                          {/* Hubungkan batang dengan yAxisId yang sesuai */}
                          <Bar yAxisId="left" dataKey="total_rombel" name="Total Rombongan Belajar" fill="#F97316" radius={[4, 4, 0, 0]} />
                          <Bar yAxisId="right" dataKey="total_guru" name="Total Tenaga Pendidik (Guru)" fill="#8B5CF6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                     </ResponsiveContainer>
                  </div>

                  {/* Grid Jenjang Terpadat / Kekurangan */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100">
                      <h4 className="font-black text-emerald-800 uppercase mb-3">Jenjang Paling Ideal / Memadai</h4>
                      <ul className="flex flex-col gap-3">
                        {aiResult.jenjangTertinggi?.map((item, i) => (
                          <li key={i} className="bg-white p-3 rounded-xl shadow-sm text-sm border border-emerald-50 flex flex-col gap-1">
                            <span className="font-black text-emerald-600 text-base">{item.jenjang}</span>
                            <span className="text-gray-600 font-medium leading-tight">{item.alasan}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-red-50 p-5 rounded-2xl border border-red-100">
                      <h4 className="font-black text-red-800 uppercase mb-3">Jenjang Kekurangan Tenaga Pendidik</h4>
                      <ul className="flex flex-col gap-3">
                        {aiResult.jenjangTerendah?.map((item, i) => (
                          <li key={i} className="bg-white p-3 rounded-xl shadow-sm text-sm border border-red-50 flex flex-col gap-1">
                            <span className="font-black text-red-600 text-base">{item.jenjang}</span>
                            <span className="text-gray-600 font-medium leading-tight">{item.alasan}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  
                  {/* Grid Wilayah Terpadat / Kekurangan */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-teal-50 p-5 rounded-2xl border border-teal-100">
                      <h4 className="font-black text-teal-800 uppercase mb-3">Wilayah Paling Ideal / Mencukupi</h4>
                      <ul className="flex flex-col gap-3">
                        {aiResult.wilayahTertinggi?.map((item, i) => (
                          <li key={i} className="bg-white p-3 rounded-xl shadow-sm text-sm border border-teal-50 flex flex-col gap-1">
                            <span className="font-black text-teal-600 text-base">{item.wilayah}</span>
                            <span className="text-gray-600 font-medium leading-tight">{item.alasan}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-orange-50 p-5 rounded-2xl border border-orange-100">
                      <h4 className="font-black text-orange-800 uppercase mb-3">Wilayah Kekurangan Tenaga Pendidik</h4>
                      <ul className="flex flex-col gap-3">
                        {aiResult.wilayahTerendah?.map((item, i) => (
                          <li key={i} className="bg-white p-3 rounded-xl shadow-sm text-sm border border-orange-50 flex flex-col gap-1">
                            <span className="font-black text-orange-600 text-base">{item.wilayah}</span>
                            <span className="text-gray-600 font-medium leading-tight">{item.alasan}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Footer Tanda Tangan AI */}
                  <div className="mt-8 pt-4 border-t border-gray-200 flex justify-between items-end text-xs font-bold text-gray-400">
                    <div>
                        <p>Digenerasi oleh: Gemini AI - SITAKA Engine</p>
                        {aiLastUpdated && <p className="text-[10px] opacity-70 mt-1">Terakhir dianalisa: {aiLastUpdated}</p>}
                    </div>
                    <p>Dicetak pada: {new Date().toLocaleDateString('id-ID')}</p>
                  </div>

                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}