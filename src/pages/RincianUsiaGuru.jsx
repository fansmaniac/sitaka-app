import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Download, Clock, MapPin, Search, X, ChevronLeft, ChevronRight, 
  Building2, School
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { db } from '../firebase/config';
import { collection, query, getDocs } from 'firebase/firestore';

// =====================================================================
// UTILITY FUNCTIONS
// =====================================================================
const getVal = (obj, keyName) => {
  if (!obj) return '';
  const key = Object.keys(obj).find(k => k.trim().toLowerCase() === keyName.toLowerCase());
  return key ? obj[key] : '';
};

// Fungsi Hitung Umur Real-time
const calculateAge = (birthDateString) => {
  if (!birthDateString) return null;
  const today = new Date();
  const birthDate = new Date(birthDateString);
  if (isNaN(birthDate)) return null;
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
  }
  return age;
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

// =====================================================================
// MAPPING STRUKTUR KATEGORI BARU (SINKRON 100% DENGAN DAPODIK GURU)
// =====================================================================
const KATEGORI_MAPPING = {
  'PAUD': ['TK', 'KB', 'TPA', 'SPS'],
  'PENDIDIKAN DASAR': ['SD', 'SPK SD', 'SMP', 'SPK SMP'],
  'PENDIDIKAN MENENGAH': ['SMA', 'SPK SMA', 'SMK'],
  'PENDIDIKAN INKLUSIF': ['SLB'],
  'PENDIDIKAN NON FORMAL': ['PKBM', 'SKB']
};

const SEMUA_SUBTABS_MAPPING = {
  'PAUD': ['TK', 'KB', 'TPA', 'SPS'],
  'SD': ['SD', 'SPK SD'],
  'SMP': ['SMP', 'SPK SMP'],
  'SMA': ['SMA', 'SPK SMA'],
  'SMK': ['SMK'],
  'SLB (Inklusif)': ['SLB', 'SDLB', 'SMPLB', 'SMALB'],
  'NON FORMAL': ['PKBM', 'SKB']
};

const isJenjangValid = (jenjangDb, targetJenjang) => {
  if (targetJenjang === 'SEMUA' || targetJenjang === 'SEMUA JENJANG') return true;
  
  if (SEMUA_SUBTABS_MAPPING[targetJenjang]) {
      return SEMUA_SUBTABS_MAPPING[targetJenjang].includes(jenjangDb);
  }
  if (KATEGORI_MAPPING[targetJenjang]) {
      return KATEGORI_MAPPING[targetJenjang].includes(jenjangDb);
  }
  return jenjangDb === targetJenjang;
};

