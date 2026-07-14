import React, { useState, useEffect, useMemo } from 'react';
import { MapPin, Info, Search, Download, Loader2, Activity, School, GraduationCap, Users, Sparkles, X, FileText, RefreshCw } from 'lucide-react';
import { db } from '../../../firebase/config';
import { collection, getDocs, getDoc, doc, query, where, setDoc } from 'firebase/firestore';
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
// UTILITY: CACHING LOKAL (BRANKAS BROWSER) DIBUAT KHUSUS SISWA
// =====================================================================
const DB_NAME = "SitakaCacheDB_SiswaModul_Agregasi"; 
const STORE_NAME = "siswaDataAgg";
const CACHE_EXPIRY_HOURS = 12;

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
        }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveToCache = async (key, data) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ data, timestamp: Date.now() }, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) { console.warn("Gagal menyimpan ke cache lokal", err); }
};

const getFromCache = async (key) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => {
        const result = req.result;
        if (result && Array.isArray(result.data)) {
          const hoursOld = (Date.now() - result.timestamp) / (1000 * 60 * 60);
          if (hoursOld < CACHE_EXPIRY_HOURS) return resolve(result.data);
        }
        resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  } catch (err) { return null; }
};

// =====================================================================
// UTILITY FUNCTIONS & PENGELOMPOKAN
// =====================================================================
const KABUPATEN_LIST = [
  "BENGKAYANG", "KAPUAS HULU", "KAYONG UTARA", "KETAPANG", 
  "KUBU RAYA", "LANDAK", "MELAWI", "MEMPAWAH", "PONTIANAK", 
  "SAMBAS", "SANGGAU", "SEKADAU", "SINGKAWANG", "SINTANG"
];

const cleanKabupatenName = (rawName) => {
  if (!rawName) return "TIDAK DIKETAHUI";
  let name = String(rawName).toUpperCase().replace(/^(KAB\.|KABUPATEN|KOTA)\s+/i, '').trim();
  const found = KABUPATEN_LIST.find(kab => name.includes(kab));
  if (found) return found;
  return name; 
};

// PETA KOLOM BERDASARKAN KATEGORI YANG DIPILIH
const COLUMN_MAP = {
  'SEMUA': ['TK', 'SD', 'SMP', 'SMA', 'SMK', 'SLB', 'NON FORMAL'],
  'PAUD': ['TK', 'KB', 'SPS', 'TPA'],
  'DASAR': ['SD', 'SPK SD', 'SMP', 'SPK SMP'],
  'MENENGAH': ['SMA', 'SPK SMA', 'SMK'],
  'INKLUSIF': ['SLB'],
  'NON FORMAL': ['PKBM', 'SKB']
};

const getColumnKey = (jenjangDb, category) => {
  const j = String(jenjangDb || '').trim().toUpperCase();
  if (category === 'SEMUA') {
      if (j === 'TK') return 'TK';
      if (['SD', 'SPK SD'].includes(j)) return 'SD';
      if (['SMP', 'SPK SMP'].includes(j)) return 'SMP';
      if (['SMA', 'SPK SMA'].includes(j)) return 'SMA';
      if (j === 'SMK') return 'SMK';
      if (j.includes('SLB') || j.includes('LB')) return 'SLB';
      if (['PKBM', 'SKB'].includes(j)) return 'NON FORMAL';
  } else if (category === 'PAUD') {
      if (['TK', 'KB', 'SPS', 'TPA'].includes(j)) return j;
  } else if (category === 'DASAR') {
      if (['SD', 'SPK SD'].includes(j)) return 'SD';
      if (['SMP', 'SPK SMP'].includes(j)) return 'SMP';
  } else if (category === 'MENENGAH') {
      if (['SMA', 'SPK SMA'].includes(j)) return 'SMA';
      if (j === 'SMK') return 'SMK';
  } else if (category === 'INKLUSIF') {
      if (j.includes('SLB') || j.includes('LB')) return 'SLB';
  } else if (category === 'NON FORMAL') {
      if (['PKBM', 'SKB'].includes(j)) return 'NON FORMAL';
  }
  return null;
};

// KAPASITAS IDEAL PD PER 1 SEKOLAH BERDASARKAN PERMENDIKDASMEN 14/2026
const IDEAL_CAPACITY = {
  'TK': 2 * 15, 'KB': 2 * 15, 'SPS': 2 * 15, 'TPA': 2 * 15,         
  'SD': 6 * 28,             
  'SMP': 3 * 32,            
  'SMA': 3 * 36,        
  'SMK': 3 * 36,       
  'SLB': 3 * 8, 
  'NON FORMAL': 3 * 30     
};

