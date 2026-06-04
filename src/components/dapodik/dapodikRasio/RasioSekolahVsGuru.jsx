import React, { useState, useEffect, useMemo } from 'react';
import { MapPin, Info, Search, Download, Loader2, Activity, School, GraduationCap, Users } from 'lucide-react';
import { db } from '../../../firebase/config';
import { collection, getDocs, getDoc, doc, query, where } from 'firebase/firestore';
import ExcelJS from 'exceljs';

// =====================================================================
// UTILITY: CACHING LOKAL (BRANKAS BROWSER) MULTI-DB
// =====================================================================
const CACHE_EXPIRY_HOURS = 12;

const initDB = (dbName, storeName) => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 1);
    request.onupgradeneeded = (e) => e.target.result.createObjectStore(storeName);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveToCache = async (dbName, storeName, key, data) => {
  try {
    const db = await initDB(dbName, storeName);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put({ data, timestamp: Date.now() }, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) { console.warn(`Gagal menyimpan ke cache ${storeName}`, err); }
};

const getFromCache = async (dbName, storeName, key) => {
  try {
    const db = await initDB(dbName, storeName);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
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

// Fungsi Penentu Kolom Berdasarkan Raw Jenjang
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

// Standar Minimal Guru per Sekolah (Acuan Dasar)
const MIN_GURU_PER_SEKOLAH = {
  'TK': 2, 'KB': 2, 'SPS': 2, 'TPA': 2,
  'SD': 6, 'SPK SD': 6,
  'SMP': 5, 'SPK SMP': 5,
  'SMA': 7, 'SPK SMA': 7,
  'SMK': 7,
  'SLB': 4,
  'NON FORMAL': 3, 'PKBM': 3, 'SKB': 3
};

// Fungsi render UI rasio dengan logika warna
const renderRatio = (sekCount, guruCount, jenjang) => {
  if (sekCount === 0 && guruCount === 0) return <span className="text-gray-300 font-normal">-</span>;
  if (sekCount === 0 && guruCount > 0) return <span className="text-red-500 font-bold text-[10px]">Error (0 Sek)</span>;
  
  const ratio = guruCount / sekCount;
  const minGuru = MIN_GURU_PER_SEKOLAH[jenjang] || 3;
  
  let colorClass = 'text-emerald-600'; // IDEAL
  
  if (ratio < minGuru) {
    colorClass = 'text-red-600'; // KURANG GURU
  } else if (ratio > minGuru * 4) {
    colorClass = 'text-blue-600'; // SURPLUS GURU (Sangat banyak guru menumpuk di satu sekolah)
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
  
  const [mergedData, setMergedData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState('');

  // --- FETCH DATA (Membaca Chunks Sekolah & Guru, Lalu Di-Merge) ---
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      const cacheKeySekolah = `sekolah_agregasi_v1_${selectedYear}`;
      const cacheKeyGuru = `guru_agregasi_v1_${selectedYear}`;
      
      try {
        // --- 1. FETCH SEKOLAH TAHAP 1 ---
        let sekolahData = await getFromCache("SitakaCacheDB_SekolahModul_Agregasi", "sekolahDataAgg", cacheKeySekolah);
        let lastUpdSekolah = '';
        
        if (!sekolahData) {
            sekolahData = [];
            const summaryRef = doc(db, 'sekolah_agregasi', `summary_${selectedYear}`);
            const summarySnap = await getDoc(summaryRef);
            if (summarySnap.exists()) {
                if(summarySnap.data().last_updated) lastUpdSekolah = summarySnap.data().last_updated;
                let qChunks = query(collection(db, 'sekolah_agregasi'), where('tahun_data', '==', String(selectedYear)));
                let snapChunks = await getDocs(qChunks);
                if(snapChunks.empty){
                    qChunks = query(collection(db, 'sekolah_agregasi'), where('tahun_data', '==', Number(selectedYear)));
                    snapChunks = await getDocs(qChunks);
                }
                snapChunks.forEach(docChunk => {
                    if (docChunk.id.includes('_chunk_')) {
                       const arr = docChunk.data().data_agregasi;
                       if(Array.isArray(arr)) sekolahData.push(...arr);
                    }
                });
                if(sekolahData.length > 0) await saveToCache("SitakaCacheDB_SekolahModul_Agregasi", "sekolahDataAgg", cacheKeySekolah, sekolahData);
            }
        }

        // --- 2. FETCH GURU TAHAP 2 ---
        let guruData = await getFromCache("SitakaCacheDB_GuruModul_Agregasi", "guruDataAgg", cacheKeyGuru);
        let lastUpdGuru = '';
        
        if (!guruData) {
            guruData = [];
            const summaryRef = doc(db, 'guru_agregasi', `summary_${selectedYear}`);
            const summarySnap = await getDoc(summaryRef);
            if (summarySnap.exists()) {
                if(summarySnap.data().last_updated) lastUpdGuru = summarySnap.data().last_updated;
                let qChunks = query(collection(db, 'guru_agregasi'), where('tahun_data', '==', String(selectedYear)));
                let snapChunks = await getDocs(qChunks);
                if(snapChunks.empty){
                    qChunks = query(collection(db, 'guru_agregasi'), where('tahun_data', '==', Number(selectedYear)));
                    snapChunks = await getDocs(qChunks);
                }
                snapChunks.forEach(docChunk => {
                    if (docChunk.id.includes('_chunk_')) {
                       const arr = docChunk.data().data_agregasi;
                       if(Array.isArray(arr)) guruData.push(...arr);
                    }
                });
                if(guruData.length > 0) await saveToCache("SitakaCacheDB_GuruModul_Agregasi", "guruDataAgg", cacheKeyGuru, guruData);
            }
        }

        if (!sekolahData || sekolahData.length === 0 || !guruData || guruData.length === 0) {
            setError(`Data Sekolah atau Guru tahun ${selectedYear} belum dikalkulasi.`);
            setMergedData([]);
        } else {
            // --- 3. MERGE DATA SEKOLAH & GURU (REALTIME) ---
            const mapSekolah = new Map();
            sekolahData.forEach(s => {
                if(s.npsn) mapSekolah.set(s.npsn, { ...s, guru_aktual: 0 });
            });
            guruData.forEach(g => {
                if(g.npsn && mapSekolah.has(g.npsn)){
                    mapSekolah.get(g.npsn).guru_aktual++;
                }
            });

            setMergedData(Array.from(mapSekolah.values()));
            
            const useDate = lastUpdGuru || lastUpdSekolah;
            if(useDate){
                const d = new Date(useDate);
                const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
                setLastUpdated(`${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`);
            } else {
                setLastUpdated('Tidak Diketahui');
            }
        }
      } catch (err) {
          console.error(err);
          setError("Gagal menarik data dari server.");
          setMergedData([]);
      } finally {
          setLoading(false);
      }
    };
    fetchData();
  }, [selectedYear]);

  const isModeSemua = filterWilayah === 'SEMUA';
  const activeColumns = COLUMN_MAP[activeKategori] || COLUMN_MAP['SEMUA'];

  // --- ENGINE KOMPUTASI REAL-TIME TABEL 1 & TABEL 2 ---
  const processedData = useMemo(() => {
    if (!mergedData || !Array.isArray(mergedData) || mergedData.length === 0) {
        return { tab1: [], tab2: [] };
    }

    const t1Map = new Map();
    activeColumns.forEach(k => t1Map.set(k, { jenjang: k, sek_n: 0, guru_n: 0, sek_s: 0, guru_s: 0, total_sek: 0, total_guru: 0 }));

    const t2Map = new Map();

    mergedData.forEach(item => {
       if (!item) return;

       const jenjangDb = item.bentuk_pendidikan || item.jenjang;
       const colKey = getColumnKey(jenjangDb, activeKategori);
       if (!colKey) return; 

       const isNegeri = String(item.status_sekolah).toUpperCase() === 'NEGERI';
       const guruTotal = item.guru_aktual;

       // Filter Wilayah untuk Tab 1
       const kabDb = cleanKabupatenName(item.kabupaten);
       if (isModeSemua || kabDb === filterWilayah) {
           const t1Row = t1Map.get(colKey);
           if (t1Row) {
               if (isNegeri) { t1Row.sek_n++; t1Row.guru_n += guruTotal; }
               else { t1Row.sek_s++; t1Row.guru_s += guruTotal; }
               t1Row.total_sek++;
               t1Row.total_guru += guruTotal;
           }
       }

       // Penyiapan Data Tab 2 (Breakdown Wilayah)
       const kecDb = String(item.kecamatan || 'TIDAK DIKETAHUI').trim().toUpperCase();
       if (!isModeSemua && kabDb !== filterWilayah) return;

       const groupKey = isModeSemua ? kabDb : kecDb;

       if (!t2Map.has(groupKey)) {
           const init = { wilayah: kabDb, kecamatan: kecDb, group_label: groupKey };
           activeColumns.forEach(k => {
               init[`${k}_sek_n`] = 0; init[`${k}_guru_n`] = 0;
               init[`${k}_sek_s`] = 0; init[`${k}_guru_s`] = 0;
           });
           t2Map.set(groupKey, init);
       }

       const t2Row = t2Map.get(groupKey);
       if (isNegeri) {
           t2Row[`${colKey}_sek_n`]++;
           t2Row[`${colKey}_guru_n`] += guruTotal;
       } else {
           t2Row[`${colKey}_sek_s`]++;
           t2Row[`${colKey}_guru_s`] += guruTotal;
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
  }, [mergedData, activeKategori, filterWilayah, isModeSemua, activeColumns]);

  const tab1Data = processedData.tab1;
  
  // Format data Tab 2 agar responsif terhadap filter Status Negeri/Swasta
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

  // --- LOGIKA GRAND TOTAL TABEL 1 ---
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

  // --- EXCEL EXPORTS ---
  const handleUnduhTab1 = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ketersediaan Sekolah vs Guru');

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

    const totalRow = worksheet.addRow({
      jenjang: 'TOTAL KESELURUHAN',
      ...grandTotalTab1
    });

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } }; 

    totalRow.font = { bold: true, color: { argb: 'FF064E3B' } }; 
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }; 

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Rekap_Sekolah_Guru_${activeKategori}_${filterWilayah}_${selectedYear}.xlsx`;
    link.click();
  };

  const handleUnduhTab2 = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Analisa Rasio Guru per Sekolah');

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
        else if (sekCount === 0 && guruCount > 0) excelRow[k] = 'Error (0 Sekolah)';
        else {
          const ratio = guruCount / sekCount;
          excelRow[k] = `1 : ${ratio.toFixed(1)}`;
        }
      });
      worksheet.addRow(excelRow);
    });

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Analisa_Rasio_Guru_per_Sekolah_${activeKategori}_${filterWilayah}_${filterStatusTab2}_${selectedYear}.xlsx`;
    link.click();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 opacity-60">
         <Loader2 size={64} className="text-emerald-500 mb-4 animate-spin" />
         <p className="font-black text-xl text-emerald-800 uppercase tracking-widest">Menarik Data Rasio...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-orange-50 rounded-3xl border-2 border-orange-200 border-dashed text-orange-600">
         <p className="font-black text-lg uppercase tracking-widest text-center mb-2">{error}</p>
         <p className="text-sm font-bold text-center">
            Harap minta Admin untuk masuk ke menu Master Data dan klik tombol <span className="text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded">Hitung Tahun {selectedYear}</span> pada bagian <br/>
            <span className="text-emerald-700 underline underline-offset-4 decoration-emerald-300">Ringkasan Dashboard Sekolah (Tahap 1) dan Guru (Tahap 2)</span>.
         </p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-8 animate-in slide-in-from-bottom-8 duration-500">
      
      {/* HEADER & FILTER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
        <div>
          <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter">Sekolah <span className="text-emerald-500">VS</span> Guru</h2>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Modul Analisa Pemenuhan Tenaga Pendidik</p>
        </div>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
          {/* FILTER JENJANG/KATEGORI BARU */}
          <div className="flex items-center bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2 shadow-sm w-full sm:w-auto focus-within:ring-2 focus-within:ring-emerald-200">
            <GraduationCap size={18} className="text-emerald-600 mr-3" />
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

          <div className="flex items-center bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2 shadow-sm w-full sm:w-auto focus-within:ring-2 focus-within:ring-emerald-200">
            <MapPin size={18} className="text-emerald-600 mr-3" />
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
            <School className="text-emerald-600" size={24} />
            <h3 className="font-black text-lg text-gray-800 uppercase tracking-tighter">Tabel 1: Ketersediaan Data Utama</h3>
          </div>
          <button onClick={handleUnduhTab1} className="flex items-center gap-2 text-xs font-black uppercase text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl hover:bg-emerald-100 transition-colors">
            <Download size={14} /> Unduh
          </button>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-center border-separate border-spacing-y-2">
            <thead className="sticky top-0 bg-white z-10 shadow-sm rounded-xl">
              <tr className="text-[10px] font-black uppercase text-gray-500 bg-gray-50">
                <th className="px-4 py-4 rounded-l-xl w-12">No</th>
                <th className="px-4 py-4 text-left">Jenjang</th>
                <th className="px-4 py-4 text-emerald-600 border-l border-gray-200">Sekolah (Negeri)</th>
                <th className="px-4 py-4 text-emerald-600">Guru (Negeri)</th>
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
                  <td className="px-4 py-3 font-bold text-emerald-700 bg-emerald-50/30 border-y border-l border-gray-100">{row.sek_n.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-emerald-700 bg-emerald-50/30 border-y border-gray-100">{row.guru_n.toLocaleString()}</td>
                  <td className="px-4 py-3 font-bold text-orange-700 bg-orange-50/20 border-y border-l border-gray-100">{row.sek_s.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-orange-700 bg-orange-50/20 border-y border-gray-100">{row.guru_s.toLocaleString()}</td>
                  <td className="px-4 py-3 font-bold text-gray-700 bg-gray-50 border-y border-l border-gray-100">{row.total_sek.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-gray-800 text-base bg-gray-100 border-y border-r border-gray-100 rounded-r-xl">{row.total_guru.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            {/* TFOOT: BARIS GRAND TOTAL */}
            {tab1Data.length > 0 && (
              <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                <tr className="bg-emerald-100 text-center font-black uppercase text-xs border-t-2 border-emerald-200">
                  <td colSpan="2" className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-emerald-200 text-emerald-900">
                    TOTAL {isModeSemua ? 'KAL-BAR' : filterWilayah}
                  </td>
                  <td className="px-4 py-4 text-emerald-800 border-y border-emerald-200">{grandTotalTab1.sek_n.toLocaleString()}</td>
                  <td className="px-4 py-4 text-emerald-900 border-y border-emerald-200">{grandTotalTab1.guru_n.toLocaleString()}</td>
                  <td className="px-4 py-4 text-orange-800 border-y border-emerald-200">{grandTotalTab1.sek_s.toLocaleString()}</td>
                  <td className="px-4 py-4 text-orange-900 border-y border-emerald-200">{grandTotalTab1.guru_s.toLocaleString()}</td>
                  <td className="px-4 py-4 text-emerald-950 border-y border-emerald-200">{grandTotalTab1.total_sek.toLocaleString()}</td>
                  <td className="px-4 py-4 text-emerald-950 text-base border-y border-r border-emerald-200 rounded-r-2xl bg-emerald-200/50">{grandTotalTab1.total_guru.toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
          {/* INFO WAKTU UPDATE DAPODIK */}
          {lastUpdated && (
             <div className="mt-4 px-2 text-right text-xs font-bold italic text-gray-400">
                Sumber : Data Dapodik Update Pada Tanggal : {lastUpdated}
             </div>
          )}
        </div>
      </div>

      {/* TABEL 2: ANALISA RASIO */}
      <div className="bg-white rounded-3xl shadow-md border border-gray-100 overflow-hidden">
        <div className="bg-emerald-700 px-6 py-5 border-b border-emerald-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Activity className="text-emerald-100" size={24} />
            <h3 className="font-black text-lg text-white uppercase tracking-tighter">Tabel 2: Hasil Analisa Rasio Guru per Sekolah</h3>
          </div>
          
          {/* FILTER STATUS & TOMBOL UNDUH TABEL 2 */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex items-center bg-white/10 border border-emerald-500/50 rounded-xl px-3 py-1.5 shadow-sm transition-all focus-within:ring-2 focus-within:ring-emerald-400 w-full md:w-auto">
              <School size={16} className="text-emerald-200 mr-2" />
              <select 
                value={filterStatusTab2} 
                onChange={(e) => setFilterStatusTab2(e.target.value)} 
                className="bg-transparent text-xs font-black uppercase text-white outline-none cursor-pointer w-full [&>option]:bg-emerald-800 [&>option]:text-white"
              >
                <option value="SEMUA">Semua Status</option>
                <option value="NEGERI">Negeri</option>
                <option value="SWASTA">Swasta</option>
              </select>
            </div>
            <button onClick={handleUnduhTab2} className="flex items-center justify-center gap-2 text-xs font-black uppercase text-emerald-900 bg-white px-4 py-2 rounded-xl hover:bg-emerald-50 transition-colors w-full md:w-auto shrink-0 shadow-sm">
              <Download size={14} /> Unduh
            </button>
          </div>
        </div>
        
        <div className="overflow-x-auto p-4">
          <table className="w-full text-center border-separate border-spacing-y-2">
            <thead className="sticky top-0 bg-white z-10 shadow-sm rounded-xl">
              <tr className="text-[10px] font-black uppercase text-gray-500 bg-emerald-50/50">
                <th className="px-4 py-4 rounded-l-xl w-12">No</th>
                <th className="px-4 py-4 text-left">{isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan'}</th>
                {activeColumns.map(k => (
                  <th key={k} className="px-2 py-4 text-emerald-800 border-l border-emerald-100 whitespace-nowrap">{k}</th>
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
                Sumber : Data Dapodik Update Pada Tanggal : {lastUpdated}
             </div>
          )}
        </div>
      </div>

      {/* INFO BOX */}
      <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-3xl flex flex-col md:flex-row items-start gap-6 shadow-sm mb-12">
        <div className="bg-emerald-600 text-white p-3 rounded-2xl shrink-0 shadow-md"><Users size={28}/></div>
        <div className="text-sm text-emerald-900 leading-relaxed w-full">
          <strong className="font-black text-base uppercase tracking-widest block mb-3 text-emerald-800">Acuan Standar Pemenuhan Guru</strong>
          <p className="font-medium opacity-90 mb-3">
            Berdasarkan pedoman umum ketersediaan pendidik, rasio minimal guru yang harus ada dalam satu satuan pendidikan (sekolah) adalah:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3 font-bold opacity-90">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> TK, KB, SPS, TPA: Min. 2 Guru / Sekolah</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> SD: Min. 6 Guru / Sekolah</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> SMP: Min. 5 Guru / Sekolah</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> SMA, SMK: Min. 7 Guru / Sekolah</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> SLB: Min. 4 Guru / Sekolah</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> NON FORMAL: Min. 3 Guru / Sekolah</div>
          </div>
          <div className="mt-4 pt-4 border-t border-emerald-200/50 text-xs italic opacity-80 font-bold">
            * Format Rasio <span className="text-emerald-700 font-black">1 : X</span>. Angka <span className="text-emerald-700 font-black">1</span> mewakili 1 Sekolah, dan <span className="text-emerald-700 font-black">X</span> adalah Rata-rata Guru Aktual yang tersedia.<br/>
            Warna <span className="text-red-600 font-black">Merah</span> = Sekolah Kekurangan Guru (Di bawah standar minimal). Warna <span className="text-emerald-600 font-black">Hijau</span> = Ideal. Warna <span className="text-blue-600 font-black">Biru</span> = Guru menumpuk (sangat berlebih).
          </div>
        </div>
      </div>

    </div>
  );
}