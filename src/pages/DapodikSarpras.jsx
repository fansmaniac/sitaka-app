import React, { useState, useMemo, useEffect, useTransition } from 'react';
// TAMBAHAN: Import useSearchParams dari react-router-dom
import { useSearchParams } from 'react-router-dom';
import { 
  Building2, HardHat, FileSpreadsheet, Search, Eye, Loader2, AlertCircle
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { db } from '../firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';

// IMPORT KOMPONEN MODAL RINCIAN SARPRAS
import RincianSarpras from './RincianSarpras';

// =====================================================================
// UTILITY: CACHING LOKAL
// =====================================================================
const DB_NAME = "SitakaCacheDB_SarprasModul";
const STORE_NAME = "sarprasModulData";
const CACHE_EXPIRY_HOURS = 12;

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME);
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
        if (result) {
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
// UTILITY FUNCTIONS
// =====================================================================
const getVal = (obj, keyName) => {
  if (!obj) return '';
  const key = Object.keys(obj).find(k => k.trim().toLowerCase() === keyName.toLowerCase());
  return key ? obj[key] : '';
};

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

const getKabupatenRank = (kabName) => {
  const name = String(kabName).toUpperCase();
  if (name.includes("BENGKAYANG")) return 1;
  if (name.includes("KAPUAS HULU")) return 2;
  if (name.includes("KAYONG UTARA")) return 3;
  if (name.includes("KETAPANG")) return 4;
  if (name.includes("KUBU RAYA")) return 5;
  if (name.includes("LANDAK")) return 6;
  if (name.includes("MELAWI")) return 7;
  if (name.includes("MEMPAWAH")) return 8;
  if (name.includes("SAMBAS")) return 9;
  if (name.includes("SANGGAU")) return 10;
  if (name.includes("SEKADAU")) return 11;
  if (name.includes("SINTANG")) return 12;
  if (name.includes("PONTIANAK")) return 13;
  if (name.includes("SINGKAWANG")) return 14;
  return 99;
};

// PEMISAHAN JENJANG STRUKTUR COMPACT
const JENJANG_GROUPS = {
  'PAUD': ['KB', 'TK', 'SPS', 'TPA', 'PAUD'],
  'SD': ['SD', 'SPK SD'],
  'SMP': ['SMP', 'SPK SMP'],
  'SMA': ['SMA', 'SPK SMA'],
  'SMK': ['SMK'],
  'SLB': ['SLB', 'SDLB', 'SMPLB', 'SMALB'],
  'NON FORMAL': ['PKBM', 'SKB']
};

const identifyJenjangGroup = (jenjangDb) => {
  const j = String(jenjangDb).trim().toUpperCase();
  for (const [key, arr] of Object.entries(JENJANG_GROUPS)) {
    if (arr.includes(j)) return key;
  }
  return null;
};

// Fungsi Hitung Ruangan Layak Pakai
const sumUsableRooms = (item, prefix) => {
  const baik = parseInt(getVal(item, `${prefix}_baik`)) || 0;
  const rr = parseInt(getVal(item, `${prefix}_rusak_ringan`)) || 0;
  const rs = parseInt(getVal(item, `${prefix}_rusak_sedang`)) || 0;
  const rb = parseInt(getVal(item, `${prefix}_rusak_berat`)) || 0;
  return baik + rr + rs + rb; 
};

// =====================================================================
// MAIN COMPONENT
// =====================================================================
export default function DapodikSarpras({ selectedYear = '2026' }) {
  // --- PERUBAHAN UTAMA: Validasi Parameter URL yang kebal Error ---
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Array Tab Valid
  const SUB_TABS = ['SEMUA', 'PAUD', 'SD', 'SMP', 'SMA', 'SMK', 'SLB', 'NON FORMAL'];
  
  // Baca parameter, jika kotor/salah otomatis reset ke default yang aman
  const rawTab = (searchParams.get('tab') || 'JUMLAH').toUpperCase();
  const activeMainTab = ['JUMLAH', 'KESENJANGAN'].includes(rawTab) ? rawTab : 'JUMLAH';
  
  const rawJenjang = (searchParams.get('jenjang') || 'SEMUA').toUpperCase();
  const activeSubTab = SUB_TABS.includes(rawJenjang) ? rawJenjang : 'SEMUA';
  
  const rawStatus = (searchParams.get('status') || 'SEMUA').toUpperCase();
  const filterStatusSekolah = ['SEMUA', 'NEGERI', 'SWASTA'].includes(rawStatus) ? rawStatus : 'SEMUA';
  
  const [isPending, startTransition] = useTransition();

  // Fungsi pengubah URL state yang sinkron
  const setActiveMainTab = (val) => {
    setSearchParams(prev => {
      prev.set('tab', val);
      return prev;
    });
  };

  const handleStatusChange = (e) => {
    const nextVal = e.target.value;
    startTransition(() => {
      setSearchParams(prev => {
        prev.set('status', nextVal);
        return prev;
      });
    });
  };

  const handleSubTabChange = (targetTab) => {
    startTransition(() => {
      setSearchParams(prev => {
        prev.set('jenjang', targetTab);
        return prev;
      });
    });
  };
  // -------------------------------------------------------------------------

  // STATE KONTROL MODAL RINCIAN
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedWilayah, setSelectedWilayah] = useState('SEMUA');
  
  const [dataSarpras, setDataSarpras] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch Data dari Firebase
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const cacheKey = `sarpras_modul_v3_${selectedYear}`;
      
      try {
        const cachedData = await getFromCache(cacheKey);
        if (cachedData) {
          setDataSarpras(cachedData);
          setLoading(false);
          return;
        }

        const q = query(collection(db, 'data_sarpras_chunks'), where("tahun_data", "==", selectedYear));
        const snap = await getDocs(q);
        const freshData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        setDataSarpras(freshData);
        await saveToCache(cacheKey, freshData);
      } catch (error) {
        console.error("Gagal memuat data Sarpras:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedYear]);

  // Handler Pembuka Modal
  const handleBukaRincian = (wilayah) => {
    setSelectedWilayah(wilayah);
    setModalOpen(true);
  };

  // Engine Agregasi Data
  const aggregatedData = useMemo(() => {
    if (activeMainTab !== 'JUMLAH' || !dataSarpras) return [];

    const mapAgg = new Map();
    KABUPATEN_LIST.forEach(kab => {
      mapAgg.set(kab, {
        wilayah: kab,
        kelas: 0, perpus: 0, lab_komputer: 0, lab_bahasa: 0,
        lab_ipa: 0, lab_fisika: 0, lab_biologi: 0, kepsek: 0,
        guru: 0, wc_siswa: 0, wc_guru: 0
      });
    });

    dataSarpras.forEach(chunk => {
      if (chunk && Array.isArray(chunk.data)) {
        chunk.data.forEach(item => {
          if (filterStatusSekolah !== 'SEMUA') {
            const statusDb = String(getVal(item, 'status_sekolah') || '').toUpperCase();
            if (statusDb !== filterStatusSekolah) return;
          }

          const group = identifyJenjangGroup(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang'));
          if (activeSubTab !== 'SEMUA' && group !== activeSubTab) return;
          if (activeSubTab === 'SEMUA' && group === null) return;

          const kab = cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'));
          if (!mapAgg.has(kab)) return;

          const row = mapAgg.get(kab);
          
          row.kelas += sumUsableRooms(item, 'ruang_kelas');
          row.perpus += sumUsableRooms(item, 'ruang_perpustakaan');
          row.lab_komputer += sumUsableRooms(item, 'ruang_lab_komputer');
          row.lab_bahasa += sumUsableRooms(item, 'ruang_lab_bahasa');
          row.lab_ipa += sumUsableRooms(item, 'ruang_lab_ipa');
          row.lab_fisika += sumUsableRooms(item, 'ruang_lab_fisika');
          row.lab_biologi += sumUsableRooms(item, 'ruang_lab_biologi');
          row.kepsek += sumUsableRooms(item, 'ruang_ruang_kepsek');
          row.guru += sumUsableRooms(item, 'ruang_ruang_guru');
          
          row.wc_siswa += sumUsableRooms(item, 'ruang_wc_siswa_laki_laki') + sumUsableRooms(item, 'ruang_wc_siswa_perempuan');
          row.wc_guru += sumUsableRooms(item, 'ruang_wc_guru_laki_laki') + sumUsableRooms(item, 'ruang_wc_guru_perempuan');
        });
      }
    });

    return Array.from(mapAgg.values()).sort((a, b) => getKabupatenRank(a.wilayah) - getKabupatenRank(b.wilayah));
  }, [dataSarpras, activeMainTab, activeSubTab, filterStatusSekolah]);

  const grandTotals = useMemo(() => {
    return aggregatedData.reduce((acc, curr) => {
      acc.kelas += curr.kelas; acc.perpus += curr.perpus;
      acc.lab_komputer += curr.lab_komputer; acc.lab_bahasa += curr.lab_bahasa;
      acc.lab_ipa += curr.lab_ipa; acc.lab_fisika += curr.lab_fisika; acc.lab_biologi += curr.lab_biologi;
      acc.kepsek += curr.kepsek; acc.guru += curr.guru;
      acc.wc_siswa += curr.wc_siswa; acc.wc_guru += curr.wc_guru;
      return acc;
    }, { 
      kelas: 0, perpus: 0, lab_komputer: 0, lab_bahasa: 0, lab_ipa: 0, 
      lab_fisika: 0, lab_biologi: 0, kepsek: 0, guru: 0, wc_siswa: 0, wc_guru: 0 
    });
  }, [aggregatedData]);

  // EXPORT EXCEL
  const downloadExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheetName = activeSubTab === 'SEMUA' ? 'Sarpras Semua Jenjang' : `Sarpras ${activeSubTab}`;
    const worksheet = workbook.addWorksheet(sheetName);

    worksheet.columns = [
      { header: 'Wilayah (Kabupaten/Kota)', key: 'wilayah', width: 30 },
      { header: 'Ruang Kelas', key: 'kelas', width: 15 },
      { header: 'Perpustakaan', key: 'perpus', width: 15 },
      { header: 'Lab Komputer', key: 'lab_komputer', width: 15 },
      { header: 'Lab Bahasa', key: 'lab_bahasa', width: 15 },
      { header: 'Lab IPA', key: 'lab_ipa', width: 15 },
      { header: 'Lab Fisika', key: 'lab_fisika', width: 15 },
      { header: 'Lab Biologi', key: 'lab_biologi', width: 15 },
      { header: 'Ruang Kepsek', key: 'kepsek', width: 15 },
      { header: 'Ruang Guru', key: 'guru', width: 15 },
      { header: 'WC Siswa', key: 'wc_siswa', width: 15 },
      { header: 'WC Guru', key: 'wc_guru', width: 15 }
    ];

    aggregatedData.forEach(item => worksheet.addRow(item));

    const totalRow = worksheet.addRow({ wilayah: 'TOTAL KESELURUHAN', ...grandTotals });

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0891B2' } }; 
    totalRow.font = { bold: true, color: { argb: 'FF134E4A' } }; 
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFBF1' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const fileNameSuffix = activeSubTab === 'SEMUA' ? 'Semua_Jenjang' : activeSubTab.replace(/\//g, '_');
    link.download = `Rekap_Sarpras_LayakPakai_${filterStatusSekolah}_${fileNameSuffix}_${selectedYear}.xlsx`;
    link.click();
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center italic font-black uppercase tracking-widest text-cyan-300">
        <Loader2 className="animate-spin text-cyan-600 mb-4" size={64} />
        Memuat Koleksi Data Sarpras...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500">
      
      {/* HEADER UTAMA SARPRAS */}
      <div className="bg-white px-4 md:px-6 py-4 border-b border-gray-100 flex flex-col gap-4 shrink-0 shadow-sm z-20">
        
        {/* Main Tabs */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-2">
             <div className="bg-cyan-100 p-2.5 rounded-xl text-cyan-700">
               <Building2 size={24} />
             </div>
             <div>
               <h2 className="font-black text-gray-800 text-lg md:text-xl uppercase tracking-tighter leading-none">Infrastruktur & Sarpras</h2>
               <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Data Kondisi Bangunan Tahun {selectedYear}</p>
             </div>
          </div>
          
          <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-2xl w-full md:w-auto">
            <button 
              onClick={() => setActiveMainTab('JUMLAH')} 
              className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl font-black uppercase text-[10px] md:text-xs transition-all shadow-sm ${activeMainTab === 'JUMLAH' ? 'bg-white text-cyan-700 scale-[1.02]' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Jumlah Sarpras
            </button>
            <button 
              onClick={() => setActiveMainTab('KESENJANGAN')} 
              className={`flex-1 md:flex-none px-6 py-2.5 rounded-xl font-black uppercase text-[10px] md:text-xs transition-all shadow-sm ${activeMainTab === 'KESENJANGAN' ? 'bg-white text-cyan-700 scale-[1.02]' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Kesenjangan Sarpras
            </button>
          </div>
        </div>

        {/* Sub Tabs & Kontrol Unduh/Filter */}
        {activeMainTab === 'JUMLAH' && (
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            
            {/* Navigasi Jenjang Compact */}
            <div className="flex items-center gap-1.5 md:gap-2 overflow-x-auto pb-1 custom-scrollbar w-full md:w-auto">
              {SUB_TABS.map(jenjang => (
                <button 
                  key={jenjang} 
                  onClick={() => handleSubTabChange(jenjang)} 
                  className={`px-4 py-2 rounded-lg font-black text-[10px] md:text-xs transition-all duration-300 whitespace-nowrap border uppercase tracking-wider ${activeSubTab === jenjang ? 'bg-cyan-800 text-white border-cyan-800 shadow-md' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                >
                  {jenjang === 'SEMUA' ? 'Semua Jenjang' : jenjang}
                </button>
              ))}
            </div>

            {/* Kontrol Kanan: Dropdown Status & Tombol Unduh */}
            <div className="flex items-center gap-3 w-full md:w-auto relative">
              
              {/* Indikator Loading Transisi Halus */}
              {isPending && (
                <span className="absolute -left-6 top-1/2 -translate-y-1/2 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
                </span>
              )}

              {/* Dropdown Filter Status Sekolah */}
              <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm w-full md:w-auto transition-colors focus-within:border-cyan-500 focus-within:ring-2 focus-within:ring-cyan-100">
                <Building2 size={16} className="text-gray-400 mr-2 shrink-0" />
                <select 
                  name="statusFilterSecured"
                  id="statusFilterSecured"
                  autoComplete="off"
                  value={filterStatusSekolah} 
                  onChange={handleStatusChange} 
                  className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer w-full pr-6 leading-tight tracking-wide"
                >
                  <option value="SEMUA">Semua Status</option>
                  <option value="NEGERI">Negeri</option>
                  <option value="SWASTA">Swasta</option>
                </select>
              </div>

              {/* Tombol Unduh Format Excel */}
              <button 
                onClick={downloadExcel} 
                className="flex items-center justify-center gap-2 bg-cyan-50 text-cyan-700 hover:bg-cyan-600 hover:text-white px-5 py-2.5 rounded-xl font-black uppercase text-[10px] md:text-xs shadow-sm border border-cyan-200 transition-all active:scale-95 shrink-0 w-full md:w-auto"
              >
                <FileSpreadsheet size={16} /> Unduh Format Excel
              </button>
            </div>

          </div>
        )}
      </div>

      {/* KONTEN UTAMA */}
      <div className={`flex-1 flex flex-col bg-gray-50/50 p-4 md:p-6 min-h-0 overflow-hidden transition-opacity duration-200 ${isPending ? 'opacity-60' : 'opacity-100'}`}>
        
        {activeMainTab === 'KESENJANGAN' ? (
          // TAMPILAN KESENJANGAN
          <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-3xl border border-gray-100 shadow-sm text-center p-8 animate-in zoom-in-95 duration-300">
             <div className="bg-amber-100 p-6 rounded-full text-amber-500 mb-6 relative">
                <HardHat size={64} />
                <AlertCircle className="absolute top-4 right-4 text-amber-600" size={24} />
             </div>
             <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tight">Kesenjangan Sarpras</h2>
             <p className="text-sm font-bold text-gray-400 mt-2 uppercase tracking-widest max-w-md">
                Modul ini sedang dalam tahap perumusan algoritma kalkulasi standar nasional pendidikan (SNP). Nantikan pembaruannya!
             </p>
          </div>
        ) : (
          // TAMPILAN TABEL JUMLAH SARPRAS
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 flex-1 flex flex-col overflow-hidden relative animate-in fade-in duration-300">
            <div className="flex-1 overflow-auto p-4 custom-scrollbar">
              <table className="w-full text-center border-separate border-spacing-y-2">
                <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm rounded-xl">
                  <tr className="text-[10px] font-black uppercase text-gray-500 whitespace-nowrap">
                    <th className="px-4 py-3 text-left rounded-l-xl">Kabupaten/Kota</th>
                    <th className="px-3 py-3 text-cyan-700">R. Kelas</th>
                    <th className="px-3 py-3 text-blue-600">Perpustakaan</th>
                    <th className="px-3 py-3 text-indigo-600">Lab Komputer</th>
                    <th className="px-3 py-3 text-violet-600">Lab Bahasa</th>
                    <th className="px-3 py-3 text-fuchsia-600">Lab IPA</th>
                    <th className="px-3 py-3 text-pink-600">Lab Fisika</th>
                    <th className="px-3 py-3 text-rose-600">Lab Biologi</th>
                    <th className="px-3 py-3 text-orange-600">R. Kepsek</th>
                    <th className="px-3 py-3 text-amber-600">R. Guru</th>
                    <th className="px-3 py-3 text-emerald-600">WC Siswa</th>
                    <th className="px-3 py-3 text-teal-600">WC Guru</th>
                    <th className="px-4 py-3 rounded-r-xl">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregatedData.map((row, idx) => (
                    <tr key={idx} className="bg-white shadow-sm hover:shadow-md hover:scale-[1.01] transition-all group">
                      <td className="px-4 py-3 rounded-l-2xl font-black text-gray-800 uppercase text-left border-y border-l border-gray-100 whitespace-nowrap">{row.wilayah}</td>
                      
                      <td className="px-3 py-3 font-bold text-cyan-700 text-sm border-y border-gray-100 bg-cyan-50/30">{row.kelas.toLocaleString()}</td>
                      <td className="px-3 py-3 font-bold text-blue-600 text-sm border-y border-gray-100 bg-blue-50/30">{row.perpus.toLocaleString()}</td>
                      <td className="px-3 py-3 font-bold text-indigo-600 text-sm border-y border-gray-100 bg-indigo-50/30">{row.lab_komputer.toLocaleString()}</td>
                      <td className="px-3 py-3 font-bold text-violet-600 text-sm border-y border-gray-100 bg-violet-50/30">{row.lab_bahasa.toLocaleString()}</td>
                      <td className="px-3 py-3 font-bold text-fuchsia-600 text-sm border-y border-gray-100 bg-fuchsia-50/30">{row.lab_ipa.toLocaleString()}</td>
                      <td className="px-3 py-3 font-bold text-pink-600 text-sm border-y border-gray-100 bg-pink-50/30">{row.lab_fisika.toLocaleString()}</td>
                      <td className="px-3 py-3 font-bold text-rose-600 text-sm border-y border-gray-100 bg-rose-50/30">{row.lab_biologi.toLocaleString()}</td>
                      <td className="px-3 py-3 font-bold text-orange-600 text-sm border-y border-gray-100 bg-orange-50/30">{row.kepsek.toLocaleString()}</td>
                      <td className="px-3 py-3 font-bold text-amber-600 text-sm border-y border-gray-100 bg-amber-50/30">{row.guru.toLocaleString()}</td>
                      <td className="px-3 py-3 font-bold text-emerald-600 text-sm border-y border-gray-100 bg-emerald-50/30">{row.wc_siswa.toLocaleString()}</td>
                      <td className="px-3 py-3 font-bold text-teal-600 text-sm border-y border-gray-100 bg-teal-50/30">{row.wc_guru.toLocaleString()}</td>

                      <td className="px-4 py-3 rounded-r-2xl border-y border-r border-gray-100">
                         <button onClick={() => handleBukaRincian(row.wilayah)} className="flex items-center justify-center gap-2 bg-cyan-50 text-cyan-600 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase hover:bg-cyan-600 hover:text-white transition-colors mx-auto">
                           <Eye size={12} /> Rincian
                         </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                  <tr className="bg-gray-100 text-center font-black uppercase text-xs border-t-2 border-gray-300 whitespace-nowrap">
                    <td className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-gray-300 text-gray-900">TOTAL PROVINSI</td>
                    <td className="px-3 py-4 text-cyan-800 border-y border-gray-300">{grandTotals.kelas.toLocaleString()}</td>
                    <td className="px-3 py-4 text-blue-800 border-y border-gray-300">{grandTotals.perpus.toLocaleString()}</td>
                    <td className="px-3 py-4 text-indigo-800 border-y border-gray-300">{grandTotals.lab_komputer.toLocaleString()}</td>
                    <td className="px-3 py-4 text-violet-800 border-y border-gray-300">{grandTotals.lab_bahasa.toLocaleString()}</td>
                    <td className="px-3 py-4 text-fuchsia-800 border-y border-gray-300">{grandTotals.lab_ipa.toLocaleString()}</td>
                    <td className="px-3 py-4 text-pink-800 border-y border-gray-300">{grandTotals.lab_fisika.toLocaleString()}</td>
                    <td className="px-3 py-4 text-rose-800 border-y border-gray-300">{grandTotals.lab_biologi.toLocaleString()}</td>
                    <td className="px-3 py-4 text-orange-800 border-y border-gray-300">{grandTotals.kepsek.toLocaleString()}</td>
                    <td className="px-3 py-4 text-amber-800 border-y border-gray-300">{grandTotals.guru.toLocaleString()}</td>
                    <td className="px-3 py-4 text-emerald-800 border-y border-gray-300">{grandTotals.wc_siswa.toLocaleString()}</td>
                    <td className="px-3 py-4 text-teal-800 border-y border-gray-300">{grandTotals.wc_guru.toLocaleString()}</td>
                    <td className="px-4 py-4 rounded-r-2xl border-y border-r border-gray-300">
                       <button onClick={() => handleBukaRincian('SEMUA')} className="flex items-center justify-center gap-2 bg-gray-800 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase hover:bg-gray-900 transition-colors mx-auto shadow-md">
                         <Search size={14} /> Semua
                       </button>
                    </td>
                  </tr>
                </tfoot>
              </table>
              <div className="mt-4 px-2 text-right text-[10px] font-bold italic text-gray-400 pb-2">
                 *Angka menampilkan total ruangan yang Layak Pakai (Kondisi: Baik, Rusak Ringan, Rusak Sedang, Rusak Berat). Ruangan dengan kondisi "Tidak Bisa Dipakai" tidak dihitung.
              </div>
            </div>
          </div>
        )}
      </div>

      {/* KONDISIONAL RENDER MODAL RINCIAN SARPRAS */}
      <RincianSarpras 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)}
        data={dataSarpras}
        initialWilayah={selectedWilayah}
        activeJenjang={activeSubTab}
        filterStatusParent={filterStatusSekolah}
        displayLastUpdated={`Tahun Data ${selectedYear}`}
      />

    </div>
  );
}