// =====================================================================
// MAIN COMPONENT: RINCIAN USIA GURU
// =====================================================================
export default function RincianUsiaGuru({ 
  isOpen, 
  onClose, 
  data = [], 
  initialWilayah = 'SEMUA', 
  activeJenjang = 'SEMUA', // Context Header dari Dashboard
  displayLastUpdated 
}) {
  let mappedJenjang = activeJenjang;
  if (mappedJenjang === 'SEMUA') mappedJenjang = 'SEMUA JENJANG';

  // STATE MODAL TABS
  const [activeModalTab, setActiveModalTab] = useState('KECAMATAN'); 
  
  // STATE FILTERS
  const [searchTerm, setSearchTerm] = useState('');
  const [filterWilayah, setFilterWilayah] = useState('SEMUA'); 
  const [filterWilayahSekolah, setFilterWilayahSekolah] = useState('SEMUA'); 
  const [filterStatus, setFilterStatus] = useState('SEMUA'); 
  const [activeJenjangTab, setActiveJenjangTab] = useState('SEMUA'); 

  // STATE MAPPING NAMA SEKOLAH (NPSN -> Nama Sekolah)
  const [mapNamaSekolah, setMapNamaSekolah] = useState(new Map());

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  const isModeSemua = initialWilayah === 'SEMUA';

  // --- FETCH MAPPING NAMA SEKOLAH SECARA MANDIRI ---
  useEffect(() => {
    const fetchNamaSekolah = async () => {
      try {
        const q = query(collection(db, 'dapodik_sekolah_chunks'));
        const snap = await getDocs(q);
        const newMap = new Map();
        
        snap.forEach(doc => {
          const chunk = doc.data();
          if (chunk && Array.isArray(chunk.data)) {
            chunk.data.forEach(s => {
              const npsn = String(s.npsn || '').trim();
              const nama = s.nama_satuan_pendidikan || s.nama_sekolah || '';
              if (npsn && nama) {
                newMap.set(npsn, nama);
              }
            });
          }
        });
        setMapNamaSekolah(newMap);
      } catch (err) {
        console.error("Gagal menarik mapping nama sekolah:", err);
      }
    };

    if (isOpen) {
      fetchNamaSekolah();
    }
  }, [isOpen]);

  // Sinkronisasi saat modal dibuka
  useEffect(() => {
    if (isOpen) {
      setActiveModalTab('KECAMATAN');
      setSearchTerm('');
      setFilterWilayah('SEMUA');
      setFilterWilayahSekolah('SEMUA');
      setFilterStatus('SEMUA');
      setActiveJenjangTab(mappedJenjang); 
      setCurrentPage(1);
    }
  }, [isOpen, mappedJenjang]);

  // Reset pagination
  useEffect(() => { 
    setCurrentPage(1); 
  }, [searchTerm, filterWilayah, filterWilayahSekolah, filterStatus, activeJenjangTab, activeModalTab]);

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Dinamika Tab Jenjang di dalam Modal
  const availableTabs = useMemo(() => {
    if (mappedJenjang === 'SEMUA JENJANG') return Object.keys(SEMUA_SUBTABS_MAPPING);
    if (SEMUA_SUBTABS_MAPPING[mappedJenjang]) return SEMUA_SUBTABS_MAPPING[mappedJenjang];
    if (KATEGORI_MAPPING[mappedJenjang]) return KATEGORI_MAPPING[mappedJenjang];
    
    for (const [kat, arr] of Object.entries(SEMUA_SUBTABS_MAPPING)) {
        if (arr.includes(mappedJenjang)) return arr;
    }
    return [];
  }, [mappedJenjang]);

  // Ekstrak Daftar Wilayah
  const listWilayahFilter = useMemo(() => {
    const validData = data.filter(item => {
      if (isModeSemua) return true;
      return cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota')) === initialWilayah;
    });

    const list = validData.map(item => {
      return isModeSemua 
        ? cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'))
        : String(getVal(item, 'kecamatan') || 'TIDAK DIKETAHUI').trim().toUpperCase();
    });

    return [...new Set(list)].sort();
  }, [data, isModeSemua, initialWilayah]);

  // =====================================================================
  // AGREGASI DATA TAB "PER KECAMATAN"
  // =====================================================================
  const dataKecamatan = useMemo(() => {
    if (!data) return [];
    
    const baseData = data.filter(item => {
      const kabDb = cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'));
      if (!isModeSemua && kabDb !== initialWilayah) return false;

      const jenjangDb = String(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang') || '').trim().toUpperCase();
      if (!isJenjangValid(jenjangDb, mappedJenjang)) return false;

      if (filterStatus !== 'SEMUA') {
        const statusDb = String(getVal(item, 'status_sekolah')).toUpperCase();
        if (statusDb !== filterStatus) return false;
      }
      return true;
    });

    const mapAgg = new Map();

    baseData.forEach(item => {
      let keyId = isModeSemua 
          ? cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota')) 
          : String(getVal(item, 'kecamatan') || 'TIDAK DIKETAHUI').trim().toUpperCase();

      if (filterWilayah !== 'SEMUA' && keyId !== filterWilayah) return;

      if (!mapAgg.has(keyId)) {
        mapAgg.set(keyId, { namaWilayah: keyId, usia_30: 0, usia_40: 0, usia_50: 0, usia_51: 0, total: 0 });
      }

      const row = mapAgg.get(keyId);
      const tglLahir = getVal(item, 'tanggal_lahir');
      const age = calculateAge(tglLahir);

      if (age !== null) {
          if (age <= 30) row.usia_30++;
          else if (age <= 40) row.usia_40++;
          else if (age <= 50) row.usia_50++;
          else row.usia_51++;
      }
      
      row.total++;
    });

    let resultArray = Array.from(mapAgg.values());

    if (searchTerm) {
      resultArray = resultArray.filter(r => r.namaWilayah.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    return isModeSemua 
      ? resultArray.sort((a, b) => getKabupatenRank(a.namaWilayah) - getKabupatenRank(b.namaWilayah)) 
      : resultArray.sort((a, b) => a.namaWilayah.localeCompare(b.namaWilayah));
  }, [data, isModeSemua, initialWilayah, filterWilayah, filterStatus, searchTerm, mappedJenjang]);

  const totalsKecamatan = useMemo(() => {
    return dataKecamatan.reduce((acc, curr) => {
      acc.usia_30 += curr.usia_30;
      acc.usia_40 += curr.usia_40;
      acc.usia_50 += curr.usia_50;
      acc.usia_51 += curr.usia_51;
      acc.total += curr.total;
      return acc;
    }, { usia_30: 0, usia_40: 0, usia_50: 0, usia_51: 0, total: 0 });
  }, [dataKecamatan]);

  // =====================================================================
  // AGREGASI DATA TAB "PER SEKOLAH" DENGAN MAPPING NAMA SINKRON
  // =====================================================================
  const dataSekolah = useMemo(() => {
    if (!data) return [];
    
    const mapSekolah = new Map();

    data.forEach(item => {
      const kabDb = cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'));
      if (!isModeSemua && kabDb !== initialWilayah) return;

      if (filterStatus !== 'SEMUA') {
        const statusDb = String(getVal(item, 'status_sekolah')).toUpperCase();
        if (statusDb !== filterStatus) return;
      }

      const jenjangDb = String(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang') || '').trim().toUpperCase();
      if (!isJenjangValid(jenjangDb, activeJenjangTab)) return;

      const kecDb = String(getVal(item, 'kecamatan') || 'TIDAK DIKETAHUI').trim().toUpperCase();
      if (filterWilayahSekolah !== 'SEMUA') {
        let keyId = isModeSemua ? kabDb : kecDb;
        if (keyId !== filterWilayahSekolah) return;
      }

      const npsn = getVal(item, 'npsn') || '-';
      let namaSekolah = getVal(item, 'nama_sekolah') || getVal(item, 'nama_satuan_pendidikan') || '';
      
      // SUNTIKAN KECERDASAN: Ambil dari mapping jika kosong
      if (!namaSekolah || namaSekolah === '-') {
         namaSekolah = mapNamaSekolah.get(String(npsn).trim()) || '-';
      }

      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        if (!namaSekolah.toLowerCase().includes(q) && !String(npsn).toLowerCase().includes(q)) return;
      }

      const uniqueKey = `${npsn}_${namaSekolah}`;
      if (!mapSekolah.has(uniqueKey)) {
        mapSekolah.set(uniqueKey, {
          npsn: npsn,
          nama_sekolah: namaSekolah,
          kecamatan: kecDb,
          jenjang: jenjangDb,
          status: String(getVal(item, 'status_sekolah')).toUpperCase(),
          usia_30: 0,
          usia_40: 0,
          usia_50: 0,
          usia_51: 0,
          total: 0
        });
      }
      
      const row = mapSekolah.get(uniqueKey);
      const tglLahir = getVal(item, 'tanggal_lahir');
      const age = calculateAge(tglLahir);

      if (age !== null) {
          if (age <= 30) row.usia_30++;
          else if (age <= 40) row.usia_40++;
          else if (age <= 50) row.usia_50++;
          else row.usia_51++;
      }
      
      row.total++;
    });

    return Array.from(mapSekolah.values()).sort((a, b) => a.nama_sekolah.localeCompare(b.nama_sekolah));
  }, [data, isModeSemua, initialWilayah, filterStatus, activeJenjangTab, filterWilayahSekolah, searchTerm, mapNamaSekolah]);

  const totalGuruSekolah = useMemo(() => {
    return dataSekolah.reduce((acc, curr) => {
      acc.usia_30 += curr.usia_30;
      acc.usia_40 += curr.usia_40;
      acc.usia_50 += curr.usia_50;
      acc.usia_51 += curr.usia_51;
      acc.total += curr.total;
      return acc;
    }, { usia_30: 0, usia_40: 0, usia_50: 0, usia_51: 0, total: 0 });
  }, [dataSekolah]);

  // =====================================================================
  // EXPORT EXCEL
  // =====================================================================
  const downloadExcelRincian = async () => {
    const workbook = new ExcelJS.Workbook();
    const safeName = activeJenjangTab.replace(/\//g, '-');
    
    if (activeModalTab === 'KECAMATAN') {
      const worksheet = workbook.addWorksheet('Rekap Usia Wilayah');
      worksheet.columns = [
        { header: isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan', key: 'namaWilayah', width: 30 },
        { header: '<= 30 Thn', key: 'usia_30', width: 15 },
        { header: '31-40 Thn', key: 'usia_40', width: 15 },
        { header: '41-50 Thn', key: 'usia_50', width: 15 },
        { header: '>= 51 Thn', key: 'usia_51', width: 15 },
        { header: 'Total Guru', key: 'total', width: 18 },
      ];
      dataKecamatan.forEach(item => worksheet.addRow(item));
      const totalRow = worksheet.addRow({ namaWilayah: 'TOTAL', usia_30: totalsKecamatan.usia_30, usia_40: totalsKecamatan.usia_40, usia_50: totalsKecamatan.usia_50, usia_51: totalsKecamatan.usia_51, total: totalsKecamatan.total });
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE11D48' } };
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Rincian_Guru_Usia_${initialWilayah}_${safeName}.xlsx`;
      link.click();
    } else {
      const worksheet = workbook.addWorksheet('Daftar Sekolah & Usia');
      worksheet.columns = [
        { header: 'NPSN', key: 'npsn', width: 15 },
        { header: 'Nama Sekolah', key: 'nama_sekolah', width: 45 },
        { header: 'Kecamatan', key: 'kecamatan', width: 25 },
        { header: 'Jenjang', key: 'jenjang', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
        { header: '<= 30 Thn', key: 'usia_30', width: 12 },
        { header: '31-40 Thn', key: 'usia_40', width: 12 },
        { header: '41-50 Thn', key: 'usia_50', width: 12 },
        { header: '>= 51 Thn', key: 'usia_51', width: 12 },
        { header: 'Total Guru', key: 'total', width: 18 },
      ];
      dataSekolah.forEach(item => worksheet.addRow(item));
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE11D48' } };
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Daftar_Guru_Sekolah_Usia_${initialWilayah}_${safeName}.xlsx`;
      link.click();
    }
  };

  // Pagination Logic
  const activeData = activeModalTab === 'KECAMATAN' ? dataKecamatan : dataSekolah;
  const totalPages = Math.ceil(activeData.length / rowsPerPage) || 1;
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentRows = activeData.slice(startIndex, startIndex + rowsPerPage);
  
  const goToPage = (page) => { if (page >= 1 && page <= totalPages) setCurrentPage(page); };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white w-full max-w-7xl h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
        
        {/* HEADER MODAL */}
        <div className="bg-rose-600 px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 text-white">
            <div className="bg-white/20 p-2 rounded-xl"><Clock size={24} /></div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tighter leading-none">
                Rincian Usia Guru
              </h2>
              <p className="text-rose-200 text-sm font-bold uppercase tracking-widest mt-1 flex gap-2">
                <span>{isModeSemua ? 'Provinsi Kalimantan Barat' : `Kabupaten ${initialWilayah}`}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={downloadExcelRincian} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl font-black text-xs uppercase shadow-md transition-all active:scale-95 border border-emerald-400">
              <Download size={14} /> Unduh Excel
            </button>
            <button onClick={onClose} className="p-2 bg-rose-800 hover:bg-red-500 text-white rounded-xl transition-colors">
              <X size={24} />
            </button>
          </div>
        </div>

        {/* TAB NAVIGATION DALAM MODAL */}
        <div className="bg-rose-50 px-6 pt-3 flex gap-2 border-b border-rose-100 shrink-0">
          <button 
            onClick={() => setActiveModalTab('KECAMATAN')}
            className={`px-6 py-2.5 rounded-t-xl font-black uppercase text-xs transition-all border-b-4 ${activeModalTab === 'KECAMATAN' ? 'bg-white text-rose-700 border-rose-700 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]' : 'bg-transparent text-rose-500 border-transparent hover:text-rose-700 hover:bg-rose-100/50'}`}
          >
            <div className="flex items-center gap-2"><MapPin size={16}/> Per Kecamatan</div>
          </button>
          <button 
            onClick={() => setActiveModalTab('SEKOLAH')}
            className={`px-6 py-2.5 rounded-t-xl font-black uppercase text-xs transition-all border-b-4 ${activeModalTab === 'SEKOLAH' ? 'bg-white text-rose-700 border-rose-700 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]' : 'bg-transparent text-rose-500 border-transparent hover:text-rose-700 hover:bg-rose-100/50'}`}
          >
            <div className="flex items-center gap-2"><School size={16}/> Per Sekolah</div>
          </button>
        </div>

        {/* TAB JENJANG KHUSUS PER SEKOLAH (DINAMIS) */}
        {activeModalTab === 'SEKOLAH' && (
          <div className="bg-white px-6 pt-4 pb-0 flex gap-2 overflow-x-auto scrollbar-hide shrink-0 z-10 relative">
            <button 
              onClick={() => setActiveJenjangTab(mappedJenjang)}
              className={`px-5 py-2 rounded-xl font-black uppercase text-[10px] md:text-xs transition-all whitespace-nowrap border ${activeJenjangTab === mappedJenjang ? 'bg-rose-600 text-white border-rose-600 shadow-md' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
            >
              {mappedJenjang === 'SEMUA JENJANG' ? 'Semua Jenjang' : `SEMUA ${mappedJenjang}`}
            </button>
            {availableTabs.map(j => (
              <button 
                key={j}
                onClick={() => setActiveJenjangTab(j)}
                className={`px-5 py-2 rounded-xl font-black uppercase text-[10px] md:text-xs transition-all whitespace-nowrap border ${activeJenjangTab === j ? 'bg-rose-600 text-white border-rose-600 shadow-md' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
              >
                {j}
              </button>
            ))}
          </div>
        )}

        {/* FILTER BAR */}
        <div className={`bg-white px-6 py-4 border-b border-gray-200 flex flex-wrap gap-4 items-center shrink-0 shadow-sm z-10 ${activeModalTab === 'SEKOLAH' ? 'border-t-0 pt-3' : ''}`}>
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder={activeModalTab === 'KECAMATAN' ? `Cari ${isModeSemua ? 'Kabupaten' : 'Kecamatan'}...` : "Cari Nama Sekolah atau NPSN..."} 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200 font-bold text-gray-700"
            />
          </div>

          <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
            <MapPin size={16} className="text-gray-400 mr-2" />
            <select 
              value={activeModalTab === 'KECAMATAN' ? filterWilayah : filterWilayahSekolah} 
              onChange={(e) => activeModalTab === 'KECAMATAN' ? setFilterWilayah(e.target.value) : setFilterWilayahSekolah(e.target.value)} 
              className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer max-w-[200px]"
            >
              <option value="SEMUA">{isModeSemua ? 'SEMUA KABUPATEN' : 'SEMUA KECAMATAN'}</option>
              {listWilayahFilter.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>

          <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
            <Building2 size={16} className="text-gray-400 mr-2" />
            <select 
              value={filterStatus} 
              onChange={(e) => setFilterStatus(e.target.value)} 
              className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer"
            >
              <option value="SEMUA">Semua Status</option>
              <option value="NEGERI">Negeri</option>
              <option value="SWASTA">Swasta</option>
            </select>
          </div>
        </div>

        {/* TABLE AREA */}
        <div className="flex-1 overflow-auto bg-gray-50/50 p-4 custom-scrollbar">
          
          {/* TABEL KECAMATAN */}
          {activeModalTab === 'KECAMATAN' && (
            <table className="w-full text-center border-separate border-spacing-y-2">
              <thead className="sticky top-0 bg-white z-10 shadow-sm rounded-xl">
                <tr className="text-[10px] font-black uppercase text-gray-500">
                  <th className="px-4 py-3 text-center rounded-l-xl w-16">No</th>
                  <th className="px-4 py-3 text-left">{isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan'}</th>
                  <th className="px-3 py-3 text-emerald-600">&lt;= 30 Thn</th>
                  <th className="px-3 py-3 text-blue-600">31-40 Thn</th>
                  <th className="px-3 py-3 text-amber-600">41-50 Thn</th>
                  <th className="px-3 py-3 text-red-600">&gt;= 51 Thn</th>
                  <th className="px-4 py-3 rounded-r-xl text-rose-800">Total Guru</th>
                </tr>
              </thead>
              <tbody>
                {currentRows.map((row, idx) => (
                  <tr key={idx} className="bg-white shadow-sm hover:shadow-md hover:scale-[1.01] transition-all group">
                    <td className="px-4 py-4 text-center font-bold text-gray-400 text-xs rounded-l-2xl border-y border-l border-gray-100">{startIndex + idx + 1}</td>
                    <td className="px-4 py-4 font-black text-gray-800 text-sm uppercase text-left border-y border-gray-100 whitespace-nowrap">{row.namaWilayah}</td>
                    
                    <td className="px-3 py-4 font-black text-emerald-600 text-base border-y border-gray-100 bg-emerald-50/30">{row.usia_30.toLocaleString()}</td>
                    <td className="px-3 py-4 font-black text-blue-600 text-base border-y border-gray-100 bg-blue-50/30">{row.usia_40.toLocaleString()}</td>
                    <td className="px-3 py-4 font-black text-amber-600 text-base border-y border-gray-100 bg-amber-50/30">{row.usia_50.toLocaleString()}</td>
                    <td className="px-3 py-4 font-black text-red-600 text-base border-y border-gray-100 bg-red-50/20">{row.usia_51.toLocaleString()}</td>
                    <td className="px-4 py-4 font-black text-rose-800 text-lg border-y border-r border-gray-100 bg-rose-50/50 rounded-r-2xl">{row.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              
              {dataKecamatan.length > 0 && (
                <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                  <tr className="bg-rose-100 text-center font-black uppercase text-xs border-t-2 border-rose-200">
                    <td colSpan="2" className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-rose-200 text-rose-900">
                      TOTAL {isModeSemua ? 'KESELURUHAN' : 'KECAMATAN'}
                    </td>
                    <td className="px-3 py-4 text-emerald-800 text-base border-y border-rose-200">{totalsKecamatan.usia_30.toLocaleString()}</td>
                    <td className="px-3 py-4 text-blue-800 text-base border-y border-rose-200">{totalsKecamatan.usia_40.toLocaleString()}</td>
                    <td className="px-3 py-4 text-amber-800 text-base border-y border-rose-200">{totalsKecamatan.usia_50.toLocaleString()}</td>
                    <td className="px-3 py-4 text-red-800 text-base border-y border-rose-200">{totalsKecamatan.usia_51.toLocaleString()}</td>
                    <td className="px-4 py-4 text-rose-950 text-lg border-y border-r border-rose-200 rounded-r-2xl bg-rose-200/50">
                      {totalsKecamatan.total.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}

          {/* TABEL SEKOLAH */}
          {activeModalTab === 'SEKOLAH' && (
            <table className="w-full text-center border-separate border-spacing-y-2">
              <thead className="sticky top-0 bg-white z-10 shadow-sm rounded-xl">
                <tr className="text-[10px] font-black uppercase text-gray-500">
                  <th className="px-4 py-3 text-center rounded-l-xl w-16">No</th>
                  <th className="px-4 py-3 text-left w-24">NPSN</th>
                  <th className="px-4 py-3 text-left">Nama Sekolah</th>
                  <th className="px-3 py-3 text-left">Kecamatan</th>
                  <th className="px-3 py-3 text-rose-600">Jenjang</th>
                  <th className="px-3 py-3 text-orange-600">Status</th>
                  <th className="px-3 py-3 text-emerald-600">&lt;= 30 Thn</th>
                  <th className="px-3 py-3 text-blue-600">31-40 Thn</th>
                  <th className="px-3 py-3 text-amber-600">41-50 Thn</th>
                  <th className="px-3 py-3 text-red-600">&gt;= 51 Thn</th>
                  <th className="px-4 py-3 rounded-r-xl text-rose-800">Total Guru</th>
                </tr>
              </thead>
              <tbody>
                {currentRows.map((row, idx) => (
                  <tr key={idx} className="bg-white shadow-sm hover:shadow-md hover:scale-[1.01] transition-all group">
                    <td className="px-4 py-3 text-center font-bold text-gray-400 text-xs rounded-l-2xl border-y border-l border-gray-100">{startIndex + idx + 1}</td>
                    <td className="px-4 py-3 font-mono text-gray-500 text-sm text-left border-y border-gray-100">{row.npsn}</td>
                    <td className="px-4 py-3 font-black text-gray-800 text-sm uppercase text-left border-y border-gray-100">{row.nama_sekolah}</td>
                    
                    <td className="px-3 py-3 font-bold text-gray-600 text-xs text-left border-y border-gray-100 uppercase">{row.kecamatan}</td>
                    <td className="px-3 py-3 font-bold text-rose-600 text-xs border-y border-gray-100 uppercase">{row.jenjang}</td>
                    <td className="px-3 py-3 font-bold text-orange-600 text-xs border-y border-gray-100 uppercase">{row.status}</td>
                    
                    <td className="px-3 py-3 font-bold text-emerald-600 text-sm border-y border-gray-100 bg-emerald-50/20">{row.usia_30.toLocaleString()}</td>
                    <td className="px-3 py-3 font-bold text-blue-600 text-sm border-y border-gray-100 bg-blue-50/20">{row.usia_40.toLocaleString()}</td>
                    <td className="px-3 py-3 font-bold text-amber-600 text-sm border-y border-gray-100 bg-amber-50/20">{row.usia_50.toLocaleString()}</td>
                    <td className="px-3 py-3 font-bold text-red-600 text-sm border-y border-gray-100 bg-red-50/20">{row.usia_51.toLocaleString()}</td>

                    <td className="px-4 py-3 font-black text-rose-800 text-lg border-y border-r border-gray-100 bg-rose-50/50 rounded-r-2xl">
                      {row.total.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              
              {dataSekolah.length > 0 && (
                <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                  <tr className="bg-rose-100 text-center font-black uppercase text-xs border-t-2 border-rose-200">
                    <td colSpan="6" className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-rose-200 text-rose-900">
                      TOTAL GURU DARI {dataSekolah.length} SEKOLAH
                    </td>
                    <td className="px-3 py-4 text-emerald-800 text-base border-y border-rose-200">{totalGuruSekolah.usia_30.toLocaleString()}</td>
                    <td className="px-3 py-4 text-blue-800 text-base border-y border-rose-200">{totalGuruSekolah.usia_40.toLocaleString()}</td>
                    <td className="px-3 py-4 text-amber-800 text-base border-y border-rose-200">{totalGuruSekolah.usia_50.toLocaleString()}</td>
                    <td className="px-3 py-4 text-red-800 text-base border-y border-rose-200">{totalGuruSekolah.usia_51.toLocaleString()}</td>
                    <td className="px-4 py-4 text-rose-950 text-lg border-y border-r border-rose-200 rounded-r-2xl bg-rose-200/50">
                      {totalGuruSekolah.total.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
          
          {activeData.length === 0 && (
             <div className="py-20 flex flex-col items-center opacity-30 text-gray-500">
               <Search size={64} className="mb-4" />
               <p className="font-black uppercase tracking-widest text-xl">Tidak Ada Data</p>
             </div>
          )}
        </div>

        {/* FOOTER & PAGINATION */}
        <div className="bg-white p-4 border-t border-gray-200 flex items-center justify-between shrink-0 rounded-b-3xl">
          <div className="flex flex-col">
            <p className="text-xs font-bold text-gray-500">
              Menampilkan <span className="text-gray-800">{activeData.length === 0 ? 0 : startIndex + 1}</span> - <span className="text-gray-800">{Math.min(startIndex + rowsPerPage, activeData.length)}</span> dari <span className="text-rose-700 font-black">{activeData.length}</span> baris
            </p>
            {displayLastUpdated && (
              <p className="text-[10px] font-bold italic text-gray-400 mt-1">
                Sumber : Data Dapodik Update Pada {displayLastUpdated}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <button disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)} className="p-2 rounded-xl bg-gray-50 border border-gray-200 hover:bg-rose-50 disabled:opacity-50 transition-colors"><ChevronLeft size={16} /></button>
            <span className="text-xs font-black text-gray-600 px-2">Hal {currentPage} / {totalPages}</span>
            <button disabled={currentPage === totalPages || totalPages === 0} onClick={() => goToPage(currentPage + 1)} className="p-2 rounded-xl bg-gray-50 border border-gray-200 hover:bg-rose-50 disabled:opacity-50 transition-colors"><ChevronRight size={16} /></button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}