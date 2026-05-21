import React, { useState, useEffect, useMemo } from 'react';
import { MapPin, Info, School, Activity, Layers, Loader2, Search, Download } from 'lucide-react';
import { db } from '../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import ExcelJS from 'exceljs';

// =====================================================================
// UTILITY FUNCTIONS
// =====================================================================
const KABUPATEN_LIST = [
  "BENGKAYANG", "KAPUAS HULU", "KAYONG UTARA", "KETAPANG", 
  "KUBU RAYA", "LANDAK", "MELAWI", "MEMPAWAH", "PONTIANAK", 
  "SAMBAS", "SANGGAU", "SEKADAU", "SINGKAWANG", "SINTANG"
];

// PEMISAHAN JENJANG SMA DAN SMK
const JENJANG_KEYS = ['PAUD', 'SD', 'SMP', 'SMA', 'SMK', 'SLB (Inklusif)', 'NON FORMAL'];

// KAPASITAS IDEAL PER 1 SEKOLAH BERDASARKAN PERMENDIKDASMEN 14/2026
const IDEAL_CAPACITY = {
  'PAUD': 2 * 15,          
  'SD': 6 * 28,            
  'SMP': 3 * 32,           
  'SMA': 3 * 36,       
  'SMK': 3 * 36,       
  'SLB (Inklusif)': 3 * 8, 
  'NON FORMAL': 3 * 30     
};

const getRawRatio = (sekCount, pdCount) => {
  if (sekCount === 0) return 0;
  return (pdCount / sekCount);
};

const renderRatio = (sekCount, pdCount, jenjang) => {
  if (sekCount === 0 && pdCount === 0) return <span className="text-gray-300 font-normal">-</span>;
  if (sekCount === 0 && pdCount > 0) return <span className="text-red-500 font-bold text-[10px]">Error (0 Sekolah)</span>;
  
  const ratio = getRawRatio(sekCount, pdCount);
  const idealMax = IDEAL_CAPACITY[jenjang];
  const idealMin = idealMax * 0.4; 
  
  let colorClass = 'text-emerald-600'; 
  
  if (ratio > idealMax) {
    colorClass = 'text-red-600'; 
  } else if (ratio < idealMin) {
    colorClass = 'text-blue-600'; 
  }

  return <span className={`font-black ${colorClass} tracking-wider`}>1 : {ratio.toFixed(0)}</span>;
};

