import React, { useState, useEffect, useMemo } from 'react';
import { MapPin, Info, Search, Download, Loader2, Activity, School, GraduationCap, Users, Sparkles, X, FileText, RefreshCw } from 'lucide-react';
import { db } from '../../../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import ExcelJS from 'exceljs';
import { PDFDownloadLink } from '@react-pdf/renderer';
import LaporanEksekutifPDF from '../../../utils/LaporanEksekutifPDF';

// --- TAMBAHAN LIBRARY UNTUK AI ---
import { GoogleGenerativeAI } from "@google/generative-ai";
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

// KAPASITAS IDEAL GURU PER 1 SEKOLAH (SESUAIKAN DENGAN ATURAN BPMP/DINAS)
const IDEAL_CAPACITY_GURU = {
  'PAUD': 4,         
  'SD': 10,             
  'SMP': 15,            
  'SMA': 25,        
  'SMK': 25,       
  'SLB (Inklusif)': 6, 
  'NON FORMAL': 5     
};

const renderRatio = (sekCount, guruCount, jenjang) => {
  if (sekCount === 0 && guruCount === 0) return <span className="text-gray-300 font-normal">-</span>;
  if (sekCount === 0 && guruCount > 0) return <span className="text-red-500 font-bold text-[10px]">Error (0 Sek)</span>;
  
  const ratio = guruCount / sekCount;
  const idealMax = (IDEAL_CAPACITY_GURU[jenjang] || 15) * 1.5; // Toleransi kelebihan guru
  const idealMin = (IDEAL_CAPACITY_GURU[jenjang] || 15) * 0.7; // Standar minimal guru
  
  let colorClass = 'text-emerald-600'; 
  
  if (ratio > idealMax) {
    colorClass = 'text-red-600'; // Kelebihan guru (menumpuk)
  } else if (ratio < idealMin) {
    colorClass = 'text-blue-600'; // Kekurangan guru
  }

  return <span className={`font-black ${colorClass} tracking-wider`}>1 : {ratio.toFixed(1)}</span>;
};

