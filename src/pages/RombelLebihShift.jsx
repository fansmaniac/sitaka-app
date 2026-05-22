import React, { useState, useMemo, useEffect, useTransition } from 'react';
import { 
  Building2, HardHat, FileSpreadsheet, Search, Loader2, AlertCircle, 
  MapPin, School, ArrowUpDown
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { db } from '../firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';

// =====================================================================
// UTILITY: CACHING LOKAL
// =====================================================================
const DB_NAME = "SitakaCacheDB_DoubleShiftModul";
const STORE_NAME = "doubleShiftData";
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

// Fungsi menghitung total Rombel (Dynamic Scanner)
const calculateTotalRombel = (item) => {
  let total = 0;
  Object.keys(item).forEach(k => {
    if (k.toLowerCase().includes('rombel_')) {
       total += parseInt(item[k]) || 0;
    }
  });
  return total;
};

// Fungsi menghitung Kelas Layak Pakai (HANYA Baik & Rusak Ringan sesuai request)
const calculateKelasLayak = (itemSarpras) => {
  if (!itemSarpras) return 0;
  const baik = parseInt(getVal(itemSarpras, 'ruang_kelas_baik')) || 0;
  const rr = parseInt(getVal(itemSarpras, 'ruang_kelas_rusak_ringan')) || 0;
  return baik + rr; 
};

// PEMISAHAN JENJANG (Sesuai Konteks Request: PAUD hanya TK, dll)
const JENJANG_GROUPS = {
  'PAUD (TK SAJA)': ['TK'],
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

// Penyesuaian nama Kota untuk Dropdown
const formatWilayahDropdown = (wilayah) => {
  if (wilayah === 'PONTIANAK' || wilayah === 'SINGKAWANG') return `KOTA ${wilayah}`;
  return `KABUPATEN ${wilayah}`;
};

// =====================================================================
// MAIN COMPONENT
// =====================================================================
export default function RombelLebihShift({ selectedYear = '2026' }) {
  const [dataSekolah, setDataSekolah] = useState([]);
  const [dataSarpras, setDataSarpras] = useState([]);
  const [loading, setLoading] = useState(true);

  // State Filters
  const [filterWilayah, setFilterWilayah] = useState('SEMUA');
  const [filterKecamatan, setFilterKecamatan] = useState('SEMUA');
  const [filterStatus, setFilterStatus] = useState('SEMUA');
  
  const [isPending, startTransition] = useTransition();

  // Fetch Data (Parallel Fetching untuk Sekolah & Sarpras)
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const cacheKeySekolah = `sekolah_modul_${selectedYear}`;
      const cacheKeySarpras = `sarpras_modul_v3_${selectedYear}`;
      
      try {
        let freshSekolah = await getFromCache(cacheKeySekolah);
        if (!freshSekolah) {
          const qSekolah = query(collection(db, 'dapodik_sekolah_chunks'), where("tahun_data", "==", selectedYear));
          const snapSekolah = await getDocs(qSekolah);
          freshSekolah = snapSekolah.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          await saveToCache(cacheKeySekolah, freshSekolah);
        }

        let freshSarpras = await getFromCache(cacheKeySarpras);
        if (!freshSarpras) {
          const qSarpras = query(collection(db, 'data_sarpras_chunks'), where("tahun_data", "==", selectedYear));
          const snapSarpras = await getDocs(qSarpras);
          freshSarpras = snapSarpras.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          await saveToCache(cacheKeySarpras, freshSarpras);
        }

        setDataSekolah(freshSekolah);
        setDataSarpras(freshSarpras);
      } catch (error) {
        console.error("Gagal memuat data master:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedYear]);

  // Ekstrak Item Murni
  const allSekolahItems = useMemo(() => {
    if (!dataSekolah.length) return [];
    let items = [];
    dataSekolah.forEach(chunk => { if (chunk && Array.isArray(chunk.data)) items = items.concat(chunk.data); });
    return items;
  }, [dataSekolah]);

  // Mapping Sarpras (Key: NPSN, Value: Kelas Layak Pakai)
  const mapKelasSarpras = useMemo(() => {
    const map = new Map();
    if (!dataSarpras.length) return map;
    
    dataSarpras.forEach(chunk => {
      if (chunk && Array.isArray(chunk.data)) {
        chunk.data.forEach(item => {
          const npsn = String(getVal(item, 'npsn')).trim();
          if (npsn) {
             const kelasLayak = calculateKelasLayak(item);
             map.set(npsn, kelasLayak);
          }
        });
      }
    });
    return map;
  }, [dataSarpras]);

  // Daftar Kecamatan Dinamis
  const listKecamatan = useMemo(() => {
    if (filterWilayah === 'SEMUA') return [];
    const validKec = allSekolahItems
      .filter(item => cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota')) === filterWilayah)
      .map(item => String(getVal(item, 'kecamatan')).trim().toUpperCase())
      .filter(k => k && k !== 'TIDAK DIKETAHUI');
    return [...new Set(validKec)].sort();
  }, [allSekolahItems, filterWilayah]);

  // Auto-reset kecamatan jika wilayah berganti
  useEffect(() => {
    setFilterKecamatan('SEMUA');
  }, [filterWilayah]);

  // Handlers untuk Filter (Menggunakan Concurrent Transition)
  const handleWilayahChange = (e) => { startTransition(() => setFilterWilayah(e.target.value)); };
  const handleKecamatanChange = (e) => { startTransition(() => setFilterKecamatan(e.target.value)); };
  const handleStatusChange = (e) => { startTransition(() => setFilterStatus(e.target.value)); };

  // =====================================================================
  // ENGINE AGREGASI DOUBLE SHIFT
  // =====================================================================
  const aggregatedData = useMemo(() => {
    if (!allSekolahItems.length) return [];

    // Inisialisasi Keranjang Data per Jenjang
    const mapAgg = new Map();
    Object.keys(JENJANG_GROUPS).forEach(j => {
      mapAgg.set(j, {
        jenjang: j,
        jumlah_sekolah: 0,
        jumlah_kelas: 0,
        jumlah_rombel: 0,
        sekolah_double_shift: 0
      });
    });

    allSekolahItems.forEach(item => {
      // Filter Wilayah
      if (filterWilayah !== 'SEMUA') {
        const kabDb = cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'));
        if (kabDb !== filterWilayah) return;
      }
      // Filter Kecamatan
      if (filterKecamatan !== 'SEMUA') {
        const kecDb = String(getVal(item, 'kecamatan')).trim().toUpperCase();
        if (kecDb !== filterKecamatan) return;
      }
      // Filter Status Sekolah
      if (filterStatus !== 'SEMUA') {
        const statusDb = String(getVal(item, 'status_sekolah')).toUpperCase();
        if (statusDb !== filterStatus) return;
      }

      // Deteksi Jenjang
      const group = identifyJenjangGroup(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang'));
      if (!group) return; 

      const row = mapAgg.get(group);
      const npsn = String(getVal(item, 'npsn')).trim();
      
      const rombel = calculateTotalRombel(item);
      // Ambil ruang kelas dari Sarpras (Jika tidak ada sarpras, asumsikan 0)
      const kelas = mapKelasSarpras.has(npsn) ? mapKelasSarpras.get(npsn) : 0;
      
      // LOGIKA DOUBLE SHIFT: Rombel > Kelas
      const isDoubleShift = rombel > kelas;

      row.jumlah_sekolah++;
      row.jumlah_kelas += kelas;
      row.jumlah_rombel += rombel;
      if (isDoubleShift) {
         row.sekolah_double_shift++;
      }
    });

    return Array.from(mapAgg.values());
  }, [allSekolahItems, mapKelasSarpras, filterWilayah, filterKecamatan, filterStatus]);

  // Grand Total
  const grandTotals = useMemo(() => {
    return aggregatedData.reduce((acc, curr) => {
      acc.jumlah_sekolah += curr.jumlah_sekolah;
      acc.jumlah_kelas += curr.jumlah_kelas;
      acc.jumlah_rombel += curr.jumlah_rombel;
      acc.sekolah_double_shift += curr.sekolah_double_shift;
      return acc;
    }, { jumlah_sekolah: 0, jumlah_kelas: 0, jumlah_rombel: 0, sekolah_double_shift: 0 });
  }, [aggregatedData]);

  // =====================================================================
  // EXPORT EXCEL
  // =====================================================================
  const downloadExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Analisis Shift');

    worksheet.columns = [
      { header: 'Jenjang Pendidikan', key: 'jenjang', width: 25 },
      { header: 'Jumlah Sekolah', key: 'jumlah_sekolah', width: 18 },
      { header: 'Jumlah Kelas', key: 'jumlah_kelas', width: 15 },
      { header: 'Jumlah Rombel', key: 'jumlah_rombel', width: 15 },
      { header: 'Sekolah Double Shift', key: 'sekolah_double_shift', width: 22 },
      { header: '% Double Shift', key: 'persentase', width: 18 }
    ];

    aggregatedData.forEach(item => {
      const persen = item.jumlah_sekolah > 0 ? ((item.sekolah_double_shift / item.jumlah_sekolah) * 100).toFixed(1) : 0;
      worksheet.addRow({ ...item, persentase: `${persen}%` });
    });

    const totalPersen = grandTotals.jumlah_sekolah > 0 ? ((grandTotals.sekolah_double_shift / grandTotals.jumlah_sekolah) * 100).toFixed(1) : 0;
    const totalRow = worksheet.addRow({ 
      jenjang: 'TOTAL KESELURUHAN', 
      ...grandTotals,
      persentase: `${totalPersen}%`
    });

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBE123C' } }; // Rose 700
    totalRow.font = { bold: true, color: { argb: 'FF881337' } }; 
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4E6' } }; // Rose 100

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Analisis_DoubleShift_${filterWilayah}_${selectedYear}.xlsx`;
    link.click();
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center italic font-black uppercase tracking-widest text-rose-300">
        <Loader2 className="animate-spin text-rose-600 mb-4" size={64} />
        Sinkronisasi Data Sekolah & Sarpras...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 bg-gray-50/50">
      
      {/* HEADER UTAMA */}
      <div className="bg-white px-4 md:px-6 py-4 border-b border-gray-100 flex flex-col gap-4 shrink-0 shadow-sm z-20">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div className="flex items-center gap-2">
             <div className="bg-rose-100 p-2.5 rounded-xl text-rose-700">
               <ArrowUpDown size={24} />
             </div>
             <div>
               <h2 className="font-black text-gray-800 text-lg md:text-xl uppercase tracking-tighter leading-none">Analisis Shift Sekolah</h2>
               <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Dugaan Double Shift (Rombel &gt; Kelas)</p>
             </div>
          </div>
        </div>

        {/* KONTROL FILTER */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto relative">
            
            {/* Indikator Transition */}
            {isPending && (
              <span className="absolute -left-6 top-1/2 -translate-y-1/2 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
              </span>
            )}

            {/* Filter Wilayah (Kab/Kota) */}
            <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm w-full md:w-auto focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-100">
              <MapPin size={16} className="text-gray-400 mr-2 shrink-0" />
              <select value={filterWilayah} onChange={handleWilayahChange} autoComplete="off" className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer w-full pr-4 leading-tight">
                <option value="SEMUA">Semua Wilayah</option>
                {KABUPATEN_LIST.map(kab => (
                   <option key={kab} value={kab}>{formatWilayahDropdown(kab)}</option>
                ))}
              </select>
            </div>

            {/* Filter Kecamatan (Disabled jika SEMUA WILAYAH) */}
            <div className={`flex items-center bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm w-full md:w-auto focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-100 ${filterWilayah === 'SEMUA' ? 'opacity-50 pointer-events-none' : ''}`}>
              <MapPin size={16} className="text-gray-400 mr-2 shrink-0" />
              <select value={filterKecamatan} onChange={handleKecamatanChange} autoComplete="off" disabled={filterWilayah === 'SEMUA'} className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer w-full pr-4 leading-tight">
                <option value="SEMUA">Semua Kecamatan</option>
                {listKecamatan.map(kec => (
                   <option key={kec} value={kec}>KECAMATAN {kec}</option>
                ))}
              </select>
            </div>

            {/* Filter Status Sekolah */}
            <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm w-full md:w-auto focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-100">
              <Building2 size={16} className="text-gray-400 mr-2 shrink-0" />
              <select value={filterStatus} onChange={handleStatusChange} autoComplete="off" className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer w-full pr-4 leading-tight">
                <option value="SEMUA">Semua Status</option>
                <option value="NEGERI">Negeri</option>
                <option value="SWASTA">Swasta</option>
              </select>
            </div>

          </div>

          <button onClick={downloadExcel} className="flex items-center justify-center gap-2 bg-rose-50 text-rose-700 hover:bg-rose-600 hover:text-white px-5 py-2.5 rounded-xl font-black uppercase text-[10px] md:text-xs shadow-sm border border-rose-200 transition-all active:scale-95 shrink-0 w-full md:w-auto">
            <FileSpreadsheet size={16} /> Unduh Format Excel
          </button>
        </div>
      </div>

      {/* KONTEN TABEL */}
      <div className={`flex-1 overflow-auto p-4 md:p-6 transition-opacity duration-200 ${isPending ? 'opacity-60' : 'opacity-100'}`}>
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 flex flex-col overflow-hidden relative">
          <div className="overflow-x-auto p-4 custom-scrollbar">
            <table className="w-full text-center border-separate border-spacing-y-2">
              <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm rounded-xl">
                <tr className="text-[10px] font-black uppercase text-gray-500 whitespace-nowrap">
                  <th className="px-4 py-3 text-left rounded-l-xl">Jenjang Pendidikan</th>
                  <th className="px-4 py-3 text-cyan-700">Jml Sekolah</th>
                  <th className="px-4 py-3 text-emerald-600">Jml Kelas Layak</th>
                  <th className="px-4 py-3 text-indigo-600">Jml Rombel</th>
                  <th className="px-4 py-3 text-rose-600 border-l-2 border-rose-100">Sekolah Shift</th>
                  <th className="px-4 py-3 rounded-r-xl text-rose-800">% Shift</th>
                </tr>
              </thead>
              <tbody>
                {aggregatedData.map((row, idx) => {
                  const persen = row.jumlah_sekolah > 0 ? ((row.sekolah_double_shift / row.jumlah_sekolah) * 100).toFixed(1) : 0;
                  
                  return (
                    <tr key={idx} className="bg-white shadow-sm hover:shadow-md hover:scale-[1.01] transition-all group">
                      <td className="px-4 py-3 rounded-l-2xl font-black text-gray-800 text-sm uppercase text-left border-y border-l border-gray-100 whitespace-nowrap">{row.jenjang}</td>
                      <td className="px-4 py-3 font-bold text-cyan-700 text-base border-y border-gray-100 bg-cyan-50/30">{row.jumlah_sekolah.toLocaleString()}</td>
                      <td className="px-4 py-3 font-bold text-emerald-600 text-base border-y border-gray-100 bg-emerald-50/30">{row.jumlah_kelas.toLocaleString()}</td>
                      <td className="px-4 py-3 font-bold text-indigo-600 text-base border-y border-gray-100 bg-indigo-50/30">{row.jumlah_rombel.toLocaleString()}</td>
                      
                      <td className="px-4 py-3 font-black text-rose-600 text-lg border-y border-l-2 border-rose-100 bg-rose-50">{row.sekolah_double_shift.toLocaleString()}</td>
                      <td className="px-4 py-3 font-black text-rose-800 text-lg border-y border-r border-gray-100 bg-rose-100/50 rounded-r-2xl">
                        {persen}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                <tr className="bg-gray-100 text-center font-black uppercase text-xs border-t-2 border-gray-300 whitespace-nowrap">
                  <td className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-gray-300 text-gray-900">TOTAL KESELURUHAN</td>
                  <td className="px-4 py-4 text-cyan-800 border-y border-gray-300">{grandTotals.jumlah_sekolah.toLocaleString()}</td>
                  <td className="px-4 py-4 text-emerald-800 border-y border-gray-300">{grandTotals.jumlah_kelas.toLocaleString()}</td>
                  <td className="px-4 py-4 text-indigo-800 border-y border-gray-300">{grandTotals.jumlah_rombel.toLocaleString()}</td>
                  <td className="px-4 py-4 text-rose-800 text-lg border-y border-l-2 border-rose-300 bg-rose-100">{grandTotals.sekolah_double_shift.toLocaleString()}</td>
                  <td className="px-4 py-4 rounded-r-2xl border-y border-r border-gray-300 bg-rose-200/50 text-rose-900 text-lg">
                    {grandTotals.jumlah_sekolah > 0 ? ((grandTotals.sekolah_double_shift / grandTotals.jumlah_sekolah) * 100).toFixed(1) : 0}%
                  </td>
                </tr>
              </tfoot>
            </table>
            
            <div className="mt-6 px-4 bg-yellow-50 border border-yellow-200 rounded-xl p-4 flex gap-3 text-left">
              <AlertCircle size={24} className="text-yellow-600 shrink-0" />
              <div>
                <h4 className="font-black text-yellow-800 text-xs uppercase tracking-widest mb-1">Catatan Metodologi</h4>
                <p className="text-xs font-medium text-yellow-700 leading-relaxed">
                  Sekolah diindikasikan menyelenggarakan sistem <strong>Double Shift</strong> apabila total jumlah <strong>Rombongan Belajar (Rombel)</strong> melebihi total jumlah <strong>Ruang Kelas Layak Pakai</strong> (Kondisi Baik + Rusak Ringan). Ruangan kelas yang Rusak Sedang, Rusak Berat, dan Tidak Bisa Dipakai dikeluarkan dari rasio ketersediaan ini.
                </p>
              </div>
            </div>

          </div>
        </div>
      </div>

    </div>
  );
}