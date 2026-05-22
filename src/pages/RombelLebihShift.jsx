import React, { useState, useMemo, useEffect, useTransition } from 'react';
import { 
  Building2, FileSpreadsheet, Loader2, MapPin, School, ArrowUpDown, X, Info, ChevronRight
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { db } from '../firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';

// =====================================================================
// UTILITY: CACHING LOKAL
// =====================================================================
const DB_NAME = "SitakaCacheDB_RombelData";
const STORE_NAME = "rombelMaster";
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
const KABUPATEN_LIST = [
  "BENGKAYANG", "KAPUAS HULU", "KAYONG UTARA", "KETAPANG", 
  "KUBU RAYA", "LANDAK", "MELAWI", "MEMPAWAH", "PONTIANAK", 
  "SAMBAS", "SANGGAU", "SEKADAU", "SINGKAWANG", "SINTANG"
];

const formatWilayahDropdown = (wilayah) => {
  if (wilayah === 'PONTIANAK' || wilayah === 'SINGKAWANG') return `KOTA ${wilayah}`;
  return `KABUPATEN ${wilayah}`;
};

const cleanKabupatenName = (rawName) => {
  if (!rawName) return "TIDAK DIKETAHUI";
  let name = String(rawName).toUpperCase().replace(/^(KAB\.|KABUPATEN|KOTA)\s+/i, '').trim();
  const found = KABUPATEN_LIST.find(kab => name.includes(kab));
  if (found) return found;
  return name; 
};

const getJenjang = (bentuk) => {
  const j = String(bentuk || '').toUpperCase().trim();
  if (['TK', 'KB', 'TPA', 'SPS', 'PAUD'].includes(j)) return 'PAUD (TK)';
  if (['SD', 'SPK SD'].includes(j)) return 'SD';
  if (['SMP', 'SPK SMP'].includes(j)) return 'SMP';
  if (['SMA', 'SPK SMA'].includes(j)) return 'SMA';
  if (['SMK'].includes(j)) return 'SMK';
  if (['SLB', 'SDLB', 'SMPLB', 'SMALB'].includes(j)) return 'SLB';
  if (['PKBM', 'SKB'].includes(j)) return 'NON FORMAL';
  
  if (j.includes('TK') || j.includes('KB') || j.includes('PAUD')) return 'PAUD (TK)';
  if (j.includes('SD') && !j.includes('SLB')) return 'SD';
  if (j.includes('SMP') && !j.includes('SLB')) return 'SMP';
  if (j.includes('SMA') && !j.includes('SLB')) return 'SMA';
  if (j.includes('SMK')) return 'SMK';
  
  return null;
};

// Ekstraktor field kebal typo
const getVal = (obj, keyNames) => {
  if (!obj) return '';
  const keys = Array.isArray(keyNames) ? keyNames : [keyNames];
  for (let keyName of keys) {
      const searchKey = String(keyName).toLowerCase().trim().replace(/_/g, '');
      const foundKey = Object.keys(obj).find(k => k.toLowerCase().replace(/_/g, '') === searchKey);
      if (foundKey) return obj[foundKey];
  }
  return '';
};

// =====================================================================
// MAIN COMPONENT
// =====================================================================
export default function RombelLebihShift({ selectedYear = '2026' }) {
  const [dataMaster, setDataMaster] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filter Utama
  const [filterWilayah, setFilterWilayah] = useState('SEMUA');
  const [filterStatus, setFilterStatus] = useState('SEMUA');
  
  // State Modal Detail & Filternya
  const [selectedJenjangDetail, setSelectedJenjangDetail] = useState(null);
  const [modalKecamatanFilter, setModalKecamatanFilter] = useState('SEMUA');
  const [modalStatusFilter, setModalStatusFilter] = useState('SEMUA'); 
  
  const [isPending, startTransition] = useTransition();

  // 1. FETCH DATA DARI KOLEKSI DATA_ROMBEL_CHUNKS
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const cacheKey = `rombel_master_${selectedYear}`;
      try {
        let freshData = await getFromCache(cacheKey);
        if (!freshData) {
          const q = query(collection(db, 'data_rombel_chunks'), where("tahun_data", "==", String(selectedYear)));
          const snap = await getDocs(q);
          let allData = [];
          snap.forEach(doc => {
            if (doc.data().data && Array.isArray(doc.data().data)) {
              allData = allData.concat(doc.data().data);
            }
          });
          freshData = allData;
          await saveToCache(cacheKey, freshData);
        }
        setDataMaster(freshData);
      } catch (error) {
        console.error("Gagal memuat data rombel:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedYear]);

  // 2. PARSING & CLEANING DATA
  const parsedData = useMemo(() => {
    return dataMaster.map(item => {
      const rombel = parseInt(getVal(item, ['jumlah_rombel', 'jumlahrombel'])) || 0;
      const kelas = parseInt(getVal(item, ['jumlah_ruang_kelas', 'jumlahruangkelas'])) || 0;
      const bentuk = getVal(item, ['bentuk_pendidikan', 'bentukpendidikan']);
      const jenjang = getJenjang(bentuk);
      
      return {
        nama: getVal(item, ['nama_satuan_pendidikan', 'namasatuanpendidikan']) || "TIDAK DIKETAHUI",
        npsn: getVal(item, 'npsn') || "-",
        jenjang,
        kabupaten: cleanKabupatenName(getVal(item, ['kabupaten_kota', 'kabupatenkota', 'kabupaten'])),
        kecamatan: String(getVal(item, 'kecamatan') || '').toUpperCase(),
        status: String(getVal(item, ['status_sekolah', 'statussekolah']) || '').toUpperCase(),
        rombel,
        kelas,
        isDoubleShift: rombel > kelas,
        selisih: kelas - rombel // Kelas - Rombel sesuai request
      };
    }).filter(i => i.jenjang !== null);
  }, [dataMaster]);

  // 3. DAFTAR KECAMATAN DINAMIS (Ditarik berdasarkan filter wilayah utama)
  const listKecamatan = useMemo(() => {
    if (filterWilayah === 'SEMUA') return [];
    const validKec = parsedData
      .filter(item => item.kabupaten === filterWilayah)
      .map(item => item.kecamatan)
      .filter(k => k && k !== 'TIDAK DIKETAHUI');
    return [...new Set(validKec)].sort();
  }, [parsedData, filterWilayah]);

  const handleWilayahChange = (e) => { startTransition(() => setFilterWilayah(e.target.value)); };
  const handleStatusChange = (e) => { startTransition(() => setFilterStatus(e.target.value)); };

  // 4. KALKULASI DATA TABEL BERDASARKAN FILTER UTAMA
  const aggregatedData = useMemo(() => {
    const JENJANG = ['PAUD (TK)', 'SD', 'SMP', 'SMA', 'SMK', 'SLB', 'NON FORMAL'];
    const mapAgg = new Map();
    
    JENJANG.forEach(j => {
         mapAgg.set(j, { jenjang: j, jumlah_sekolah: 0, jumlah_kelas: 0, jumlah_rombel: 0, sekolah_double_shift: 0 });
    });

    parsedData.forEach(item => {
        if (filterWilayah !== 'SEMUA' && item.kabupaten !== filterWilayah) return;
        if (filterStatus !== 'SEMUA' && item.status !== filterStatus) return;

        const agg = mapAgg.get(item.jenjang);
        if (agg) {
            agg.jumlah_sekolah += 1; 
            agg.jumlah_kelas += item.kelas;
            agg.jumlah_rombel += item.rombel;
            if (item.isDoubleShift) {
               agg.sekolah_double_shift += 1;
            }
        }
    });

    return Array.from(mapAgg.values());
  }, [parsedData, filterWilayah, filterStatus]);

  // 5. GRAND TOTAL UNTUK FOOTER
  const grandTotals = useMemo(() => {
    return aggregatedData.reduce((acc, curr) => {
      acc.jumlah_sekolah += curr.jumlah_sekolah;
      acc.jumlah_kelas += curr.jumlah_kelas;
      acc.jumlah_rombel += curr.jumlah_rombel;
      acc.sekolah_double_shift += curr.sekolah_double_shift;
      return acc;
    }, { jumlah_sekolah: 0, jumlah_kelas: 0, jumlah_rombel: 0, sekolah_double_shift: 0 });
  }, [aggregatedData]);

  const totalPersenValue = grandTotals.jumlah_sekolah > 0 ? ((grandTotals.sekolah_double_shift / grandTotals.jumlah_sekolah) * 100) : 0;
  const totalPersenStr = totalPersenValue % 1 === 0 ? totalPersenValue : totalPersenValue.toFixed(1);

  // 6. LIST DETAIL MODAL
  const detailList = useMemo(() => {
    if (!selectedJenjangDetail) return [];
    return parsedData.filter(item => 
      item.jenjang === selectedJenjangDetail && 
      item.isDoubleShift &&
      (filterWilayah === 'SEMUA' || item.kabupaten === filterWilayah) &&
      (filterStatus === 'SEMUA' || item.status === filterStatus) &&
      (modalKecamatanFilter === 'SEMUA' || item.kecamatan === modalKecamatanFilter) &&
      (modalStatusFilter === 'SEMUA' || item.status === modalStatusFilter)
    ).sort((a, b) => a.selisih - b.selisih); // Urutkan dari yang selisih minusnya paling besar
  }, [selectedJenjangDetail, parsedData, filterWilayah, filterStatus, modalKecamatanFilter, modalStatusFilter]);

  // 7. UNDUH EXCEL AGREGASI UTAMA
  const downloadExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Analisis Double Shift');
    
    worksheet.columns = [
      { header: 'Jenjang', key: 'jenjang', width: 20 },
      { header: 'Jumlah Sekolah', key: 'jumlah_sekolah', width: 18 },
      { header: 'Jumlah Kelas', key: 'jumlah_kelas', width: 18 },
      { header: 'Jumlah Rombel', key: 'jumlah_rombel', width: 18 },
      { header: 'Sekolah Double Shift', key: 'sekolah_double_shift', width: 22 },
      { header: 'Persentase (%)', key: 'persentase', width: 18 }
    ];

    aggregatedData.forEach(row => {
      const persentase = row.jumlah_sekolah === 0 ? 0 : ((row.sekolah_double_shift / row.jumlah_sekolah) * 100).toFixed(2);
      worksheet.addRow({ ...row, persentase: `${persentase}%` });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Analisis_Shift_${filterWilayah}_${selectedYear}.xlsx`;
    link.click();
  };

  // 8. UNDUH EXCEL RINCIAN SEKOLAH (MODAL)
  const downloadDetailExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Rincian ${selectedJenjangDetail}`);
    
    worksheet.columns = [
      { header: 'NPSN', key: 'npsn', width: 15 },
      { header: 'Nama Sekolah', key: 'nama', width: 40 },
      { header: 'Kecamatan', key: 'kecamatan', width: 25 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Jumlah Kelas', key: 'kelas', width: 15 },
      { header: 'Jumlah Rombel', key: 'rombel', width: 15 },
      { header: 'Selisih', key: 'selisih', width: 15 }
    ];

    worksheet.getRow(1).font = { bold: true };

    detailList.forEach(row => {
      worksheet.addRow({
        npsn: row.npsn,
        nama: row.nama,
        kecamatan: row.kecamatan,
        status: row.status,
        kelas: row.kelas,
        rombel: row.rombel,
        selisih: row.selisih
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Rincian_DoubleShift_${selectedJenjangDetail}_${filterWilayah}_${selectedYear}.xlsx`;
    link.click();
  };

  // Efek Reset Filter Modal
  useEffect(() => {
    if (selectedJenjangDetail) {
      setModalStatusFilter('SEMUA');
      setModalKecamatanFilter('SEMUA');
    }
  }, [selectedJenjangDetail]);

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center italic font-black uppercase tracking-widest text-rose-300">
        <Loader2 className="animate-spin text-rose-600 mb-4" size={64} />
        Memuat Database Rombel...
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

        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto relative">
            {isPending && (
              <span className="absolute -left-6 top-1/2 -translate-y-1/2 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
              </span>
            )}

            <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm w-full md:w-auto focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-100">
              <MapPin size={16} className="text-gray-400 mr-2 shrink-0" />
              <select value={filterWilayah} onChange={handleWilayahChange} className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer w-full pr-4 leading-tight">
                <option value="SEMUA">Semua Wilayah</option>
                {KABUPATEN_LIST.map(kab => (
                   <option key={kab} value={kab}>{formatWilayahDropdown(kab)}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm w-full md:w-auto focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-100">
              <Building2 size={16} className="text-gray-400 mr-2 shrink-0" />
              <select value={filterStatus} onChange={handleStatusChange} className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer w-full pr-4 leading-tight">
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
                  <th className="px-4 py-3 text-emerald-600">Jml Ruang Kelas</th>
                  <th className="px-4 py-3 text-indigo-600">Jml Rombel</th>
                  <th className="px-4 py-3 text-rose-600 border-l-2 border-rose-100">Sekolah Shift</th>
                  <th className="px-4 py-3 text-rose-800">% Shift</th>
                  <th className="px-4 py-3 rounded-r-xl text-gray-400">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {aggregatedData.map((row, idx) => {
                  const persenValue = row.jumlah_sekolah > 0 ? ((row.sekolah_double_shift / row.jumlah_sekolah) * 100) : 0;
                  const persenStr = persenValue % 1 === 0 ? persenValue : persenValue.toFixed(1);
                  return (
                    <tr key={idx} className="bg-white shadow-sm hover:shadow-md transition-all group">
                      <td className="px-4 py-3 rounded-l-2xl font-black text-gray-800 text-sm uppercase text-left border-y border-l border-gray-100">{row.jenjang}</td>
                      <td className="px-4 py-3 font-bold text-cyan-700 text-base border-y border-gray-100 bg-cyan-50/30">{row.jumlah_sekolah.toLocaleString()}</td>
                      <td className="px-4 py-3 font-bold text-emerald-600 text-base border-y border-gray-100 bg-emerald-50/30">{row.jumlah_kelas.toLocaleString()}</td>
                      <td className="px-4 py-3 font-bold text-indigo-600 text-base border-y border-gray-100 bg-indigo-50/30">{row.jumlah_rombel.toLocaleString()}</td>
                      <td className="px-4 py-3 font-black text-rose-600 text-lg border-y border-l-2 border-rose-100 bg-rose-50">{row.sekolah_double_shift.toLocaleString()}</td>
                      <td className="px-4 py-3 font-black text-rose-800 text-lg border-y border-gray-100 bg-rose-100/50">{persenStr}%</td>
                      <td className="px-4 py-3 border-y border-r border-gray-100 rounded-r-2xl">
                         <button 
                            disabled={row.sekolah_double_shift === 0}
                            onClick={() => setSelectedJenjangDetail(row.jenjang)}
                            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full font-black text-[10px] uppercase transition-all
                              ${row.sekolah_double_shift > 0 
                                ? 'bg-rose-600 text-white hover:bg-rose-700 shadow-md active:scale-95' 
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                         >
                           <Info size={14} /> Rincian
                         </button>
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
                  <td className="px-4 py-4 border-y border-gray-300 bg-rose-200/50 text-rose-900 text-lg">{totalPersenStr}%</td>
                  <td className="px-4 py-4 rounded-r-2xl border-y border-r border-gray-300 bg-gray-100"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* MODAL RINCIAN SEKOLAH */}
      {selectedJenjangDetail && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-4xl max-h-[85vh] rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-white/20 animate-in zoom-in-95 duration-300">
            
            {/* Header Modal */}
            <div className="bg-rose-600 p-6 md:p-8 flex flex-col md:flex-row items-start md:items-center justify-between text-white shrink-0 gap-4">
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md hidden md:block">
                   <School size={32} />
                </div>
                <div>
                  <h3 className="text-xl md:text-2xl font-black uppercase tracking-tight leading-none">Rincian Double Shift</h3>
                  <p className="text-rose-100 text-[10px] font-bold uppercase tracking-widest mt-1.5 opacity-80">
                    Jenjang {selectedJenjangDetail} • Filter Aktif: {filterWilayah}
                  </p>
                </div>
              </div>
              
              <div className="flex items-center gap-2 flex-wrap md:flex-nowrap justify-start md:justify-end w-full md:w-auto">
                {/* Filter Kecamatan Khusus Modal */}
                <div className={`flex items-center bg-white/20 border border-white/30 rounded-xl px-3 py-1.5 shadow-sm ${filterWilayah === 'SEMUA' ? 'opacity-50 pointer-events-none' : ''}`}>
                  <MapPin size={14} className="text-white mr-2 shrink-0" />
                  <select 
                    value={modalKecamatanFilter} 
                    onChange={(e) => setModalKecamatanFilter(e.target.value)} 
                    disabled={filterWilayah === 'SEMUA'}
                    className="bg-transparent text-xs font-black uppercase text-white outline-none cursor-pointer pr-4 leading-tight [&>option]:text-gray-800"
                  >
                    <option value="SEMUA">Semua Kecamatan</option>
                    {listKecamatan.map(kec => (
                       <option key={kec} value={kec}>KECAMATAN {kec}</option>
                    ))}
                  </select>
                </div>

                {/* Filter Status Khusus Modal */}
                <div className="flex items-center bg-white/20 border border-white/30 rounded-xl px-3 py-1.5 shadow-sm">
                  <Building2 size={14} className="text-white mr-2 shrink-0" />
                  <select 
                    value={modalStatusFilter} 
                    onChange={(e) => setModalStatusFilter(e.target.value)} 
                    className="bg-transparent text-xs font-black uppercase text-white outline-none cursor-pointer pr-4 leading-tight [&>option]:text-gray-800"
                  >
                    <option value="SEMUA">Semua Status</option>
                    <option value="NEGERI">Negeri</option>
                    <option value="SWASTA">Swasta</option>
                  </select>
                </div>

                <button onClick={() => setSelectedJenjangDetail(null)} className="p-2 ml-2 bg-white/10 hover:bg-white/30 rounded-full transition-colors shrink-0">
                  <X size={24} />
                </button>
              </div>
            </div>

            {/* Body Modal */}
            <div className="flex-1 overflow-auto p-4 md:p-8 bg-gray-50 custom-scrollbar">
               <div className="space-y-3">
                 {detailList.length > 0 ? detailList.map((sch, i) => (
                   <div key={i} className="bg-white border border-gray-200 p-4 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-rose-300 hover:shadow-md transition-all group">
                      <div className="flex items-start gap-4">
                        {/* Pindahkan Kecamatan ke atas */}
                        <div className="bg-rose-50 text-rose-600 p-3 rounded-2xl group-hover:bg-rose-600 group-hover:text-white transition-colors flex items-center justify-center flex-col shrink-0 min-w-[80px]">
                           <span className="text-[10px] font-black uppercase tracking-widest leading-none mb-1">KECAMATAN</span>
                           <span className="text-xs font-bold leading-none text-center">{sch.kecamatan}</span>
                        </div>
                        <div>
                          <h4 className="font-black text-gray-800 text-sm md:text-base uppercase leading-tight group-hover:text-rose-700 transition-colors">{sch.nama}</h4>
                          <p className="text-[10px] font-bold text-gray-400 mt-1 uppercase tracking-wider">
                            NPSN: {sch.npsn} • {sch.status}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 md:gap-4 shrink-0">
                        <div className="bg-emerald-50 px-4 py-2 rounded-2xl border border-emerald-100 text-center min-w-[70px]">
                           <p className="text-[9px] font-black text-emerald-600 uppercase">Kelas</p>
                           <p className="text-lg font-black text-emerald-700 leading-none">{sch.kelas}</p>
                        </div>
                        <div className="flex items-center text-rose-300">
                           <ChevronRight size={20} />
                        </div>
                        <div className="bg-indigo-50 px-4 py-2 rounded-2xl border border-indigo-100 text-center min-w-[70px]">
                           <p className="text-[9px] font-black text-indigo-600 uppercase">Rombel</p>
                           <p className="text-lg font-black text-indigo-700 leading-none">{sch.rombel}</p>
                        </div>
                        {/* Perhitungan (Kelas - Rombel) */}
                        <div className="ml-2 bg-rose-100 px-3 py-1.5 rounded-full text-[10px] font-black text-rose-700 uppercase whitespace-nowrap min-w-[90px] text-center shadow-sm">
                           Selisih: {sch.selisih}
                        </div>
                      </div>
                   </div>
                 )) : (
                   <div className="text-center py-20 flex flex-col items-center justify-center">
                      <div className="bg-gray-100 p-4 rounded-full mb-4">
                         <School size={40} className="text-gray-300" />
                      </div>
                      <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">Tidak ada data sesuai filter</p>
                   </div>
                 )}
               </div>
            </div>

            {/* Footer Modal dengan Tombol Unduh Rincian */}
            <div className="p-4 md:p-6 bg-white border-t border-gray-100 flex flex-col-reverse md:flex-row justify-between items-center gap-4">
               <button 
                  onClick={downloadDetailExcel} 
                  disabled={detailList.length === 0}
                  className={`flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-black uppercase text-xs transition-all shadow-sm w-full md:w-auto
                    ${detailList.length > 0 
                      ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-600 hover:text-white border border-emerald-200 active:scale-95' 
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200'}`}
               >
                 <FileSpreadsheet size={16} /> Unduh Rincian (.xlsx)
               </button>
               <button 
                  onClick={() => setSelectedJenjangDetail(null)}
                  className="bg-gray-800 text-white px-8 py-3 rounded-2xl font-black uppercase text-xs hover:bg-black transition-all active:scale-95 shadow-lg shadow-gray-200 w-full md:w-auto"
               >
                 Tutup Rincian
               </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}