// =====================================================================
// MAIN COMPONENT
// =====================================================================
export default function RasioSekolahVsGuru({ selectedYear }) {
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
        const docRef = doc(db, 'dapodik_agregasi', `rasio_sekolah_guru_${selectedYear}`);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
           const data = docSnap.data();
           
           // Kita hanya butuh tabel2 mentah karena tabel2 berisi detail per kecamatan.
           // Nanti tabel 1 (rekap provinsi/kabupaten) akan kita hitung dinamis dari tabel2.
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
           setError(`Data Rasio Sekolah VS Guru tahun ${selectedYear} belum dikalkulasi.`);
           setRawTab2Data([]); 
        }
      } catch (err) {
        console.error("Gagal fetch rasio sekolah vs guru:", err);
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
    activeColumns.forEach(k => t1Map.set(k, { jenjang: k, sek_n: 0, guru_n: 0, sek_s: 0, guru_s: 0, total_sek: 0, total_guru: 0 }));

    const t2Map = new Map();

    rawTab2Data.forEach(row => {
       // Filter wilayah terlebih dahulu
       if (!isModeSemua && row.wilayah !== filterWilayah) return;

       // Tentukan grup (Jika SEMUA, grup per Kabupaten. Jika SPESIFIK, grup per Kecamatan)
       const groupKey = isModeSemua ? row.wilayah : row.kecamatan;

       if (!t2Map.has(groupKey)) {
           const init = { group_label: groupKey };
           activeColumns.forEach(k => {
               init[`${k}_sek_n`] = 0; init[`${k}_guru_n`] = 0;
               init[`${k}_sek_s`] = 0; init[`${k}_guru_s`] = 0;
           });
           t2Map.set(groupKey, init);
       }

       const t2Node = t2Map.get(groupKey);

       // Looping ke kolom jenjang pendidikan yang aktif saja
       activeColumns.forEach(k => {
           // Menarik data dari row mentah
           const sn = parseInt(row[`${k}_sek_n`]) || 0;
           const gn = parseInt(row[`${k}_guru_n`]) || 0;
           const ss = parseInt(row[`${k}_sek_s`]) || 0;
           const gs = parseInt(row[`${k}_guru_s`]) || 0;

           // Akumulasi Tabel 1
           const t1Node = t1Map.get(k);
           if (t1Node) {
               t1Node.sek_n += sn;
               t1Node.guru_n += gn;
               t1Node.sek_s += ss;
               t1Node.guru_s += gs;
               t1Node.total_sek += (sn + ss);
               t1Node.total_guru += (gn + gs);
           }

           // Akumulasi Tabel 2
           t2Node[`${k}_sek_n`] += sn;
           t2Node[`${k}_guru_n`] += gn;
           t2Node[`${k}_sek_s`] += ss;
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
  
  // Terapkan Filter Status Negeri/Swasta pada Tabel 2
  const tab2DataDisplay = useMemo(() => {
    return processedData.tab2.map(row => {
       const mapped = { group_label: row.group_label };
       activeColumns.forEach(k => {
           let sek = 0; let guru = 0;
           if (filterStatusTab2 === 'SEMUA') {
               sek = row[`${k}_sek_n`] + row[`${k}_sek_s`];
               guru = row[`${k}_guru_n`] + row[`${k}_guru_s`];
           } else if (filterStatusTab2 === 'NEGERI') {
               sek = row[`${k}_sek_n`];
               guru = row[`${k}_guru_n`];
           } else if (filterStatusTab2 === 'SWASTA') {
               sek = row[`${k}_sek_s`];
               guru = row[`${k}_guru_s`];
           }
           mapped[`${k}_sek`] = sek;
           mapped[`${k}_guru`] = guru;
       });
       return mapped;
    });
  }, [processedData.tab2, filterStatusTab2, activeColumns]);

  const grandTotalTab1 = useMemo(() => {
    return tab1Data.reduce((acc, curr) => {
      acc.sek_n += curr.sek_n;
      acc.guru_n += curr.guru_n;
      acc.sek_s += curr.sek_s;
      acc.guru_s += curr.guru_s;
      acc.total_sek += curr.total_sek;
      acc.total_guru += curr.total_guru;
      return acc;
    }, { sek_n: 0, guru_n: 0, sek_s: 0, guru_s: 0, total_sek: 0, total_guru: 0 });
  }, [tab1Data]);

  // --- LOGIKA AI GEMINI (DENGAN FIREBASE CACHING & FALLBACK) ---
  const handleAnalisisAI = async (forceRefresh = false) => {
    if (!genAI) {
      alert("API Key Gemini belum disetting di .env (VITE_GEMINI_API_KEY)");
      return;
    }
    
    setIsModalOpen(true);
    setIsAnalyzing(true);

    const formatIdKategori = activeKategori.replace(/\s+/g, '');
    const formatIdWilayah = filterWilayah.replace(/\s+/g, '');
    const docId = `sekolah_guru_${selectedYear}_${formatIdKategori}_${formatIdWilayah}_${filterStatusTab2}`;

    try {
      if (!forceRefresh) {
        const cachedRef = doc(db, 'laporan_ai_rasio_guru', docId);
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
        total_sekolah: r.total_sek,
        total_guru: r.total_guru,
        rasio_aktual: r.total_sek > 0 ? (r.total_guru / r.total_sek).toFixed(2) : 0
      }));

      const tipeWilayah = isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan';
      const payloadTabel2 = tab2DataDisplay.map(r => {
        let rowData = { wilayah: r.group_label };
        activeColumns.forEach(k => {
           rowData[`${k}_sek`] = r[`${k}_sek`];
           rowData[`${k}_guru`] = r[`${k}_guru`];
           rowData[`${k}_rasio`] = r[`${k}_sek`] > 0 ? (r[`${k}_guru`] / r[`${k}_sek`]).toFixed(2) : 0;
        });
        return rowData;
      });

      const prompt = `
        Kamu adalah AI Analis Data Pendidikan di aplikasi SITAKA 2026. Gunakan bahasa formal standar laporan eksekutif.
        Saya memiliki data Rasio Sekolah berbanding Guru (Pendidik) untuk Provinsi Kalimantan Barat.
        Tahun Data: ${selectedYear}. Wilayah Filter saat ini: ${filterWilayah}. Kategori Jenjang: ${activeKategori}.
        
        Standar Rata-Rata Guru per Sekolah (Asumsi):
        - PAUD/TK/KB: Minimal 4 Guru/Sekolah
        - SD: Minimal 10 Guru/Sekolah
        - SMP: Minimal 15 Guru/Sekolah
        - SMA/SMK: Minimal 20-25 Guru/Sekolah
        - SLB: Minimal 6 Guru/Sekolah
        - Non Formal: Minimal 5 Guru/Sekolah

        Berikut adalah data Tabel 1 (Ringkasan per Jenjang):
        ${JSON.stringify(payloadTabel1)}

        Berikut adalah data Tabel 2 (Sebaran per ${tipeWilayah}):
        ${JSON.stringify(payloadTabel2)}

        Berdasarkan data di atas, berikan analisa ringkas dan tajam dengan output format JSON murni.
        KEMBALIKAN HANYA FORMAT JSON YANG VALID TANPA MARKDOWN sesuai struktur berikut ini:
        {
          "kesimpulanUmum": "Dua paragraf padat tentang kondisi umum distribusi guru dan pemenuhan kebutuhan pendidik berdasarkan data menggunakan bahasa Indonesia formal laporan.",
          "jenjangTertinggi": [ { "jenjang": "Nama Jenjang", "alasan": "Penjelasan ringkas wilayah/jenjang yang memiliki rasio guru berlebih (menumpuk)" } ],
          "jenjangTerendah": [ { "jenjang": "Nama Jenjang", "alasan": "Penjelasan ringkas wilayah/jenjang yang mengalami kekurangan guru" } ],
          "wilayahTertinggi": [ { "wilayah": "Nama Wilayah", "alasan": "Sebutkan alasan spesifik yang membuat wilayah ini rasio gurunya sangat tinggi/berlebih" } ],
          "wilayahTerendah": [ { "wilayah": "Nama Wilayah", "alasan": "Sebutkan alasan spesifik yang membuat wilayah ini rasio gurunya minim (krisis guru)" } ]
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

      if (!success) throw lastError || new Error("Semua model Gemini gagal diakses.");
      
      responseText = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();
      const parsedData = JSON.parse(responseText);
      
      const timestamp = new Date().toISOString();
      await setDoc(doc(db, 'laporan_ai_rasio_guru', docId), {
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

  // --- EXCEL EXPORTS ---
  const handleUnduhTab1 = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ketersediaan Data Utama');
    worksheet.columns = [
      { header: 'Jenjang', key: 'jenjang', width: 20 },
      { header: 'Sekolah (Negeri)', key: 'sek_n', width: 18 },
      { header: 'Guru (Negeri)', key: 'guru_n', width: 15 },
      { header: 'Sekolah (Swasta)', key: 'sek_s', width: 18 },
      { header: 'Guru (Swasta)', key: 'guru_s', width: 15 },
      { header: 'Total Sekolah', key: 'total_sek', width: 18 },
      { header: 'Total Guru', key: 'total_guru', width: 18 },
    ];
    tab1Data.forEach(row => worksheet.addRow(row));
    const totalRow = worksheet.addRow({ jenjang: 'TOTAL KESELURUHAN', ...grandTotalTab1 });
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }; 
    totalRow.font = { bold: true, color: { argb: 'FF1E3A8A' } }; 
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }; 
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Rekap_Sekolah_Guru_${activeKategori}_${filterWilayah}_${selectedYear}.xlsx`;
    link.click();
  };

  const handleUnduhTab2 = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Analisa Rasio Ketersediaan Guru');
    worksheet.columns = [
      { header: isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan', key: 'wilayah_label', width: 30 },
      ...activeColumns.map(k => ({ header: k, key: k, width: 15 })),
    ];
    tab2DataDisplay.forEach(row => {
      const excelRow = { wilayah_label: row.group_label };
      activeColumns.forEach(k => {
        const sekCount = row[`${k}_sek`];
        const guruCount = row[`${k}_guru`];
        if (sekCount === 0 && guruCount === 0) excelRow[k] = '-';
        else if (sekCount === 0 && guruCount > 0) excelRow[k] = 'Error';
        else {
          const ratio = guruCount / sekCount;
          excelRow[k] = `1 : ${ratio.toFixed(1)}`;
        }
      });
      worksheet.addRow(excelRow);
    });
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Analisa_Rasio_Sekolah_Guru_${activeKategori}_${filterWilayah}_${filterStatusTab2}_${selectedYear}.xlsx`;
    link.click();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 opacity-60">
         <Loader2 size={64} className="text-blue-500 mb-4 animate-spin" />
         <p className="font-black text-xl text-blue-800 uppercase tracking-widest">Menarik Data Rasio Guru...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-orange-50 rounded-3xl border-2 border-orange-200 border-dashed text-orange-600">
         <p className="font-black text-lg uppercase tracking-widest text-center mb-2">{error}</p>
         <p className="text-sm font-bold text-center">
            Harap minta Admin untuk masuk ke menu Master Data dan klik tombol <span className="text-sky-600 bg-sky-100 px-2 py-0.5 rounded">Hitung {selectedYear}</span> pada modul <br/>
            <span className="text-sky-700 underline underline-offset-4 decoration-sky-300">Sekolah VS Guru</span>.
         </p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-8 animate-in slide-in-from-bottom-8 duration-500">
      
      {/* HEADER & FILTER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
        <div>
          <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter">Sekolah <span className="text-blue-500">VS</span> Guru (Pendidik)</h2>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1 mb-2">Modul Analisa Proporsi & Distribusi Guru</p>
          <p className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg inline-block shadow-sm">
            TIPS: Klik tombol "Analisa Data" untuk mendapatkan ringkasan dan hasil analisis data yang ditampilkan ini.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          
          <button 
            onClick={() => handleAnalisisAI(false)}
            disabled={tab1Data.length === 0}
            className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black uppercase text-sm px-5 py-2.5 rounded-2xl hover:scale-105 transition-all shadow-[0_0_15px_rgba(124,58,237,0.5)] animate-pulse hover:animate-none focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed disabled:animate-none"
          >
            <Sparkles size={18} />
            Analisa Data
          </button>

          <div className="flex items-center bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2 shadow-sm w-full sm:w-auto focus-within:ring-2 focus-within:ring-blue-200">
            <GraduationCap size={18} className="text-blue-600 mr-3" />
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

          <div className="flex items-center bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2 shadow-sm w-full sm:w-auto focus-within:ring-2 focus-within:ring-blue-200">
            <MapPin size={18} className="text-blue-600 mr-3" />
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
            <School className="text-blue-600" size={24} />
            <h3 className="font-black text-lg text-gray-800 uppercase tracking-tighter">Tabel 1: Ketersediaan Data Utama</h3>
          </div>
          <button onClick={handleUnduhTab1} className="flex items-center gap-2 text-xs font-black uppercase text-blue-600 bg-blue-50 px-4 py-2 rounded-xl hover:bg-blue-100 transition-colors">
            <Download size={14} /> Unduh
          </button>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-center border-separate border-spacing-y-2">
            <thead className="sticky top-0 bg-white z-10 shadow-sm rounded-xl">
              <tr className="text-[10px] font-black uppercase text-gray-500 bg-gray-50">
                <th className="px-4 py-4 rounded-l-xl w-12">No</th>
                <th className="px-4 py-4 text-left">Jenjang</th>
                <th className="px-4 py-4 text-blue-600 border-l border-gray-200">Sekolah (Negeri)</th>
                <th className="px-4 py-4 text-blue-600">Guru (Negeri)</th>
                <th className="px-4 py-4 text-orange-600 border-l border-gray-200">Sekolah (Swasta)</th>
                <th className="px-4 py-4 text-orange-600">Guru (Swasta)</th>
                <th className="px-4 py-4 text-gray-800 border-l border-gray-200 bg-gray-100">Total Sekolah</th>
                <th className="px-4 py-4 text-gray-800 rounded-r-xl bg-gray-100">Total Guru</th>
              </tr>
            </thead>
            <tbody>
              {tab1Data.map((row, idx) => (
                <tr key={idx} className="bg-white shadow-sm hover:shadow-md transition-all group">
                  <td className="px-4 py-3 rounded-l-xl font-bold text-gray-400 text-xs border-y border-l border-gray-100">{idx + 1}</td>
                  <td className="px-4 py-3 font-black text-gray-800 text-sm uppercase text-left border-y border-gray-100">{row.jenjang}</td>
                  <td className="px-4 py-3 font-bold text-blue-700 bg-blue-50/30 border-y border-l border-gray-100">{row.sek_n.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-blue-700 bg-blue-50/30 border-y border-gray-100">{row.guru_n.toLocaleString()}</td>
                  <td className="px-4 py-3 font-bold text-orange-700 bg-orange-50/20 border-y border-l border-gray-100">{row.sek_s.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-orange-700 bg-orange-50/20 border-y border-gray-100">{row.guru_s.toLocaleString()}</td>
                  <td className="px-4 py-3 font-bold text-gray-700 bg-gray-50 border-y border-l border-gray-100">{row.total_sek.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-gray-800 text-base bg-gray-100 border-y border-r border-gray-100 rounded-r-xl">{row.total_guru.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            {tab1Data.length > 0 && (
              <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                <tr className="bg-blue-100 text-center font-black uppercase text-xs border-t-2 border-blue-200">
                  <td colSpan="2" className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-blue-200 text-blue-900">
                    TOTAL {isModeSemua ? 'KAL-BAR' : filterWilayah}
                  </td>
                  <td className="px-4 py-4 text-blue-800 border-y border-blue-200">{grandTotalTab1.sek_n.toLocaleString()}</td>
                  <td className="px-4 py-4 text-blue-900 border-y border-blue-200">{grandTotalTab1.guru_n.toLocaleString()}</td>
                  <td className="px-4 py-4 text-orange-800 border-y border-blue-200">{grandTotalTab1.sek_s.toLocaleString()}</td>
                  <td className="px-4 py-4 text-orange-900 border-y border-blue-200">{grandTotalTab1.guru_s.toLocaleString()}</td>
                  <td className="px-4 py-4 text-blue-950 border-y border-blue-200">{grandTotalTab1.total_sek.toLocaleString()}</td>
                  <td className="px-4 py-4 text-blue-950 text-base border-y border-r border-blue-200 rounded-r-2xl bg-blue-200/50">{grandTotalTab1.total_guru.toLocaleString()}</td>
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
        <div className="bg-blue-900 px-6 py-5 border-b border-blue-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Activity className="text-blue-200" size={24} />
            <h3 className="font-black text-lg text-white uppercase tracking-tighter">Tabel 2: Hasil Analisa Distribusi Guru</h3>
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex items-center bg-white/10 border border-blue-700/50 rounded-xl px-3 py-1.5 shadow-sm transition-all focus-within:ring-2 focus-within:ring-blue-400 w-full md:w-auto">
              <School size={16} className="text-blue-300 mr-2" />
              <select 
                value={filterStatusTab2} 
                onChange={(e) => setFilterStatusTab2(e.target.value)} 
                className="bg-transparent text-xs font-black uppercase text-white outline-none cursor-pointer w-full [&>option]:bg-blue-800 [&>option]:text-white"
              >
                <option value="SEMUA">Semua Status</option>
                <option value="NEGERI">Negeri</option>
                <option value="SWASTA">Swasta</option>
              </select>
            </div>
            <button onClick={handleUnduhTab2} className="flex items-center justify-center gap-2 text-xs font-black uppercase text-blue-900 bg-white px-4 py-2 rounded-xl hover:bg-blue-50 transition-colors w-full md:w-auto shrink-0 shadow-sm">
              <Download size={14} /> Unduh
            </button>
          </div>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-center border-separate border-spacing-y-2">
            <thead className="sticky top-0 bg-white z-10 shadow-sm rounded-xl">
              <tr className="text-[10px] font-black uppercase text-gray-500 bg-blue-50/50">
                <th className="px-4 py-4 rounded-l-xl w-12">No</th>
                <th className="px-4 py-4 text-left">{isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan'}</th>
                {activeColumns.map(k => (
                  <th key={k} className="px-2 py-4 text-blue-800 border-l border-blue-100 whitespace-nowrap">{k}</th>
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
                        {renderRatio(row[`${k}_sek`], row[`${k}_guru`], k)}
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
      <div className="bg-blue-50 border border-blue-200 p-6 rounded-3xl flex flex-col md:flex-row items-start gap-6 shadow-sm mb-12">
        <div className="bg-blue-600 text-white p-3 rounded-2xl shrink-0 shadow-md"><Users size={28}/></div>
        <div className="text-sm text-blue-900 leading-relaxed w-full">
          <strong className="font-black text-base uppercase tracking-widest block mb-3 text-blue-800">Acuan Estimasi Kebutuhan Guru</strong>
          <p className="font-medium opacity-90 mb-3">
            Aturan Standar Rata-Rata Guru (Pendidik) per Sekolah:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3 font-bold opacity-90">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> PAUD/TK/KB: Min 4 Guru / Sek</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> SD: Min 10 Guru / Sekolah</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> SMP: Min 15 Guru / Sekolah</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> SMA, SMK: Min 20-25 Guru / Sekolah</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> SLB: Min 6 Guru / Sekolah</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> NON FORMAL: Min 5 Guru / Sekolah</div>
          </div>
          <div className="mt-4 pt-4 border-t border-blue-200/50 text-xs italic opacity-80 font-bold">
            * Format Rasio <span className="text-blue-700 font-black">1 : X</span>. Angka <span className="text-blue-700 font-black">1</span> adalah 1 Sekolah, dan <span className="text-blue-700 font-black">X</span> adalah Rata-rata Guru Aktual. <br/>
            Warna <span className="text-emerald-600 font-black">Hijau</span> = Ideal. Warna <span className="text-blue-600 font-black">Biru</span> = Kekurangan Guru (Di bawah minimal). Warna <span className="text-red-600 font-black">Merah</span> = Overload (Penumpukan Guru).
          </div>
        </div>
      </div>

      {/* MODAL AI ANALISIS MENEMPEL DI HALAMAN INI */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative">
            
            {/* Header Modal AI */}
            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-purple-600 p-2 rounded-xl text-white"><Sparkles size={24} /></div>
                <div>
                  <h3 className="font-black text-xl text-purple-900 uppercase">Laporan Eksekutif</h3>
                  <p className="text-xs font-bold text-purple-600">SITAKA 2026 - Analisa Rasio Sekolah VS Guru</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {aiResult && (
                  <button onClick={() => handleAnalisisAI(true)} title="Analisa Ulang" className="flex items-center gap-2 bg-white border border-gray-200 text-gray-600 text-xs font-bold px-3 py-2 rounded-xl hover:bg-gray-50 transition-colors shadow-sm">
                    <RefreshCw size={16} className={isAnalyzing ? 'animate-spin' : ''} />
                  </button>
                )}
                
                {/* --- UPDATE: TOMBOL UNDUH PDF DENGAN REACT-PDF --- */}
                {aiResult && (
                  <PDFDownloadLink
                    document={
                    <LaporanEksekutifPDF
                      judulLaporan="Analisa Rasio Sekolah VS Guru"
                      deskripsiLaporan={`Tahun ${selectedYear} - Estimasi Kebutuhan dan Distribusi Pendidik Berdasarkan Standar`}
                      tahun={selectedYear}
                      wilayah={filterWilayah}
                      kategori={activeKategori}
                      dataAI={aiResult}
                      // --- TAMBAHAN PROPS UNTUK GRAFIK GURU ---
                      chartData={tab1Data.map(d => ({ label: d.jenjang, v1: d.total_sek, v2: d.total_guru }))}
                      label1="Total Sekolah"
                      label2="Total Guru"
                    />
                    }
                    fileName={`Laporan_AI_Rasio_Sekolah_Vs_Guru_${filterWilayah}_${selectedYear}.pdf`}
                    className="flex items-center gap-2 bg-indigo-600 text-white text-xs font-bold px-4 py-2 rounded-xl hover:bg-indigo-700 transition-colors shadow-md hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {({ loading }) =>
                      loading ? (
                        <><Loader2 size={16} className="animate-spin" /> Memproses...</>
                      ) : (
                        <><FileText size={16} /> Unduh PDF</>
                      )
                    }
                  </PDFDownloadLink>
                )}

                <button onClick={() => setIsModalOpen(false)} className="p-2 bg-white rounded-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all shadow-sm">
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Body Modal AI yang Bisa Di-scroll */}
            <div className="p-8 overflow-y-auto flex-1 bg-gray-50/50" id="pdf-ai-content">
              {isAnalyzing ? (
                <div className="flex flex-col items-center justify-center h-64 opacity-70">
                  <Sparkles size={64} className="text-purple-500 animate-pulse mb-4" />
                  <p className="font-black text-xl uppercase tracking-widest text-purple-800">Tunggu, Sedang Berpikir...</p>
                  <p className="text-sm font-bold text-gray-400 mt-2">Menganalisis Sebaran Guru Pendidik</p>
                </div>
              ) : aiResult ? (
                <div className="flex flex-col gap-8 pb-10">
                  
                  {/* KOP LAPORAN UNTUK PDF */}
                  <div className="text-center pb-4 border-b-2 border-indigo-100">
                    <h2 className="text-2xl font-black text-indigo-900 uppercase">Ringkasan Analitik Distribusi Guru</h2>
                    <p className="text-sm font-bold text-gray-500 mt-1">Data Agregasi Rasio Sekolah vs Guru ({selectedYear})</p>
                    <p className="text-xs font-medium text-gray-400 mt-1">Wilayah: {filterWilayah} | Kategori: {activeKategori}</p>
                  </div>

                  {/* Kesimpulan */}
                  <div className="bg-white p-6 rounded-2xl border border-indigo-100 shadow-sm">
                    <h4 className="font-black text-lg text-indigo-900 mb-3 flex items-center gap-2">
                       <Info size={20} /> KESIMPULAN UMUM
                    </h4>
                    <p className="text-gray-700 leading-relaxed font-medium text-justify whitespace-pre-wrap">{aiResult.kesimpulanUmum}</p>
                  </div>

                  {/* Grafik Tabel 1 (Recharts) dengan Dual Y-Axis */}
                  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm h-80">
                     <h4 className="font-black text-sm text-gray-800 mb-4 uppercase text-center">Grafik Perbandingan Sekolah vs Guru</h4>
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={tab1Data} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                          <XAxis dataKey="jenjang" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 'bold' }} />
                          {/* Y-Axis Kiri untuk Sekolah */}
                          <YAxis yAxisId="left" orientation="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#8b5cf6' }} />
                          {/* Y-Axis Kanan untuk Guru */}
                          <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#4F46E5' }} />
                          
                          <Tooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                          <Legend wrapperStyle={{ paddingTop: '20px', fontWeight: 'bold', fontSize: '12px' }} />
                          
                          {/* Hubungkan batang dengan yAxisId yang sesuai */}
                          <Bar yAxisId="left" dataKey="total_sek" name="Total Sekolah" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                          <Bar yAxisId="right" dataKey="total_guru" name="Total Guru" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                        </BarChart>
                     </ResponsiveContainer>
                  </div>

                  {/* Grid Jenjang Penumpukan / Kekurangan */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-red-50 p-5 rounded-2xl border border-red-100">
                      <h4 className="font-black text-red-800 uppercase mb-3">Jenjang Penumpukan Guru (Overload)</h4>
                      <ul className="flex flex-col gap-3">
                        {aiResult.jenjangTertinggi?.map((item, i) => (
                          <li key={i} className="bg-white p-3 rounded-xl shadow-sm text-sm border border-red-50 flex flex-col gap-1">
                            <span className="font-black text-red-600 text-base">{item.jenjang}</span>
                            <span className="text-gray-600 font-medium leading-tight">{item.alasan}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100">
                      <h4 className="font-black text-blue-800 uppercase mb-3">Jenjang Krisis Guru (Kekurangan)</h4>
                      <ul className="flex flex-col gap-3">
                        {aiResult.jenjangTerendah?.map((item, i) => (
                          <li key={i} className="bg-white p-3 rounded-xl shadow-sm text-sm border border-blue-50 flex flex-col gap-1">
                            <span className="font-black text-blue-600 text-base">{item.jenjang}</span>
                            <span className="text-gray-600 font-medium leading-tight">{item.alasan}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  
                  {/* Grid Wilayah Penumpukan / Kekurangan */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-orange-50 p-5 rounded-2xl border border-orange-100">
                      <h4 className="font-black text-orange-800 uppercase mb-3">Wilayah Penumpukan Guru</h4>
                      <ul className="flex flex-col gap-3">
                        {aiResult.wilayahTertinggi?.map((item, i) => (
                          <li key={i} className="bg-white p-3 rounded-xl shadow-sm text-sm border border-orange-50 flex flex-col gap-1">
                            <span className="font-black text-orange-600 text-base">{item.wilayah}</span>
                            <span className="text-gray-600 font-medium leading-tight">{item.alasan}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="bg-emerald-50 p-5 rounded-2xl border border-emerald-100">
                      <h4 className="font-black text-emerald-800 uppercase mb-3">Wilayah Kekurangan Guru</h4>
                      <ul className="flex flex-col gap-3">
                        {aiResult.wilayahTerendah?.map((item, i) => (
                          <li key={i} className="bg-white p-3 rounded-xl shadow-sm text-sm border border-emerald-50 flex flex-col gap-1">
                            <span className="font-black text-emerald-600 text-base">{item.wilayah}</span>
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