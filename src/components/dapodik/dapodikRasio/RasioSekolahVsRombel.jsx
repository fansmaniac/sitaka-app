import React, { useState, useEffect, useMemo } from 'react';
import { MapPin, Info, Layers, Activity, Search, Download, Loader2, School } from 'lucide-react';
import { db } from '../../../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import ExcelJS from 'exceljs';

// =====================================================================
// UTILITY FUNCTIONS & STANDAR REGULASI
// =====================================================================
const KABUPATEN_LIST = [
  "BENGKAYANG", "KAPUAS HULU", "KAYONG UTARA", "KETAPANG", 
  "KUBU RAYA", "LANDAK", "MELAWI", "MEMPAWAH", "PONTIANAK", 
  "SAMBAS", "SANGGAU", "SEKADAU", "SINGKAWANG", "SINTANG"
];

// PEMISAHAN JENJANG SMA DAN SMK
const JENJANG_KEYS = ['PAUD', 'SD', 'SMP', 'SMA', 'SMK', 'SLB (Inklusif)', 'NON FORMAL'];

// Standar Minimal & Maksimal Rombel per Sekolah
const STANDAR_ROMBEL = {
  'PAUD': { min: 2, max: 16 },
  'SD': { min: 6, max: 24 },
  'SMP': { min: 3, max: 33 },
  'SMA': { min: 3, max: 72 }, 
  'SMK': { min: 3, max: 72 }, 
  'SLB (Inklusif)': { min: 3, max: 30 },
  'NON FORMAL': { min: 3, max: 36 } 
};

// Fungsi hitung angka rasio mentah
const getRawRatio = (sekCount, rombelCount) => {
  if (sekCount === 0) return 0;
  return (rombelCount / sekCount);
};

// Fungsi render UI rasio dengan logika warna
const renderRatio = (sekCount, rombelCount, jenjang) => {
  if (sekCount === 0 && rombelCount === 0) return <span className="text-gray-300 font-normal">-</span>;
  if (sekCount === 0 && rombelCount > 0) return <span className="text-red-500 font-bold text-[10px]">Error (0 Sek)</span>;
  
  const ratio = getRawRatio(sekCount, rombelCount);
  const standar = STANDAR_ROMBEL[jenjang];
  
  let colorClass = 'text-emerald-600'; // IDEAL
  
  if (ratio < standar.min) {
     colorClass = 'text-red-600'; // KURANG dari minimal
  } else if (ratio > standar.max) {
     colorClass = 'text-blue-600'; // MELEBIHI batas maksimal (Overload Rombel)
  }

  // Menggunakan pembulatan 1 angka di belakang koma untuk kemudahan membaca
  return <span className={`font-black ${colorClass} tracking-wider`}>1 : {ratio.toFixed(1)}</span>;
};

