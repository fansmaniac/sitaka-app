import React, { useState, useEffect, useMemo } from 'react';
import { 
  MapPin, 
  Info, 
  Search, 
  Download, 
  Loader2, 
  Activity, 
  School, 
  GraduationCap, 
  Sparkles, 
  X, 
  FileText,
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

// PETA KOLOM DISESUAIKAN DENGAN OUTPUT ADMIN MESIN KALKULASI SARPRAS
const COLUMN_MAP = {
  'SEMUA': ['TK', 'SD', 'SMP', 'SMA', 'SMK', 'SLB (Inklusif)', 'NON FORMAL'],
  'PAUD': ['TK'],
  'DASAR': ['SD', 'SMP'],
  'MENENGAH': ['SMA', 'SMK'],
  'INKLUSIF': ['SLB (Inklusif)'],
  'NON FORMAL': ['NON FORMAL']
};

// Fungsi hitung angka rasio mentah (Jumlah Kelas / Jumlah Rombel)
const getRawRatio = (rombelCount, kelasCount) => {
  if (rombelCount === 0) return 0;
  return (kelasCount / rombelCount);
};

// Fungsi render UI rasio dengan logika warna
const renderRatio = (rombelCount, kelasCount) => {
  if (rombelCount === 0 && kelasCount === 0) return <span className="text-gray-300 font-normal">-</span>;
  if (rombelCount === 0 && kelasCount > 0) return <span className="text-red-500 font-bold text-[10px]">Error (0 Rombel)</span>;
  
  const ratio = getRawRatio(rombelCount, kelasCount);
  
  let colorClass = 'text-emerald-600'; // IDEAL (1 Rombel = 1 Kelas)
  
  if (ratio < 1.0) {
    colorClass = 'text-red-600'; // KURANG RUANG KELAS (Kelas lebih sedikit dari Rombel)
  } else if (ratio > 1.2) {
    colorClass = 'text-blue-600'; // SURPLUS KELAS
  }

  return <span className={`font-black ${colorClass} tracking-wider`}>1 : {ratio.toFixed(1)}</span>;
};

// =====================================================================
// MAIN COMPONENT
// =====================================================================
export default function RasioRombelVsKelas({ selectedYear }) {
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
        const docRef = doc(db, 'dapodik_agregasi', `rasio_rombel_kelas_${selectedYear}`);
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
           setError(`Data Rasio Rombel VS Ruang Kelas tahun ${selectedYear} belum dikalkulasi.`);
           setRawTab2Data([]); 
        }
      } catch (err) {
        console.error("Gagal fetch rasio rombel vs kelas:", err);
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
    activeColumns.forEach(k => t1Map.set(k, { jenjang: k, rombel_n: 0, kelas_n: 0, rombel_s: 0, kelas_s: 0, total_rombel: 0, total_kelas: 0 }));

    const t2Map = new Map();

    rawTab2Data.forEach(row => {
       // Filter wilayah terlebih dahulu
       if (!isModeSemua && row.wilayah !== filterWilayah) return;

       // Tentukan grup (Jika SEMUA, grup per Kabupaten. Jika SPESIFIK, grup per Kecamatan)
       const groupKey = isModeSemua ? row.wilayah : row.kecamatan;

       if (!t2Map.has(groupKey)) {
           const init = { group_label: groupKey };
           activeColumns.forEach(k => {
               init[`${k}_rombel_n`] = 0; init[`${k}_kelas_n`] = 0;
               init[`${k}_rombel_s`] = 0; init[`${k}_kelas_s`] = 0;
           });
           t2Map.set(groupKey, init);
       }

       const t2Node = t2Map.get(groupKey);

       // Looping ke kolom jenjang pendidikan yang aktif saja
       activeColumns.forEach(k => {
           // Menarik data dari row mentah
           const rn = parseInt(row[`${k}_rombel_n`]) || 0;
           const kn = parseInt(row[`${k}_kelas_n`]) || 0;
           const rs = parseInt(row[`${k}_rombel_s`]) || 0;
           const ks = parseInt(row[`${k}_kelas_s`]) || 0;

           // Akumulasi Tabel 1
           const t1Node = t1Map.get(k);
           if (t1Node) {
               t1Node.rombel_n += rn;
               t1Node.kelas_n += kn;
               t1Node.rombel_s += rs;
               t1Node.kelas_s += ks;
               t1Node.total_rombel += (rn + rs);
               t1Node.total_kelas += (kn + ks);
           }

           // Akumulasi Tabel 2
           t2Node[`${k}_rombel_n`] += rn;
           t2Node[`${k}_kelas_n`] += kn;
           t2Node[`${k}_rombel_s`] += rs;
           t2Node[`${k}_kelas_s`] += ks;
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
           let rombel = 0; let kelas = 0;
           if (filterStatusTab2 === 'SEMUA') {
               rombel = row[`${k}_rombel_n`] + row[`${k}_rombel_s`];
               kelas = row[`${k}_kelas_n`] + row[`${k}_kelas_s`];
           } else if (filterStatusTab2 === 'NEGERI') {
               rombel = row[`${k}_rombel_n`];
               kelas = row[`${k}_kelas_n`];
           } else if (filterStatusTab2 === 'SWASTA') {
               rombel = row[`${k}_rombel_s`];
               kelas = row[`${k}_kelas_s`];
           }
           mapped[`${k}_rombel`] = rombel;
           mapped[`${k}_kelas`] = kelas;
       });
       return mapped;
    });
  }, [processedData.tab2, filterStatusTab2, activeColumns]);

  // --- LOGIKA GRAND TOTAL TABEL 1 ---
  const grandTotalTab1 = useMemo(() => {
    return tab1Data.reduce((acc, curr) => {
      acc.rombel_n += curr.rombel_n;
      acc.kelas_n += curr.kelas_n;
      acc.rombel_s += curr.rombel_s;
      acc.kelas_s += curr.kelas_s;
      acc.total_rombel += curr.total_rombel;
      acc.total_kelas += curr.total_kelas;
      return acc;
    }, { rombel_n: 0, kelas_n: 0, rombel_s: 0, kelas_s: 0, total_rombel: 0, total_kelas: 0 });
  }, [tab1Data]);

  // --- LOGIKA AI GEMINI (DENGAN CACHING FIREBASE) ---
  const handleAnalisisAI = async (forceRefresh = false) => {
    if (!genAI) {
      alert("API Key Gemini belum disetting di .env (VITE_GEMINI_API_KEY)");
      return;
    }
    
    setIsModalOpen(true);
    setIsAnalyzing(true);

    const formatIdKategori = activeKategori.replace(/\s+/g, '');
    const formatIdWilayah = filterWilayah.replace(/\s+/g, '');
    const docId = `rombel_kelas_${selectedYear}_${formatIdKategori}_${formatIdWilayah}_${filterStatusTab2}`;

    try {
      if (!forceRefresh) {
        const cachedRef = doc(db, 'laporan_ai_rasio_rombel_kelas', docId);
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
        total_kelas: r.total_kelas,
        rasio_aktual: r.total_rombel > 0 ? (r.total_kelas / r.total_rombel).toFixed(2) : 0
      }));

      const tipeWilayah = isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan';
      const payloadTabel2 = tab2DataDisplay.map(r => {
        let rowData = { wilayah: r.group_label };
        activeColumns.forEach(k => {
           rowData[`${k}_rombel`] = r[`${k}_rombel`];
           rowData[`${k}_kelas`] = r[`${k}_kelas`];
           rowData[`${k}_rasio`] = r[`${k}_rombel`] > 0 ? (r[`${k}_kelas`] / r[`${k}_rombel`]).toFixed(2) : 0;
        });
        return rowData;
      });

      const prompt = `
        Kamu adalah AI Analis Data Pendidikan di aplikasi SITAKA 2026. Gunakan bahasa formal standar laporan eksekutif.
        Saya memiliki data Rasio Rombongan Belajar (Rombel) berbanding Ruang Kelas Fisik untuk Provinsi Kalimantan Barat.
        Tahun Data: ${selectedYear}. Wilayah Filter saat ini: ${filterWilayah}. Kategori Jenjang: ${activeKategori}.
        
        Kriteria Regulasi Ketersediaan Ruang Kelas Fisik:
        - Rasio Ideal = Minimal ketersediaan 1 ruang kelas untuk 1 Rombongan Belajar (1 : 1.0 atau lebih tinggi).
        - Kurang Kelas = Rasio Aktual di bawah 1.0 (Jumlah rombel lebih besar dari kelas, memicu double shift atau menumpang).
        
        Berikut adalah data Tabel 1 (Ringkasan per Jenjang):
        ${JSON.stringify(payloadTabel1)}

        Berikut adalah data Tabel 2 (Sebaran per ${tipeWilayah}):
        ${JSON.stringify(payloadTabel2)}

        Berdasarkan data di atas, berikan analisa ringkas dan tajam dengan output format JSON murni.
        KEMBALIKAN HANYA FORMAT JSON YANG VALID TANPA MARKDOWN sesuai struktur berikut ini:
        {
          "kesimpulanUmum": "Dua paragraf padat tentang kondisi umum ketersediaan ruang kelas terhadap jumlah rombongan belajar di wilayah aktif berdasarkan data menggunakan bahasa Indonesia formal laporan.",
          "jenjangTertinggi": [ { "jenjang": "Nama Jenjang", "alasan": "Penjelasan ringkas mengapa jenjang ini paling ideal/mempunyai ruang kelas yang cukup terhadap rombel" } ],
          "jenjangTerendah": [ { "jenjang": "Nama Jenjang", "alasan": "Penjelasan ringkas mengapa jenjang ini paling tidak ideal/mengalami kekurangan ruang kelas fisik terhadap rombel" } ],
          "wilayahTertinggi": [ { "wilayah": "Nama Wilayah", "alasan": "Sebutkan alasan spesifik wilayah ini memiliki rasio rombel vs kelas paling ideal/memadai" } ],
          "wilayahTerendah": [ { "wilayah": "Nama Wilayah", "alasan": "Sebutkan alasan spesifik wilayah ini mengalami defisit kelas fisik/kritis" } ]
        }
        Catatan Penting: 
        1. Setiap Array (jenjang/wilayah) standarnya berisi 3 data tertinggi/terendah. 
        2. ATURAN SERI (TIE-BREAKER): Jika terdapat beberapa jenjang atau wilayah dengan nilai rasio yang sama (seri) pada batas posisi ke-3, maka masukkan SEMUANYA meskipun array tersebut akhirnya berisi lebih dari 3 data (misal 4 atau 5).
      `;

      const modelsToTry = [
        "gemini-2.5-flash", 
        "gemini-2.0-flash", 
        "gemini-1.5-pro", 
        "gemini-1.5-flash-latest"
      ];

      let responseText = "";
      let success = false;
      let lastError = null;

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
      
      responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsedData = JSON.parse(responseText);
      
      const timestamp = new Date().toISOString();
      await setDoc(doc(db, 'laporan_ai_rasio_rombel_kelas', docId), {
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
      filename:     `Laporan_AI_Ketersediaan_Kelas_SITAKA_${filterWilayah}_${selectedYear}.pdf`,
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2, useCORS: true },
      jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
  };

  // Format helper untuk tanggal laporan
  const formatAiDate = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    return `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()} - ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} WIB`;
  };

  // =====================================================================
  // EXCEL EXPORTS
  // =====================================================================
  const handleUnduhTab1 = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ketersediaan Rombel vs Kelas');

    worksheet.columns = [
      { header: 'Jenjang', key: 'jenjang', width: 20 },
      { header: 'Rombel (Negeri)', key: 'rombel_n', width: 18 },
      { header: 'Kelas (Negeri)', key: 'kelas_n', width: 15 },
      { header: 'Rombel (Swasta)', key: 'rombel_s', width: 18 },
      { header: 'Kelas (Swasta)', key: 'kelas_s', width: 15 },
      { header: 'Total Rombel', key: 'total_rombel', width: 18 },
      { header: 'Total Kelas', key: 'total_kelas', width: 18 }
    ];

    tab1Data.forEach(row => worksheet.addRow(row));

    const totalRow = worksheet.addRow({
      jenjang: 'TOTAL KESELURUHAN',
      ...grandTotalTab1
    });

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } }; 

    totalRow.font = { bold: true, color: { argb: 'FF78350F' } }; 
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; 

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Ketersediaan_Rombel_Kelas_${activeKategori}_${filterWilayah}_${selectedYear}.xlsx`;
    link.click();
  };

  const handleUnduhTab2 = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Analisa Rasio Kelas per Rombel');

    worksheet.columns = [
      { header: isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan', key: 'wilayah_label', width: 30 },
      ...activeColumns.map(k => ({ header: k, key: k, width: 15 })),
    ];

    tab2DataDisplay.forEach(row => {
      const excelRow = { wilayah_label: row.group_label };
      activeColumns.forEach(k => {
        const rombelCount = row[`${k}_rombel`];
        const kelasCount = row[`${k}_kelas`];
        
        if (rombelCount === 0 && kelasCount === 0) excelRow[k] = '-';
        else if (rombelCount === 0 && kelasCount > 0) excelRow[k] = 'Error (0 Rombel)';
        else {
          const ratio = getRawRatio(rombelCount, kelasCount);
          excelRow[k] = `1 : ${ratio.toFixed(1)}`;
        }
      });
      worksheet.addRow(excelRow);
    });

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Analisa_Rasio_Kelas_per_Rombel_${activeKategori}_${filterWilayah}_${filterStatusTab2}_${selectedYear}.xlsx`;
    link.click();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 opacity-60">
         <Loader2 size={64} className="text-amber-500 mb-4 animate-spin" />
         <p className="font-black text-xl text-amber-800 uppercase tracking-widest">Menarik Data Rasio Kelas...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-orange-50 rounded-3xl border-2 border-orange-200 border-dashed text-orange-600">
         <p className="font-black text-lg uppercase tracking-widest text-center">{error}</p>
         <p className="text-sm mt-2 font-bold">Harap minta Admin untuk menjalankan Mesin Kalkulasi Rombel vs Ruang Kelas.</p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-8 animate-in slide-in-from-bottom-8 duration-500">
      
      {/* HEADER & FILTER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
        <div>
          <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter">Rombel <span className="text-amber-500">VS</span> Ruang Kelas</h2>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1 mb-2">Modul Analisa Ketersediaan Ruang Kelas Belajar Fisik</p>
          <p className="text-sm font-bold text-amber-600 bg-amber-50 px-3 py-1.5 rounded-lg inline-block shadow-sm">
            TIPS: Klik tombol "Analisa Data" untuk mendapatkan ringkasan dan hasil analisis data yang ditampilkan ini.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          
          <button 
            onClick={() => handleAnalisisAI(false)}
            disabled={tab1Data.length === 0}
            className="flex items-center gap-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-black uppercase text-sm px-5 py-2.5 rounded-2xl hover:scale-105 transition-all shadow-[0_0_15px_rgba(245,158,11,0.5)] animate-pulse hover:animate-none focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-amber-500 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed disabled:animate-none"
          >
            <Sparkles size={18} />
            Analisa Data
          </button>

          <div className="flex items-center bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2 shadow-sm w-full sm:w-auto focus-within:ring-2 focus-within:ring-amber-200">
            <GraduationCap size={18} className="text-amber-600 mr-3" />
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

          <div className="flex items-center bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2 shadow-sm w-full sm:w-auto focus-within:ring-2 focus-within:ring-amber-200">
            <MapPin size={18} className="text-amber-600 mr-3" />
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

      {/* TABEL 1 */}
      <div className="bg-white rounded-3xl shadow-md border border-gray-100 overflow-hidden">
        <div className="bg-gray-50 px-6 py-5 border-b border-gray-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <School className="text-amber-600" size={24} />
            <h3 className="font-black text-lg text-gray-800 uppercase tracking-tighter">Tabel 1: Ketersediaan Data Utama</h3>
          </div>
          <button onClick={handleUnduhTab1} className="flex items-center gap-2 text-xs font-black uppercase text-amber-600 bg-amber-50 px-4 py-2 rounded-xl hover:bg-amber-100 transition-colors">
            <Download size={14} /> Unduh
          </button>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-center border-separate border-spacing-y-2">
            <thead className="sticky top-0 bg-white z-10 shadow-sm rounded-xl">
              <tr className="text-[10px] font-black uppercase text-gray-500 bg-gray-50">
                <th className="px-4 py-4 rounded-l-xl w-12">No</th>
                <th className="px-4 py-4 text-left">Jenjang</th>
                <th className="px-4 py-4 text-amber-600 border-l border-gray-200">Rombel (Negeri)</th>
                <th className="px-4 py-4 text-amber-600">Kelas (Negeri)</th>
                <th className="px-4 py-4 text-orange-600 border-l border-gray-200">Rombel (Swasta)</th>
                <th className="px-4 py-4 text-orange-600">Kelas (Swasta)</th>
                <th className="px-4 py-4 text-gray-800 border-l border-gray-200 bg-gray-100">Total Rombel</th>
                <th className="px-4 py-4 text-gray-800 rounded-r-xl bg-gray-100">Total Kelas</th>
              </tr>
            </thead>
            <tbody>
              {tab1Data.map((row, idx) => (
                <tr key={idx} className="bg-white shadow-sm hover:shadow-md transition-all group">
                  <td className="px-4 py-3 rounded-l-xl font-bold text-gray-400 text-xs border-y border-l border-gray-100">{idx + 1}</td>
                  <td className="px-4 py-3 font-black text-gray-800 text-sm uppercase text-left border-y border-gray-100">{row.jenjang}</td>
                  <td className="px-4 py-3 font-bold text-amber-700 bg-amber-50/30 border-y border-l border-gray-100">{row.rombel_n.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-amber-700 bg-amber-50/30 border-y border-gray-100">{row.kelas_n.toLocaleString()}</td>
                  <td className="px-4 py-3 font-bold text-orange-700 bg-orange-50/20 border-y border-l border-gray-100">{row.rombel_s.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-orange-700 bg-orange-50/20 border-y border-gray-100">{row.kelas_s.toLocaleString()}</td>
                  <td className="px-4 py-3 font-bold text-gray-700 bg-gray-50 border-y border-l border-gray-100">{row.total_rombel.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-gray-800 text-base bg-gray-100 border-y border-r border-gray-100 rounded-r-xl">{row.total_kelas.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            {tab1Data.length > 0 && (
              <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                <tr className="bg-amber-100 text-center font-black uppercase text-xs border-t-2 border-amber-200">
                  <td colSpan="2" className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-amber-200 text-amber-900">
                    TOTAL {isModeSemua ? 'KAL-BAR' : filterWilayah}
                  </td>
                  <td className="px-4 py-4 text-amber-800 border-y border-amber-200">{grandTotalTab1.rombel_n.toLocaleString()}</td>
                  <td className="px-4 py-4 text-amber-900 border-y border-amber-200">{grandTotalTab1.kelas_n.toLocaleString()}</td>
                  <td className="px-4 py-4 text-orange-800 border-y border-amber-200">{grandTotalTab1.rombel_s.toLocaleString()}</td>
                  <td className="px-4 py-4 text-orange-900 border-y border-amber-200">{grandTotalTab1.kelas_s.toLocaleString()}</td>
                  <td className="px-4 py-4 text-amber-950 border-y border-l border-amber-200">{grandTotalTab1.total_rombel.toLocaleString()}</td>
                  <td className="px-4 py-4 text-amber-950 text-base border-y border-r border-amber-200 rounded-r-2xl bg-amber-200/50">{grandTotalTab1.total_kelas.toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
          {lastUpdated && (
             <div className="mt-4 px-2 text-right text-xs font-bold italic text-gray-400">
                Sumber Kalkulasi Engine : {lastUpdated}
             </div>
          )}
        </div>
      </div>

      {/* TABEL 2 */}
      <div className="bg-white rounded-3xl shadow-md border border-gray-100 overflow-hidden">
        <div className="bg-amber-600 px-6 py-5 border-b border-amber-700 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Activity className="text-amber-100" size={24} />
            <h3 className="font-black text-lg text-white uppercase tracking-tighter">Tabel 2: Hasil Analisa Ketercukupan Ruang Kelas</h3>
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex items-center bg-white/10 border border-amber-500/50 rounded-xl px-3 py-1.5 shadow-sm transition-all focus-within:ring-2 focus-within:ring-amber-400 w-full md:w-auto">
              <School size={16} className="text-amber-200 mr-2" />
              <select 
                value={filterStatusTab2} 
                onChange={(e) => setFilterStatusTab2(e.target.value)} 
                className="bg-transparent text-xs font-black uppercase text-white outline-none cursor-pointer w-full [&>option]:bg-amber-800 [&>option]:text-white"
              >
                <option value="SEMUA">Semua Status</option>
                <option value="NEGERI">Negeri</option>
                <option value="SWASTA">Swasta</option>
              </select>
            </div>
            <button onClick={handleUnduhTab2} className="flex items-center justify-center gap-2 text-xs font-black uppercase text-amber-900 bg-white px-4 py-2 rounded-xl hover:bg-amber-50 transition-colors w-full md:w-auto shrink-0 shadow-sm">
              <Download size={14} /> Unduh
            </button>
          </div>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-center border-separate border-spacing-y-2">
            <thead className="sticky top-0 bg-white z-10 shadow-sm rounded-xl">
              <tr className="text-[10px] font-black uppercase text-gray-500 bg-amber-50/50">
                <th className="px-4 py-4 rounded-l-xl w-12">No</th>
                <th className="px-4 py-4 text-left">{isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan'}</th>
                {activeColumns.map(k => (
                  <th key={k} className="px-2 py-4 text-amber-800 border-l border-amber-100 whitespace-nowrap">{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tab2DataDisplay.map((row, idx) => (
                <tr key={idx} className="bg-white shadow-sm hover:shadow-md transition-all group">
                  <td className="px-4 py-4 rounded-l-xl font-bold text-gray-400 text-xs border-y border-l border-gray-100">{idx + 1}</td>
                  <td className="px-4 py-4 font-black text-gray-800 text-sm uppercase text-left border-y border-gray-100 whitespace-nowrap">
                    {row.group_label}
                  </td>
                  {activeColumns.map((k, kIdx) => {
                    const isLast = kIdx === activeColumns.length - 1;
                    return (
                      <td key={k} className={`px-2 py-4 border-y border-l border-gray-100 bg-gray-50/30 text-sm ${isLast ? 'rounded-r-xl border-r' : ''}`}>
                        {renderRatio(row[`${k}_rombel`], row[`${k}_kelas`], k)}
                      </td>
                    );
                  })}
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

      {/* INFO BOX */}
      <div className="bg-amber-50 border border-amber-200 p-6 rounded-3xl flex flex-col md:flex-row items-start gap-6 shadow-sm mb-12">
        <div className="bg-amber-600 text-white p-3 rounded-2xl shrink-0 shadow-md"><Info size={28}/></div>
        <div className="text-sm text-amber-900 leading-relaxed w-full">
          <strong className="font-black text-base uppercase tracking-widest block mb-3 text-amber-800">Acuan Standar Minimum Fasilitas Kelas</strong>
          <p className="font-medium opacity-90 mb-3">
            Berdasarkan prinsip optimalisasi pembelajaran, idealnya setiap rombongan belajar (rombel) menempati satu ruang kelas fisik yang layak.
          </p>
          <div className="grid grid-cols-1 font-bold opacity-90">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-500"></div> Rasio Ideal = 1 Rombel : 1 Ruang Kelas.</div>
          </div>
          <div className="mt-4 pt-4 border-t border-amber-200/50 text-xs italic opacity-80 font-bold">
            * Format Rasio <span className="text-amber-700 font-black">1 : X</span>. Angka <span className="text-amber-700 font-black">1</span> mewakili 1 Rombel, dan <span className="text-amber-700 font-black">X</span> adalah rasio ketersediaan Ruang Kelas Fisik.<br/>
            Warna <span className="text-red-600 font-black">Merah</span> = Kurang Kelas (Jumlah rombel lebih besar dari jumlah kelas, terjadi shift/numpang). Warna <span className="text-emerald-600 font-black">Hijau</span> = Ideal (Minimal 1 Kelas per Rombel).
          </div>
        </div>
      </div>

      {/* MODAL AI ANALISIS MENEMPEL DI HALAMAN INI */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative">
            
            {/* Header Modal AI */}
            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gradient-to-r from-amber-50 to-orange-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-amber-600 p-2 rounded-xl text-white"><Sparkles size={24} /></div>
                <div>
                  <h3 className="font-black text-xl text-amber-900 uppercase">Laporan Eksekutif</h3>
                  <p className="text-xs font-bold text-amber-600">SITAKA 2026 - Analisa Rasio Rombel VS Ruang Kelas</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {aiResult && (
                  <button onClick={() => handleAnalisisAI(true)} title="Analisa Ulang" className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 text-xs font-bold px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors shadow-sm">
                    <RefreshCw size={16} className={isAnalyzing ? 'animate-spin' : ''} />
                  </button>
                )}
                {aiResult && (
                  <button onClick={handleDownloadPDF} className="flex items-center gap-2 bg-amber-600 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-amber-700 transition-colors shadow-md">
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
                  <Sparkles size={64} className="text-amber-500 animate-pulse mb-4" />
                  <p className="font-black text-xl uppercase tracking-widest text-amber-800">Tunggu, Sedang Berpikir...</p>
                  <p className="text-sm font-bold text-gray-400 mt-2">Menganalisis Data Ketercukupan Ruang Kelas Fisik Terhadap Rombel</p>
                </div>
              ) : aiResult ? (
                <div className="flex flex-col gap-8 pb-10">
                  
                  {/* KOP LAPORAN UNTUK PDF */}
                  <div className="text-center pb-4 border-b-2 border-amber-100">
                    <h2 className="text-2xl font-black text-amber-900 uppercase">Ringkasan Analitik</h2>
                    <p className="text-sm font-bold text-gray-500 mt-1">Data Agregasi Rasio Rombel vs Ruang Kelas ({selectedYear})</p>
                    <p className="text-xs font-medium text-gray-400 mt-1">Wilayah: {filterWilayah} | Kategori: {activeKategori}</p>
                  </div>

                  {/* Kesimpulan */}
                  <div className="bg-white p-6 rounded-2xl border border-amber-100 shadow-sm">
                    <h4 className="font-black text-lg text-amber-900 mb-3 flex items-center gap-2">
                       <Info size={20} /> KESIMPULAN UMUM
                    </h4>
                    <p className="text-gray-700 leading-relaxed font-medium text-justify whitespace-pre-wrap">{aiResult.kesimpulanUmum}</p>
                  </div>

                  {/* Grafik Tabel 1 (Recharts) dengan Dual Y-Axis */}
                  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm h-80">
                     <h4 className="font-black text-sm text-gray-800 mb-4 uppercase text-center">Grafik Ketersediaan Ruang Kelas per Jenjang</h4>
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={tab1Data} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                          <XAxis dataKey="jenjang" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 'bold' }} />
                          {/* Y-Axis Kiri untuk Rombel */}
                          <YAxis yAxisId="left" orientation="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#D97706' }} />
                          {/* Y-Axis Kanan untuk Kelas */}
                          <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#B45309' }} />
                          
                          <Tooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                          <Legend wrapperStyle={{ paddingTop: '20px', fontWeight: 'bold', fontSize: '12px' }} />
                          
                          {/* Hubungkan batang dengan yAxisId yang sesuai */}
                          <Bar yAxisId="left" dataKey="total_rombel" name="Total Rombongan Belajar" fill="#D97706" radius={[4, 4, 0, 0]} />
                          <Bar yAxisId="right" dataKey="total_kelas" name="Total Ruang Kelas Fisik" fill="#B45309" radius={[4, 4, 0, 0]} />
                        </BarChart>
                     </ResponsiveContainer>
                  </div>

                  {/* Grid Jenjang Terpadat / Kekurangan */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100">
                      <h4 className="font-black text-emerald-800 uppercase mb-3">Jenjang Paling Ideal</h4>
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
                      <h4 className="font-black text-red-800 uppercase mb-3">Jenjang Kurang Ideal (Defisit Kelas)</h4>
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
                      <h4 className="font-black text-teal-800 uppercase mb-3">Wilayah Paling Ideal</h4>
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
                      <h4 className="font-black text-orange-800 uppercase mb-3">Wilayah Kurang Ideal</h4>
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
                        {aiLastUpdated && <p className="text-[10px] opacity-70 mt-1">Terakhir dianalisa: {formatAiDate(aiLastUpdated)}</p>}
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