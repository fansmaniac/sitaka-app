import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Download, Clock, MapPin, Search, X, ChevronLeft, ChevronRight, Building2 
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

// Hitung Umur Real-time
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

const JENJANG_GROUPS = {
  'SEMUA': [],
  'PAUD': ['TK', 'KB', 'PAUD'],
  'SD': ['SD', 'SPK SD'],
  'SMP': ['SMP', 'SPK SMP'],
  'SMA/SMK': ['SMA', 'SPK SMA', 'SMK'],
  'SLB (Inklusif)': ['SLB'],
  'NON FORMAL': ['PKBM', 'SKB', 'SPS', 'TPA']
};

// =====================================================================
// MAIN COMPONENT
// =====================================================================
export default function RincianUsiaGuru({ 
  isOpen, 
  onClose, 
  data = [], 
  initialWilayah = 'SEMUA', 
  activeJenjang = 'SEMUA',
  displayLastUpdated 
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterWilayah, setFilterWilayah] = useState(initialWilayah);
  const [filterStatus, setFilterStatus] = useState('SEMUA'); 
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  // Sinkronisasi saat modal dibuka
  useEffect(() => {
    if (isOpen) setFilterWilayah(initialWilayah);
  }, [isOpen, initialWilayah]);

  // Reset pagination saat filter berubah
  useEffect(() => { 
    setCurrentPage(1); 
  }, [searchTerm, filterWilayah, activeJenjang, filterStatus]);

  // Handle ESC key
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const listKabupaten = useMemo(() => {
    const unik = [...new Set(data.map(item => cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'))))];
    return unik.filter(k => k !== 'TIDAK DIKETAHUI').sort((a, b) => getKabupatenRank(a) - getKabupatenRank(b));
  }, [data]);

  const isModeSemua = filterWilayah === 'SEMUA';

  // Proses Agregasi Data Usia
  const processedData = useMemo(() => {
    if (!data) return [];
    const validJenjangList = JENJANG_GROUPS[activeJenjang];

    const validData = data.filter(item => {
      const kabDb = cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'));
      if (!isModeSemua && kabDb !== filterWilayah) return false;

      if (activeJenjang !== 'SEMUA') {
        const jenjangDb = String(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang') || '').trim().toUpperCase();
        if (!validJenjangList.includes(jenjangDb)) return false;
      }

      if (filterStatus !== 'SEMUA') {
        const statusDb = String(getVal(item, 'status_sekolah') || '').trim().toUpperCase();
        if (statusDb !== filterStatus) return false;
      }

      return true;
    });

    const mapAgg = new Map();

    validData.forEach(item => {
      let keyId = isModeSemua 
          ? cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota')) 
          : String(getVal(item, 'kecamatan') || 'TIDAK DIKETAHUI').trim().toUpperCase();

      if (!mapAgg.has(keyId)) {
        mapAgg.set(keyId, { 
          namaWilayah: keyId, 
          usia_30: 0, usia_40: 0, usia_50: 0, usia_51: 0, 
          total: 0 
        });
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
  }, [data, isModeSemua, filterWilayah, searchTerm, activeJenjang, filterStatus]);

  const columnTotals = useMemo(() => {
    return processedData.reduce((acc, curr) => {
      acc.usia_30 += curr.usia_30;
      acc.usia_40 += curr.usia_40;
      acc.usia_50 += curr.usia_50;
      acc.usia_51 += curr.usia_51;
      acc.total += curr.total;
      return acc;
    }, { usia_30: 0, usia_40: 0, usia_50: 0, usia_51: 0, total: 0 });
  }, [processedData]);

  // Export Excel
  const downloadExcelRincian = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheetName = isModeSemua ? 'Rekap Provinsi' : `Rekap ${filterWilayah}`;
    const worksheet = workbook.addWorksheet(sheetName);

    worksheet.columns = [
      { header: isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan', key: 'namaWilayah', width: 30 },
      { header: '<= 30 Tahun', key: 'usia_30', width: 15 },
      { header: '31 - 40 Tahun', key: 'usia_40', width: 15 },
      { header: '41 - 50 Tahun', key: 'usia_50', width: 15 },
      { header: '>= 51 Tahun', key: 'usia_51', width: 15 },
      { header: 'Total Guru', key: 'total', width: 18 },
    ];

    processedData.forEach(item => worksheet.addRow(item));

    const totalRow = worksheet.addRow({
      namaWilayah: 'TOTAL KESELURUHAN',
      usia_30: columnTotals.usia_30,
      usia_40: columnTotals.usia_40,
      usia_50: columnTotals.usia_50,
      usia_51: columnTotals.usia_51,
      total: columnTotals.total
    });

    // Styling Header
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBE123C' } }; // Rose 700
    
    // Styling Baris Total
    totalRow.font = { bold: true, color: { argb: 'FF881337' } }; // Rose 900
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4E6' } }; // Rose 100

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Rincian_Usia_Guru_${isModeSemua ? 'Provinsi' : filterWilayah}_${activeJenjang.replace('/','-')}_${filterStatus}.xlsx`;
    link.click();
  };

  const totalPages = Math.ceil(processedData.length / rowsPerPage) || 1;
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentRows = processedData.slice(startIndex, startIndex + rowsPerPage);
  
  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white w-full max-w-5xl h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
        
        {/* HEADER MODAL */}
        <div className="bg-rose-700 px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 text-white">
            <div className="bg-white/20 p-2 rounded-xl"><Clock size={24} /></div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tighter leading-none">
                Rincian Usia Guru
              </h2>
              <p className="text-rose-200 text-sm font-bold uppercase tracking-widest mt-1 flex gap-2">
                <span>{isModeSemua ? 'Provinsi Kalimantan Barat' : `Kecamatan di Kab. ${filterWilayah}`}</span>
                <span className="opacity-50">|</span>
                <span className="text-amber-200">Jenjang: {activeJenjang}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={downloadExcelRincian} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl font-black text-xs uppercase shadow-md transition-all active:scale-95 border border-emerald-400">
              <Download size={14} /> Unduh
            </button>
            <button onClick={onClose} className="p-2 bg-rose-800 hover:bg-red-500 text-white rounded-xl transition-colors">
              <X size={24} />
            </button>
          </div>
        </div>

        {/* FILTER BAR */}
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex flex-wrap gap-4 items-center shrink-0">
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder={`Cari Nama ${isModeSemua ? 'Kabupaten' : 'Kecamatan'}...`} 
              value={searchTerm} 
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-200 font-bold text-gray-700"
            />
          </div>
          <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
            <MapPin size={16} className="text-gray-400 mr-2" />
            <select 
              value={filterWilayah} 
              onChange={(e) => setFilterWilayah(e.target.value)} 
              className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer max-w-[200px]"
            >
              <option value="SEMUA">SELURUH PROVINSI</option>
              {listKabupaten.map(k => <option key={k} value={k}>{k}</option>)}
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
        <div className="flex-1 overflow-auto bg-white p-4">
          <table className="w-full text-center border-separate border-spacing-y-2">
            <thead className="sticky top-0 bg-white z-10 shadow-sm rounded-xl">
              <tr className="text-[10px] font-black uppercase text-gray-500">
                <th className="px-4 py-3 text-center rounded-l-xl w-16">No</th>
                <th className="px-4 py-3 text-left">{isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan'}</th>
                <th className="px-3 py-3 text-emerald-600">&lt;= 30 Tahun</th>
                <th className="px-3 py-3 text-blue-600">31-40 Tahun</th>
                <th className="px-3 py-3 text-amber-600">41-50 Tahun</th>
                <th className="px-3 py-3 text-red-600">&gt;= 51 Tahun</th>
                <th className="px-4 py-3 rounded-r-xl text-rose-800">Total Guru</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.map((row, idx) => (
                <tr key={idx} className="bg-white shadow-sm hover:shadow-md hover:scale-[1.01] transition-all group">
                  <td className="px-4 py-4 text-center font-bold text-gray-400 text-xs rounded-l-2xl border-y border-l border-gray-100">{startIndex + idx + 1}</td>
                  <td className="px-4 py-4 font-black text-gray-800 text-sm uppercase text-left border-y border-gray-100 whitespace-nowrap">{row.namaWilayah}</td>
                  
                  <td className="px-3 py-4 font-black text-emerald-600 text-base border-y border-gray-100 bg-emerald-50/30">
                    {row.usia_30.toLocaleString()}
                  </td>
                  <td className="px-3 py-4 font-black text-blue-600 text-base border-y border-gray-100 bg-blue-50/30">
                    {row.usia_40.toLocaleString()}
                  </td>
                  <td className="px-3 py-4 font-black text-amber-600 text-base border-y border-gray-100 bg-amber-50/30">
                    {row.usia_50.toLocaleString()}
                  </td>
                  <td className="px-3 py-4 font-black text-red-600 text-base border-y border-gray-100 bg-red-50/30">
                    {row.usia_51.toLocaleString()}
                  </td>
                  <td className="px-4 py-4 font-black text-rose-800 text-lg border-y border-r border-gray-100 bg-rose-50/50 rounded-r-2xl">
                    {row.total.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
            
            {/* TFOOT: BARIS TOTAL KESELURUHAN */}
            {processedData.length > 0 && (
              <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                <tr className="bg-rose-100 text-center font-black uppercase text-xs border-t-2 border-rose-200">
                  <td colSpan="2" className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-rose-200 text-rose-900">
                    TOTAL {isModeSemua ? 'KESELURUHAN' : 'KECAMATAN'}
                  </td>
                  <td className="px-3 py-4 text-emerald-800 text-base border-y border-rose-200">{columnTotals.usia_30.toLocaleString()}</td>
                  <td className="px-3 py-4 text-blue-800 text-base border-y border-rose-200">{columnTotals.usia_40.toLocaleString()}</td>
                  <td className="px-3 py-4 text-amber-800 text-base border-y border-rose-200">{columnTotals.usia_50.toLocaleString()}</td>
                  <td className="px-3 py-4 text-red-800 text-base border-y border-rose-200">{columnTotals.usia_51.toLocaleString()}</td>
                  <td className="px-4 py-4 text-rose-950 text-lg border-y border-r border-rose-200 rounded-r-2xl bg-rose-200/50">
                    {columnTotals.total.toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
          
          {processedData.length === 0 && (
             <div className="py-20 flex flex-col items-center opacity-30 text-gray-500">
               <Search size={64} className="mb-4" />
               <p className="font-black uppercase tracking-widest text-xl">Tidak Ada Data</p>
             </div>
          )}
        </div>

        {/* FOOTER & PAGINATION */}
        <div className="bg-gray-50 p-4 border-t border-gray-200 flex items-center justify-between shrink-0 rounded-b-3xl">
          <div className="flex flex-col">
            <p className="text-xs font-bold text-gray-500">
              Menampilkan <span className="text-gray-800">{processedData.length === 0 ? 0 : startIndex + 1}</span> - <span className="text-gray-800">{Math.min(startIndex + rowsPerPage, processedData.length)}</span> dari <span className="text-rose-700 font-black">{processedData.length}</span> baris
            </p>
            {displayLastUpdated && (
              <p className="text-[10px] font-bold italic text-gray-400 mt-1">
                Sumber : Data Dapodik PTK Update Pada {displayLastUpdated}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <button disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)} className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-rose-50 disabled:opacity-50 transition-colors"><ChevronLeft size={16} /></button>
            <span className="text-xs font-black text-gray-600 px-2">Hal {currentPage} / {totalPages}</span>
            <button disabled={currentPage === totalPages || totalPages === 0} onClick={() => goToPage(currentPage + 1)} className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-rose-50 disabled:opacity-50 transition-colors"><ChevronRight size={16} /></button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}