// =====================================================================
// MAIN COMPONENT
// =====================================================================
export default function RasioSekolahVsRombel({ selectedYear }) {
  const [filterWilayah, setFilterWilayah] = useState('SEMUA');
  const [filterStatusTab2, setFilterStatusTab2] = useState('SEMUA'); // STATE BARU FILTER STATUS TABEL 2
  
  const [tab2DataRaw, setTab2DataRaw] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(''); // State untuk tanggal update

  // --- FETCH DATA ---
  useEffect(() => {
    const fetchAgregasi = async () => {
      setLoading(true);
      setError(null);
      try {
        const docRef = doc(db, 'dapodik_agregasi', `rasio_sekolah_rombel_${selectedYear}`);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setTab2DataRaw(data.tabel2 || []);
          
          if (data.last_updated) {
            const d = new Date(data.last_updated);
            const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
            setLastUpdated(`${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`);
          } else {
            setLastUpdated('Tidak Diketahui');
          }
        } else {
          setError(`Data rasio Sekolah VS Rombel tahun ${selectedYear} belum dikalkulasi oleh Admin.`);
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

  // --- ENGINE TABEL 1 ---
  const tab1Data = useMemo(() => {
    if (!tab2DataRaw || tab2DataRaw.length === 0) return [];

    const resMap = new Map();
    JENJANG_KEYS.forEach(k => resMap.set(k, { jenjang: k, sek_n: 0, rombel_n: 0, sek_s: 0, rombel_s: 0, total_sek: 0, total_rombel: 0 }));

    tab2DataRaw.forEach(row => {
      if (!isModeSemua && row.wilayah !== filterWilayah) return;

      JENJANG_KEYS.forEach(k => {
        const agg = resMap.get(k);
        const baseK = k === 'SLB (Inklusif)' ? 'SLB (Inklusif)' : k;
        agg.sek_n += (row[`${baseK}_sek_n`] || 0);
        agg.rombel_n += (row[`${baseK}_rombel_n`] || 0);
        agg.sek_s += (row[`${baseK}_sek_s`] || 0);
        agg.rombel_s += (row[`${baseK}_rombel_s`] || 0);
        
        agg.total_sek += (row[`${baseK}_sek`] || 0);
        agg.total_rombel += (row[`${baseK}_rombel`] || 0);
      });
    });

    return Array.from(resMap.values());
  }, [tab2DataRaw, filterWilayah, isModeSemua]);

  // --- LOGIKA GRAND TOTAL TABEL 1 ---
  const grandTotalTab1 = useMemo(() => {
    return tab1Data.reduce((acc, curr) => {
      acc.sek_n += curr.sek_n;
      acc.rombel_n += curr.rombel_n;
      acc.sek_s += curr.sek_s;
      acc.rombel_s += curr.rombel_s;
      acc.total_sek += curr.total_sek;
      acc.total_rombel += curr.total_rombel;
      return acc;
    }, { sek_n: 0, rombel_n: 0, sek_s: 0, rombel_s: 0, total_sek: 0, total_rombel: 0 });
  }, [tab1Data]);

  // --- ENGINE TABEL 2 DENGAN FILTER STATUS SAKTI ---
  const tab2Data = useMemo(() => {
    if (!tab2DataRaw || tab2DataRaw.length === 0) return [];
    
    // Helper fungsi menentukan kolom yg akan ditarik (SEMUA, _n, _s)
    const getSuffix = (baseType) => {
      if (filterStatusTab2 === 'NEGERI') return `${baseType}_n`;
      if (filterStatusTab2 === 'SWASTA') return `${baseType}_s`;
      return baseType; 
    };

    const sekKey = getSuffix('sek');
    const rombelKey = getSuffix('rombel');

    if (isModeSemua) {
      const mapKab = new Map();
      tab2DataRaw.forEach(row => {
         const kab = row.wilayah;
         if(!mapKab.has(kab)) {
             const init = { wilayah: kab, kecamatan: kab }; 
             JENJANG_KEYS.forEach(k => { init[`${k}_sek`] = 0; init[`${k}_rombel`] = 0; });
             mapKab.set(kab, init);
         }
         const aggRow = mapKab.get(kab);
         JENJANG_KEYS.forEach(k => { 
             const baseK = k === 'SLB (Inklusif)' ? 'SLB (Inklusif)' : k;
             aggRow[`${k}_sek`] += (row[`${baseK}_${sekKey}`] || 0); 
             aggRow[`${k}_rombel`] += (row[`${baseK}_${rombelKey}`] || 0); 
         });
      });
      return Array.from(mapKab.values()).sort((a, b) => {
         const rankA = KABUPATEN_LIST.indexOf(a.wilayah.toUpperCase());
         const rankB = KABUPATEN_LIST.indexOf(b.wilayah.toUpperCase());
         return (rankA !== -1 ? rankA : 99) - (rankB !== -1 ? rankB : 99);
      });
    } else {
      // Pada tingkat kecamatan, remap ke variabel penampung default (_sek, _rombel) agar seragam renderingnya
      const filtered = tab2DataRaw.filter(r => r.wilayah === filterWilayah).sort((a,b) => a.kecamatan.localeCompare(b.kecamatan));
      return filtered.map(row => {
        const mappedRow = { ...row };
        JENJANG_KEYS.forEach(k => {
           const baseK = k === 'SLB (Inklusif)' ? 'SLB (Inklusif)' : k;
           mappedRow[`${k}_sek`] = row[`${baseK}_${sekKey}`] || 0;
           mappedRow[`${k}_rombel`] = row[`${baseK}_${rombelKey}`] || 0;
        });
        return mappedRow;
      });
    }
  }, [tab2DataRaw, filterWilayah, isModeSemua, filterStatusTab2]);

  // --- EXCEL ---
  const handleUnduhTab1 = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Rekap Sekolah & Rombel');

    worksheet.columns = [
      { header: 'Jenjang', key: 'jenjang', width: 20 },
      { header: 'Sekolah (Negeri)', key: 'sek_n', width: 18 },
      { header: 'Rombel (Negeri)', key: 'rombel_n', width: 15 },
      { header: 'Sekolah (Swasta)', key: 'sek_s', width: 18 },
      { header: 'Rombel (Swasta)', key: 'rombel_s', width: 15 },
      { header: 'Total Sekolah', key: 'total_sek', width: 18 },
      { header: 'Total Rombel', key: 'total_rombel', width: 18 },
    ];

    tab1Data.forEach(row => worksheet.addRow(row));

    // Tambahkan Baris Total di Excel
    const totalRow = worksheet.addRow({
      jenjang: 'TOTAL KESELURUHAN',
      ...grandTotalTab1
    });

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE11D48' } }; // Rose 600

    totalRow.font = { bold: true, color: { argb: 'FF881337' } }; // Rose 900
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4E6' } }; // Rose 100

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Rekap_Sekolah_Rombel_${filterWilayah}_${selectedYear}.xlsx`;
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
        const rombelCount = row[`${k}_rombel`];
        
        if (sekCount === 0 && rombelCount === 0) excelRow[k] = '-';
        else if (sekCount === 0 && rombelCount > 0) excelRow[k] = 'Error';
        else {
          const ratio = rombelCount / sekCount;
          excelRow[k] = `1 : ${ratio.toFixed(1)}`;
        }
      });
      worksheet.addRow(excelRow);
    });

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE11D48' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Analisa_Rasio_Sekolah_Rombel_${filterWilayah}_${filterStatusTab2}_${selectedYear}.xlsx`;
    link.click();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 opacity-60">
         <Loader2 size={64} className="text-rose-500 mb-4 animate-spin" />
         <p className="font-black text-xl text-rose-800 uppercase tracking-widest">Menarik Data Rasio...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-orange-50 rounded-3xl border-2 border-orange-200 border-dashed text-orange-600">
         <p className="font-black text-lg uppercase tracking-widest text-center">{error}</p>
         <p className="text-sm mt-2 font-bold">Harap minta Admin untuk menjalankan Mesin Kalkulasi di Admin Dashboard.</p>
      </div>
    );
  }

  return (
    <div className="w-full flex flex-col gap-8 animate-in slide-in-from-bottom-8 duration-500">
      
      {/* HEADER & FILTER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-[2rem] shadow-sm border border-gray-100">
        <div>
          <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter">Sekolah <span className="text-rose-500">VS</span> Rombel</h2>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Modul Analisa Ketersediaan Ruang Kelas</p>
        </div>
        <div className="flex items-center bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2 shadow-sm">
          <MapPin size={18} className="text-rose-600 mr-3" />
          <select 
            value={filterWilayah} 
            onChange={(e) => setFilterWilayah(e.target.value)} 
            className="bg-transparent text-sm font-black uppercase text-gray-700 outline-none cursor-pointer min-w-[200px]"
          >
            <option value="SEMUA">SELURUH PROVINSI</option>
            {KABUPATEN_LIST.map(k => <option key={k} value={k}>KAB. {k}</option>)}
          </select>
        </div>
      </div>

      {/* TABEL 1 */}
      <div className="bg-white rounded-3xl shadow-md border border-gray-100 overflow-hidden">
        <div className="bg-gray-50 px-6 py-5 border-b border-gray-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <School className="text-rose-600" size={24} />
            <h3 className="font-black text-lg text-gray-800 uppercase tracking-tighter">Tabel 1: Ketersediaan Data Utama</h3>
          </div>
          <button onClick={handleUnduhTab1} className="flex items-center gap-2 text-xs font-black uppercase text-rose-600 bg-rose-50 px-4 py-2 rounded-xl hover:bg-rose-100 transition-colors">
            <Download size={14} /> Unduh
          </button>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-center border-separate border-spacing-y-2">
            <thead className="sticky top-0 bg-white z-10 shadow-sm rounded-xl">
              <tr className="text-[10px] font-black uppercase text-gray-500 bg-gray-50">
                <th className="px-4 py-4 rounded-l-xl w-12">No</th>
                <th className="px-4 py-4 text-left">Jenjang</th>
                <th className="px-4 py-4 text-rose-600 border-l border-gray-200">Sekolah (Negeri)</th>
                <th className="px-4 py-4 text-rose-600">Rombel (Negeri)</th>
                <th className="px-4 py-4 text-orange-600 border-l border-gray-200">Sekolah (Swasta)</th>
                <th className="px-4 py-4 text-orange-600">Rombel (Swasta)</th>
                <th className="px-4 py-4 text-gray-800 border-l border-gray-200 bg-gray-100">Total Sekolah</th>
                <th className="px-4 py-4 text-gray-800 rounded-r-xl bg-gray-100">Total Rombel</th>
              </tr>
            </thead>
            <tbody>
              {tab1Data.map((row, idx) => (
                <tr key={idx} className="bg-white shadow-sm hover:shadow-md transition-all group">
                  <td className="px-4 py-3 rounded-l-xl font-bold text-gray-400 text-xs border-y border-l border-gray-100">{idx + 1}</td>
                  <td className="px-4 py-3 font-black text-gray-800 text-sm uppercase text-left border-y border-gray-100">{row.jenjang}</td>
                  <td className="px-4 py-3 font-bold text-rose-700 bg-rose-50/30 border-y border-l border-gray-100">{row.sek_n.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-rose-700 bg-rose-50/30 border-y border-gray-100">{row.rombel_n.toLocaleString()}</td>
                  <td className="px-4 py-3 font-bold text-orange-700 bg-orange-50/20 border-y border-l border-gray-100">{row.sek_s.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-orange-700 bg-orange-50/20 border-y border-gray-100">{row.rombel_s.toLocaleString()}</td>
                  <td className="px-4 py-3 font-bold text-gray-700 bg-gray-50 border-y border-l border-gray-100">{row.total_sek.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-gray-800 text-base bg-gray-100 border-y border-r border-gray-100 rounded-r-xl">{row.total_rombel.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            {/* TFOOT: BARIS GRAND TOTAL */}
            {tab1Data.length > 0 && (
              <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                <tr className="bg-rose-100 text-center font-black uppercase text-xs border-t-2 border-rose-200">
                  <td colSpan="2" className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-rose-200 text-rose-900">
                    TOTAL {isModeSemua ? 'KAL-BAR' : filterWilayah}
                  </td>
                  <td className="px-4 py-4 text-rose-800 border-y border-rose-200">{grandTotalTab1.sek_n.toLocaleString()}</td>
                  <td className="px-4 py-4 text-rose-900 border-y border-rose-200">{grandTotalTab1.rombel_n.toLocaleString()}</td>
                  <td className="px-4 py-4 text-orange-800 border-y border-rose-200">{grandTotalTab1.sek_s.toLocaleString()}</td>
                  <td className="px-4 py-4 text-orange-900 border-y border-rose-200">{grandTotalTab1.rombel_s.toLocaleString()}</td>
                  <td className="px-4 py-4 text-rose-950 border-y border-rose-200">{grandTotalTab1.total_sek.toLocaleString()}</td>
                  <td className="px-4 py-4 text-rose-950 text-base border-y border-r border-rose-200 rounded-r-2xl bg-rose-200/50">{grandTotalTab1.total_rombel.toLocaleString()}</td>
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
        <div className="bg-rose-900 px-6 py-5 border-b border-rose-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Activity className="text-rose-200" size={24} />
            <h3 className="font-black text-lg text-white uppercase tracking-tighter">Tabel 2: Hasil Analisa Rasio Sekolah per Rombel</h3>
          </div>
          
          {/* FILTER STATUS & TOMBOL UNDUH TABEL 2 */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex items-center bg-white/10 border border-rose-500/50 rounded-xl px-3 py-1.5 shadow-sm transition-all focus-within:ring-2 focus-within:ring-rose-400 w-full md:w-auto">
              <School size={16} className="text-rose-200 mr-2" />
              <select 
                value={filterStatusTab2} 
                onChange={(e) => setFilterStatusTab2(e.target.value)} 
                className="bg-transparent text-xs font-black uppercase text-white outline-none cursor-pointer w-full [&>option]:bg-rose-800 [&>option]:text-white"
              >
                <option value="SEMUA">Semua Status</option>
                <option value="NEGERI">Negeri</option>
                <option value="SWASTA">Swasta</option>
              </select>
            </div>
            <button onClick={handleUnduhTab2} className="flex items-center justify-center gap-2 text-xs font-black uppercase text-rose-900 bg-white px-4 py-2 rounded-xl hover:bg-rose-50 transition-colors w-full md:w-auto shrink-0 shadow-sm">
              <Download size={14} /> Unduh
            </button>
          </div>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-center border-separate border-spacing-y-2">
            <thead className="sticky top-0 bg-white z-10 shadow-sm rounded-xl">
              <tr className="text-[10px] font-black uppercase text-gray-500 bg-rose-50/50">
                <th className="px-4 py-4 rounded-l-xl w-12">No</th>
                <th className="px-4 py-4 text-left">{isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan'}</th>
                {JENJANG_KEYS.map(k => (
                  <th key={k} className="px-2 py-4 text-rose-800 border-l border-rose-100 whitespace-nowrap">{k}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tab2Data.map((row, idx) => (
                <tr key={idx} className="bg-white shadow-sm hover:shadow-md transition-all group">
                  <td className="px-4 py-4 rounded-l-xl font-bold text-gray-400 text-xs border-y border-l border-gray-100">{idx + 1}</td>
                  <td className="px-4 py-4 font-black text-gray-800 text-sm uppercase text-left border-y border-gray-100 whitespace-nowrap">
                    {isModeSemua ? row.wilayah : row.kecamatan}
                  </td>
                  {JENJANG_KEYS.map((k, kIdx) => {
                    const isLast = kIdx === JENJANG_KEYS.length - 1;
                    return (
                      <td key={k} className={`px-2 py-4 border-y border-l border-gray-100 bg-gray-50/30 text-sm ${isLast ? 'rounded-r-xl border-r' : ''}`}>
                        {renderRatio(row[`${k}_sek`], row[`${k}_rombel`], k)}
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
      <div className="bg-rose-50 border border-rose-200 p-6 rounded-3xl flex flex-col md:flex-row items-start gap-6 shadow-sm mb-12">
        <div className="bg-rose-600 text-white p-3 rounded-2xl shrink-0 shadow-md"><Layers size={28}/></div>
        <div className="text-sm text-rose-900 leading-relaxed w-full">
          <strong className="font-black text-base uppercase tracking-widest block mb-3 text-rose-800">Acuan Permendikdasmen No. 14 Tahun 2026</strong>
          <p className="font-medium opacity-90 mb-3">
            Aturan Standar Minimal dan Maksimal Rombongan Belajar (Rombel) dalam 1 Sekolah:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3 font-bold opacity-90">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-rose-500"></div> PAUD: Min 2 - Max 16 Rombel</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-rose-500"></div> SD: Min 6 - Max 24 Rombel</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-rose-500"></div> SMP: Min 3 - Max 33 Rombel</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-rose-500"></div> SMA: Min 3 - Max 72 Rombel</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-rose-500"></div> SMK: Min 3 - Max 72 Rombel</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-rose-500"></div> SLB: Min 3 - Max 30 Rombel</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-rose-500"></div> NON FORMAL: Min 3 - Max 36 Rombel</div>
          </div>
          <div className="mt-4 pt-4 border-t border-rose-200/50 text-xs italic opacity-80 font-bold">
            * Format Rasio <span className="text-rose-700 font-black">1 : X</span>. Angka <span className="text-rose-700 font-black">1</span> adalah 1 Sekolah, dan <span className="text-rose-700 font-black">X</span> adalah Jumlah Rombel. <br/>
            Warna <span className="text-emerald-600 font-black">Hijau</span> = Ideal (Dalam rentang Min-Max). Warna <span className="text-red-600 font-black">Merah</span> = Kekurangan Rombel (Di bawah minimal). Warna <span className="text-blue-600 font-black">Biru</span> = Overload (Melebihi batas maksimal sekolah).
          </div>
        </div>
      </div>

    </div>
  );
}