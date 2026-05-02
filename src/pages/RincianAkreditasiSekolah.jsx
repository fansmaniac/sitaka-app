import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Download, Award, MapPin, Search, X, ChevronLeft, ChevronRight, 
  Building2, School
} from 'lucide-react';
import ExcelJS from 'exceljs';

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

// SUDAH DIPISAHKAN SMA DAN SMK
const JENJANG_GROUPS = {
  'PAUD': ['TK', 'KB', 'PAUD', 'SPS', 'TPA'],
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

// =====================================================================
// MAIN COMPONENT
// =====================================================================
export default function RincianAkreditasiSekolah({ 
  isOpen, 
  onClose, 
  data = [], 
  initialWilayah = 'SEMUA', 
  activeJenjang = 'SEMUA', // Context Header/Awal
  displayLastUpdated 
}) {
  // Fungsi penerjemah jenjang (Jaga-jaga jika parent mengirimkan nama yang berbeda)
  const normalizeJenjang = (j) => {
    if (j === 'SLB (Inklusif)') return 'SLB';
    return j;
  };

  const mappedJenjang = normalizeJenjang(activeJenjang);

  // STATE MODAL TABS
  const [activeModalTab, setActiveModalTab] = useState('KECAMATAN'); // 'KECAMATAN' | 'SEKOLAH'
  
  // STATE FILTERS
  const [searchTerm, setSearchTerm] = useState('');
  const [filterWilayah, setFilterWilayah] = useState('SEMUA'); // Tab Kecamatan
  const [filterWilayahSekolah, setFilterWilayahSekolah] = useState('SEMUA'); // Tab Sekolah
  const [filterStatus, setFilterStatus] = useState('SEMUA'); // Tab Kecamatan & Sekolah
  const [activeJenjangTab, setActiveJenjangTab] = useState('SEMUA'); // Tab Menu Jenjang (Khusus Tab Sekolah)

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  const isModeSemua = initialWilayah === 'SEMUA';

  // Sinkronisasi saat modal dibuka
  useEffect(() => {
    if (isOpen) {
      setActiveModalTab('KECAMATAN');
      setSearchTerm('');
      setFilterWilayah('SEMUA');
      setFilterWilayahSekolah('SEMUA');
      setFilterStatus('SEMUA');
      setActiveJenjangTab(mappedJenjang); // Inisialisasi jenjang dari parent
      setCurrentPage(1);
    }
  }, [isOpen, mappedJenjang]);

  // Reset pagination saat pencarian atau filter berubah
  useEffect(() => { 
    setCurrentPage(1); 
  }, [searchTerm, filterWilayah, filterWilayahSekolah, filterStatus, activeJenjangTab, activeModalTab]);

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  // Ekstrak Daftar Wilayah (Kabupaten/Kecamatan) untuk Dropdown Filter
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
    
    // Filter Base
    const baseData = data.filter(item => {
      const kabDb = cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'));
      if (!isModeSemua && kabDb !== initialWilayah) return false;

      // Filter Jenjang
      if (mappedJenjang !== 'SEMUA') {
         const validJenjangList = JENJANG_GROUPS[mappedJenjang] || []; 
         const jenjangDb = String(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang') || '').trim().toUpperCase();
         if (!validJenjangList.includes(jenjangDb)) return false;
      }

      // Filter Status
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
        mapAgg.set(keyId, { namaWilayah: keyId, akr_a: 0, akr_b: 0, akr_c: 0, akr_tt: 0, akr_belum: 0, total: 0 });
      }

      const row = mapAgg.get(keyId);
      const akr = String(getVal(item, 'akreditasi')).trim().toUpperCase();
      
      if (akr === 'A') row.akr_a++;
      else if (akr === 'B') row.akr_b++;
      else if (akr === 'C') row.akr_c++;
      else if (akr === 'TT') row.akr_tt++;
      else row.akr_belum++;
      
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
      acc.akr_a += curr.akr_a;
      acc.akr_b += curr.akr_b;
      acc.akr_c += curr.akr_c;
      acc.akr_tt += curr.akr_tt;
      acc.akr_belum += curr.akr_belum;
      acc.total += curr.total;
      return acc;
    }, { akr_a: 0, akr_b: 0, akr_c: 0, akr_tt: 0, akr_belum: 0, total: 0 });
  }, [dataKecamatan]);

  // =====================================================================
  // AGREGASI DATA TAB "PER SEKOLAH"
  // =====================================================================
  const dataSekolah = useMemo(() => {
    if (!data) return [];
    
    let validData = data.filter(item => {
      const kabDb = cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'));
      if (!isModeSemua && kabDb !== initialWilayah) return false;

      if (filterStatus !== 'SEMUA') {
        const statusDb = String(getVal(item, 'status_sekolah')).toUpperCase();
        if (statusDb !== filterStatus) return false;
      }

      // Mematuhi Tab Jenjang di UI
      if (activeJenjangTab !== 'SEMUA') {
        const group = identifyJenjangGroup(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang'));
        if (group !== activeJenjangTab) return false;
      }

      if (searchTerm) {
        const nama = String(getVal(item, 'nama_sekolah') || getVal(item, 'nama_satuan_pendidikan') || '').toLowerCase();
        const npsn = String(getVal(item, 'npsn') || '').toLowerCase();
        const q = searchTerm.toLowerCase();
        if (!nama.includes(q) && !npsn.includes(q)) return false;
      }

      return true;
    });

    return validData.map(item => {
      const akrRaw = String(getVal(item, 'akreditasi')).trim().toUpperCase();
      const akrDisplay = ['A', 'B', 'C', 'TT'].includes(akrRaw) ? akrRaw : 'BELUM';
      
      return {
        npsn: getVal(item, 'npsn'),
        nama_sekolah: getVal(item, 'nama_sekolah') || getVal(item, 'nama_satuan_pendidikan') || '-',
        jenjang: getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang'),
        status: getVal(item, 'status_sekolah'),
        kecamatan: getVal(item, 'kecamatan'),
        akreditasi: akrDisplay
      };
    }).sort((a, b) => String(a.nama_sekolah).localeCompare(String(b.nama_sekolah)));

  }, [data, isModeSemua, initialWilayah, filterStatus, activeJenjangTab, searchTerm]);


  // =====================================================================
  // EXPORT EXCEL
  // =====================================================================
  const downloadExcelRincian = async () => {
    const workbook = new ExcelJS.Workbook();
    
    if (activeModalTab === 'KECAMATAN') {
      const sheetName = isModeSemua ? 'Rekap Provinsi' : `Rekap ${initialWilayah}`;
      const worksheet = workbook.addWorksheet(sheetName);

      worksheet.columns = [
        { header: isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan', key: 'namaWilayah', width: 30 },
        { header: 'Akreditasi A', key: 'akr_a', width: 15 },
        { header: 'Akreditasi B', key: 'akr_b', width: 15 },
        { header: 'Akreditasi C', key: 'akr_c', width: 15 },
        { header: 'TT (Tidak Terakreditasi)', key: 'akr_tt', width: 25 },
        { header: 'Belum Terakreditasi', key: 'akr_belum', width: 20 },
        { header: 'Total Sekolah', key: 'total', width: 18 },
      ];

      dataKecamatan.forEach(item => worksheet.addRow(item));

      const totalRow = worksheet.addRow({
        namaWilayah: 'TOTAL KESELURUHAN',
        akr_a: totalsKecamatan.akr_a,
        akr_b: totalsKecamatan.akr_b,
        akr_c: totalsKecamatan.akr_c,
        akr_tt: totalsKecamatan.akr_tt,
        akr_belum: totalsKecamatan.akr_belum,
        total: totalsKecamatan.total
      });

      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } }; // Emerald 600
      totalRow.font = { bold: true, color: { argb: 'FF064E3B' } }; 
      totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }; 

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Rincian_Akreditasi_Kecamatan_${initialWilayah}.xlsx`;
      link.click();
    } else {
      // Tab SEKOLAH
      const worksheet = workbook.addWorksheet('Daftar Sekolah');

      worksheet.columns = [
        { header: 'NPSN', key: 'npsn', width: 15 },
        { header: 'Nama Sekolah', key: 'nama_sekolah', width: 45 },
        { header: 'Jenjang', key: 'jenjang', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Kecamatan', key: 'kecamatan', width: 25 },
        { header: 'Akreditasi', key: 'akreditasi', width: 15 },
      ];

      dataSekolah.forEach(item => worksheet.addRow(item));

      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } }; // Emerald 600

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Daftar_Sekolah_Akreditasi_${initialWilayah}_${activeJenjangTab.replace(' ','_')}.xlsx`;
      link.click();
    }
  };

  // Pagination Logic
  const activeData = activeModalTab === 'KECAMATAN' ? dataKecamatan : dataSekolah;
  const totalPages = Math.ceil(activeData.length / rowsPerPage) || 1;
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentRows = activeData.slice(startIndex, startIndex + rowsPerPage);
  
  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white w-full max-w-6xl h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
        
        {/* HEADER MODAL */}
        <div className="bg-emerald-600 px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 text-white">
            <div className="bg-white/20 p-2 rounded-xl"><Award size={24} /></div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tighter leading-none">
                Rincian Akreditasi Sekolah
              </h2>
              <p className="text-emerald-200 text-sm font-bold uppercase tracking-widest mt-1 flex gap-2">
                <span>{isModeSemua ? 'Provinsi Kalimantan Barat' : `Kabupaten ${initialWilayah}`}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={downloadExcelRincian} className="flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-xl font-black text-xs uppercase shadow-md transition-all active:scale-95 border border-blue-400">
              <Download size={14} /> Unduh Excel
            </button>
            <button onClick={onClose} className="p-2 bg-white/10 hover:bg-red-500 text-white rounded-xl transition-colors">
              <X size={24} />
            </button>
          </div>
        </div>

        {/* TAB NAVIGATION DALAM MODAL */}
        <div className="bg-emerald-50 px-6 pt-3 flex gap-2 border-b border-emerald-100 shrink-0">
          <button 
            onClick={() => setActiveModalTab('KECAMATAN')}
            className={`px-6 py-2.5 rounded-t-xl font-black uppercase text-xs transition-all border-b-4 ${activeModalTab === 'KECAMATAN' ? 'bg-white text-emerald-700 border-emerald-700 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]' : 'bg-transparent text-emerald-500 border-transparent hover:text-emerald-700 hover:bg-emerald-100/50'}`}
          >
            <div className="flex items-center gap-2"><MapPin size={16}/> Per Kecamatan</div>
          </button>
          <button 
            onClick={() => setActiveModalTab('SEKOLAH')}
            className={`px-6 py-2.5 rounded-t-xl font-black uppercase text-xs transition-all border-b-4 ${activeModalTab === 'SEKOLAH' ? 'bg-white text-emerald-700 border-emerald-700 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]' : 'bg-transparent text-emerald-500 border-transparent hover:text-emerald-700 hover:bg-emerald-100/50'}`}
          >
            <div className="flex items-center gap-2"><School size={16}/> Per Sekolah</div>
          </button>
        </div>

        {/* TAB JENJANG KHUSUS PER SEKOLAH */}
        {activeModalTab === 'SEKOLAH' && (
          <div className="bg-white px-6 pt-4 pb-0 flex gap-2 overflow-x-auto scrollbar-hide shrink-0 z-10 relative">
            <button 
              onClick={() => setActiveJenjangTab('SEMUA')}
              className={`px-5 py-2 rounded-xl font-black uppercase text-[10px] md:text-xs transition-all whitespace-nowrap border ${activeJenjangTab === 'SEMUA' ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
            >
              Semua Jenjang
            </button>
            {Object.keys(JENJANG_GROUPS).map(j => (
              <button 
                key={j}
                onClick={() => setActiveJenjangTab(j)}
                className={`px-5 py-2 rounded-xl font-black uppercase text-[10px] md:text-xs transition-all whitespace-nowrap border ${activeJenjangTab === j ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
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
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 font-bold text-gray-700"
            />
          </div>

          {/* FILTER TAB KECAMATAN */}
          {activeModalTab === 'KECAMATAN' && (
            <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
              <MapPin size={16} className="text-gray-400 mr-2" />
              <select 
                value={filterWilayah} 
                onChange={(e) => setFilterWilayah(e.target.value)} 
                className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer max-w-[200px]"
              >
                <option value="SEMUA">{isModeSemua ? 'SEMUA KABUPATEN' : 'SEMUA KECAMATAN'}</option>
                {listWilayahFilter.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          )}

          {/* FILTER TAB SEKOLAH */}
          {activeModalTab === 'SEKOLAH' && (
            <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
              <MapPin size={16} className="text-gray-400 mr-2" />
              <select 
                value={filterWilayahSekolah} 
                onChange={(e) => setFilterWilayahSekolah(e.target.value)} 
                className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer max-w-[200px]"
              >
                <option value="SEMUA">{isModeSemua ? 'SEMUA KABUPATEN' : 'SEMUA KECAMATAN'}</option>
                {listWilayahFilter.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          )}

          {/* FILTER STATUS (BERLAKU UNTUK KEDUANYA) */}
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
                  <th className="px-3 py-3 text-emerald-600">A</th>
                  <th className="px-3 py-3 text-blue-600">B</th>
                  <th className="px-3 py-3 text-amber-600">C</th>
                  <th className="px-3 py-3 text-red-600">TT</th>
                  <th className="px-3 py-3 text-slate-500">Belum</th>
                  <th className="px-4 py-3 rounded-r-xl text-gray-800">Total Sekolah</th>
                </tr>
              </thead>
              <tbody>
                {currentRows.map((row, idx) => (
                  <tr key={idx} className="bg-white shadow-sm hover:shadow-md hover:scale-[1.01] transition-all group">
                    <td className="px-4 py-4 text-center font-bold text-gray-400 text-xs rounded-l-2xl border-y border-l border-gray-100">{startIndex + idx + 1}</td>
                    <td className="px-4 py-4 font-black text-gray-800 text-sm uppercase text-left border-y border-gray-100 whitespace-nowrap">{row.namaWilayah}</td>
                    
                    <td className="px-3 py-4 font-black text-emerald-600 text-base border-y border-gray-100 bg-emerald-50/30">{row.akr_a.toLocaleString()}</td>
                    <td className="px-3 py-4 font-black text-blue-600 text-base border-y border-gray-100 bg-blue-50/30">{row.akr_b.toLocaleString()}</td>
                    <td className="px-3 py-4 font-black text-amber-600 text-base border-y border-gray-100 bg-amber-50/30">{row.akr_c.toLocaleString()}</td>
                    <td className="px-3 py-4 font-black text-red-600 text-base border-y border-gray-100 bg-red-50/20">{row.akr_tt.toLocaleString()}</td>
                    <td className="px-3 py-4 font-black text-slate-500 text-base border-y border-gray-100 bg-slate-50/50">{row.akr_belum.toLocaleString()}</td>
                    
                    <td className="px-4 py-4 font-black text-gray-800 text-lg border-y border-r border-gray-100 bg-gray-50/50 rounded-r-2xl">{row.total.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              
              {dataKecamatan.length > 0 && (
                <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                  <tr className="bg-emerald-100 text-center font-black uppercase text-xs border-t-2 border-emerald-200">
                    <td colSpan="2" className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-emerald-200 text-emerald-900">
                      TOTAL {isModeSemua ? 'KESELURUHAN' : 'KECAMATAN'}
                    </td>
                    <td className="px-3 py-4 text-emerald-800 text-base border-y border-emerald-200">{totalsKecamatan.akr_a.toLocaleString()}</td>
                    <td className="px-3 py-4 text-blue-800 text-base border-y border-emerald-200">{totalsKecamatan.akr_b.toLocaleString()}</td>
                    <td className="px-3 py-4 text-amber-800 text-base border-y border-emerald-200">{totalsKecamatan.akr_c.toLocaleString()}</td>
                    <td className="px-3 py-4 text-red-800 text-base border-y border-emerald-200">{totalsKecamatan.akr_tt.toLocaleString()}</td>
                    <td className="px-3 py-4 text-slate-800 text-base border-y border-emerald-200">{totalsKecamatan.akr_belum.toLocaleString()}</td>
                    <td className="px-4 py-4 text-emerald-950 text-lg border-y border-r border-emerald-200 rounded-r-2xl bg-emerald-200/50">
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
                  <th className="px-3 py-3 text-emerald-600">Jenjang</th>
                  <th className="px-3 py-3 text-orange-600">Status</th>
                  <th className="px-4 py-3 rounded-r-xl text-gray-800">Akreditasi</th>
                </tr>
              </thead>
              <tbody>
                {currentRows.map((row, idx) => {
                  let badgeColor = 'bg-slate-100 text-slate-600 border-slate-200'; // Default Belum
                  if (row.akreditasi === 'A') badgeColor = 'bg-emerald-100 text-emerald-700 border-emerald-200';
                  else if (row.akreditasi === 'B') badgeColor = 'bg-blue-100 text-blue-700 border-blue-200';
                  else if (row.akreditasi === 'C') badgeColor = 'bg-amber-100 text-amber-700 border-amber-200';
                  else if (row.akreditasi === 'TT') badgeColor = 'bg-red-100 text-red-700 border-red-200';

                  return (
                    <tr key={idx} className="bg-white shadow-sm hover:shadow-md hover:scale-[1.01] transition-all group">
                      <td className="px-4 py-3 text-center font-bold text-gray-400 text-xs rounded-l-2xl border-y border-l border-gray-100">{startIndex + idx + 1}</td>
                      <td className="px-4 py-3 font-mono text-gray-500 text-sm text-left border-y border-gray-100">{row.npsn}</td>
                      <td className="px-4 py-3 font-black text-gray-800 text-sm uppercase text-left border-y border-gray-100">{row.nama_sekolah}</td>
                      
                      <td className="px-3 py-3 font-bold text-gray-600 text-xs text-left border-y border-gray-100 uppercase">{row.kecamatan}</td>
                      <td className="px-3 py-3 font-bold text-emerald-600 text-xs border-y border-gray-100 uppercase">{row.jenjang}</td>
                      <td className="px-3 py-3 font-bold text-orange-600 text-xs border-y border-gray-100 uppercase">{row.status}</td>
                      
                      <td className="px-4 py-3 border-y border-r border-gray-100 rounded-r-2xl">
                        <span className={`px-4 py-1.5 rounded-xl font-black text-xs border ${badgeColor}`}>
                          {row.akreditasi}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
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
              Menampilkan <span className="text-gray-800">{activeData.length === 0 ? 0 : startIndex + 1}</span> - <span className="text-gray-800">{Math.min(startIndex + rowsPerPage, activeData.length)}</span> dari <span className="text-emerald-700 font-black">{activeData.length}</span> baris
            </p>
            {displayLastUpdated && (
              <p className="text-[10px] font-bold italic text-gray-400 mt-1">
                Sumber : Data Dapodik Update Pada {displayLastUpdated}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <button disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)} className="p-2 rounded-xl bg-gray-50 border border-gray-200 hover:bg-emerald-50 disabled:opacity-50 transition-colors"><ChevronLeft size={16} /></button>
            <span className="text-xs font-black text-gray-600 px-2">Hal {currentPage} / {totalPages}</span>
            <button disabled={currentPage === totalPages || totalPages === 0} onClick={() => goToPage(currentPage + 1)} className="p-2 rounded-xl bg-gray-50 border border-gray-200 hover:bg-emerald-50 disabled:opacity-50 transition-colors"><ChevronRight size={16} /></button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}