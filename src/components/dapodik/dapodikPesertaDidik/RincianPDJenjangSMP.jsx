import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Download, Library, MapPin, Search, X, ChevronLeft, ChevronRight,
  Building2, School
} from 'lucide-react';
import ExcelJS from 'exceljs';

// =====================================================================
// UTILITY FUNCTIONS
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

const JENJANG_GROUPS = {
  'SMP': ['SMP', 'SPK SMP'] // Sesuai dengan filter SMP utama
};

const identifyJenjangGroup = (jenjangDb) => {
  const j = String(jenjangDb).trim().toUpperCase();
  if (JENJANG_GROUPS['SMP'].includes(j)) return 'SMP';
  return null;
};

// =====================================================================
// MAIN COMPONENT
// =====================================================================
export default function RincianPDJenjangSMP({ 
  isOpen, 
  onClose, 
  data = [], 
  initialWilayah = 'SEMUA', 
  displayLastUpdated 
}) {
  // STATE MODAL TABS
  const [activeModalTab, setActiveModalTab] = useState('KECAMATAN'); // 'KECAMATAN' | 'SEKOLAH'

  // STATE FILTERS
  const [searchTerm, setSearchTerm] = useState('');
  const [filterWilayah, setFilterWilayah] = useState(initialWilayah); // Untuk Tab Kecamatan
  const [filterWilayahSekolah, setFilterWilayahSekolah] = useState('SEMUA'); // Untuk Tab Sekolah
  const [filterStatus, setFilterStatus] = useState('SEMUA'); 

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
      setCurrentPage(1);
    }
  }, [isOpen]);

  // Reset pagination saat pencarian atau filter berubah
  useEffect(() => { 
    setCurrentPage(1); 
  }, [searchTerm, filterWilayah, filterWilayahSekolah, filterStatus, activeModalTab]);

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
      return cleanKabupatenName(item.kabupaten) === initialWilayah;
    });

    const list = validData.map(item => {
      return isModeSemua 
        ? cleanKabupatenName(item.kabupaten)
        : String(item.kecamatan || 'TIDAK DIKETAHUI').trim().toUpperCase();
    });

    return [...new Set(list)].sort();
  }, [data, isModeSemua, initialWilayah]);

  // =====================================================================
  // AGREGASI DATA TAB "PER KECAMATAN"
  // =====================================================================
  const dataKecamatan = useMemo(() => {
    if (!data) return [];

    const baseData = data.filter(item => {
      // 1. Filter Wilayah Base
      const kabDb = cleanKabupatenName(item.kabupaten);
      if (!isModeSemua && kabDb !== initialWilayah) return false;

      const group = identifyJenjangGroup(item.bentuk_pendidikan);
      if (group !== 'SMP') return false;

      if (filterStatus !== 'SEMUA') {
        const statusDb = String(item.status_sekolah || '').toUpperCase();
        if (statusDb !== filterStatus) return false;
      }
      return true;
    });

    const mapAgg = new Map();

    baseData.forEach(item => {
      let keyId = isModeSemua 
          ? cleanKabupatenName(item.kabupaten) 
          : String(item.kecamatan || 'TIDAK DIKETAHUI').trim().toUpperCase();

      if (filterWilayah !== 'SEMUA' && keyId !== filterWilayah) return;

      if (!mapAgg.has(keyId)) {
        mapAgg.set(keyId, { 
          namaWilayah: keyId, 
          smp_7: 0, smp_8: 0, smp_9: 0, 
          total: 0 
        });
      }

      const row = mapAgg.get(keyId);
      
      const t7 = (item.t7_l || 0) + (item.t7_p || 0);
      const t8 = (item.t8_l || 0) + (item.t8_p || 0);
      const t9 = (item.t9_l || 0) + (item.t9_p || 0);

      row.smp_7 += t7; 
      row.smp_8 += t8; 
      row.smp_9 += t9;
      row.total += (t7 + t8 + t9);
    });

    let resultArray = Array.from(mapAgg.values());

    if (searchTerm) {
      resultArray = resultArray.filter(r => r.namaWilayah.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    return isModeSemua 
      ? resultArray.sort((a, b) => getKabupatenRank(a.namaWilayah) - getKabupatenRank(b.namaWilayah)) 
      : resultArray.sort((a, b) => a.namaWilayah.localeCompare(b.namaWilayah));
  }, [data, isModeSemua, initialWilayah, filterWilayah, filterStatus, searchTerm]);

  const totalsKecamatan = useMemo(() => {
    return dataKecamatan.reduce((acc, curr) => {
      acc.smp_7 += curr.smp_7; 
      acc.smp_8 += curr.smp_8; 
      acc.smp_9 += curr.smp_9;
      acc.total += curr.total;
      return acc;
    }, { smp_7: 0, smp_8: 0, smp_9: 0, total: 0 });
  }, [dataKecamatan]);

  // =====================================================================
  // AGREGASI DATA TAB "PER SEKOLAH"
  // =====================================================================
  const dataSekolah = useMemo(() => {
    if (!data) return [];
    
    let validData = data.filter(item => {
      const kabDb = cleanKabupatenName(item.kabupaten);
      if (!isModeSemua && kabDb !== initialWilayah) return false;

      const group = identifyJenjangGroup(item.bentuk_pendidikan);
      if (group !== 'SMP') return false;

      if (filterStatus !== 'SEMUA') {
        const statusDb = String(item.status_sekolah || '').toUpperCase();
        if (statusDb !== filterStatus) return false;
      }

      // Filter Wilayah Khusus Tab Sekolah (Kecamatan/Kabupaten)
      if (filterWilayahSekolah !== 'SEMUA') {
        let keyId = isModeSemua 
          ? cleanKabupatenName(item.kabupaten) 
          : String(item.kecamatan || 'TIDAK DIKETAHUI').trim().toUpperCase();
        if (keyId !== filterWilayahSekolah) return false;
      }

      if (searchTerm) {
        const nama = String(item.nama || '-').toLowerCase();
        const npsn = String(item.npsn || '').toLowerCase();
        const q = searchTerm.toLowerCase();
        if (!nama.includes(q) && !npsn.includes(q)) return false;
      }

      return true;
    });

    return validData.map(item => {
      const t7 = (item.t7_l || 0) + (item.t7_p || 0);
      const t8 = (item.t8_l || 0) + (item.t8_p || 0);
      const t9 = (item.t9_l || 0) + (item.t9_p || 0);

      return {
        npsn: item.npsn || '-',
        nama_sekolah: String(item.nama || '-').toUpperCase(),
        status: String(item.status_sekolah || '').toUpperCase(),
        kecamatan: String(item.kecamatan || 'TIDAK DIKETAHUI').trim().toUpperCase(),
        smp_7: t7,
        smp_8: t8,
        smp_9: t9,
        total: t7 + t8 + t9
      };
    }).sort((a, b) => String(a.nama_sekolah).localeCompare(String(b.nama_sekolah)));

  }, [data, isModeSemua, initialWilayah, filterStatus, filterWilayahSekolah, searchTerm]);

  const totalsSekolah = useMemo(() => {
    return dataSekolah.reduce((acc, curr) => {
      acc.smp_7 += curr.smp_7; 
      acc.smp_8 += curr.smp_8; 
      acc.smp_9 += curr.smp_9;
      acc.total += curr.total;
      return acc;
    }, { smp_7: 0, smp_8: 0, smp_9: 0, total: 0 });
  }, [dataSekolah]);

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
        { header: 'Kelas 7', key: 'smp_7', width: 15 },
        { header: 'Kelas 8', key: 'smp_8', width: 15 },
        { header: 'Kelas 9', key: 'smp_9', width: 15 },
        { header: 'Total Peserta Didik', key: 'total', width: 22 },
      ];

      dataKecamatan.forEach(item => worksheet.addRow(item));

      const totalRow = worksheet.addRow({
        namaWilayah: 'TOTAL KESELURUHAN',
        smp_7: totalsKecamatan.smp_7, 
        smp_8: totalsKecamatan.smp_8, 
        smp_9: totalsKecamatan.smp_9,
        total: totalsKecamatan.total
      });

      // Styling Header
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }; // Indigo 600
      
      // Styling Baris Total
      totalRow.font = { bold: true, color: { argb: 'FF312E81' } }; // Indigo 900
      totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }; // Indigo 100

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Rincian_PD_SMP_Kecamatan_${initialWilayah}.xlsx`;
      link.click();
    } else {
      // Tab SEKOLAH
      const worksheet = workbook.addWorksheet('Daftar Sekolah');

      worksheet.columns = [
        { header: 'NPSN', key: 'npsn', width: 15 },
        { header: 'Nama Sekolah', key: 'nama_sekolah', width: 45 },
        { header: 'Kecamatan', key: 'kecamatan', width: 25 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Kelas 7', key: 'smp_7', width: 12 },
        { header: 'Kelas 8', key: 'smp_8', width: 12 },
        { header: 'Kelas 9', key: 'smp_9', width: 12 },
        { header: 'Total Peserta Didik', key: 'total', width: 22 },
      ];

      dataSekolah.forEach(item => worksheet.addRow(item));

      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }; // Indigo 600

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Daftar_Sekolah_PD_SMP_${initialWilayah}.xlsx`;
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
        <div className="bg-indigo-600 px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 text-white">
            <div className="bg-white/20 p-2 rounded-xl"><Library size={24} /></div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tighter leading-none">
                Rincian Peserta Didik SMP
              </h2>
              <p className="text-indigo-200 text-sm font-bold uppercase tracking-widest mt-1 flex gap-2">
                <span>{isModeSemua ? 'Provinsi Kalimantan Barat' : `Kabupaten ${initialWilayah}`}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={downloadExcelRincian} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-black text-xs uppercase shadow-md transition-all active:scale-95 border border-emerald-400">
              <Download size={14} /> Unduh Excel
            </button>
            <button onClick={onClose} className="p-2 bg-white/10 hover:bg-red-500 text-white rounded-xl transition-colors">
              <X size={24} />
            </button>
          </div>
        </div>

        {/* TAB NAVIGATION DALAM MODAL */}
        <div className="bg-indigo-50 px-6 pt-3 flex gap-2 border-b border-indigo-100 shrink-0">
          <button 
            onClick={() => setActiveModalTab('KECAMATAN')}
            className={`px-6 py-2.5 rounded-t-xl font-black uppercase text-xs transition-all border-b-4 ${activeModalTab === 'KECAMATAN' ? 'bg-white text-indigo-700 border-indigo-700 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]' : 'bg-transparent text-indigo-500 border-transparent hover:text-indigo-700 hover:bg-indigo-100/50'}`}
          >
            <div className="flex items-center gap-2"><MapPin size={16}/> Per Kecamatan</div>
          </button>
          <button 
            onClick={() => setActiveModalTab('SEKOLAH')}
            className={`px-6 py-2.5 rounded-t-xl font-black uppercase text-xs transition-all border-b-4 ${activeModalTab === 'SEKOLAH' ? 'bg-white text-indigo-700 border-indigo-700 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]' : 'bg-transparent text-indigo-500 border-transparent hover:text-indigo-700 hover:bg-indigo-100/50'}`}
          >
            <div className="flex items-center gap-2"><School size={16}/> Per Sekolah</div>
          </button>
        </div>

        {/* FILTER BAR */}
        <div className="bg-white px-6 py-4 border-b border-gray-200 flex flex-wrap gap-4 items-center shrink-0 shadow-sm z-10">
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder={activeModalTab === 'KECAMATAN' ? `Cari ${isModeSemua ? 'Kabupaten' : 'Kecamatan'}...` : "Cari Nama Sekolah atau NPSN..."} 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 font-bold text-gray-700"
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
                  <th className="px-4 py-3 text-indigo-500">Kelas 7</th>
                  <th className="px-4 py-3 text-violet-500">Kelas 8</th>
                  <th className="px-4 py-3 text-fuchsia-500">Kelas 9</th>
                  <th className="px-4 py-3 rounded-r-xl text-gray-800">Total PD</th>
                </tr>
              </thead>
              <tbody>
                {currentRows.map((row, idx) => (
                  <tr key={idx} className="bg-white shadow-sm hover:shadow-md hover:scale-[1.01] transition-all group">
                    <td className="px-4 py-4 text-center font-bold text-gray-400 text-xs rounded-l-2xl border-y border-l border-gray-100">{startIndex + idx + 1}</td>
                    <td className="px-4 py-4 font-black text-gray-800 text-sm uppercase text-left border-y border-gray-100 whitespace-nowrap">{row.namaWilayah}</td>
                    
                    <td className="px-4 py-4 font-bold text-indigo-500 text-sm border-y border-gray-100 bg-indigo-50/20">{row.smp_7.toLocaleString()}</td>
                    <td className="px-4 py-4 font-bold text-violet-500 text-sm border-y border-gray-100 bg-violet-50/20">{row.smp_8.toLocaleString()}</td>
                    <td className="px-4 py-4 font-bold text-fuchsia-500 text-sm border-y border-gray-100 bg-fuchsia-50/20">{row.smp_9.toLocaleString()}</td>
                    
                    <td className="px-4 py-4 font-black text-gray-800 text-lg border-y border-r border-gray-100 bg-gray-50/50 rounded-r-2xl">
                      {row.total.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              
              {dataKecamatan.length > 0 && (
                <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                  <tr className="bg-indigo-100 text-center font-black uppercase text-xs border-t-2 border-indigo-200">
                    <td colSpan="2" className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-indigo-200 text-indigo-900">
                      TOTAL {isModeSemua ? 'KESELURUHAN' : 'KECAMATAN'}
                    </td>
                    <td className="px-4 py-4 text-indigo-600 border-y border-indigo-200 text-base">{totalsKecamatan.smp_7.toLocaleString()}</td>
                    <td className="px-4 py-4 text-violet-600 border-y border-indigo-200 text-base">{totalsKecamatan.smp_8.toLocaleString()}</td>
                    <td className="px-4 py-4 text-fuchsia-600 border-y border-indigo-200 text-base">{totalsKecamatan.smp_9.toLocaleString()}</td>
                    <td className="px-4 py-4 text-indigo-950 text-lg border-y border-r border-indigo-200 rounded-r-2xl bg-indigo-200/50">
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
                  <th className="px-3 py-3 text-orange-600">Status</th>
                  <th className="px-4 py-3 text-indigo-500">Kls 7</th>
                  <th className="px-4 py-3 text-violet-500">Kls 8</th>
                  <th className="px-4 py-3 text-fuchsia-500">Kls 9</th>
                  <th className="px-4 py-3 rounded-r-xl text-gray-800">Total PD</th>
                </tr>
              </thead>
              <tbody>
                {currentRows.map((row, idx) => (
                  <tr key={idx} className="bg-white shadow-sm hover:shadow-md hover:scale-[1.01] transition-all group">
                    <td className="px-4 py-3 text-center font-bold text-gray-400 text-xs rounded-l-2xl border-y border-l border-gray-100">{startIndex + idx + 1}</td>
                    <td className="px-4 py-3 font-mono text-gray-500 text-sm text-left border-y border-gray-100">{row.npsn}</td>
                    <td className="px-4 py-3 font-black text-gray-800 text-sm uppercase text-left border-y border-gray-100">{row.nama_sekolah}</td>
                    
                    <td className="px-3 py-3 font-bold text-gray-600 text-xs text-left border-y border-gray-100 uppercase">{row.kecamatan}</td>
                    <td className="px-3 py-3 font-bold text-orange-600 text-xs border-y border-gray-100 uppercase">{row.status}</td>
                    
                    <td className="px-4 py-3 font-bold text-indigo-500 text-sm border-y border-gray-100 bg-indigo-50/20">{row.smp_7.toLocaleString()}</td>
                    <td className="px-4 py-3 font-bold text-violet-500 text-sm border-y border-gray-100 bg-violet-50/20">{row.smp_8.toLocaleString()}</td>
                    <td className="px-4 py-3 font-bold text-fuchsia-500 text-sm border-y border-gray-100 bg-fuchsia-50/20">{row.smp_9.toLocaleString()}</td>
                    
                    <td className="px-4 py-3 font-black text-gray-800 text-lg border-y border-r border-gray-100 bg-gray-50/50 rounded-r-2xl">
                      {row.total.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              
              {dataSekolah.length > 0 && (
                <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                  <tr className="bg-indigo-100 text-center font-black uppercase text-xs border-t-2 border-indigo-200">
                    <td colSpan="5" className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-indigo-200 text-indigo-900">
                      TOTAL DARI {dataSekolah.length} SEKOLAH
                    </td>
                    <td className="px-4 py-4 text-indigo-600 border-y border-indigo-200 text-base">{totalsSekolah.smp_7.toLocaleString()}</td>
                    <td className="px-4 py-4 text-violet-600 border-y border-indigo-200 text-base">{totalsSekolah.smp_8.toLocaleString()}</td>
                    <td className="px-4 py-4 text-fuchsia-600 border-y border-indigo-200 text-base">{totalsSekolah.smp_9.toLocaleString()}</td>
                    <td className="px-4 py-4 text-indigo-950 text-lg border-y border-r border-indigo-200 rounded-r-2xl bg-indigo-200/50">
                      {totalsSekolah.total.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
          
          {activeData.length === 0 && (
             <div className="py-20 flex flex-col items-center opacity-30 text-gray-500">
               <Search size={64} className="mb-4" />
               <p className="font-black uppercase tracking-widest text-xl">Tidak Ada Data SMP</p>
             </div>
          )}
        </div>

        {/* FOOTER & PAGINATION */}
        <div className="bg-white p-4 border-t border-gray-200 flex items-center justify-between shrink-0 rounded-b-3xl">
          <div className="flex flex-col">
            <p className="text-xs font-bold text-gray-500">
              Menampilkan <span className="text-gray-800">{activeData.length === 0 ? 0 : startIndex + 1}</span> - <span className="text-gray-800">{Math.min(startIndex + rowsPerPage, activeData.length)}</span> dari <span className="text-indigo-700 font-black">{activeData.length}</span> baris
            </p>
            {displayLastUpdated && (
              <p className="text-[10px] font-bold italic text-gray-400 mt-1">
                Sumber : Data Dapodik Siswa Update Pada {displayLastUpdated}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <button disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)} className="p-2 rounded-xl bg-gray-50 border border-gray-200 hover:bg-indigo-50 disabled:opacity-50 transition-colors"><ChevronLeft size={16} /></button>
            <span className="text-xs font-black text-gray-600 px-2">Hal {currentPage} / {totalPages}</span>
            <button disabled={currentPage === totalPages || totalPages === 0} onClick={() => goToPage(currentPage + 1)} className="p-2 rounded-xl bg-gray-50 border border-gray-200 hover:bg-indigo-50 disabled:opacity-50 transition-colors"><ChevronRight size={16} /></button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}