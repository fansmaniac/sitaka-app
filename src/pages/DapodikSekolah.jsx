import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Download, School, MapPin, Eye, FileSpreadsheet, 
  Search, X, ChevronLeft, ChevronRight, Filter, Building2
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
// PREMIUM PIE CHART COMPONENT (DENGAN POINTER & LABEL)
// =====================================================================
const PremiumPieChart = ({ segments, total }) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  if (total === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-gray-50 flex items-center justify-center border-4 border-dashed border-gray-200">
          <span className="text-gray-400 font-bold text-xs uppercase tracking-widest">Kosong</span>
        </div>
      </div>
    );
  }

  let cumulativePercent = 0;
  
  // Fungsi untuk mendapatkan koordinat X,Y pada keliling lingkaran
  const getCoordinatesForPercent = (percent, radius = 1) => {
    const x = Math.cos(2 * Math.PI * percent) * radius;
    const y = Math.sin(2 * Math.PI * percent) * radius;
    return [x, y];
  };

  // Persiapkan data drawing untuk setiap segmen
  const chartData = segments.map((s, i) => {
    if (s.value === 0) return null;
    
    const percentage = s.value / total;
    const startPercent = cumulativePercent;
    const endPercent = cumulativePercent + percentage;
    const midPercent = startPercent + (percentage / 2); 
    
    cumulativePercent = endPercent;

    // Koordinat untuk irisan pie (radius 1)
    const [startX, startY] = getCoordinatesForPercent(startPercent);
    const [endX, endY] = getCoordinatesForPercent(endPercent);
    const largeArcFlag = percentage > 0.5 ? 1 : 0;
    
    // Path Pie
    let pathData;
    if (percentage === 1) {
      pathData = `M 1 0 A 1 1 0 1 1 -1 0 A 1 1 0 1 1 1 0`;
    } else {
      pathData = `M 0 0 L ${startX} ${startY} A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY} Z`;
    }

    // --- LOGIKA POINTER & LABEL ---
    const [lineStartX, lineStartY] = getCoordinatesForPercent(midPercent, 1);
    const [lineMidX, lineMidY] = getCoordinatesForPercent(midPercent, 1.2);
    const isRightSide = lineMidX > 0;
    const lineEndX = isRightSide ? lineMidX + 0.2 : lineMidX - 0.2;
    const lineEndY = lineMidY;

    // Posisi Text
    const textX = isRightSide ? lineEndX + 0.05 : lineEndX - 0.05;
    const textAnchor = isRightSide ? "start" : "end";
    
    // Transformasi untuk efek pop-out saat hover
    const isHovered = hoveredIndex === i;
    const popOutOffset = 0.05;
    const [popX, popY] = getCoordinatesForPercent(midPercent, popOutOffset);
    const transform = isHovered && percentage < 1 ? `translate(${popX}, ${popY}) scale(1.05)` : 'scale(1)';

    return {
      ...s,
      index: i,
      pathData,
      percentage: (percentage * 100).toFixed(1),
      lineStartX, lineStartY,
      lineMidX, lineMidY,
      lineEndX, lineEndY,
      textX, textAnchor,
      transform,
      isRightSide
    };
  }).filter(Boolean);

  return (
    // Memperbaiki padding dan tinggi viewBox agar elemen saling merapat
    <div className="w-full max-w-[280px] md:max-w-[320px] aspect-square relative flex items-center justify-center mx-auto drop-shadow-xl hover:scale-105 transition-transform duration-300">
      <svg viewBox="-1.8 -1.5 3.6 3" className="w-full h-full max-h-[300px] overflow-visible drop-shadow-xl">
        
        {/* ROTASI GRUP UTAMA AGAR MULAI DARI ATAS (JAM 12) */}
        <g transform="rotate(-90)">
          {/* RENDER IRISAN PIE */}
          {chartData.map((data) => (
            <path 
              key={`slice-${data.index}`} 
              d={data.pathData} 
              fill={data.color}
              transform={data.transform}
              onMouseEnter={() => setHoveredIndex(data.index)}
              onMouseLeave={() => setHoveredIndex(null)}
              className="cursor-pointer transition-all duration-300 stroke-white stroke-[0.015]"
              style={{ transformOrigin: '0px 0px' }}
            />
          ))}
          
          {/* RENDER POINTERS & LABELS (Dirotasi balik text-nya) */}
          {chartData.map((data) => (
            <g 
              key={`label-${data.index}`}
              className={`transition-opacity duration-300 ${hoveredIndex !== null && hoveredIndex !== data.index ? 'opacity-30' : 'opacity-100'}`}
            >
              {/* Garis Pointer Polyline */}
              <polyline 
                points={`${data.lineStartX},${data.lineStartY} ${data.lineMidX},${data.lineMidY} ${data.lineEndX},${data.lineEndY}`}
                fill="none"
                stroke={data.color}
                strokeWidth="0.015"
                strokeLinejoin="round"
              />
              
              <circle cx={data.lineStartX} cy={data.lineStartY} r="0.04" fill={data.color} />
              <circle cx={data.lineEndX} cy={data.lineEndY} r="0.03" fill={data.color} />

              <g transform={`rotate(90 ${data.textX} ${data.lineEndY})`}>
                <text 
                  x={data.textX} 
                  y={data.lineEndY - 0.04}
                  textAnchor={data.textAnchor}
                  fill={data.color}
                  className="font-black text-[0.14px] uppercase"
                >
                  {data.percentage}%
                </text>
                <text 
                  x={data.textX} 
                  y={data.lineEndY + 0.12} 
                  textAnchor={data.textAnchor}
                  fill="#4B5563" 
                  className="font-bold text-[0.1px] tracking-widest"
                >
                  {data.name} ({data.value.toLocaleString()})
                </text>
              </g>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
};


// =====================================================================
// MODAL RINCIAN SEKOLAH
// =====================================================================
const DapodikSekolahModal = ({ isOpen, onClose, data, jenjang, initialWilayah }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterWilayah, setFilterWilayah] = useState(initialWilayah);
  const [filterStatus, setFilterStatus] = useState('SEMUA');
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  useEffect(() => {
    if (isOpen) setFilterWilayah(initialWilayah);
  }, [isOpen, initialWilayah]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterWilayah, filterStatus]);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const listKabupaten = useMemo(() => {
    const unik = [...new Set(data.map(item => String(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota') || '').trim().toUpperCase()))];
    return unik.filter(k => k !== '').sort((a, b) => getKabupatenRank(a) - getKabupatenRank(b));
  }, [data]);

  const processedData = useMemo(() => {
    if (!data) return [];

    let result = data.filter(sekolah => {
      // 1. Filter Jenjang
      const jenjangDb = String(getVal(sekolah, 'bentuk_pendidikan') || getVal(sekolah, 'jenjang') || '').trim().toUpperCase();
      if (jenjang !== 'SEMUA' && jenjangDb !== jenjang) return false;

      // 2. Filter Wilayah
      const kabDb = String(getVal(sekolah, 'kabupaten') || getVal(sekolah, 'Kabupaten/Kota') || '').trim().toUpperCase();
      if (filterWilayah !== 'SEMUA' && kabDb !== filterWilayah) return false;

      // 3. Filter Status Sekolah
      const statusDb = String(getVal(sekolah, 'status_sekolah') || '').trim().toUpperCase();
      if (filterStatus !== 'SEMUA' && statusDb !== filterStatus) return false;

      // 4. Search NPSN / Nama
      if (searchTerm) {
        const nama = String(getVal(sekolah, 'nama_satuan_pendidikan') || getVal(sekolah, 'nama_sekolah') || '').toLowerCase();
        const npsn = String(getVal(sekolah, 'npsn') || '').toLowerCase();
        if (!nama.includes(searchTerm.toLowerCase()) && !npsn.includes(searchTerm.toLowerCase())) return false;
      }
      return true;
    });

    result.sort((a, b) => {
      const namaA = String(getVal(a, 'nama_satuan_pendidikan') || getVal(a, 'nama_sekolah') || '').toUpperCase();
      const namaB = String(getVal(b, 'nama_satuan_pendidikan') || getVal(b, 'nama_sekolah') || '').toUpperCase();
      return namaA.localeCompare(namaB);
    });

    return result;
  }, [data, jenjang, filterWilayah, filterStatus, searchTerm]);

  // FUNGSI UNDUH EXCEL RINCIAN
  const downloadExcelRincian = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Rincian ${jenjang === 'SEMUA' ? 'Semua Jenjang' : jenjang}`);

    worksheet.columns = [
      { header: 'NPSN', key: 'npsn', width: 15 },
      { header: 'Nama Sekolah', key: 'nama', width: 40 },
      { header: 'Jenjang', key: 'jenjang', width: 15 }, // Tambah Kolom Jenjang
      { header: 'Wilayah', key: 'wilayah', width: 25 },
      { header: 'Kecamatan', key: 'kecamatan', width: 25 },
      { header: 'Status', key: 'status', width: 15 },
    ];

    processedData.forEach(item => {
      worksheet.addRow({
        npsn: getVal(item, 'npsn'),
        nama: getVal(item, 'nama_satuan_pendidikan') || getVal(item, 'nama_sekolah'),
        jenjang: getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang'),
        wilayah: getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'),
        kecamatan: getVal(item, 'kecamatan'),
        status: getVal(item, 'status_sekolah'),
      });
    });

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Rincian_Sekolah_${jenjang === 'SEMUA' ? 'Keseluruhan' : jenjang}_${filterWilayah}.xlsx`;
    link.click();
  };

  const totalPages = Math.ceil(processedData.length / rowsPerPage) || 1;
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentRows = processedData.slice(startIndex, startIndex + rowsPerPage);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white w-full max-w-6xl h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
        
        <div className="bg-blue-700 px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 text-white">
            <div className="bg-white/20 p-2 rounded-xl"><School size={24} /></div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tighter leading-none">Rincian Sekolah {jenjang === 'SEMUA' ? 'Keseluruhan' : jenjang}</h2>
              <p className="text-blue-200 text-sm font-bold uppercase tracking-widest mt-1">Data Spesifik</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={downloadExcelRincian} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl font-black text-xs uppercase shadow-md transition-all active:scale-95">
              <Download size={14} /> Unduh
            </button>
            <button onClick={onClose} className="p-2 bg-white/10 hover:bg-red-500 text-white rounded-xl transition-colors">
              <X size={24} />
            </button>
          </div>
        </div>

        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex flex-wrap gap-4 items-center shrink-0">
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" placeholder="Cari NPSN / Nama Sekolah..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 font-bold text-gray-700"
            />
          </div>
          <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
            <MapPin size={16} className="text-gray-400 mr-2" />
            <select value={filterWilayah} onChange={(e) => setFilterWilayah(e.target.value)} className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer">
              <option value="SEMUA">Semua Wilayah</option>
              {listKabupaten.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
          <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
            <Building2 size={16} className="text-gray-400 mr-2" />
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer">
              <option value="SEMUA">Semua Status</option>
              <option value="NEGERI">Negeri</option>
              <option value="SWASTA">Swasta</option>
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-white p-4">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-white z-10 shadow-sm">
              <tr className="text-xs font-black uppercase text-gray-400 bg-gray-50 border-b-2 border-gray-200">
                <th className="px-4 py-3 text-center rounded-tl-xl w-16">No</th>
                <th className="px-4 py-3">Nama Satuan Pendidikan</th>
                <th className="px-4 py-3 text-center">Jenjang</th>
                <th className="px-4 py-3 text-center">NPSN</th>
                <th className="px-4 py-3 text-center">Wilayah</th>
                <th className="px-4 py-3 rounded-tr-xl text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.map((row, idx) => {
                const statusSekolah = String(getVal(row, 'status_sekolah') || '-').toUpperCase();
                const statusColor = statusSekolah === 'NEGERI' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800';
                const jenjangDb = String(getVal(row, 'bentuk_pendidikan') || getVal(row, 'jenjang') || '-').toUpperCase();

                return (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors">
                    <td className="px-4 py-4 text-center font-bold text-gray-400 text-xs">{startIndex + idx + 1}</td>
                    <td className="px-4 py-4 font-black text-gray-800 text-sm uppercase">
                      {getVal(row, 'nama_satuan_pendidikan') || getVal(row, 'nama_sekolah') || '-'}
                      <div className="text-[10px] text-gray-500 mt-1 font-bold">Kec. {getVal(row, 'kecamatan') || '-'}</div>
                    </td>
                    <td className="px-4 py-4 text-center font-black text-sky-700 text-xs uppercase">{jenjangDb}</td>
                    <td className="px-4 py-4 text-center font-black text-gray-600 text-xs tracking-widest">{getVal(row, 'npsn') || '-'}</td>
                    <td className="px-4 py-4 text-center font-bold text-gray-600 text-xs uppercase">{getVal(row, 'kabupaten') || getVal(row, 'Kabupaten/Kota') || '-'}</td>
                    <td className="px-4 py-4 text-center">
                      <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black tracking-widest uppercase ${statusColor}`}>
                        {statusSekolah}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="bg-gray-50 p-4 border-t border-gray-200 flex items-center justify-between shrink-0 rounded-b-3xl">
          <p className="text-xs font-bold text-gray-500">
            Menampilkan <span className="text-gray-800">{processedData.length === 0 ? 0 : startIndex + 1}</span> - <span className="text-gray-800">{Math.min(startIndex + rowsPerPage, processedData.length)}</span> dari <span className="text-blue-700 font-black">{processedData.length}</span> data
          </p>
          <div className="flex items-center gap-2">
            <button disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)} className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-blue-50 disabled:opacity-50"><ChevronLeft size={16} /></button>
            <span className="text-xs font-black text-gray-600 px-2">Hal {currentPage} / {totalPages}</span>
            <button disabled={currentPage === totalPages || totalPages === 0} onClick={() => goToPage(currentPage + 1)} className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-blue-50 disabled:opacity-50"><ChevronRight size={16} /></button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
};


// =====================================================================
// MAIN COMPONENT: DAPODIK SEKOLAH
// =====================================================================
export default function DapodikSekolah({ data = [], selectedYear = '2026' }) {
  const [activeTab, setActiveTab] = useState('SEMUA'); // DEFAULT TAB SEMUA JENJANG
  
  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedWilayah, setSelectedWilayah] = useState('SEMUA');

  // 1. Ekstrak daftar unik Kabupaten dari seluruh data (untuk skeleton tabel)
  const listKabupaten = useMemo(() => {
    const unik = [...new Set(data.map(item => String(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota') || '').trim().toUpperCase()))];
    return unik.filter(k => k !== '').sort((a, b) => getKabupatenRank(a) - getKabupatenRank(b));
  }, [data]);

  // 2. Mesin Agregasi Utama berdasarkan Active Tab
  const aggregatedData = useMemo(() => {
    // Saring data berdasarkan jenjang yang aktif
    const filteredData = data.filter(item => {
      if (activeTab === 'SEMUA') return true;
      const jenjangDb = String(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang') || '').trim().toUpperCase();
      return jenjangDb === activeTab;
    });

    const mapAgg = new Map();
    // Inisiasi semua wilayah dengan 0 agar tabel konsisten
    listKabupaten.forEach(kab => {
      mapAgg.set(kab, { wilayah: kab, negeri: 0, swasta: 0, total: 0 });
    });

    filteredData.forEach(sekolah => {
       const kab = String(getVal(sekolah, 'kabupaten') || getVal(sekolah, 'Kabupaten/Kota') || 'TIDAK DIKETAHUI').trim().toUpperCase();
       
       if (!mapAgg.has(kab)) {
           mapAgg.set(kab, { wilayah: kab, negeri: 0, swasta: 0, total: 0 });
       }

       const row = mapAgg.get(kab);
       const status = String(getVal(sekolah, 'status_sekolah') || '').trim().toUpperCase();
       
       if (status === 'NEGERI') row.negeri++;
       else if (status === 'SWASTA') row.swasta++;
       else row.swasta++; 
       
       row.total++;
    });

    return Array.from(mapAgg.values()).sort((a, b) => getKabupatenRank(a.wilayah) - getKabupatenRank(b.wilayah));
  }, [data, activeTab, listKabupaten]);

  // 3. Hitung Grand Total & Data Chart
  const grandTotals = useMemo(() => {
    return aggregatedData.reduce((acc, curr) => {
      acc.negeri += curr.negeri;
      acc.swasta += curr.swasta;
      acc.total += curr.total;
      return acc;
    }, { negeri: 0, swasta: 0, total: 0 });
  }, [aggregatedData]);

  // Data Pie Chart
  const pieSegments = [
    { name: 'Negeri', value: grandTotals.negeri, color: '#2563eb' }, // Blue 600
    { name: 'Swasta', value: grandTotals.swasta, color: '#f97316' }  // Orange 500
  ];

  // Hitung persentase untuk ditambahkan ke Legend
  const percentNegeri = grandTotals.total > 0 ? ((grandTotals.negeri / grandTotals.total) * 100).toFixed(1) : 0;
  const percentSwasta = grandTotals.total > 0 ? ((grandTotals.swasta / grandTotals.total) * 100).toFixed(1) : 0;

  // 4. Unduh Excel Tabel
  const downloadExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheetTitle = activeTab === 'SEMUA' ? 'Semua Jenjang' : activeTab;
    const worksheet = workbook.addWorksheet(`Rekap ${worksheetTitle}`);

    worksheet.columns = [
      { header: 'Wilayah (Kabupaten/Kota)', key: 'wilayah', width: 30 },
      { header: 'Negeri', key: 'negeri', width: 15 },
      { header: 'Swasta', key: 'swasta', width: 15 },
      { header: 'Jumlah Unit', key: 'total', width: 15 },
    ];

    aggregatedData.forEach(item => worksheet.addRow(item));

    const totalRow = worksheet.addRow({
      wilayah: 'TOTAL KESELURUHAN',
      negeri: grandTotals.negeri,
      swasta: grandTotals.swasta,
      total: grandTotals.total
    });

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    totalRow.font = { bold: true, color: { argb: 'FF1E3A8A' } };
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Rekap_Sekolah_${activeTab === 'SEMUA' ? 'Keseluruhan' : activeTab}_${selectedYear}.xlsx`;
    link.click();
  };

  const handleBukaRincian = (wilayah) => {
    setSelectedWilayah(wilayah);
    setModalOpen(true);
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500">
      
      {/* 1. TABS HEADER */}
      <div className="bg-white px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0 shadow-sm z-20 overflow-x-auto">
        <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-2xl min-w-max">
          {['SEMUA', 'TK', 'SD', 'SMP', 'SMA'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-6 md:px-8 py-2.5 rounded-xl font-black text-xs md:text-sm transition-all duration-300 ${activeTab === tab ? 'bg-blue-600 text-white shadow-md scale-105' : 'text-gray-500 hover:bg-gray-200'}`}
            >
              {tab === 'SEMUA' ? 'SEMUA JENJANG' : `JENJANG ${tab}`}
            </button>
          ))}
        </div>
        
        <button 
          onClick={downloadExcel}
          className="flex items-center gap-2 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white px-5 py-2.5 rounded-xl font-black uppercase text-xs shadow-sm border border-blue-200 transition-all active:scale-95 shrink-0 ml-4"
        >
          <FileSpreadsheet size={16} /> Unduh Rekap
        </button>
      </div>

      {/* 2. DUA KOLOM LAYOUT */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 bg-gray-50/50">
        
        {/* KOLOM KIRI: TABEL REKAPITULASI */}
        <div className="flex-1 lg:w-2/3 p-4 md:p-6 flex flex-col min-h-0 overflow-hidden border-r border-gray-200">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-center border-separate border-spacing-y-2">
                <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm rounded-xl">
                  <tr className="text-[10px] font-black uppercase text-gray-500">
                    <th className="px-4 py-3 text-left rounded-l-xl">Wilayah</th>
                    <th className="px-4 py-3 text-blue-600">Negeri</th>
                    <th className="px-4 py-3 text-orange-600">Swasta</th>
                    <th className="px-4 py-3 text-gray-800">Jumlah Unit</th>
                    <th className="px-4 py-3 rounded-r-xl">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregatedData.map((row, idx) => (
                    <tr key={idx} className="bg-white shadow-sm hover:shadow-md hover:scale-[1.01] transition-all group">
                      <td className="px-4 py-3 rounded-l-2xl font-black text-gray-800 uppercase text-left border-y border-l border-gray-100 whitespace-nowrap">
                        {row.wilayah}
                      </td>
                      <td className="px-4 py-3 font-black text-blue-600 text-base border-y border-gray-100 bg-blue-50/30">{row.negeri.toLocaleString()}</td>
                      <td className="px-4 py-3 font-black text-orange-600 text-base border-y border-gray-100 bg-orange-50/30">{row.swasta.toLocaleString()}</td>
                      <td className="px-4 py-3 font-black text-gray-800 text-lg border-y border-gray-100 bg-gray-50/50">{row.total.toLocaleString()}</td>
                      <td className="px-4 py-3 rounded-r-2xl border-y border-r border-gray-100">
                         <button 
                            onClick={() => handleBukaRincian(row.wilayah)}
                            className="flex items-center justify-center gap-2 bg-blue-50 text-blue-600 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase hover:bg-blue-600 hover:text-white transition-colors mx-auto"
                         >
                           <Eye size={14} /> Rincian
                         </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                  <tr className="bg-blue-50 text-center font-black uppercase text-sm border-t-2 border-blue-200">
                    <td className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-blue-200 text-blue-900">
                      TOTAL KALIMANTAN BARAT
                    </td>
                    <td className="px-4 py-4 text-blue-700 border-y border-blue-200">{grandTotals.negeri.toLocaleString()}</td>
                    <td className="px-4 py-4 text-orange-700 border-y border-blue-200">{grandTotals.swasta.toLocaleString()}</td>
                    <td className="px-4 py-4 text-gray-900 border-y border-blue-200 text-lg bg-blue-100/50">{grandTotals.total.toLocaleString()}</td>
                    <td className="px-4 py-4 rounded-r-2xl border-y border-r border-blue-200">
                       <button 
                            onClick={() => handleBukaRincian('SEMUA')}
                            className="flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-blue-800 transition-colors mx-auto shadow-md"
                         >
                           <Search size={14} /> Rincian Semua
                         </button>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        {/* KOLOM KANAN: PREMIUM PIE CHART */}
        <div className="lg:w-1/3 flex flex-col bg-white border-l border-gray-100 relative">
          
          {/* HEADER CHART */}
          <div className="text-center w-full px-4 pt-8 pb-4 shrink-0">
            <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter">Proporsi Status Sekolah</h2>
            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest mt-1">
              {activeTab === 'SEMUA' ? 'Semua Jenjang' : `Jenjang ${activeTab}`}
            </p>
          </div>

          {/* AREA CHART (Tengah) */}
          <div className="flex-1 flex items-center justify-center min-h-0 relative">
             <PremiumPieChart segments={pieSegments} total={grandTotals.total} />
          </div>

          {/* LEGEND (Bawah) */}
          <div className="px-6 pb-8 pt-4 w-full flex flex-col gap-3 shrink-0">
             <div className="flex items-center justify-between bg-blue-50 p-4 rounded-2xl border border-blue-100 transition-colors hover:bg-blue-100">
                <div className="flex items-center gap-3">
                   <div className="w-4 h-4 rounded-full bg-blue-600 shadow-inner"></div>
                   <div className="flex flex-col">
                     <span className="font-black text-sm text-blue-900 uppercase">Sekolah Negeri</span>
                   </div>
                </div>
                <div className="text-right">
                   <span className="font-black text-xl text-blue-700">{grandTotals.negeri.toLocaleString()}</span>
                   <span className="ml-2 font-bold text-sm text-blue-500">({percentNegeri}%)</span>
                </div>
             </div>
             
             <div className="flex items-center justify-between bg-orange-50 p-4 rounded-2xl border border-orange-100 transition-colors hover:bg-orange-100">
                <div className="flex items-center gap-3">
                   <div className="w-4 h-4 rounded-full bg-orange-500 shadow-inner"></div>
                   <div className="flex flex-col">
                     <span className="font-black text-sm text-orange-900 uppercase">Sekolah Swasta</span>
                   </div>
                </div>
                <div className="text-right">
                   <span className="font-black text-xl text-orange-600">{grandTotals.swasta.toLocaleString()}</span>
                   <span className="ml-2 font-bold text-sm text-orange-400">({percentSwasta}%)</span>
                </div>
             </div>
          </div>

        </div>

      </div>

      {/* 3. MODAL COMPONENT */}
      <DapodikSekolahModal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)}
        data={data}
        jenjang={activeTab}
        initialWilayah={selectedWilayah}
      />

    </div>
  );
}