import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Download, Users, MapPin, Eye, FileSpreadsheet, 
  Search, X, ChevronLeft, ChevronRight, GraduationCap, Building2, Filter
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
  const idx = KABUPATEN_LIST.indexOf(kabName);
  return idx !== -1 ? idx : 99;
};

// =====================================================================
// KATEGORI & LOGIKA DATA
// =====================================================================

// PENGELOMPOKAN JENJANG BARU
const JENJANG_GROUPS = {
  'SEMUA': [],
  'PAUD': ['TK', 'KB', 'SPS', 'TPA', 'PAUD'],
  'SD': ['SD', 'SPK SD'],
  'SMP': ['SMP', 'SPK SMP'],
  'SMA/SMK': ['SMA', 'SPK SMA', 'SMK'],
  'SLB (Inklusif)': ['SLB'],
  'Non Formal': ['PKBM', 'SKB']
};

const JENJANG_KEYS = ['PAUD', 'SD', 'SMP', 'SMA/SMK', 'SLB (Inklusif)', 'Non Formal'];

const identifyJenjangGroup = (jenjangDb) => {
  const j = String(jenjangDb).trim().toUpperCase();
  for (const group of JENJANG_KEYS) {
    if (JENJANG_GROUPS[group].includes(j)) return group;
  }
  return null;
};

const TAB_CONFIG = {
  GENDER: {
    title: 'Gender Guru',
    keys: ['Laki-Laki', 'Perempuan'],
    colors: ['#3b82f6', '#ec4899'],
  },
  KUALIFIKASI: {
    title: 'Kualifikasi Guru',
    keys: ['S3', 'S2', 'S1', 'SMA/Sederajat', 'Tidak Diketahui'],
    colors: ['#1e3a8a', '#2563eb', '#3b82f6', '#f59e0b', '#94a3b8'],
  },
  PEGAWAI: {
    title: 'Status Kepegawaian',
    keys: ['PNS', 'PPPK', 'GTY/PTY', 'Honor Daerah', 'Honor Sekolah', 'Lainnya'],
    colors: ['#9333ea', '#7e22ce', '#6b21a8', '#0d9488', '#ea580c', '#cbd5e1'],
  },
  SERTIFIKASI: {
    title: 'Sertifikasi Pendidik',
    keys: ['Sudah Sertifikasi', 'Belum Sertifikasi'],
    colors: ['#10b981', '#ef4444'],
  },
  USIA: {
    title: 'Rentang Usia (Tahun)',
    keys: ['<= 30', '31 - 40', '41 - 50', '>= 51', 'Tidak Diketahui'],
    colors: ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#cbd5e1'],
  },
  PENSIUN: {
    title: 'Proyeksi Pensiun',
    keys: ['Usia 56', 'Usia 57', 'Usia 58', 'Usia 59', 'Usia 60', '>= 61'],
    colors: ['#fde047', '#fbbf24', '#f59e0b', '#ea580c', '#dc2626', '#991b1b'],
  }
};

