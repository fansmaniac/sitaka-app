import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Download, GraduationCap, MapPin, Eye, FileSpreadsheet, 
  Search, X, ChevronLeft, ChevronRight, Building2, Filter, Users
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

const getNum = (obj, keyName) => parseInt(getVal(obj, keyName)) || 0;

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
// PENGELOMPOKAN JENJANG
// =====================================================================
const JENJANG_GROUPS = {
  'SEMUA': [],
  'PAUD': ['TK', 'KB', 'PAUD'],
  'SD': ['SD', 'SPK SD'],
  'SMP': ['SMP', 'SPK SMP'],
  'SMA/SMK': ['SMA', 'SPK SMA', 'SMK'],
  'SLB (Inklusif)': ['SLB'],
  'NON FORMAL': ['PKBM', 'SKB', 'TPA', 'SPS']
};

const JENJANG_KEYS = ['PAUD', 'SD', 'SMP', 'SMA/SMK', 'SLB (Inklusif)', 'NON FORMAL'];

const identifyJenjangGroup = (jenjangDb) => {
  const j = String(jenjangDb).trim().toUpperCase();
  for (const group of JENJANG_KEYS) {
    if (JENJANG_GROUPS[group].includes(j)) return group;
  }
  return null;
};

// =====================================================================
// MODAL RINCIAN PESERTA DIDIK
// =====================================================================
const DapodikPesertaDidikModal = ({ isOpen, onClose, data, activeJenjang, initialWilayah }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('SEMUA'); 
  const [filterGender, setFilterGender] = useState('SEMUA');
  
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  useEffect(() => { setCurrentPage(1); }, [searchTerm, filterStatus, filterGender, activeJenjang]);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const isModeSemuaWilayah = initialWilayah === 'SEMUA';
  const needsStatusFilter = ['SEMUA', 'SD', 'SMP', 'SMA/SMK'].includes(activeJenjang);
  const needsGenderFilter = ['PAUD', 'SLB (Inklusif)', 'NON FORMAL'].includes(activeJenjang);

  const processedData = useMemo(() => {
    if (!data) return [];
    const validJenjangList = JENJANG_GROUPS[activeJenjang];

    // 1. Filter Data Mentah
    const validData = data.filter(sekolah => {
      // Filter Wilayah
      const kabDb = cleanKabupatenName(getVal(sekolah, 'kabupaten') || getVal(sekolah, 'Kabupaten/Kota'));
      if (!isModeSemuaWilayah && kabDb !== initialWilayah) return false;

      // Filter Jenjang
      if (activeJenjang !== 'SEMUA') {
        const jenjangDb = String(getVal(sekolah, 'bentuk_pendidikan') || getVal(sekolah, 'jenjang')).trim().toUpperCase();
        if (!validJenjangList.includes(jenjangDb)) return false;
      }

      // Filter Status (jika berlaku)
      if (needsStatusFilter && filterStatus !== 'SEMUA') {
        const statusDb = String(getVal(sekolah, 'status_sekolah') || '').trim().toUpperCase();
        if (statusDb !== filterStatus) return false;
      }

      return true;
    });

    // 2. Agregasi per Kecamatan
    const mapAgg = new Map();

    validData.forEach(sekolah => {
      const kecRaw = String(getVal(sekolah, 'kecamatan') || 'TIDAK DIKETAHUI').trim().toUpperCase();
      const kabClean = cleanKabupatenName(getVal(sekolah, 'kabupaten') || getVal(sekolah, 'Kabupaten/Kota'));
      const keyId = `${kabClean}_${kecRaw}`;

      if (!mapAgg.has(keyId)) {
        mapAgg.set(keyId, { 
          kecamatan: kecRaw, kabupaten: kabClean,
          paud:0, sd:0, smp:0, sma:0, slb:0, nf:0,
          k1:0, k2:0, k3:0, k4:0, k5:0, k6:0,
          k7:0, k8:0, k9:0,
          k10:0, k11:0, k12:0,
          negeri:0, swasta:0,
          total: 0 
        });
      }

      const row = mapAgg.get(keyId);
      const group = identifyJenjangGroup(getVal(sekolah, 'bentuk_pendidikan') || getVal(sekolah, 'jenjang'));
      const status = String(getVal(sekolah, 'status_sekolah')).toUpperCase();

      const pdL = getNum(sekolah, 'pd_l');
      const pdP = getNum(sekolah, 'pd_p');
      let pdTotal = getNum(sekolah, 'pd_total') || (pdL + pdP);

      // Logika Filter Gender
      if (needsGenderFilter) {
         if (filterGender === 'L') pdTotal = pdL;
         else if (filterGender === 'P') pdTotal = pdP;
      }

      // Hitung Kelas
      const k1 = getNum(sekolah, 't1_l') + getNum(sekolah, 't1_p');
      const k2 = getNum(sekolah, 't2_l') + getNum(sekolah, 't2_p');
      const k3 = getNum(sekolah, 't3_l') + getNum(sekolah, 't3_p');
      const k4 = getNum(sekolah, 't4_l') + getNum(sekolah, 't4_p');
      const k5 = getNum(sekolah, 't5_l') + getNum(sekolah, 't5_p');
      const k6 = getNum(sekolah, 't6_l') + getNum(sekolah, 't6_p');

      const k7 = getNum(sekolah, 't7_l') + getNum(sekolah, 't7_p');
      const k8 = getNum(sekolah, 't8_l') + getNum(sekolah, 't8_p');
      const k9 = getNum(sekolah, 't9_l') + getNum(sekolah, 't9_p');

      const k10 = getNum(sekolah, 't10_l') + getNum(sekolah, 't10_p');
      const k11 = getNum(sekolah, 't11_l') + getNum(sekolah, 't11_p');
      const k12 = getNum(sekolah, 't12_l') + getNum(sekolah, 't12_p');

      if (activeJenjang === 'SEMUA' && group) {
         if (group === 'PAUD') row.paud += pdTotal;
         else if (group === 'SD') row.sd += pdTotal;
         else if (group === 'SMP') row.smp += pdTotal;
         else if (group === 'SMA/SMK') row.sma += pdTotal;
         else if (group === 'SLB (Inklusif)') row.slb += pdTotal;
         else if (group === 'NON FORMAL') row.nf += pdTotal;
         row.total += pdTotal;
      } 
      else if (activeJenjang === 'SD') {
         row.k1 += k1; row.k2 += k2; row.k3 += k3; row.k4 += k4; row.k5 += k5; row.k6 += k6;
         row.total += (k1+k2+k3+k4+k5+k6);
      } 
      else if (activeJenjang === 'SMP') {
         row.k7 += k7; row.k8 += k8; row.k9 += k9;
         row.total += (k7+k8+k9);
      } 
      else if (activeJenjang === 'SMA/SMK') {
         row.k10 += k10; row.k11 += k11; row.k12 += k12;
         row.total += (k10+k11+k12);
      } 
      else if (needsGenderFilter) {
         if (status === 'NEGERI') row.negeri += pdTotal;
         else row.swasta += pdTotal;
         row.total += pdTotal;
      }
    });

    let resultArray = Array.from(mapAgg.values());

    if (searchTerm) {
       resultArray = resultArray.filter(r => r.kecamatan.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    return resultArray.sort((a, b) => a.kecamatan.localeCompare(b.kecamatan));

  }, [data, activeJenjang, initialWilayah, isModeSemuaWilayah, filterStatus, filterGender, searchTerm, needsStatusFilter, needsGenderFilter]);

  const columnTotals = useMemo(() => {
    const totals = { 
      paud:0, sd:0, smp:0, sma:0, slb:0, nf:0, 
      k1:0, k2:0, k3:0, k4:0, k5:0, k6:0, k7:0, k8:0, k9:0, k10:0, k11:0, k12:0, 
      negeri:0, swasta:0, total: 0 
    };
    processedData.forEach(row => {
      Object.keys(totals).forEach(k => totals[k] += row[k]);
    });
    return totals;
  }, [processedData]);

  const getExcelColumns = () => {
    let cols = [{ header: 'Kecamatan', key: 'kecamatan', width: 25 }, { header: 'Kabupaten/Kota', key: 'kabupaten', width: 25 }];
    
    if (activeJenjang === 'SEMUA') {
       cols.push({ header:'PAUD', key:'paud', width:12 }, { header:'SD', key:'sd', width:12 }, { header:'SMP', key:'smp', width:12 }, { header:'SMA/SMK', key:'sma', width:15 }, { header:'SLB', key:'slb', width:12 }, { header:'NON FORMAL', key:'nf', width:15 });
    } else if (activeJenjang === 'SD') {
       cols.push({ header:'Kelas 1', key:'k1', width:12 }, { header:'Kelas 2', key:'k2', width:12 }, { header:'Kelas 3', key:'k3', width:12 }, { header:'Kelas 4', key:'k4', width:12 }, { header:'Kelas 5', key:'k5', width:12 }, { header:'Kelas 6', key:'k6', width:12 });
    } else if (activeJenjang === 'SMP') {
       cols.push({ header:'Kelas 7', key:'k7', width:15 }, { header:'Kelas 8', key:'k8', width:15 }, { header:'Kelas 9', key:'k9', width:15 });
    } else if (activeJenjang === 'SMA/SMK') {
       cols.push({ header:'Kelas 10', key:'k10', width:15 }, { header:'Kelas 11', key:'k11', width:15 }, { header:'Kelas 12', key:'k12', width:15 });
    } else {
       cols.push({ header:'Negeri', key:'negeri', width:15 }, { header:'Swasta', key:'swasta', width:15 });
    }
    cols.push({ header: 'Total PD', key: 'total', width: 15 });
    return cols;
  };

  const downloadExcelRincian = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Rincian PD ${initialWilayah}`);

    worksheet.columns = getExcelColumns();
    processedData.forEach(item => worksheet.addRow(item));

    const totalRowData = { kecamatan: 'TOTAL KESELURUHAN', ...columnTotals };
    const totalRow = worksheet.addRow(totalRowData);

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    totalRow.font = { bold: true, color: { argb: 'FF1E3A8A' } };
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Rincian_PD_${activeJenjang.replace('/', '-')}_${initialWilayah}.xlsx`;
    link.click();
  };

  const renderTableHeaders = () => {
    if (activeJenjang === 'SEMUA') {
      return (
        <>
          <th className="px-2 py-3 text-blue-700">PAUD</th><th className="px-2 py-3 text-blue-700">SD</th>
          <th className="px-2 py-3 text-blue-700">SMP</th><th className="px-2 py-3 text-blue-700">SMA/SMK</th>
          <th className="px-2 py-3 text-blue-700">SLB (Inklusif)</th><th className="px-2 py-3 text-blue-700">NON FORMAL</th>
        </>
      );
    }
    if (activeJenjang === 'SD') {
      return (
        <>
          <th className="px-2 py-3 text-blue-700">Kls 1</th><th className="px-2 py-3 text-blue-700">Kls 2</th>
          <th className="px-2 py-3 text-blue-700">Kls 3</th><th className="px-2 py-3 text-blue-700">Kls 4</th>
          <th className="px-2 py-3 text-blue-700">Kls 5</th><th className="px-2 py-3 text-blue-700">Kls 6</th>
        </>
      );
    }
    if (activeJenjang === 'SMP') {
      return (
        <><th className="px-4 py-3 text-blue-700">Kelas 7</th><th className="px-4 py-3 text-blue-700">Kelas 8</th><th className="px-4 py-3 text-blue-700">Kelas 9</th></>
      );
    }
    if (activeJenjang === 'SMA/SMK') {
      return (
        <><th className="px-4 py-3 text-blue-700">Kelas 10</th><th className="px-4 py-3 text-blue-700">Kelas 11</th><th className="px-4 py-3 text-blue-700">Kelas 12</th></>
      );
    }
    return (
      <><th className="px-4 py-3 text-blue-600">Negeri</th><th className="px-4 py-3 text-orange-600">Swasta</th></>
    );
  };

  const renderTableData = (row) => {
    const tdClass = "px-2 py-3 font-bold text-gray-600 text-sm border-y border-gray-100 bg-blue-50/10";
    if (activeJenjang === 'SEMUA') {
      return (
        <>
          <td className={tdClass}>{row.paud.toLocaleString()}</td><td className={tdClass}>{row.sd.toLocaleString()}</td>
          <td className={tdClass}>{row.smp.toLocaleString()}</td><td className={tdClass}>{row.sma.toLocaleString()}</td>
          <td className={tdClass}>{row.slb.toLocaleString()}</td><td className={tdClass}>{row.nf.toLocaleString()}</td>
        </>
      );
    }
    if (activeJenjang === 'SD') {
      return (
        <>
          <td className={tdClass}>{row.k1.toLocaleString()}</td><td className={tdClass}>{row.k2.toLocaleString()}</td>
          <td className={tdClass}>{row.k3.toLocaleString()}</td><td className={tdClass}>{row.k4.toLocaleString()}</td>
          <td className={tdClass}>{row.k5.toLocaleString()}</td><td className={tdClass}>{row.k6.toLocaleString()}</td>
        </>
      );
    }
    if (activeJenjang === 'SMP') {
      return (
        <><td className={tdClass}>{row.k7.toLocaleString()}</td><td className={tdClass}>{row.k8.toLocaleString()}</td><td className={tdClass}>{row.k9.toLocaleString()}</td></>
      );
    }
    if (activeJenjang === 'SMA/SMK') {
      return (
        <><td className={tdClass}>{row.k10.toLocaleString()}</td><td className={tdClass}>{row.k11.toLocaleString()}</td><td className={tdClass}>{row.k12.toLocaleString()}</td></>
      );
    }
    return (
      <>
        <td className="px-4 py-3 font-black text-blue-600 text-sm border-y border-gray-100 bg-blue-50/10">{row.negeri.toLocaleString()}</td>
        <td className="px-4 py-3 font-black text-orange-600 text-sm border-y border-gray-100 bg-orange-50/10">{row.swasta.toLocaleString()}</td>
      </>
    );
  };

  const renderTableFooter = () => {
    const tdClass = "px-2 py-4 text-blue-800 border-y border-blue-200";
    if (activeJenjang === 'SEMUA') {
      return (
        <>
          <td className={tdClass}>{columnTotals.paud.toLocaleString()}</td><td className={tdClass}>{columnTotals.sd.toLocaleString()}</td>
          <td className={tdClass}>{columnTotals.smp.toLocaleString()}</td><td className={tdClass}>{columnTotals.sma.toLocaleString()}</td>
          <td className={tdClass}>{columnTotals.slb.toLocaleString()}</td><td className={tdClass}>{columnTotals.nf.toLocaleString()}</td>
        </>
      );
    }
    if (activeJenjang === 'SD') {
      return (
        <>
          <td className={tdClass}>{columnTotals.k1.toLocaleString()}</td><td className={tdClass}>{columnTotals.k2.toLocaleString()}</td>
          <td className={tdClass}>{columnTotals.k3.toLocaleString()}</td><td className={tdClass}>{columnTotals.k4.toLocaleString()}</td>
          <td className={tdClass}>{columnTotals.k5.toLocaleString()}</td><td className={tdClass}>{columnTotals.k6.toLocaleString()}</td>
        </>
      );
    }
    if (activeJenjang === 'SMP') {
      return (
        <><td className={tdClass}>{columnTotals.k7.toLocaleString()}</td><td className={tdClass}>{columnTotals.k8.toLocaleString()}</td><td className={tdClass}>{columnTotals.k9.toLocaleString()}</td></>
      );
    }
    if (activeJenjang === 'SMA/SMK') {
      return (
        <><td className={tdClass}>{columnTotals.k10.toLocaleString()}</td><td className={tdClass}>{columnTotals.k11.toLocaleString()}</td><td className={tdClass}>{columnTotals.k12.toLocaleString()}</td></>
      );
    }
    return (
      <>
        <td className="px-4 py-4 text-blue-700 border-y border-blue-200">{columnTotals.negeri.toLocaleString()}</td>
        <td className="px-4 py-4 text-orange-700 border-y border-blue-200">{columnTotals.swasta.toLocaleString()}</td>
      </>
    );
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
            <div className="bg-white/20 p-2 rounded-xl"><GraduationCap size={24} /></div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tighter leading-none">Rincian Peserta Didik</h2>
              <p className="text-blue-200 text-sm font-bold uppercase tracking-widest mt-1">
                {isModeSemuaWilayah ? 'Provinsi Kalimantan Barat' : `Kab. ${initialWilayah}`} • Jenjang {activeJenjang}
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

        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex flex-wrap gap-4 items-center shrink-0">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" placeholder="Cari Nama Kecamatan..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 font-bold text-gray-700 text-sm"
            />
          </div>
          
          {needsStatusFilter && (
            <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
              <Building2 size={16} className="text-gray-400 mr-2" />
              <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer">
                <option value="SEMUA">Semua Status</option>
                <option value="NEGERI">Negeri</option>
                <option value="SWASTA">Swasta</option>
              </select>
            </div>
          )}

          {needsGenderFilter && (
            <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
              <Users size={16} className="text-gray-400 mr-2" />
              <select value={filterGender} onChange={(e) => setFilterGender(e.target.value)} className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer">
                <option value="SEMUA">Semua Gender</option>
                <option value="L">Laki-Laki</option>
                <option value="P">Perempuan</option>
              </select>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto bg-white p-4">
          <table className="w-full text-center border-separate border-spacing-y-2">
            <thead className="sticky top-0 bg-white z-10 shadow-sm rounded-xl">
              <tr className="text-[10px] font-black uppercase text-gray-500">
                <th className="px-4 py-3 text-center rounded-l-xl w-16">No</th>
                <th className="px-4 py-3 text-left">Kecamatan</th>
                {renderTableHeaders()}
                <th className="px-4 py-3 rounded-r-xl text-gray-800">Total PD</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.map((row, idx) => (
                <tr key={idx} className="bg-white shadow-sm hover:shadow-md hover:scale-[1.01] transition-all group">
                  <td className="px-4 py-3 text-center font-bold text-gray-400 text-xs rounded-l-2xl border-y border-l border-gray-100">{startIndex + idx + 1}</td>
                  <td className="px-4 py-3 font-black text-gray-800 text-sm uppercase text-left border-y border-gray-100 whitespace-nowrap">
                    {row.kecamatan}
                    <div className="text-[10px] font-bold text-gray-400 mt-0.5">{row.kabupaten}</div>
                  </td>
                  {renderTableData(row)}
                  <td className="px-4 py-3 font-black text-blue-800 text-base border-y border-r border-gray-100 bg-blue-50/50 rounded-r-2xl">
                    {row.total.toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
            {processedData.length > 0 && (
              <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                <tr className="bg-blue-100 text-center font-black uppercase text-xs border-t-2 border-blue-200">
                  <td colSpan="2" className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-blue-200 text-blue-900">
                    TOTAL {isModeSemuaWilayah ? 'PROVINSI' : 'KECAMATAN'}
                  </td>
                  {renderTableFooter()}
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
// MAIN COMPONENT: DAPODIK PESERTA DIDIK
// =====================================================================
export default function DapodikPesertaDidik({ data = [], selectedYear = '2026' }) {
  const [activeTab, setActiveTab] = useState('SEMUA'); 
  const [subTab, setSubTab] = useState('SEMUA'); 
  
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedWilayah, setSelectedWilayah] = useState('SEMUA');

  useEffect(() => { setSubTab('SEMUA'); }, [activeTab]);

  const aggregatedData = useMemo(() => {
    const validJenjangList = JENJANG_GROUPS[activeTab];
    const isModeKelas = ['SD', 'SMP', 'SMA/SMK'].includes(activeTab);

    const mapAgg = new Map();
    KABUPATEN_LIST.forEach(kab => {
      mapAgg.set(kab, { 
        wilayah: kab, 
        paud:0, sd:0, smp:0, sma:0, slb:0, nf:0,
        negeri:0, swasta:0,
        t1:0, t2:0, t3:0, t4:0, t5:0, t6:0, 
        t7:0, t8:0, t9:0, t10:0, t11:0, t12:0, 
        pd_total:0 
      });
    });

    data.forEach(sekolah => {
       const group = identifyJenjangGroup(getVal(sekolah, 'bentuk_pendidikan') || getVal(sekolah, 'jenjang'));
       if (!group) return;

       if (activeTab !== 'SEMUA' && group !== activeTab) return;

       const status = String(getVal(sekolah, 'status_sekolah') || '').trim().toUpperCase();
       if (isModeKelas && subTab !== 'SEMUA' && status !== subTab) return;

       const kab = cleanKabupatenName(getVal(sekolah, 'kabupaten') || getVal(sekolah, 'Kabupaten/Kota'));
       if (!mapAgg.has(kab)) return; 

       const row = mapAgg.get(kab);
       const getNumCol = (k) => parseInt(getVal(sekolah, k)) || 0;
       
       const pdL = getNumCol('pd_l');
       const pdP = getNumCol('pd_p');
       const pdTotal = getNumCol('pd_total') || (pdL + pdP);

       const k1 = getNumCol('t1_l') + getNumCol('t1_p');
       const k2 = getNumCol('t2_l') + getNumCol('t2_p');
       const k3 = getNumCol('t3_l') + getNumCol('t3_p');
       const k4 = getNumCol('t4_l') + getNumCol('t4_p');
       const k5 = getNumCol('t5_l') + getNumCol('t5_p');
       const k6 = getNumCol('t6_l') + getNumCol('t6_p');
       const k7 = getNumCol('t7_l') + getNumCol('t7_p');
       const k8 = getNumCol('t8_l') + getNumCol('t8_p');
       const k9 = getNumCol('t9_l') + getNumCol('t9_p');
       const k10 = getNumCol('t10_l') + getNumCol('t10_p');
       const k11 = getNumCol('t11_l') + getNumCol('t11_p');
       const k12 = getNumCol('t12_l') + getNumCol('t12_p');

       if (activeTab === 'SEMUA') {
           if (group === 'PAUD') row.paud += pdTotal;
           else if (group === 'SD') row.sd += pdTotal;
           else if (group === 'SMP') row.smp += pdTotal;
           else if (group === 'SMA/SMK') row.sma += pdTotal;
           else if (group === 'SLB (Inklusif)') row.slb += pdTotal;
           else if (group === 'NON FORMAL') row.nf += pdTotal;
           row.pd_total += pdTotal;
       } 
       else if (isModeKelas) {
           if (activeTab === 'SD') {
               row.t1 += k1; row.t2 += k2; row.t3 += k3; row.t4 += k4; row.t5 += k5; row.t6 += k6;
               row.pd_total += (k1+k2+k3+k4+k5+k6);
           } else if (activeTab === 'SMP') {
               row.t7 += k7; row.t8 += k8; row.t9 += k9;
               row.pd_total += (k7+k8+k9);
           } else if (activeTab === 'SMA/SMK') {
               row.t10 += k10; row.t11 += k11; row.t12 += k12;
               row.pd_total += (k10+k11+k12);
           }
       } 
       else {
           if (status === 'NEGERI') row.negeri += pdTotal;
           else row.swasta += pdTotal;
           row.pd_total += pdTotal;
       }
    });

    return Array.from(mapAgg.values()).sort((a, b) => getKabupatenRank(a.wilayah) - getKabupatenRank(b.wilayah));
  }, [data, activeTab, subTab]);

  const grandTotals = useMemo(() => {
    const res = { 
      paud:0, sd:0, smp:0, sma:0, slb:0, nf:0, 
      t1:0, t2:0, t3:0, t4:0, t5:0, t6:0, t7:0, t8:0, t9:0, t10:0, t11:0, t12:0, 
      negeri:0, swasta:0, pd_total:0 
    };
    aggregatedData.forEach(curr => {
      Object.keys(res).forEach(k => res[k] += curr[k]);
    });
    return res;
  }, [aggregatedData]);

  const getExcelColumns = () => {
    let cols = [{ header: 'Wilayah (Kabupaten/Kota)', key: 'wilayah', width: 30 }];
    
    if (activeTab === 'SEMUA') {
       cols.push({ header:'PAUD', key:'paud', width:12 }, { header:'SD', key:'sd', width:12 }, { header:'SMP', key:'smp', width:12 }, { header:'SMA/SMK', key:'sma', width:15 }, { header:'SLB', key:'slb', width:12 }, { header:'NON FORMAL', key:'nf', width:15 });
    } else if (activeTab === 'SD') {
       cols.push({ header: 'Kelas 1', key: 't1', width: 12 }, { header: 'Kelas 2', key: 't2', width: 12 }, { header: 'Kelas 3', key: 't3', width: 12 }, { header: 'Kelas 4', key: 't4', width: 12 }, { header: 'Kelas 5', key: 't5', width: 12 }, { header: 'Kelas 6', key: 't6', width: 12 });
    } else if (activeTab === 'SMP') {
       cols.push({ header: 'Kelas 7', key: 't7', width: 15 }, { header: 'Kelas 8', key: 't8', width: 15 }, { header: 'Kelas 9', key: 't9', width: 15 });
    } else if (activeTab === 'SMA/SMK') {
       cols.push({ header: 'Kelas 10', key: 't10', width: 15 }, { header: 'Kelas 11', key: 't11', width: 15 }, { header: 'Kelas 12', key: 't12', width: 15 });
    } else {
       cols.push({ header: 'Negeri', key: 'negeri', width: 15 }, { header: 'Swasta', key: 'swasta', width: 15 });
    }
    cols.push({ header: 'Total PD', key: 'pd_total', width: 15 });
    return cols;
  };

  const downloadExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheetTitle = activeTab === 'SEMUA' ? 'Semua Jenjang' : activeTab.replace('/', '-'); 
    const worksheet = workbook.addWorksheet(`Rekap PD ${worksheetTitle}`);

    worksheet.columns = getExcelColumns();
    aggregatedData.forEach(item => worksheet.addRow(item));

    const totalRowData = { wilayah: 'TOTAL KESELURUHAN', ...grandTotals };
    const totalRow = worksheet.addRow(totalRowData);

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    totalRow.font = { bold: true, color: { argb: 'FF1E3A8A' } };
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Rekap_PD_${activeTab === 'SEMUA' ? 'Keseluruhan' : activeTab.replace('/', '-')}_${selectedYear}.xlsx`;
    link.click();
  };

  const renderTableHeaders = () => {
    if (activeTab === 'SEMUA') {
      return (
        <>
          <th className="px-2 py-3 text-blue-700">PAUD</th><th className="px-2 py-3 text-blue-700">SD</th>
          <th className="px-2 py-3 text-blue-700">SMP</th><th className="px-2 py-3 text-blue-700">SMA/SMK</th>
          <th className="px-2 py-3 text-blue-700">SLB (Inklusif)</th><th className="px-2 py-3 text-blue-700">NON FORMAL</th>
        </>
      );
    }
    if (activeTab === 'SD') {
      return (
        <>
          <th className="px-2 py-3 text-blue-700">Kls 1</th><th className="px-2 py-3 text-blue-700">Kls 2</th>
          <th className="px-2 py-3 text-blue-700">Kls 3</th><th className="px-2 py-3 text-blue-700">Kls 4</th>
          <th className="px-2 py-3 text-blue-700">Kls 5</th><th className="px-2 py-3 text-blue-700">Kls 6</th>
        </>
      );
    }
    if (activeTab === 'SMP') {
      return (
        <><th className="px-4 py-3 text-blue-700">Kelas 7</th><th className="px-4 py-3 text-blue-700">Kelas 8</th><th className="px-4 py-3 text-blue-700">Kelas 9</th></>
      );
    }
    if (activeTab === 'SMA/SMK') {
      return (
        <><th className="px-4 py-3 text-blue-700">Kelas 10</th><th className="px-4 py-3 text-blue-700">Kelas 11</th><th className="px-4 py-3 text-blue-700">Kelas 12</th></>
      );
    }
    return (
      <><th className="px-4 py-3 text-blue-600">Negeri</th><th className="px-4 py-3 text-orange-600">Swasta</th></>
    );
  };

  const renderTableData = (row) => {
    const tdClass = "px-2 py-3 font-bold text-gray-600 text-sm border-y border-gray-100 bg-blue-50/10";
    if (activeTab === 'SEMUA') {
      return (
        <>
          <td className={tdClass}>{row.paud.toLocaleString()}</td><td className={tdClass}>{row.sd.toLocaleString()}</td>
          <td className={tdClass}>{row.smp.toLocaleString()}</td><td className={tdClass}>{row.sma.toLocaleString()}</td>
          <td className={tdClass}>{row.slb.toLocaleString()}</td><td className={tdClass}>{row.nf.toLocaleString()}</td>
        </>
      );
    }
    if (activeTab === 'SD') {
      return (
        <>
          <td className={tdClass}>{row.t1.toLocaleString()}</td><td className={tdClass}>{row.t2.toLocaleString()}</td>
          <td className={tdClass}>{row.t3.toLocaleString()}</td><td className={tdClass}>{row.t4.toLocaleString()}</td>
          <td className={tdClass}>{row.t5.toLocaleString()}</td><td className={tdClass}>{row.t6.toLocaleString()}</td>
        </>
      );
    }
    if (activeTab === 'SMP') {
      return (
        <><td className={tdClass}>{row.t7.toLocaleString()}</td><td className={tdClass}>{row.t8.toLocaleString()}</td><td className={tdClass}>{row.t9.toLocaleString()}</td></>
      );
    }
    if (activeTab === 'SMA/SMK') {
      return (
        <><td className={tdClass}>{row.t10.toLocaleString()}</td><td className={tdClass}>{row.t11.toLocaleString()}</td><td className={tdClass}>{row.t12.toLocaleString()}</td></>
      );
    }
    return (
      <>
        <td className="px-4 py-3 font-black text-blue-600 text-sm border-y border-gray-100 bg-blue-50/10">{row.negeri.toLocaleString()}</td>
        <td className="px-4 py-3 font-black text-orange-600 text-sm border-y border-gray-100 bg-orange-50/10">{row.swasta.toLocaleString()}</td>
      </>
    );
  };

  const renderTableFooter = () => {
    const tdClass = "px-2 py-4 text-blue-800 border-y border-blue-200";
    if (activeTab === 'SEMUA') {
      return (
        <>
          <td className={tdClass}>{grandTotals.paud.toLocaleString()}</td><td className={tdClass}>{grandTotals.sd.toLocaleString()}</td>
          <td className={tdClass}>{grandTotals.smp.toLocaleString()}</td><td className={tdClass}>{grandTotals.sma.toLocaleString()}</td>
          <td className={tdClass}>{grandTotals.slb.toLocaleString()}</td><td className={tdClass}>{grandTotals.nf.toLocaleString()}</td>
        </>
      );
    }
    if (activeTab === 'SD') {
      return (
        <>
          <td className={tdClass}>{grandTotals.t1.toLocaleString()}</td><td className={tdClass}>{grandTotals.t2.toLocaleString()}</td>
          <td className={tdClass}>{grandTotals.t3.toLocaleString()}</td><td className={tdClass}>{grandTotals.t4.toLocaleString()}</td>
          <td className={tdClass}>{grandTotals.t5.toLocaleString()}</td><td className={tdClass}>{grandTotals.t6.toLocaleString()}</td>
        </>
      );
    }
    if (activeTab === 'SMP') {
      return (
        <><td className={tdClass}>{grandTotals.t7.toLocaleString()}</td><td className={tdClass}>{grandTotals.t8.toLocaleString()}</td><td className={tdClass}>{grandTotals.t9.toLocaleString()}</td></>
      );
    }
    if (activeTab === 'SMA/SMK') {
      return (
        <><td className={tdClass}>{grandTotals.t10.toLocaleString()}</td><td className={tdClass}>{grandTotals.t11.toLocaleString()}</td><td className={tdClass}>{grandTotals.t12.toLocaleString()}</td></>
      );
    }
    return (
      <>
        <td className="px-4 py-4 text-blue-700 border-y border-blue-200">{grandTotals.negeri.toLocaleString()}</td>
        <td className="px-4 py-4 text-orange-700 border-y border-blue-200">{grandTotals.swasta.toLocaleString()}</td>
      </>
    );
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500">
      
      {/* 1. TABS HEADER */}
      <div className="bg-white px-4 md:px-6 py-3 border-b border-gray-100 flex items-center justify-start gap-2 overflow-x-auto scrollbar-hide shadow-sm z-30 shrink-0">
        <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-2xl min-w-max">
          {Object.keys(JENJANG_GROUPS).map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 md:px-6 py-2.5 rounded-xl font-black text-xs md:text-sm transition-all duration-300 whitespace-nowrap ${activeTab === tab ? 'bg-blue-600 text-white shadow-md scale-105' : 'text-gray-500 hover:bg-gray-200'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* 2. SUB-TABS & INFO */}
      <div className="bg-gray-50/50 px-4 md:px-6 py-3 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3 shrink-0 z-20">
        
        <div className="flex items-center flex-1 min-w-max">
          {['SD', 'SMP', 'SMA/SMK'].includes(activeTab) && (
             <div className="flex items-center gap-2 bg-white p-1 border border-gray-200 rounded-lg">
               {['SEMUA', 'NEGERI', 'SWASTA'].map(st => (
                  <button 
                    key={st} onClick={() => setSubTab(st)}
                    className={`px-3 md:px-4 py-1.5 rounded-md font-bold text-[10px] md:text-xs transition-all whitespace-nowrap ${subTab === st ? 'bg-blue-100 text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-800'}`}
                  >
                    {st === 'SEMUA' ? 'SEMUA STATUS' : st}
                  </button>
               ))}
             </div>
          )}

          {['PAUD', 'NON FORMAL'].includes(activeTab) && (
             <p className="text-[10px] md:text-xs font-bold text-blue-700 uppercase tracking-widest flex items-center gap-2">
               <GraduationCap size={16} /> 
               {activeTab === 'PAUD' ? 'Jenjang formal ini terdiri dari PAUD, KB, dan TK' : 'Jenjang non formal ini terdiri dari PKBM, TPA, SPS, dan SKB'}
             </p>
          )}
        </div>

        <button 
          onClick={downloadExcel}
          className="flex items-center gap-2 bg-white text-blue-700 hover:bg-blue-50 px-4 py-2 rounded-lg font-black uppercase text-[10px] shadow-sm border border-blue-200 transition-all active:scale-95 shrink-0"
        >
          <FileSpreadsheet size={14} /> Unduh Rekap
        </button>
      </div>

      {/* 3. AREA KONTEN */}
      <div className="flex-1 flex flex-col min-h-0 bg-gray-50/50 p-4 md:p-6">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-center border-separate border-spacing-y-2">
                <thead className="sticky top-0 bg-white z-10 shadow-sm rounded-xl">
                  <tr className="text-[10px] font-black uppercase text-gray-500 bg-gray-50 border-b-2 border-gray-200">
                    <th className="px-4 py-3 text-center rounded-l-xl w-16">No</th>
                    <th className="px-4 py-3 text-left">Wilayah</th>
                    {renderTableHeaders()}
                    <th className="px-4 py-3 text-gray-800">Total PD</th>
                    <th className="px-4 py-3 rounded-r-xl">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregatedData.map((row, idx) => (
                    <tr key={idx} className="bg-white shadow-sm hover:shadow-md hover:scale-[1.01] transition-all group">
                      <td className="px-4 py-3 text-center font-bold text-gray-400 text-xs rounded-l-2xl border-y border-l border-gray-100">{idx + 1}</td>
                      <td className="px-4 py-3 font-black text-gray-800 uppercase text-left border-y border-gray-100 whitespace-nowrap">
                        {row.wilayah}
                      </td>
                      {renderTableData(row)}
                      <td className="px-4 py-3 font-black text-gray-800 text-lg border-y border-gray-100 bg-gray-50/50">{row.pd_total.toLocaleString()}</td>
                      <td className="px-4 py-3 rounded-r-2xl border-y border-r border-gray-100">
                         <button 
                            onClick={() => { setSelectedWilayah(row.wilayah); setModalOpen(true); }}
                            className="flex items-center justify-center gap-2 bg-blue-50 text-blue-600 px-4 py-1.5 rounded-xl text-[10px] font-black uppercase hover:bg-blue-600 hover:text-white transition-colors mx-auto"
                         >
                           <Eye size={14} /> Rincian
                         </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                  <tr className="bg-blue-100 text-center font-black uppercase text-xs border-t-2 border-blue-200">
                    <td colSpan="2" className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-blue-200 text-blue-900">
                      TOTAL KALIMANTAN BARAT
                    </td>
                    {renderTableFooter()}
                    <td className="px-4 py-4 text-gray-900 border-y border-blue-200 text-lg bg-blue-200/50">{grandTotals.pd_total.toLocaleString()}</td>
                    <td className="px-4 py-4 rounded-r-2xl border-y border-r border-blue-200">
                       <button 
                            onClick={() => { setSelectedWilayah('SEMUA'); setModalOpen(true); }}
                            className="flex items-center justify-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase hover:bg-blue-800 transition-colors mx-auto shadow-md"
                         >
                           <Search size={14} /> Semua
                         </button>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
      </div>

      {/* 3. MODAL COMPONENT */}
      <DapodikPesertaDidikModal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)}
        data={data}
        activeJenjang={activeTab}
        initialWilayah={selectedWilayah}
      />

    </div>
  );
}