// =====================================================================
// MAIN COMPONENT
// =====================================================================
export default function RasioSekolahVsPD({ selectedYear }) {
  const [filterWilayah, setFilterWilayah] = useState('SEMUA');
  const [filterStatusTab2, setFilterStatusTab2] = useState('SEMUA'); // STATE BARU FILTER STATUS TABEL 2
  const [tab2DataRaw, setTab2DataRaw] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(''); // State untuk tanggal update

  useEffect(() => {
    const fetchAgregasi = async () => {
      setLoading(true);
      setError(null);
      try {
        const docRef = doc(db, 'dapodik_agregasi', `rasio_sekolah_pd_${selectedYear}`);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setTab2DataRaw(data.tabel2 || []);
          
          // Format tanggal last_updated
          if (data.last_updated) {
            const d = new Date(data.last_updated);
            const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
            setLastUpdated(`${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`);
          } else {
            setLastUpdated('Tidak Diketahui');
          }
        } else {
          setError(`Data rasio tahun ${selectedYear} belum dikalkulasi oleh Admin.`);
        }
      } catch (err) {
        console.error(err);
        setError("Gagal menarik data rasio dari server.");
      } finally {
        setLoading(false);
      }
    };
    fetchAgregasi();
  }, [selectedYear]);

  const isModeSemua = filterWilayah === 'SEMUA';

  // --- ENGINE TABEL 1 (REKAP JENJANG) ---
  const tab1Data = useMemo(() => {
    if (!tab2DataRaw || tab2DataRaw.length === 0) return [];

    const resMap = new Map();
    JENJANG_KEYS.forEach(k => resMap.set(k, { jenjang: k, sek_n: 0, pd_n: 0, sek_s: 0, pd_s: 0, total_sek: 0, total_pd: 0 }));

    tab2DataRaw.forEach(row => {
      if (!isModeSemua && row.wilayah !== filterWilayah) return;
      JENJANG_KEYS.forEach(k => {
        const agg = resMap.get(k);
        // Tangkap key agregasi mentah, gunakan nama standar dari db
        const baseK = k === 'SLB (Inklusif)' ? 'SLB (Inklusif)' : k;
        agg.sek_n += (row[`${baseK}_sek_n`] || 0);
        agg.pd_n += (row[`${baseK}_pd_n`] || 0);
        agg.sek_s += (row[`${baseK}_sek_s`] || 0);
        agg.pd_s += (row[`${baseK}_pd_s`] || 0);
        agg.total_sek += (row[`${baseK}_sek`] || 0);
        agg.total_pd += (row[`${baseK}_pd`] || 0);
      });
    });
    return Array.from(resMap.values());
  }, [tab2DataRaw, filterWilayah, isModeSemua]);

  // --- LOGIKA GRAND TOTAL TABEL 1 ---
  const grandTotalTab1 = useMemo(() => {
    return tab1Data.reduce((acc, curr) => {
      acc.sek_n += curr.sek_n;
      acc.pd_n += curr.pd_n;
      acc.sek_s += curr.sek_s;
      acc.pd_s += curr.pd_s;
      acc.total_sek += curr.total_sek;
      acc.total_pd += curr.total_pd;
      return acc;
    }, { sek_n: 0, pd_n: 0, sek_s: 0, pd_s: 0, total_sek: 0, total_pd: 0 });
  }, [tab1Data]);

  // --- ENGINE TABEL 2 (REKAP WILAYAH DENGAN FILTER STATUS) ---
  const tab2Data = useMemo(() => {
    if (!tab2DataRaw || tab2DataRaw.length === 0) return [];
    
    // Helper fungsi menentukan kolom yg akan ditarik (SEMUA, _n, _s)
    const getSuffix = (baseType) => {
      if (filterStatusTab2 === 'NEGERI') return `${baseType}_n`;
      if (filterStatusTab2 === 'SWASTA') return `${baseType}_s`;
      return baseType; 
    };

    const sekKey = getSuffix('sek');
    const pdKey = getSuffix('pd');

    if (isModeSemua) {
      const mapKab = new Map();
      tab2DataRaw.forEach(row => {
         const kab = row.wilayah;
         if(!mapKab.has(kab)) {
             const init = { wilayah: kab, kecamatan: kab }; 
             JENJANG_KEYS.forEach(k => { init[`${k}_sek`] = 0; init[`${k}_pd`] = 0; });
             mapKab.set(kab, init);
         }
         const aggRow = mapKab.get(kab);
         JENJANG_KEYS.forEach(k => { 
             const baseK = k === 'SLB (Inklusif)' ? 'SLB (Inklusif)' : k;
             aggRow[`${k}_sek`] += (row[`${baseK}_${sekKey}`] || 0); 
             aggRow[`${k}_pd`] += (row[`${baseK}_${pdKey}`] || 0); 
         });
      });
      return Array.from(mapKab.values()).sort((a, b) => {
         const rankA = KABUPATEN_LIST.indexOf(a.wilayah.toUpperCase());
         const rankB = KABUPATEN_LIST.indexOf(b.wilayah.toUpperCase());
         return (rankA !== -1 ? rankA : 99) - (rankB !== -1 ? rankB : 99);
      });
    } else {
      // Pada tingkat kecamatan, remap ke variabel penampung default (_sek, _pd) agar seragam renderingnya
      const filtered = tab2DataRaw.filter(r => r.wilayah === filterWilayah).sort((a,b) => a.kecamatan.localeCompare(b.kecamatan));
      return filtered.map(row => {
        const mappedRow = { ...row };
        JENJANG_KEYS.forEach(k => {
           const baseK = k === 'SLB (Inklusif)' ? 'SLB (Inklusif)' : k;
           mappedRow[`${k}_sek`] = row[`${baseK}_${sekKey}`] || 0;
           mappedRow[`${k}_pd`] = row[`${baseK}_${pdKey}`] || 0;
        });
        return mappedRow;
      });
    }
  }, [tab2DataRaw, filterWilayah, isModeSemua, filterStatusTab2]);

  // --- EXCEL EXPORTS ---
  const handleUnduhTab1 = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ketersediaan Data Utama');
    worksheet.columns = [
      { header: 'Jenjang', key: 'jenjang', width: 20 },
      { header: 'Sekolah (Negeri)', key: 'sek_n', width: 18 },
      { header: 'PD (Negeri)', key: 'pd_n', width: 15 },
      { header: 'Sekolah (Swasta)', key: 'sek_s', width: 18 },
      { header: 'PD (Swasta)', key: 'pd_s', width: 15 },
      { header: 'Total Sekolah', key: 'total_sek', width: 18 },
      { header: 'Total PD', key: 'total_pd', width: 18 },
    ];
    tab1Data.forEach(row => worksheet.addRow(row));
    const totalRow = worksheet.addRow({ jenjang: 'TOTAL KESELURUHAN', ...grandTotalTab1 });
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    totalRow.font = { bold: true };
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Rekap_Sekolah_PD_${filterWilayah}_${selectedYear}.xlsx`;
    link.click();
  };

  const handleUnduhTab2 = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Analisa Rasio');
    worksheet.columns = [
      { header: isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan', key: 'wilayah_label', width: 30 },
      ...JENJANG_KEYS.map(k => ({ header: k, key: k, width: 15 })),
    ];
    tab2Data.forEach(row => {
      const excelRow = { wilayah_label: isModeSemua ? row.wilayah : row.kecamatan };
      JENJANG_KEYS.forEach(k => {
        const sekCount = row[`${k}_sek`];
        const pdCount = row[`${k}_pd`];
        if (sekCount === 0 && pdCount === 0) excelRow[k] = '-';
        else if (sekCount === 0 && pdCount > 0) excelRow[k] = 'Error';
        else excelRow[k] = `1 : ${(pdCount / sekCount).toFixed(0)}`;
      });
      worksheet.addRow(excelRow);
    });
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Analisa_Rasio_PD_${filterWilayah}_${filterStatusTab2}_${selectedYear}.xlsx`;
    link.click();
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center p-20 opacity-60">
       <Loader2 size={64} className="text-blue-500 mb-4 animate-spin" />
       <p className="font-black text-xl text-blue-800 uppercase tracking-widest">Menarik Data Rasio...</p>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center p-20 bg-orange-50 rounded-3xl border-2 border-orange-200 border-dashed text-orange-600">
       <p className="font-black text-lg uppercase tracking-widest text-center">{error}</p>
    </div>
  );

  return (
    <div className="w-full flex flex-col gap-8 animate-in slide-in-from-bottom-8 duration-500">
      
      {/* HEADER & FILTER WILAYAH */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
        <div>
          <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter">Sekolah <span className="text-blue-500">VS</span> Peserta Didik</h2>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Modul Analisa Proporsi & Daya Tampung</p>
        </div>
        <div className="flex items-center bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2 shadow-sm">
          <MapPin size={18} className="text-blue-600 mr-3" />
          <select value={filterWilayah} onChange={(e) => setFilterWilayah(e.target.value)} className="bg-transparent text-sm font-black uppercase text-gray-700 outline-none cursor-pointer min-w-[200px]">
            <option value="SEMUA">SELURUH PROVINSI</option>
            {KABUPATEN_LIST.map(k => (
              <option key={k} value={k}>
                {k === 'SINGKAWANG' || k === 'PONTIANAK' ? 'KOTA' : 'KAB.'} {k}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* TABEL 1 */}
      <div className="bg-white rounded-3xl shadow-md border border-gray-100 overflow-hidden">
        <div className="bg-gray-50 px-6 py-5 border-b border-gray-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <School className="text-blue-600" size={24} />
            <h3 className="font-black text-lg text-gray-800 uppercase tracking-tighter">Tabel 1: Ketersediaan Data Utama</h3>
          </div>
          <button onClick={handleUnduhTab1} className="flex items-center gap-2 text-xs font-black uppercase text-blue-600 bg-blue-100 px-4 py-2 rounded-xl hover:bg-blue-200 transition-colors">
            <Download size={14} /> Unduh
          </button>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-center border-separate border-spacing-y-2">
            <thead className="sticky top-0 bg-white z-10 shadow-sm rounded-xl">
              <tr className="text-[10px] font-black uppercase text-gray-500 bg-gray-50">
                <th className="px-4 py-4 rounded-l-xl w-12">No</th>
                <th className="px-4 py-4 text-left">Jenjang</th>
                <th className="px-4 py-4 text-blue-600 border-l border-gray-200">Sekolah (Negeri)</th>
                <th className="px-4 py-4 text-blue-600">PD (Negeri)</th>
                <th className="px-4 py-4 text-orange-600 border-l border-gray-200">Sekolah (Swasta)</th>
                <th className="px-4 py-4 text-orange-600">PD (Swasta)</th>
                <th className="px-4 py-4 text-gray-800 border-l border-gray-200 bg-gray-100">Total Sekolah</th>
                <th className="px-4 py-4 text-gray-800 rounded-r-xl bg-gray-100">Total PD</th>
              </tr>
            </thead>
            <tbody>
              {tab1Data.map((row, idx) => (
                <tr key={idx} className="bg-white shadow-sm hover:shadow-md transition-all group">
                  <td className="px-4 py-3 rounded-l-xl font-bold text-gray-400 text-xs border-y border-l border-gray-100">{idx + 1}</td>
                  <td className="px-4 py-3 font-black text-gray-800 text-sm uppercase text-left border-y border-gray-100">{row.jenjang}</td>
                  <td className="px-4 py-3 font-bold text-blue-700 bg-blue-50/20 border-y border-l border-gray-100">{row.sek_n.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-blue-700 bg-blue-50/20 border-y border-gray-100">{row.pd_n.toLocaleString()}</td>
                  <td className="px-4 py-3 font-bold text-orange-700 bg-orange-50/20 border-y border-l border-gray-100">{row.sek_s.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-orange-700 bg-orange-50/20 border-y border-gray-100">{row.pd_s.toLocaleString()}</td>
                  <td className="px-4 py-3 font-bold text-gray-700 bg-gray-50 border-y border-l border-gray-100">{row.total_sek.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-gray-800 text-base bg-gray-100 border-y border-r border-gray-100 rounded-r-xl">{row.total_pd.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            {/* TFOOT: BARIS GRAND TOTAL */}
            {tab1Data.length > 0 && (
              <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                <tr className="bg-blue-100 text-center font-black uppercase text-xs border-t-2 border-blue-200">
                  <td colSpan="2" className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-blue-200 text-blue-900">TOTAL {isModeSemua ? 'KAL-BAR' : filterWilayah}</td>
                  <td className="px-4 py-4 text-blue-800 border-y border-blue-200">{grandTotalTab1.sek_n.toLocaleString()}</td>
                  <td className="px-4 py-4 text-blue-900 border-y border-blue-200">{grandTotalTab1.pd_n.toLocaleString()}</td>
                  <td className="px-4 py-4 text-orange-800 border-y border-blue-200">{grandTotalTab1.sek_s.toLocaleString()}</td>
                  <td className="px-4 py-4 text-orange-900 border-y border-blue-200">{grandTotalTab1.pd_s.toLocaleString()}</td>
                  <td className="px-4 py-4 text-blue-950 border-y border-blue-200">{grandTotalTab1.total_sek.toLocaleString()}</td>
                  <td className="px-4 py-4 text-blue-950 text-base border-y border-r border-blue-200 rounded-r-2xl bg-blue-200/50">{grandTotalTab1.total_pd.toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
          {/* INFO WAKTU UPDATE DAPODIK */}
          {lastUpdated && (
             <div className="mt-4 px-2 text-right text-xs font-bold italic text-gray-400">
                Sumber : Data Dapodik Update Pada Tanggal : {lastUpdated}
             </div>
          )}
        </div>
      </div>

      {/* TABEL 2 */}
      <div className="bg-white rounded-3xl shadow-md border border-gray-100 overflow-hidden">
        <div className="bg-blue-900 px-6 py-5 border-b border-blue-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Activity className="text-blue-200" size={24} />
            <h3 className="font-black text-lg text-white uppercase tracking-tighter">Tabel 2: Hasil Analisa Rasio Daya Tampung</h3>
          </div>
          
          {/* FILTER STATUS & TOMBOL UNDUH TABEL 2 */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex items-center bg-white/10 border border-blue-700/50 rounded-xl px-3 py-1.5 shadow-sm transition-all focus-within:ring-2 focus-within:ring-blue-400 w-full md:w-auto">
              <School size={16} className="text-blue-300 mr-2" />
              <select 
                value={filterStatusTab2} 
                onChange={(e) => setFilterStatusTab2(e.target.value)} 
                className="bg-transparent text-xs font-black uppercase text-white outline-none cursor-pointer w-full focus:bg-blue-900"
              >
                <option value="SEMUA" className="bg-blue-900 text-white">Semua Status</option>
                <option value="NEGERI" className="bg-blue-900 text-white">Negeri</option>
                <option value="SWASTA" className="bg-blue-900 text-white">Swasta</option>
              </select>
            </div>
            <button onClick={handleUnduhTab2} className="flex items-center justify-center gap-2 text-xs font-black uppercase text-blue-900 bg-white px-4 py-2 rounded-xl hover:bg-blue-50 transition-colors w-full md:w-auto shrink-0 shadow-sm">
              <Download size={14} /> Unduh
            </button>
          </div>
        </div>
        
        <div className="overflow-x-auto p-4">
          <table className="w-full text-center border-separate border-spacing-y-2">
            <thead className="sticky top-0 bg-white z-10 shadow-sm rounded-xl">
              <tr className="text-[10px] font-black uppercase text-gray-500 bg-blue-50/50">
                <th className="px-4 py-4 rounded-l-xl w-12">No</th>
                <th className="px-4 py-4 text-left">{isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan'}</th>
                {JENJANG_KEYS.map(k => (
                  <th key={k} className="px-2 py-4 text-blue-800 border-l border-blue-100 whitespace-nowrap">{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tab2Data.map((row, idx) => (
                <tr key={idx} className="bg-white shadow-sm hover:shadow-md transition-all group">
                  <td className="px-4 py-4 rounded-l-xl font-bold text-gray-400 text-xs border-y border-l border-gray-100">{idx + 1}</td>
                  <td className="px-4 py-4 font-black text-gray-800 text-sm uppercase text-left border-y border-gray-100 whitespace-nowrap">{isModeSemua ? row.wilayah : row.kecamatan}</td>
                  {JENJANG_KEYS.map((k, kIdx) => {
                    const isLast = kIdx === JENJANG_KEYS.length - 1;
                    return (
                      <td key={k} className={`px-2 py-4 border-y border-l border-gray-100 bg-gray-50/30 text-sm ${isLast ? 'rounded-r-xl border-r' : ''}`}>
                        {renderRatio(row[`${k}_sek`], row[`${k}_pd`], k)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          
          {tab2Data.length === 0 ? (
             <div className="py-20 flex flex-col items-center opacity-30 text-gray-500">
               <Search size={64} className="mb-4" />
               <p className="font-black uppercase tracking-widest text-xl">Tidak Ada Data</p>
             </div>
          ) : (
             <div className="mt-4 px-2 text-right text-xs font-bold italic text-gray-400">
                Sumber : Data Dapodik Update Pada Tanggal : {lastUpdated}
             </div>
          )}
        </div>
      </div>

      {/* INFO BOX */}
      <div className="bg-blue-50 border border-blue-200 p-6 rounded-3xl flex flex-col md:flex-row items-start gap-6 shadow-sm mb-12">
        <div className="bg-blue-600 text-white p-3 rounded-2xl shrink-0 shadow-md"><Info size={28}/></div>
        <div className="text-sm text-blue-900 leading-relaxed w-full">
          <strong className="font-black text-base uppercase tracking-widest block mb-3 text-blue-800">Acuan Permendikdasmen No. 14 Tahun 2026</strong>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3 font-bold opacity-90">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> PAUD: Optimal 30 PD / Sekolah</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> SD: Optimal 168 PD / Sekolah</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> SMP: Optimal 96 PD / Sekolah</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> SMA: Optimal 108 PD / Sekolah</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> SMK: Optimal 108 PD / Sekolah</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> SLB: Optimal 24 PD / Sekolah</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500"></div> NON FORMAL: Optimal 90 PD / Sekolah</div>
          </div>
          <div className="mt-4 pt-4 border-t border-blue-200/50 text-xs italic opacity-80 font-bold">
            * Format Rasio <span className="text-blue-700 font-black">1 : X</span>. Angka <span className="text-blue-700 font-black">1</span> adalah 1 Sekolah, dan <span className="text-red-600 font-black">X</span> adalah Rata-rata PD Aktual. Jumlah Peserta Didik yang optimal ditampung juga tergantung pada faktor ketersediaan PTK dan Ruang Kelas di Sekolah.
          </div>
        </div>
      </div>

    </div>
  );
}