const renderRatio = (sekCount, pdCount, jenjang) => {
  if (sekCount === 0 && pdCount === 0) return <span className="text-gray-300 font-normal">-</span>;
  if (sekCount === 0 && pdCount > 0) return <span className="text-red-500 font-bold text-[10px]">Error (0 Sek)</span>;
  
  const ratio = pdCount / sekCount;
  const idealMax = IDEAL_CAPACITY[jenjang] || 100;
  const idealMin = idealMax * 0.4; 
  
  let colorClass = 'text-emerald-600'; 
  
  if (ratio > idealMax) {
    colorClass = 'text-red-600'; 
  } else if (ratio < idealMin) {
    colorClass = 'text-blue-600'; 
  }

  return <span className={`font-black ${colorClass} tracking-wider`}>1 : {ratio.toFixed(0)}</span>;
};

// =====================================================================
// MAIN COMPONENT
// =====================================================================
export default function RasioSekolahVsPD({ selectedYear }) {
  const [activeKategori, setActiveKategori] = useState('SEMUA');
  const [filterWilayah, setFilterWilayah] = useState('SEMUA');
  const [filterStatusTab2, setFilterStatusTab2] = useState('SEMUA'); 
  
  const [rawSiswaData, setRawSiswaData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState('');

  // STATE UNTUK MODAL AI
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiLastUpdated, setAiLastUpdated] = useState(null);

  // --- FETCH DATA DARI TAHAP 3 (SISWA AGREGASI) ---
  useEffect(() => {
    const fetchAgregasi = async () => {
      setLoading(true);
      setError(null);
      const cacheKey = `siswa_agregasi_v2_${selectedYear}`; 
      
      try {
        let allData = [];
        let lastUpd = '';
        
        const cachedData = await getFromCache(cacheKey);
        
        if (cachedData && Array.isArray(cachedData) && cachedData.length > 0) {
          allData = cachedData;
          const summaryRef = doc(db, 'siswa_agregasi', `summary_${selectedYear}`);
          const summarySnap = await getDoc(summaryRef);
          if (summarySnap.exists() && summarySnap.data().last_updated) {
              const d = new Date(summarySnap.data().last_updated);
              const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
              lastUpd = `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
          }
        } else {
          const summaryRef = doc(db, 'siswa_agregasi', `summary_${selectedYear}`);
          const summarySnap = await getDoc(summaryRef);

          if (summarySnap.exists()) {
            const docData = summarySnap.data();
            if (docData.last_updated) {
              const d = new Date(docData.last_updated);
              const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
              lastUpd = `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;
            }
          }

          let qChunks = query(collection(db, 'siswa_agregasi'), where('tahun_data', '==', String(selectedYear)));
          let snapChunks = await getDocs(qChunks);

          if (snapChunks.empty) {
             qChunks = query(collection(db, 'siswa_agregasi'), where('tahun_data', '==', Number(selectedYear)));
             snapChunks = await getDocs(qChunks);
          }

          snapChunks.forEach(docChunk => {
            if (docChunk.id.includes('_chunk_')) {
               const chunkArray = docChunk.data().data_agregasi;
               if (Array.isArray(chunkArray)) {
                   allData.push(...chunkArray);
               }
            }
          });

          if(allData.length > 0) {
              await saveToCache(cacheKey, allData);
          }
        }
        
        if (!allData || allData.length === 0) {
           setError(`Data Peserta Didik tahun ${selectedYear} belum dikalkulasi.`);
           setRawSiswaData([]); 
        } else {
           setRawSiswaData(allData);
           setLastUpdated(lastUpd || 'Tidak Diketahui');
        }
      } catch (err) {
        console.error(err);
        setError("Gagal menarik data Peserta Didik dari server.");
        setRawSiswaData([]); 
      } finally {
        setLoading(false);
      }
    };

    fetchAgregasi();
  }, [selectedYear]);

  const isModeSemua = filterWilayah === 'SEMUA';
  const activeColumns = COLUMN_MAP[activeKategori] || COLUMN_MAP['SEMUA'];

  // --- ENGINE KOMPUTASI REAL-TIME TABEL 1 & TABEL 2 ---
  const processedData = useMemo(() => {
    if (!rawSiswaData || !Array.isArray(rawSiswaData) || rawSiswaData.length === 0) {
        return { tab1: [], tab2: [] };
    }

    const t1Map = new Map();
    activeColumns.forEach(k => t1Map.set(k, { jenjang: k, sek_n: 0, pd_n: 0, sek_s: 0, pd_s: 0, total_sek: 0, total_pd: 0 }));

    const t2Map = new Map();

    rawSiswaData.forEach(item => {
       if (!item) return;

       const jenjangDb = item.bentuk_pendidikan || item.jenjang;
       const colKey = getColumnKey(jenjangDb, activeKategori);
       if (!colKey) return; 

       const isNegeri = String(item.status_sekolah).toUpperCase() === 'NEGERI';
       const pdTotal = parseInt(item.pd_total) || 0;

       const kabDb = cleanKabupatenName(item.kabupaten);
       if (isModeSemua || kabDb === filterWilayah) {
           const t1Row = t1Map.get(colKey);
           if (t1Row) {
               if (isNegeri) { t1Row.sek_n++; t1Row.pd_n += pdTotal; }
               else { t1Row.sek_s++; t1Row.pd_s += pdTotal; }
               t1Row.total_sek++;
               t1Row.total_pd += pdTotal;
           }
       }

       const kecDb = String(item.kecamatan || 'TIDAK DIKETAHUI').trim().toUpperCase();
       if (!isModeSemua && kabDb !== filterWilayah) return;

       const groupKey = isModeSemua ? kabDb : kecDb;

       if (!t2Map.has(groupKey)) {
           const init = { wilayah: kabDb, kecamatan: kecDb, group_label: groupKey };
           activeColumns.forEach(k => {
               init[`${k}_sek_n`] = 0; init[`${k}_pd_n`] = 0;
               init[`${k}_sek_s`] = 0; init[`${k}_pd_s`] = 0;
           });
           t2Map.set(groupKey, init);
       }

       const t2Row = t2Map.get(groupKey);
       if (isNegeri) {
           t2Row[`${colKey}_sek_n`]++;
           t2Row[`${colKey}_pd_n`] += pdTotal;
       } else {
           t2Row[`${colKey}_sek_s`]++;
           t2Row[`${colKey}_pd_s`] += pdTotal;
       }
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
  }, [rawSiswaData, activeKategori, filterWilayah, isModeSemua, activeColumns]);

  const tab1Data = processedData.tab1;
  
  const tab2DataDisplay = useMemo(() => {
    return processedData.tab2.map(row => {
       const mapped = { group_label: row.group_label };
       activeColumns.forEach(k => {
           let sek = 0; let pd = 0;
           if (filterStatusTab2 === 'SEMUA') {
               sek = row[`${k}_sek_n`] + row[`${k}_sek_s`];
               pd = row[`${k}_pd_n`] + row[`${k}_pd_s`];
           } else if (filterStatusTab2 === 'NEGERI') {
               sek = row[`${k}_sek_n`];
               pd = row[`${k}_pd_n`];
           } else if (filterStatusTab2 === 'SWASTA') {
               sek = row[`${k}_sek_s`];
               pd = row[`${k}_pd_s`];
           }
           mapped[`${k}_sek`] = sek;
           mapped[`${k}_pd`] = pd;
       });
       return mapped;
    });
  }, [processedData.tab2, filterStatusTab2, activeColumns]);

  const grandTotalTab1 = useMemo(() => {
    return tab1Data.reduce((acc, curr) => {
      acc.sek_n += curr.sek_n;
      acc.pd_n += curr.pd_n;
      acc.sek_s += curr.sek_s;
      acc.pd_s += curr.pd_s;
      acc.total_sek += curr.total_sek;
      acc.total_pd += curr.total_pd;
      return acc;
    }, { sek_n: 0, pd_n: 0, sek_s: 0, pd_s: 0, total_sek: 0, total_pd: 0 });
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
    const docId = `sekolah_pd_${selectedYear}_${formatIdKategori}_${formatIdWilayah}_${filterStatusTab2}`;

    try {
      // 1. Cek Firebase Cache terlebih dahulu
      if (!forceRefresh) {
        const cachedRef = doc(db, 'laporan_ai_rasio', docId);
        const cachedSnap = await getDoc(cachedRef);
        if (cachedSnap.exists()) {
           const data = cachedSnap.data();
           setAiResult(data.result);
           setAiLastUpdated(data.last_updated);
           setIsAnalyzing(false);
           return; 
        }
      }

      // 2. Persiapkan Data & Prompt jika belum ada di Firebase / Force Refresh
      const payloadTabel1 = tab1Data.map(r => ({
        jenjang: r.jenjang,
        total_sekolah: r.total_sek,
        total_pd: r.total_pd,
        rasio_aktual: r.total_sek > 0 ? (r.total_pd / r.total_sek).toFixed(2) : 0
      }));

      const tipeWilayah = isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan';
      const payloadTabel2 = tab2DataDisplay.map(r => {
        let rowData = { wilayah: r.group_label };
        activeColumns.forEach(k => {
           rowData[`${k}_sek`] = r[`${k}_sek`];
           rowData[`${k}_pd`] = r[`${k}_pd`];
           rowData[`${k}_rasio`] = r[`${k}_sek`] > 0 ? (r[`${k}_pd`] / r[`${k}_sek`]).toFixed(2) : 0;
        });
        return rowData;
      });

      const prompt = `
        Kamu adalah AI Analis Data Pendidikan di aplikasi SITAKA 2026. Gunakan bahasa formal standar laporan eksekutif.
        Saya memiliki data Rasio Sekolah berbanding Peserta Didik (PD) untuk Provinsi Kalimantan Barat.
        Tahun Data: ${selectedYear}. Wilayah Filter saat ini: ${filterWilayah}. Kategori Jenjang: ${activeKategori}.
        
        Aturan Kapasitas Ideal (Permendikdasmen No 14 Tahun 2026):
        - TK/KB/SPS/TPA: Idealnya 30 PD/Sekolah
        - SD: Idealnya 168 PD/Sekolah
        - SMP: Idealnya 96 PD/Sekolah
        - SMA/SMK: Idealnya 108 PD/Sekolah
        - SLB: Idealnya 24 PD/Sekolah
        - Non Formal: Idealnya 90 PD/Sekolah

        Berikut adalah data Tabel 1 (Ringkasan per Jenjang):
        ${JSON.stringify(payloadTabel1)}

        Berikut adalah data Tabel 2 (Sebaran per ${tipeWilayah}):
        ${JSON.stringify(payloadTabel2)}

        Berdasarkan data di atas, berikan analisa ringkas dan tajam dengan output format JSON murni.
        KEMBALIKAN HANYA FORMAT JSON YANG VALID TANPA MARKDOWN sesuai struktur berikut ini:
        {
          "kesimpulanUmum": "Dua paragraf padat tentang kondisi umum daya tampung sekolah berdasarkan data menggunakan bahasa Indonesia formal laporan.",
          "jenjangTertinggi": [ { "jenjang": "Nama Jenjang", "alasan": "Penjelasan ringkas rasio aktual vs ideal" } ],
          "jenjangTerendah": [ { "jenjang": "Nama Jenjang", "alasan": "Penjelasan ringkas rasio aktual vs ideal" } ],
          "wilayahTertinggi": [ { "wilayah": "Nama Wilayah", "alasan": "Sebutkan alasan spesifik yang membuat wilayah ini rasio daya tampungnya paling terpadat" } ],
          "wilayahTerendah": [ { "wilayah": "Nama Wilayah", "alasan": "Sebutkan alasan spesifik yang membuat wilayah ini rasio daya tampungnya sepi/kurang" } ]
        }
        Catatan Penting: 
        1. Setiap Array (jenjang/wilayah) standarnya berisi 3 data tertinggi/terendah. 
        2. ATURAN SERI (TIE-BREAKER): Jika terdapat beberapa jenjang atau wilayah dengan nilai rasio yang sama (seri) pada batas posisi ke-3, maka masukkan SEMUANYA meskipun array tersebut akhirnya berisi lebih dari 3 data (misal 4 atau 5).
      `;

      const modelsToTry = [
        "gemini-2.5-flash", 
        "gemini-2.0-flash", 
        "gemini-1.5-pro", 
        "gemini-1.5-flash-latest", 
        "gemini-1.5-flash"
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
      
      // 3. Simpan Hasil ke Firebase agar Konsisten
      const timestamp = new Date().toISOString();
      await setDoc(doc(db, 'laporan_ai_rasio', docId), {
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

  // Format helper untuk tanggal laporan
  const formatAiDate = (isoString) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
    return `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()} - ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} WIB`;
  };

  // --- EXCEL EXPORTS ---
  const handleUnduhTab1 = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ketersediaan Data Utama');
    worksheet.columns = [
      { header: 'Jenjang', key: 'jenjang', width: 20 },
      { header: 'Sekolah (Negeri)', key: 'sek_n', width: 18 },
      { header: 'PD (Negeri)', key: 'pd_n', width: 15 },
      { header: 'Sekolah (Swasta)', key: 'sek_s', width: 18 },
      { header: 'PD (Swasta)', key: 'pd_s', width: 15 },
      { header: 'Total Sekolah', key: 'total_sek', width: 18 },
      { header: 'Total PD', key: 'total_pd', width: 18 },
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
    link.download = `Rekap_Sekolah_PD_${activeKategori}_${filterWilayah}_${selectedYear}.xlsx`;
    link.click();
  };

  const handleUnduhTab2 = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Analisa Rasio Daya Tampung');
    worksheet.columns = [
      { header: isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan', key: 'wilayah_label', width: 30 },
      ...activeColumns.map(k => ({ header: k, key: k, width: 15 })),
    ];
    tab2DataDisplay.forEach(row => {
      const excelRow = { wilayah_label: row.group_label };
      activeColumns.forEach(k => {
        const sekCount = row[`${k}_sek`];
        const pdCount = row[`${k}_pd`];
        if (sekCount === 0 && pdCount === 0) excelRow[k] = '-';
        else if (sekCount === 0 && pdCount > 0) excelRow[k] = 'Error';
        else {
          const ratio = pdCount / sekCount;
          excelRow[k] = `1 : ${ratio.toFixed(0)}`;
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
    link.download = `Analisa_Rasio_Sekolah_PD_${activeKategori}_${filterWilayah}_${filterStatusTab2}_${selectedYear}.xlsx`;
    link.click();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 opacity-60">
         <Loader2 size={64} className="text-blue-500 mb-4 animate-spin" />
         <p className="font-black text-xl text-blue-800 uppercase tracking-widest">Menarik Data Rasio...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-orange-50 rounded-3xl border-2 border-orange-200 border-dashed text-orange-600">
         <p className="font-black text-lg uppercase tracking-widest text-center mb-2">{error}</p>
         <p className="text-sm font-bold text-center">
            Harap minta Admin untuk masuk ke menu Master Data dan klik tombol <span className="text-sky-600 bg-sky-100 px-2 py-0.5 rounded">Hitung Tahun {selectedYear}</span> pada bagian <br/>
            <span className="text-sky-700 underline underline-offset-4 decoration-sky-300">Ringkasan Peserta Didik (Tahap 3)</span>.
         </p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-8 animate-in slide-in-from-bottom-8 duration-500">
      
      {/* HEADER & FILTER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
        <div>
          <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter">Sekolah <span className="text-blue-500">VS</span> Peserta Didik</h2>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1 mb-2">Modul Analisa Proporsi & Daya Tampung</p>
          <p className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-lg inline-block shadow-sm">
            TIPS: Klik tombol "Analisa Data" untuk mendapatkan ringkasan dan hasil analisis data yang ditampilkan ini.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          
          {/* TOMBOL AI DENGAN HIGHLIGHT */}
          <button 
            onClick={() => handleAnalisisAI(false)}
            disabled={tab1Data.length === 0}
            className="flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black uppercase text-sm px-5 py-2.5 rounded-2xl hover:scale-105 transition-all shadow-[0_0_15px_rgba(124,58,237,0.5)] animate-pulse hover:animate-none focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 disabled:opacity-50 disabled:scale-100 disabled:cursor-not-allowed disabled:animate-none"
          >
            <Sparkles size={18} />
            Analisa Data
          </button>

          {/* FILTER JENJANG/KATEGORI */}
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
                <th className="px-4 py-4 text-blue-600">PD (Negeri)</th>
                <th className="px-4 py-4 text-orange-600 border-l border-gray-200">Sekolah (Swasta)</th>
                <th className="px-4 py-4 text-orange-600">PD (Swasta)</th>
                <th className="px-4 py-4 text-gray-800 border-l border-gray-200 bg-gray-100">Total Sekolah</th>
                <th className="px-4 py-4 text-gray-800 rounded-r-xl bg-gray-100">Total PD</th>
              </tr>
            </thead>
            <tbody>
              {tab1Data.map((row, idx) => (
                <tr key={idx} className="bg-white shadow-sm hover:shadow-md transition-all group">
                  <td className="px-4 py-3 rounded-l-xl font-bold text-gray-400 text-xs border-y border-l border-gray-100">{idx + 1}</td>
                  <td className="px-4 py-3 font-black text-gray-800 text-sm uppercase text-left border-y border-gray-100">{row.jenjang}</td>
                  <td className="px-4 py-3 font-bold text-blue-700 bg-blue-50 border-y border-l border-gray-100">{row.sek_n.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-blue-700 bg-blue-50 border-y border-gray-100">{row.pd_n.toLocaleString()}</td>
                  <td className="px-4 py-3 font-bold text-orange-700 bg-orange-50 border-y border-l border-gray-100">{row.sek_s.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-orange-700 bg-orange-50 border-y border-gray-100">{row.pd_s.toLocaleString()}</td>
                  <td className="px-4 py-3 font-bold text-gray-700 bg-gray-50 border-y border-l border-gray-100">{row.total_sek.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-gray-800 text-base bg-gray-100 border-y border-r border-gray-100 rounded-r-xl">{row.total_pd.toLocaleString()}</td>
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
                  <td className="px-4 py-4 text-blue-900 border-y border-blue-200">{grandTotalTab1.pd_n.toLocaleString()}</td>
                  <td className="px-4 py-4 text-orange-800 border-y border-blue-200">{grandTotalTab1.sek_s.toLocaleString()}</td>
                  <td className="px-4 py-4 text-orange-900 border-y border-blue-200">{grandTotalTab1.pd_s.toLocaleString()}</td>
                  <td className="px-4 py-4 text-blue-950 border-y border-blue-200">{grandTotalTab1.total_sek.toLocaleString()}</td>
                  <td className="px-4 py-4 text-blue-950 text-base border-y border-r border-blue-200 rounded-r-2xl bg-blue-100">{grandTotalTab1.total_pd.toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
          {lastUpdated && (
             <div className="mt-4 px-2 text-right text-xs font-bold italic text-gray-400">
                Sumber : Data Dapodik Update Pada Tanggal : {lastUpdated}
             </div>
          )}
        </div>
      </div>

      {/* TABEL 2 */}
      <div className="bg-white rounded-3xl shadow-md border border-gray-100 overflow-hidden">
        <div className="bg-blue-900 px-6 py-5 border-b border-blue-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Activity className="text-blue-200" size={24} />
            <h3 className="font-black text-lg text-white uppercase tracking-tighter">Tabel 2: Hasil Analisa Rasio Daya Tampung</h3>
          </div>
          
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex items-center bg-blue-800 border border-blue-700 rounded-xl px-3 py-1.5 shadow-sm transition-all focus-within:ring-2 focus-within:ring-blue-400 w-full md:w-auto">
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
              <tr className="text-[10px] font-black uppercase text-gray-500 bg-blue-50">
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
                      <td key={k} className={`px-2 py-4 border-y border-l border-gray-100 bg-gray-50 text-sm ${isLast ? 'rounded-r-xl border-r' : ''}`}>
                        {renderRatio(row[`${k}_sek`], row[`${k}_pd`], k)}
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
                Sumber : Data Dapodik Update Pada Tanggal : {lastUpdated}
             </div>
          )}
        </div>
      </div>

      {/* INFO BOX */}
      <div className="bg-blue-50 border border-blue-200 p-6 rounded-3xl flex flex-col md:flex-row items-start gap-6 shadow-sm mb-12">
        <div className="bg-blue-600 text-white p-3 rounded-2xl shrink-0 shadow-md"><Users size={28}/></div>
        <div className="text-sm text-blue-900 leading-relaxed w-full">
          <strong className="font-black text-base uppercase tracking-widest block mb-3 text-blue-800">Acuan Permendikdasmen No. 14 Tahun 2026</strong>
          <p className="font-medium opacity-90 mb-3">
            Aturan Standar Rata-Rata Daya Tampung Peserta Didik per Sekolah (Ideal):
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3 font-bold opacity-90">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> TK, KB, SPS, TPA: Optimal 30 PD / Sek</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> SD: Optimal 168 PD / Sekolah</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> SMP: Optimal 96 PD / Sekolah</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> SMA, SMK: Optimal 108 PD / Sekolah</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> SLB: Optimal 24 PD / Sekolah</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> NON FORMAL: Optimal 90 PD / Sekolah</div>
          </div>
          <div className="mt-4 pt-4 border-t border-blue-200 text-xs italic font-bold">
            * Format Rasio <span className="text-blue-700 font-black">1 : X</span>. Angka <span className="text-blue-700 font-black">1</span> adalah 1 Sekolah, dan <span className="text-blue-700 font-black">X</span> adalah Rata-rata PD Aktual. <br/>
            Warna <span className="text-emerald-600 font-black">Hijau</span> = Ideal. Warna <span className="text-blue-600 font-black">Biru</span> = Kekurangan Murid (Di bawah minimal). Warna <span className="text-red-600 font-black">Merah</span> = Overload (Kapasitas siswa berlebih).
          </div>
        </div>
      </div>

      {/* MODAL AI ANALISIS MENEMPEL DI HALAMAN INI */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden relative">
            
            {/* Header Modal AI */}
            <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-gradient-to-r from-indigo-50 to-purple-50 shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-purple-600 p-2 rounded-xl text-white"><Sparkles size={24} /></div>
                <div>
                  <h3 className="font-black text-xl text-purple-900 uppercase">Laporan Eksekutif</h3>
                  <p className="text-xs font-bold text-purple-600">SITAKA 2026 - Analisa Rasio Sekolah VS Peserta Didik</p>
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
                      judulLaporan="Laporan Eksekutif Daya Tampung"
                      deskripsiLaporan={`SITAKA - Agregasi Rasio Sekolah vs Peserta Didik Tahun ${selectedYear}`}
                      tahun={selectedYear}
                      wilayah={filterWilayah}
                      kategori={activeKategori}
                      dataAI={aiResult}
                      // --- TAMBAHAN PROPS UNTUK GRAFIK SISWA ---
                      chartData={tab1Data.map(d => ({ label: d.jenjang, v1: d.total_sek, v2: d.total_pd }))}
                      label1="Total Sekolah"
                      label2="Total Murid"
                    />
                    }
                    fileName={`Laporan_AI_Rasio_Sekolah_Vs_PD_${filterWilayah}_${selectedYear}.pdf`}
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
            <div 
              className="p-8 overflow-y-auto flex-1" 
              style={{ backgroundColor: '#f9fafb', color: '#1f2937' }}
            >
              {isAnalyzing ? (
                <div className="flex flex-col items-center justify-center h-64 opacity-70">
                  <Sparkles size={64} style={{ color: '#a855f7' }} className="animate-pulse mb-4" />
                  <p className="font-black text-xl uppercase tracking-widest" style={{ color: '#6b21a8' }}>Tunggu, Sedang Berpikir...</p>
                  <p className="text-sm font-bold mt-2" style={{ color: '#9ca3af' }}>Menganalisis Permendikdasmen No 14 Tahun 2026</p>
                </div>
              ) : aiResult ? (
                <div className="flex flex-col gap-8 pb-10">
                  
                  {/* KOP LAPORAN UNTUK PDF */}
                  <div className="text-center pb-4 border-b-2" style={{ borderColor: '#e0e7ff' }}>
                    <h2 className="text-2xl font-black uppercase" style={{ color: '#312e81' }}>Ringkasan Analitik Daya Tampung</h2>
                    <p className="text-sm font-bold mt-1" style={{ color: '#6b7280' }}>Data Agregasi Rasio Sekolah vs Peserta Didik ({selectedYear})</p>
                    <p className="text-xs font-medium mt-1" style={{ color: '#9ca3af' }}>Wilayah: {filterWilayah} | Kategori: {activeKategori}</p>
                  </div>

                  {/* Kesimpulan */}
                  <div className="p-6 rounded-2xl border" style={{ backgroundColor: '#ffffff', borderColor: '#e0e7ff' }}>
                    <h4 className="font-black text-lg mb-3 flex items-center gap-2" style={{ color: '#312e81' }}>
                       <Info size={20} /> KESIMPULAN UMUM
                    </h4>
                    <p className="leading-relaxed font-medium text-justify whitespace-pre-wrap" style={{ color: '#374151' }}>{aiResult.kesimpulanUmum}</p>
                  </div>

                  {/* Grafik Tabel 1 (Recharts) dengan Dual Y-Axis */}
                  <div className="p-6 rounded-2xl border h-80" style={{ backgroundColor: '#ffffff', borderColor: '#f3f4f6' }}>
                     <h4 className="font-black text-sm mb-4 uppercase text-center" style={{ color: '#1f2937' }}>Grafik Perbandingan Sekolah vs Peserta Didik</h4>
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={tab1Data} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                          <XAxis dataKey="jenjang" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 'bold' }} />
                          {/* Y-Axis Kiri untuk Sekolah */}
                          <YAxis yAxisId="left" orientation="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#8b5cf6' }} />
                          {/* Y-Axis Kanan untuk Peserta Didik */}
                          <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#4F46E5' }} />
                          
                          <Tooltip cursor={{ fill: '#F3F4F6' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                          <Legend wrapperStyle={{ paddingTop: '20px', fontWeight: 'bold', fontSize: '12px' }} />
                          
                          <Bar yAxisId="left" dataKey="total_sek" name="Total Sekolah" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                          <Bar yAxisId="right" dataKey="total_pd" name="Total Peserta Didik" fill="#4F46E5" radius={[4, 4, 0, 0]} />
                        </BarChart>
                     </ResponsiveContainer>
                  </div>

                  {/* Grid Jenjang Terpadat / Kekurangan */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-5 rounded-2xl border" style={{ backgroundColor: '#fef2f2', borderColor: '#fee2e2' }}>
                      <h4 className="font-black uppercase mb-3" style={{ color: '#991b1b' }}>Jenjang Terpadat (Overload)</h4>
                      <ul className="flex flex-col gap-3">
                        {aiResult.jenjangTertinggi?.map((item, i) => (
                          <li key={i} className="p-3 rounded-xl text-sm border flex flex-col gap-1" style={{ backgroundColor: '#ffffff', borderColor: '#fef2f2' }}>
                            <span className="font-black text-base" style={{ color: '#dc2626' }}>{item.jenjang}</span>
                            <span className="font-medium leading-tight" style={{ color: '#4b5563' }}>{item.alasan}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="p-5 rounded-2xl border" style={{ backgroundColor: '#eff6ff', borderColor: '#dbeafe' }}>
                      <h4 className="font-black uppercase mb-3" style={{ color: '#1e40af' }}>Jenjang Jumlah Murid Ideal (Optimal)</h4>
                      <ul className="flex flex-col gap-3">
                        {aiResult.jenjangTerendah?.map((item, i) => (
                          <li key={i} className="p-3 rounded-xl text-sm border flex flex-col gap-1" style={{ backgroundColor: '#ffffff', borderColor: '#eff6ff' }}>
                            <span className="font-black text-base" style={{ color: '#2563eb' }}>{item.jenjang}</span>
                            <span className="font-medium leading-tight" style={{ color: '#4b5563' }}>{item.alasan}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                  
                  {/* Grid Wilayah Terpadat / Kekurangan */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-5 rounded-2xl border" style={{ backgroundColor: '#fff7ed', borderColor: '#ffedd5' }}>
                      <h4 className="font-black uppercase mb-3" style={{ color: '#9a3412' }}>Wilayah Terpadat</h4>
                      <ul className="flex flex-col gap-3">
                        {aiResult.wilayahTertinggi?.map((item, i) => (
                          <li key={i} className="p-3 rounded-xl text-sm border flex flex-col gap-1" style={{ backgroundColor: '#ffffff', borderColor: '#fff7ed' }}>
                            <span className="font-black text-base" style={{ color: '#ea580c' }}>{item.wilayah}</span>
                            <span className="font-medium leading-tight" style={{ color: '#4b5563' }}>{item.alasan}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="p-5 rounded-2xl border" style={{ backgroundColor: '#ecfdf5', borderColor: '#d1fae5' }}>
                      <h4 className="font-black uppercase mb-3" style={{ color: '#065f46' }}>Wilayah Paling Ideal</h4>
                      <ul className="flex flex-col gap-3">
                        {aiResult.wilayahTerendah?.map((item, i) => (
                          <li key={i} className="p-3 rounded-xl text-sm border flex flex-col gap-1" style={{ backgroundColor: '#ffffff', borderColor: '#ecfdf5' }}>
                            <span className="font-black text-base" style={{ color: '#059669' }}>{item.wilayah}</span>
                            <span className="font-medium leading-tight" style={{ color: '#4b5563' }}>{item.alasan}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* Footer Tanda Tangan AI */}
                  <div className="mt-8 pt-4 border-t flex justify-between items-end text-xs font-bold" style={{ borderColor: '#e5e7eb', color: '#9ca3af' }}>
                    <div>
                        <p>Digenerasi oleh: Gemini AI - SITAKA Engine</p>
                        {aiLastUpdated && <p className="text-[10px] mt-1">Terakhir dianalisa: {formatAiDate(aiLastUpdated)}</p>}
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