// =====================================================================
// PREMIUM PIE CHART COMPONENT
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
  const getCoordinatesForPercent = (percent, radius = 1) => {
    const x = Math.cos(2 * Math.PI * percent) * radius;
    const y = Math.sin(2 * Math.PI * percent) * radius;
    return [x, y];
  };

  const chartData = segments.map((s, i) => {
    if (s.value === 0) return null;
    const percentage = s.value / total;
    const startPercent = cumulativePercent;
    const endPercent = cumulativePercent + percentage;
    const midPercent = startPercent + (percentage / 2); 
    cumulativePercent = endPercent;

    const [startX, startY] = getCoordinatesForPercent(startPercent);
    const [endX, endY] = getCoordinatesForPercent(endPercent);
    const largeArcFlag = percentage > 0.5 ? 1 : 0;
    
    let pathData = percentage === 1 
      ? `M 1 0 A 1 1 0 1 1 -1 0 A 1 1 0 1 1 1 0` 
      : `M 0 0 L ${startX} ${startY} A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY} Z`;

    const [lineStartX, lineStartY] = getCoordinatesForPercent(midPercent, 1);
    const [lineMidX, lineMidY] = getCoordinatesForPercent(midPercent, 1.2);
    const isRightSide = lineMidX > 0;
    const lineEndX = isRightSide ? lineMidX + 0.2 : lineMidX - 0.2;
    const lineEndY = lineMidY;

    const textX = isRightSide ? lineEndX + 0.05 : lineEndX - 0.05;
    const textAnchor = isRightSide ? "start" : "end";
    
    const isHovered = hoveredIndex === i;
    const [popX, popY] = getCoordinatesForPercent(midPercent, 0.05);
    const transform = isHovered && percentage < 1 ? `translate(${popX}, ${popY}) scale(1.05)` : 'scale(1)';

    return {
      ...s, index: i, pathData, percentage: (percentage * 100).toFixed(1),
      lineStartX, lineStartY, lineMidX, lineMidY, lineEndX, lineEndY,
      textX, textAnchor, transform
    };
  }).filter(Boolean);

  return (
    <div className="w-full max-w-[280px] md:max-w-[320px] aspect-square relative flex items-center justify-center mx-auto drop-shadow-xl hover:scale-105 transition-transform duration-300">
      <svg viewBox="-1.8 -1.5 3.6 3" className="w-full h-full max-h-[300px] overflow-visible drop-shadow-xl">
        <g transform="rotate(-90)">
          {chartData.map((data) => (
            <path 
              key={`slice-${data.index}`} d={data.pathData} fill={data.color} transform={data.transform}
              onMouseEnter={() => setHoveredIndex(data.index)} onMouseLeave={() => setHoveredIndex(null)}
              className="cursor-pointer transition-all duration-300 stroke-white stroke-[0.015]" style={{ transformOrigin: '0px 0px' }}
            />
          ))}
          {chartData.map((data) => (
            <g key={`label-${data.index}`} className={`transition-opacity duration-300 ${hoveredIndex !== null && hoveredIndex !== data.index ? 'opacity-30' : 'opacity-100'}`}>
              <polyline points={`${data.lineStartX},${data.lineStartY} ${data.lineMidX},${data.lineMidY} ${data.lineEndX},${data.lineEndY}`} fill="none" stroke={data.color} strokeWidth="0.015" strokeLinejoin="round" />
              <circle cx={data.lineStartX} cy={data.lineStartY} r="0.04" fill={data.color} />
              <circle cx={data.lineEndX} cy={data.lineEndY} r="0.03" fill={data.color} />
              <g transform={`rotate(90 ${data.textX} ${data.lineEndY})`}>
                <text x={data.textX} y={data.lineEndY - 0.04} textAnchor={data.textAnchor} fill={data.color} className="font-black text-[0.14px] uppercase">{data.percentage}%</text>
                <text x={data.textX} y={data.lineEndY + 0.12} textAnchor={data.textAnchor} fill="#4B5563" className="font-bold text-[0.1px] tracking-widest">{data.name}</text>
              </g>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
};


// =====================================================================
// MODAL RINCIAN GURU (DINAMIS JENJANG / KECAMATAN)
// =====================================================================
const DapodikGuruModal = ({ isOpen, onClose, data, activeTabKey, activeJenjang, initialWilayah, tabConfig }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterWilayah, setFilterWilayah] = useState(initialWilayah);
  const [filterStatus, setFilterStatus] = useState('SEMUA');
  const [filterKategori, setFilterKategori] = useState('SEMUA');
  
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  useEffect(() => {
    if (isOpen) setFilterWilayah(initialWilayah);
  }, [isOpen, initialWilayah, activeTabKey, activeJenjang]);

  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterWilayah, filterStatus, filterKategori]);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const listKabupaten = useMemo(() => {
    const unik = [...new Set(data.map(item => String(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota') || '').trim().toUpperCase()))];
    return unik.filter(k => k !== '').sort((a, b) => getKabupatenRank(a) - getKabupatenRank(b));
  }, [data]);

  const isModeSemuaJenjang = activeJenjang === 'SEMUA';

  // FUNGSI UNTUK MENDAPATKAN KATEGORI DINAMIS GURU
  const getKategori = (ptk) => {
    let u = null;
    if (activeTabKey === 'USIA' || activeTabKey === 'PENSIUN') {
       const tgl = getVal(ptk, 'tanggal_lahir');
       if (tgl) {
          const m = String(tgl).match(/(19|20)\d{2}/);
          if (m) u = 2026 - parseInt(m[0], 10);
       }
       if (activeTabKey === 'PENSIUN' && (u === null || u < 56)) return null; 
    }

    if (activeTabKey === 'GENDER') {
       const jk = String(getVal(ptk, 'jk') || getVal(ptk, 'gender')).toUpperCase();
       if (jk === 'L' || jk === 'LAKI-LAKI') return 'Laki-Laki';
       if (jk === 'P' || jk === 'PEREMPUAN') return 'Perempuan';
       return null;
    } 
    else if (activeTabKey === 'KUALIFIKASI') {
       const q = String(getVal(ptk, 'pendidikan')).toUpperCase().trim();
       if (q === 'S3' || q === 'S.3') return 'S3';
       if (q === 'S2' || q === 'S.2') return 'S2';
       if (q === 'S1' || q === 'S.1' || q === 'D4' || q === 'D.IV') return 'S1';
       if (q.includes('SMA') || q.includes('SMK') || q.includes('D1') || q.includes('D2') || q.includes('D3')) return 'SMA/Sederajat';
       return 'Tidak Diketahui';
    }
    else if (activeTabKey === 'PEGAWAI') {
       const sp = String(getVal(ptk, 'status_kepegawaian')).toUpperCase();
       if (sp.includes('PNS')) return 'PNS';
       if (sp.includes('PPPK')) return 'PPPK';
       if (sp.includes('GTY') || sp.includes('PTY') || sp.includes('YAYASAN')) return 'GTY/PTY';
       if (sp.includes('SEKOLAH') || sp.includes('HONORER SEKOLAH')) return 'Honor Sekolah';
       if (sp.includes('DAERAH') || sp.includes('KAB') || sp.includes('PROV')) return 'Honor Daerah';
       return 'Lainnya';
    }
    else if (activeTabKey === 'SERTIFIKASI') {
       const cert = String(getVal(ptk, 'bidang_studi_sertifikasi')).trim();
       return (cert !== '' && cert !== '-' && cert.toLowerCase() !== 'null') ? 'Sudah Sertifikasi' : 'Belum Sertifikasi';
    }
    else if (activeTabKey === 'USIA') {
       if (u === null) return 'Tidak Diketahui';
       if (u <= 30) return '<= 30';
       if (u <= 40) return '31 - 40';
       if (u <= 50) return '41 - 50';
       return '>= 51';
    } 
    else if (activeTabKey === 'PENSIUN') {
       if (u === 56) return 'Usia 56';
       if (u === 57) return 'Usia 57';
       if (u === 58) return 'Usia 58';
       if (u === 59) return 'Usia 59';
       if (u === 60) return 'Usia 60';
       if (u >= 61) return '>= 61';
    }
    return null;
  };

  const processedData = useMemo(() => {
    if (!data) return [];
    const validJenjangList = JENJANG_GROUPS[activeJenjang];

    // 1. GATEKEEPER & FILTER AWAL
    const validData = data.filter(ptk => {
      const isGuru = String(getVal(ptk, 'jenis_ptk')).toUpperCase().includes('GURU');
      if (!isGuru) return false;
      const isInduk = String(getVal(ptk, 'status_tugas') || getVal(ptk, 'ptk_induk')).trim().toUpperCase() === 'INDUK' || String(getVal(ptk, 'status_tugas')).trim() === '1';
      if (!isInduk) return false;

      if (!isModeSemuaJenjang) {
        const jenjangDb = String(getVal(ptk, 'bentuk_pendidikan') || getVal(ptk, 'jenjang')).trim().toUpperCase();
        if (!validJenjangList.includes(jenjangDb)) return false;
      }

      const kabDb = cleanKabupatenName(getVal(ptk, 'kabupaten') || getVal(ptk, 'Kabupaten/Kota'));
      if (filterWilayah !== 'SEMUA' && kabDb !== filterWilayah) return false;

      const statusDb = String(getVal(ptk, 'status_sekolah') || '').trim().toUpperCase();
      if (filterStatus !== 'SEMUA' && statusDb !== filterStatus) return false;

      return true;
    });

    // 2. AGREGASI DATA
    const mapAgg = new Map();

    // Inisialisasi baris kosong jika mode Semua Jenjang
    if (isModeSemuaJenjang) {
      JENJANG_KEYS.forEach(j => {
        const initRow = { keyId: j, label: j, subLabel: filterWilayah === 'SEMUA' ? 'Semua Wilayah' : filterWilayah, total: 0 };
        tabConfig.keys.forEach(k => initRow[k] = 0);
        mapAgg.set(j, initRow);
      });
    }

    validData.forEach(ptk => {
       const valKategori = getKategori(ptk);
       if (!valKategori) return;

       if (filterKategori !== 'SEMUA' && valKategori !== filterKategori) return;

       let keyId, label, subLabel;

       if (isModeSemuaJenjang) {
         keyId = identifyJenjangGroup(getVal(ptk, 'bentuk_pendidikan') || getVal(ptk, 'jenjang'));
         if (!keyId) return; // Abaikan jika tidak masuk grup manapun
       } else {
         const kecRaw = String(getVal(ptk, 'kecamatan') || 'TIDAK DIKETAHUI').trim().toUpperCase();
         const kabClean = cleanKabupatenName(getVal(ptk, 'kabupaten') || getVal(ptk, 'Kabupaten/Kota'));
         keyId = `${kabClean}_${kecRaw}`;
         label = kecRaw;
         subLabel = kabClean;

         if (!mapAgg.has(keyId)) {
             const initRow = { keyId, label, subLabel, total: 0 };
             tabConfig.keys.forEach(k => initRow[k] = 0);
             mapAgg.set(keyId, initRow);
         }
       }

       const row = mapAgg.get(keyId);
       if (row[valKategori] !== undefined) {
           row[valKategori]++;
           row.total++;
       }
    });

    let resultArray = Array.from(mapAgg.values());

    if (searchTerm) {
       resultArray = resultArray.filter(r => r.label.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    if (isModeSemuaJenjang) {
      return resultArray.sort((a, b) => JENJANG_KEYS.indexOf(a.keyId) - JENJANG_KEYS.indexOf(b.keyId));
    } else {
      return resultArray.sort((a, b) => a.label.localeCompare(b.label));
    }

  }, [data, activeJenjang, filterWilayah, filterStatus, filterKategori, activeTabKey, searchTerm, tabConfig.keys, isModeSemuaJenjang]);

  // HITUNG TOTAL KESELURUHAN (GRAND TOTAL)
  const columnTotals = useMemo(() => {
    const totals = { total: 0 };
    tabConfig.keys.forEach(k => totals[k] = 0);

    processedData.forEach(row => {
      totals.total += row.total;
      tabConfig.keys.forEach(k => totals[k] += row[k]);
    });

    return totals;
  }, [processedData, tabConfig.keys]);

  const downloadExcelRincian = async () => {
    const workbook = new ExcelJS.Workbook();
    const sheetName = isModeSemuaJenjang ? 'Rekap Per Jenjang' : `Rekap ${filterWilayah}`;
    const worksheet = workbook.addWorksheet(sheetName);

    worksheet.columns = [
      { header: isModeSemuaJenjang ? 'Jenjang Pendidikan' : 'Kecamatan', key: 'label', width: 30 },
      { header: isModeSemuaJenjang ? 'Wilayah' : 'Kabupaten/Kota', key: 'subLabel', width: 25 },
      ...tabConfig.keys.map(k => ({ header: k, key: k, width: 18 })),
      { header: 'Total Guru', key: 'total', width: 15 },
    ];

    processedData.forEach(item => worksheet.addRow(item));

    const totalRowData = { label: 'TOTAL KESELURUHAN', total: columnTotals.total };
    tabConfig.keys.forEach(k => totalRowData[k] = columnTotals[k]);
    const totalRow = worksheet.addRow(totalRowData);

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    totalRow.font = { bold: true, color: { argb: 'FF1E3A8A' } };
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Rincian_Guru_${isModeSemuaJenjang ? 'Semua_Jenjang' : filterWilayah}_${activeTabKey}.xlsx`;
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
            <div className="bg-white/20 p-2 rounded-xl"><Users size={24} /></div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tighter leading-none">Rincian • {tabConfig.title}</h2>
              <p className="text-blue-200 text-sm font-bold uppercase tracking-widest mt-1">
                {isModeSemuaJenjang ? 'Rekapitulasi Per Jenjang' : `Kecamatan di Kab. ${filterWilayah}`}
              </p>
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

        {/* BARIS FILTER */}
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex flex-wrap gap-4 items-center shrink-0">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" placeholder={`Cari ${isModeSemuaJenjang ? 'Jenjang' : 'Kecamatan'}...`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 font-bold text-gray-700 text-sm"
            />
          </div>
          
          <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
            <MapPin size={16} className="text-gray-400 mr-2" />
            <select value={filterWilayah} onChange={(e) => setFilterWilayah(e.target.value)} className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer max-w-[150px]">
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

          <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
            <Filter size={16} className="text-gray-400 mr-2" />
            <select value={filterKategori} onChange={(e) => setFilterKategori(e.target.value)} className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer max-w-[150px]">
              <option value="SEMUA">Semua {tabConfig.title}</option>
              {tabConfig.keys.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-white p-4">
          <table className="w-full text-center border-separate border-spacing-y-2">
            <thead className="sticky top-0 bg-white z-10 shadow-sm rounded-xl">
              <tr className="text-[10px] font-black uppercase text-gray-500">
                <th className="px-4 py-3 text-center rounded-l-xl w-16">No</th>
                <th className="px-4 py-3 text-left">{isModeSemuaJenjang ? 'Jenjang Pendidikan' : 'Kecamatan'}</th>
                {tabConfig.keys.map(k => (
                  <th key={k} className="px-2 py-3 text-blue-700 whitespace-nowrap">{k}</th>
                ))}
                <th className="px-4 py-3 rounded-r-xl text-gray-800">Total Guru</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.map((row, idx) => (
                <tr key={idx} className="bg-white shadow-sm hover:shadow-md hover:scale-[1.01] transition-all group">
                  <td className="px-4 py-3 text-center font-bold text-gray-400 text-xs rounded-l-2xl border-y border-l border-gray-100">{startIndex + idx + 1}</td>
                  <td className="px-4 py-3 font-black text-gray-800 text-sm uppercase text-left border-y border-gray-100 whitespace-nowrap">
                    {row.label}
                    <div className="text-[10px] font-bold text-gray-400 mt-0.5">{row.subLabel}</div>
                  </td>
                  {tabConfig.keys.map(k => (
                    <td key={k} className="px-2 py-3 font-bold text-gray-600 text-sm border-y border-gray-100 bg-blue-50/10">
                      {row[k].toLocaleString()}
                    </td>
                  ))}
                  <td className="px-4 py-3 font-black text-blue-800 text-base border-y border-r border-gray-100 bg-blue-50/50 rounded-r-2xl">
                    {row.total.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* TFOOT: BARIS TOTAL KESELURUHAN */}
            {processedData.length > 0 && (
              <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                <tr className="bg-blue-100 text-center font-black uppercase text-xs border-t-2 border-blue-200">
                  <td colSpan="2" className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-blue-200 text-blue-900">
                    TOTAL KESELURUHAN
                  </td>
                  {tabConfig.keys.map(k => (
                    <td key={k} className="px-2 py-4 text-blue-800 border-y border-blue-200">
                      {columnTotals[k].toLocaleString()}
                    </td>
                  ))}
                  <td className="px-4 py-4 text-blue-900 text-base border-y border-r border-blue-200 rounded-r-2xl">
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

        <div className="bg-gray-50 p-4 border-t border-gray-200 flex items-center justify-between shrink-0 rounded-b-3xl">
          <p className="text-xs font-bold text-gray-500">
            Menampilkan <span className="text-gray-800">{processedData.length === 0 ? 0 : startIndex + 1}</span> - <span className="text-gray-800">{Math.min(startIndex + rowsPerPage, processedData.length)}</span> dari <span className="text-blue-700 font-black">{processedData.length}</span> baris
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
// MAIN COMPONENT: DAPODIK GURU
// =====================================================================
export default function DapodikGuru({ data = [], selectedYear = '2026' }) {
  const [activeTabKey, setActiveTabKey] = useState('GENDER'); 
  const [activeJenjang, setActiveJenjang] = useState('SEMUA'); 
  
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedWilayah, setSelectedWilayah] = useState('SEMUA');

  const config = TAB_CONFIG[activeTabKey];

  // ENGINE AGREGASI MASTER (SUPER CEPAT)
  const aggregatedData = useMemo(() => {
    
    const validJenjangList = JENJANG_GROUPS[activeJenjang];
    const isSemuaJenjang = activeJenjang === 'SEMUA';

    // 1. GATEKEEPER & FILTER AWAL
    const validData = data.filter(ptk => {
      const isGuru = String(getVal(ptk, 'jenis_ptk')).toUpperCase().includes('GURU');
      if (!isGuru) return false;
      
      const isInduk = String(getVal(ptk, 'status_tugas') || getVal(ptk, 'ptk_induk')).trim().toUpperCase() === 'INDUK' || String(getVal(ptk, 'status_tugas')).trim() === '1';
      if (!isInduk) return false;

      if (!isSemuaJenjang) {
        const jenjangDb = String(getVal(ptk, 'bentuk_pendidikan') || getVal(ptk, 'jenjang')).trim().toUpperCase();
        if (!validJenjangList.includes(jenjangDb)) return false;
      }
      return true;
    });

    const mapAgg = new Map();
    
    KABUPATEN_LIST.forEach(kab => {
      const initRow = { wilayah: kab, total: 0 };
      config.keys.forEach(k => initRow[k] = 0);
      mapAgg.set(kab, initRow);
    });

    validData.forEach(ptk => {
       // Pre-calculate age if needed
       let u = null;
       if (activeTabKey === 'USIA' || activeTabKey === 'PENSIUN') {
          const tgl = getVal(ptk, 'tanggal_lahir');
          if (tgl) {
             const m = String(tgl).match(/(19|20)\d{2}/);
             if (m) u = 2026 - parseInt(m[0], 10);
          }
       }
       if (activeTabKey === 'PENSIUN' && (u === null || u < 56)) return;

       const rawKab = getVal(ptk, 'kabupaten') || getVal(ptk, 'Kabupaten/Kota');
       const kabClean = cleanKabupatenName(rawKab); 

       if (!mapAgg.has(kabClean)) {
           const initRow = { wilayah: kabClean, total: 0 };
           config.keys.forEach(k => initRow[k] = 0);
           mapAgg.set(kabClean, initRow);
       }

       const row = mapAgg.get(kabClean);
       
       if (activeTabKey === 'GENDER') {
          const jk = String(getVal(ptk, 'jk') || getVal(ptk, 'gender')).toUpperCase();
          if (jk === 'L' || jk === 'LAKI-LAKI') { row['Laki-Laki']++; row.total++; }
          else if (jk === 'P' || jk === 'PEREMPUAN') { row['Perempuan']++; row.total++; }
       } 
       else if (activeTabKey === 'KUALIFIKASI') {
          const q = String(getVal(ptk, 'pendidikan')).toUpperCase().trim();
          if (q === 'S3' || q === 'S.3') row['S3']++;
          else if (q === 'S2' || q === 'S.2') row['S2']++;
          else if (q === 'S1' || q === 'S.1' || q === 'D4' || q === 'D.IV') row['S1']++;
          else if (q.includes('SMA') || q.includes('SMK') || q.includes('D1') || q.includes('D2') || q.includes('D3')) row['SMA/Sederajat']++;
          else row['Tidak Diketahui']++;
          row.total++;
       }
       else if (activeTabKey === 'PEGAWAI') {
          const sp = String(getVal(ptk, 'status_kepegawaian')).toUpperCase();
          if (sp.includes('PNS')) row['PNS']++;
          else if (sp.includes('PPPK')) row['PPPK']++;
          else if (sp.includes('GTY') || sp.includes('PTY') || sp.includes('YAYASAN')) row['GTY/PTY']++;
          else if (sp.includes('SEKOLAH') || sp.includes('HONORER SEKOLAH')) row['Honor Sekolah']++;
          else if (sp.includes('DAERAH') || sp.includes('KAB') || sp.includes('PROV')) row['Honor Daerah']++;
          else row['Lainnya']++;
          row.total++;
       }
       else if (activeTabKey === 'SERTIFIKASI') {
          const cert = String(getVal(ptk, 'bidang_studi_sertifikasi')).trim();
          if (cert !== '' && cert !== '-' && cert.toLowerCase() !== 'null') row['Sudah Sertifikasi']++;
          else row['Belum Sertifikasi']++;
          row.total++;
       }
       else if (activeTabKey === 'USIA') {
          if (u === null) row['Tidak Diketahui']++;
          else if (u <= 30) row['<= 30']++;
          else if (u <= 40) row['31 - 40']++;
          else if (u <= 50) row['41 - 50']++;
          else row['>= 51']++;
          row.total++;
       } 
       else if (activeTabKey === 'PENSIUN') {
          if (u === 56) { row['Usia 56']++; row.total++; }
          else if (u === 57) { row['Usia 57']++; row.total++; }
          else if (u === 58) { row['Usia 58']++; row.total++; }
          else if (u === 59) { row['Usia 59']++; row.total++; }
          else if (u === 60) { row['Usia 60']++; row.total++; }
          else if (u >= 61) { row['>= 61']++; row.total++; }
       }
    });

    return Array.from(mapAgg.values())
      .filter(row => row.wilayah !== "TIDAK DIKETAHUI" || row.total > 0)
      .sort((a, b) => getKabupatenRank(a.wilayah) - getKabupatenRank(b.wilayah));

  }, [data, activeTabKey, activeJenjang, config.keys]);

  const grandTotals = useMemo(() => {
    const res = { total: 0 };
    config.keys.forEach(k => res[k] = 0);
    
    aggregatedData.forEach(curr => {
      res.total += curr.total;
      config.keys.forEach(k => res[k] += curr[k]);
    });
    return res;
  }, [aggregatedData, config.keys]);

  const pieSegments = config.keys.map((k, i) => ({
    name: k,
    value: grandTotals[k],
    color: config.colors[i]
  }));

  const downloadExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Rekap Guru`);

    const cols = [
      { header: 'Wilayah (Kabupaten/Kota)', key: 'wilayah', width: 30 },
      ...config.keys.map(k => ({ header: k, key: k, width: 18 })),
      { header: 'Jumlah Total', key: 'total', width: 15 }
    ];
    worksheet.columns = cols;

    aggregatedData.forEach(item => worksheet.addRow(item));

    const totalRowData = { wilayah: 'TOTAL KESELURUHAN', total: grandTotals.total };
    config.keys.forEach(k => totalRowData[k] = grandTotals[k]);
    const totalRow = worksheet.addRow(totalRowData);

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    totalRow.font = { bold: true, color: { argb: 'FF1E3A8A' } };
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Rekap_Guru_${activeTabKey}_${activeJenjang.replace('/', '-')}.xlsx`;
    link.click();
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500">
      
      <div className="bg-white px-4 md:px-6 py-3 border-b border-gray-100 flex items-center justify-start gap-2 overflow-x-auto scrollbar-hide shadow-sm z-30 shrink-0">
        {Object.keys(TAB_CONFIG).map(key => (
          <button 
            key={key} onClick={() => setActiveTabKey(key)}
            className={`whitespace-nowrap px-4 md:px-6 py-2 rounded-xl font-black text-xs transition-all duration-300 ${activeTabKey === key ? 'bg-blue-600 text-white shadow-md scale-105' : 'text-gray-500 hover:bg-gray-200'}`}
          >
            {TAB_CONFIG[key].title}
          </button>
        ))}
      </div>

      <div className="bg-gray-50/50 px-4 md:px-6 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 shrink-0 z-20">
        <div className="flex items-center gap-2 bg-white p-1 border border-gray-200 rounded-lg overflow-x-auto scrollbar-hide">
          {Object.keys(JENJANG_GROUPS).map(tab => (
            <button 
              key={tab} onClick={() => setActiveJenjang(tab)}
              className={`px-3 md:px-4 py-1.5 rounded-md font-bold text-[10px] md:text-xs transition-all whitespace-nowrap ${activeJenjang === tab ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
            >
              {tab}
            </button>
          ))}
        </div>
        <button onClick={downloadExcel} className="flex items-center gap-2 bg-white text-blue-700 hover:bg-blue-50 px-4 py-2 rounded-lg font-black uppercase text-[10px] shadow-sm border border-blue-200 transition-all active:scale-95 shrink-0">
          <FileSpreadsheet size={14} /> Unduh Rekap
        </button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 bg-gray-50/50">
        
        <div className="flex-1 lg:w-2/3 p-4 md:p-6 flex flex-col min-h-0 overflow-hidden border-r border-gray-200">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-center border-separate border-spacing-y-2">
                <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm rounded-xl">
                  <tr className="text-[10px] font-black uppercase text-gray-500">
                    <th className="px-4 py-3 text-left rounded-l-xl">Wilayah</th>
                    {config.keys.map(k => (
                      <th key={k} className="px-2 py-3 text-blue-700 whitespace-nowrap">{k}</th>
                    ))}
                    <th className="px-4 py-3 text-gray-800 whitespace-nowrap">Jumlah Total</th>
                    <th className="px-4 py-3 rounded-r-xl">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregatedData.map((row, idx) => (
                    <tr key={idx} className="bg-white shadow-sm hover:shadow-md hover:scale-[1.01] transition-all group">
                      <td className="px-4 py-3 rounded-l-2xl font-black text-gray-800 uppercase text-left border-y border-l border-gray-100 whitespace-nowrap">
                        {row.wilayah}
                      </td>
                      {config.keys.map(k => (
                        <td key={k} className="px-2 py-3 font-bold text-gray-600 text-sm border-y border-gray-100 bg-blue-50/10">
                          {row[k].toLocaleString()}
                        </td>
                      ))}
                      <td className="px-4 py-3 font-black text-blue-800 text-base border-y border-gray-100 bg-blue-50/50">{row.total.toLocaleString()}</td>
                      <td className="px-4 py-3 rounded-r-2xl border-y border-r border-gray-100">
                         <button onClick={() => { setSelectedWilayah(row.wilayah); setModalOpen(true); }} className="flex items-center justify-center gap-2 bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase hover:bg-blue-600 hover:text-white transition-colors mx-auto">
                           <Eye size={12} /> Rincian
                         </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                  <tr className="bg-blue-100 text-center font-black uppercase text-xs border-t-2 border-blue-200">
                    <td className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-blue-200 text-blue-900">
                      TOTAL KAL-BAR
                    </td>
                    {config.keys.map(k => (
                      <td key={k} className="px-2 py-4 text-blue-800 border-y border-blue-200">{grandTotals[k].toLocaleString()}</td>
                    ))}
                    <td className="px-4 py-4 text-blue-900 text-base border-y border-blue-200">{grandTotals.total.toLocaleString()}</td>
                    <td className="px-4 py-4 rounded-r-2xl border-y border-r border-blue-200">
                       <button onClick={() => { setSelectedWilayah('SEMUA'); setModalOpen(true); }} className="flex items-center justify-center bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase hover:bg-blue-800 transition-colors mx-auto shadow-md">
                         Semua
                       </button>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        <div className="lg:w-1/3 flex flex-col bg-white border-l border-gray-100 relative">
          <div className="text-center w-full px-4 pt-8 pb-4 shrink-0">
            <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter">{config.title}</h2>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Jenjang {activeJenjang}</p>
          </div>

          <div className="flex-1 flex items-center justify-center min-h-0 relative py-4">
             <PremiumPieChart segments={pieSegments} total={grandTotals.total} />
          </div>

          <div className="px-6 pb-8 pt-4 w-full flex flex-col gap-2 shrink-0 max-h-64 overflow-y-auto scrollbar-hide">
             {config.keys.map((k, i) => {
                const val = grandTotals[k];
                const pct = grandTotals.total > 0 ? ((val / grandTotals.total) * 100).toFixed(1) : 0;
                if (val === 0) return null;

                return (
                  <div key={k} className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-100 transition-colors hover:bg-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="w-3.5 h-3.5 rounded-full shadow-inner shrink-0" style={{ backgroundColor: config.colors[i] }}></div>
                      <span className="font-black text-xs text-gray-700 uppercase leading-tight truncate max-w-[120px]">{k}</span>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <span className="font-bold text-xs text-gray-500">({pct}%)</span>
                      <span className="font-black text-base text-gray-800">{val.toLocaleString()}</span>
                    </div>
                  </div>
                );
             })}
          </div>
        </div>

      </div>

      <DapodikGuruModal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)}
        data={data}
        activeTabKey={activeTabKey}
        activeJenjang={activeJenjang}
        initialWilayah={selectedWilayah}
        tabConfig={config}
      />

    </div>
  );
}