import React, { useState, useEffect, useMemo } from 'react';
import { MapPin, Info, Search, Download, Loader2, Building, Activity, School } from 'lucide-react';
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

// PEMISAHAN JENJANG (PAUD DIUBAH MENJADI KHUSUS TK)
const JENJANG_KEYS = ['TK', 'SD', 'SMP', 'SMA', 'SMK', 'SLB (Inklusif)', 'NON FORMAL'];

// Fungsi hitung angka rasio mentah (Jumlah Kelas / Jumlah Rombel)
const getRawRatio = (rombelCount, kelasCount) => {
  if (rombelCount === 0) return 0;
  return (kelasCount / rombelCount);
};

// Fungsi render UI rasio dengan logika warna
const renderRatio = (rombelCount, kelasCount) => {
  if (rombelCount === 0 && kelasCount === 0) return <span className="text-gray-300 font-normal">-</span>;
  if (rombelCount === 0 && kelasCount > 0) return <span className="text-red-500 font-bold text-[10px]">Error (0 Rombel)</span>;
  
  const ratio = getRawRatio(rombelCount, kelasCount);
  
  let colorClass = 'text-emerald-600'; // IDEAL (1 Rombel = 1 Kelas)
  
  if (ratio < 1.0) {
    colorClass = 'text-red-600'; // KURANG RUANG KELAS (Kelas lebih sedikit dari Rombel)
  } else if (ratio > 1.2) {
    colorClass = 'text-blue-600'; // SURPLUS KELAS
  }

  return <span className={`font-black ${colorClass} tracking-wider`}>1 : {ratio.toFixed(1)}</span>;
};

// =====================================================================
// MAIN COMPONENT
// =====================================================================
export default function RasioRombelVsKelas({ selectedYear }) {
  const [filterWilayah, setFilterWilayah] = useState('SEMUA');
  const [filterStatusTab2, setFilterStatusTab2] = useState('SEMUA'); // STATE BARU FILTER STATUS TABEL 2
  
  const [tab2DataRaw, setTab2DataRaw] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(''); // State untuk tanggal update

  // --- FETCH DATA PRE-CALCULATED DARI FIREBASE ---
  useEffect(() => {
    const fetchAgregasi = async () => {
      setLoading(true);
      setError(null);
      try {
        const docRef = doc(db, 'dapodik_agregasi', `rasio_rombel_kelas_${selectedYear}`);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setTab2DataRaw(data.tabel2 || []);
          
          // Format tanggal last_updated
          if (data.last_updated) {
            const d = new Date(data.last_updated);
            const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
            setLastUpdated(`${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()} Pukul ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
          } else {
            setLastUpdated('Tidak Diketahui');
          }
        } else {
          setError(`Data rasio Rombel VS Ruang Kelas tahun ${selectedYear} belum dikalkulasi oleh Admin.`);
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

  // =====================================================================
  // DATA ENGINE (TABEL 1)
  // =====================================================================
  const tab1Data = useMemo(() => {
    if (!tab2DataRaw || tab2DataRaw.length === 0) return [];

    const resMap = new Map();
    // Tambahkan variabel total_sek
    JENJANG_KEYS.forEach(k => resMap.set(k, { jenjang: k, rombel_n: 0, kelas_n: 0, rombel_s: 0, kelas_s: 0, total_rombel: 0, total_kelas: 0, total_sek: 0 }));

    tab2DataRaw.forEach(row => {
      if (!isModeSemua && row.wilayah !== filterWilayah) return;

      JENJANG_KEYS.forEach(k => {
        const agg = resMap.get(k);
        const baseK = k === 'SLB (Inklusif)' ? 'SLB (Inklusif)' : k;
        agg.rombel_n += (row[`${baseK}_rombel_n`] || 0);
        agg.kelas_n += (row[`${baseK}_kelas_n`] || 0);
        agg.rombel_s += (row[`${baseK}_rombel_s`] || 0);
        agg.kelas_s += (row[`${baseK}_kelas_s`] || 0);
        
        agg.total_rombel += (row[`${baseK}_rombel`] || 0);
        agg.total_kelas += (row[`${baseK}_kelas`] || 0);
        agg.total_sek += (row[`${baseK}_sek`] || 0); // Akumulasi Total Sekolah
      });
    });

    return Array.from(resMap.values());
  }, [tab2DataRaw, filterWilayah, isModeSemua]);

  // --- LOGIKA GRAND TOTAL TABEL 1 ---
  const grandTotalTab1 = useMemo(() => {
    return tab1Data.reduce((acc, curr) => {
      acc.rombel_n += curr.rombel_n;
      acc.kelas_n += curr.kelas_n;
      acc.rombel_s += curr.rombel_s;
      acc.kelas_s += curr.kelas_s;
      acc.total_rombel += curr.total_rombel;
      acc.total_kelas += curr.total_kelas;
      acc.total_sek += curr.total_sek; // Akumulasi Grand Total Sekolah
      return acc;
    }, { rombel_n: 0, kelas_n: 0, rombel_s: 0, kelas_s: 0, total_rombel: 0, total_kelas: 0, total_sek: 0 });
  }, [tab1Data]);


  // =====================================================================
  // DATA ENGINE (TABEL 2) DENGAN FILTER STATUS SAKTI
  // =====================================================================
  const tab2Data = useMemo(() => {
    if (!tab2DataRaw || tab2DataRaw.length === 0) return [];
    
    // Helper fungsi menentukan kolom yg akan ditarik (SEMUA, _n, _s)
    const getSuffix = (baseType) => {
      if (filterStatusTab2 === 'NEGERI') return `${baseType}_n`;
      if (filterStatusTab2 === 'SWASTA') return `${baseType}_s`;
      return baseType; 
    };

    const rombelKey = getSuffix('rombel');
    const kelasKey = getSuffix('kelas');

    if (isModeSemua) {
      const mapKab = new Map();
      tab2DataRaw.forEach(row => {
         const kab = row.wilayah;
         if(!mapKab.has(kab)) {
             const init = { wilayah: kab, kecamatan: kab }; 
             JENJANG_KEYS.forEach(k => { init[`${k}_rombel`] = 0; init[`${k}_kelas`] = 0; });
             mapKab.set(kab, init);
         }
         const aggRow = mapKab.get(kab);
         JENJANG_KEYS.forEach(k => { 
             const baseK = k === 'SLB (Inklusif)' ? 'SLB (Inklusif)' : k;
             aggRow[`${k}_rombel`] += (row[`${baseK}_${rombelKey}`] || 0); 
             aggRow[`${k}_kelas`] += (row[`${baseK}_${kelasKey}`] || 0); 
         });
      });
      return Array.from(mapKab.values()).sort((a, b) => {
         const rankA = KABUPATEN_LIST.indexOf(a.wilayah.toUpperCase());
         const rankB = KABUPATEN_LIST.indexOf(b.wilayah.toUpperCase());
         return (rankA !== -1 ? rankA : 99) - (rankB !== -1 ? rankB : 99);
      });
    } else {
      // Pada tingkat kecamatan, remap ke variabel penampung default (_rombel, _kelas) agar seragam renderingnya
      const filtered = tab2DataRaw.filter(r => r.wilayah === filterWilayah).sort((a,b) => a.kecamatan.localeCompare(b.kecamatan));
      return filtered.map(row => {
        const mappedRow = { ...row };
        JENJANG_KEYS.forEach(k => {
           const baseK = k === 'SLB (Inklusif)' ? 'SLB (Inklusif)' : k;
           mappedRow[`${k}_rombel`] = row[`${baseK}_${rombelKey}`] || 0;
           mappedRow[`${k}_kelas`] = row[`${baseK}_${kelasKey}`] || 0;
        });
        return mappedRow;
      });
    }
  }, [tab2DataRaw, filterWilayah, isModeSemua, filterStatusTab2]);

  // =====================================================================
  // EXCEL EXPORTS
  // =====================================================================
  const handleUnduhTab1 = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ketersediaan Rombel vs Kelas');

    worksheet.columns = [
      { header: 'Jenjang', key: 'jenjang', width: 20 },
      { header: 'Rombel (Negeri)', key: 'rombel_n', width: 18 },
      { header: 'Kelas (Negeri)', key: 'kelas_n', width: 15 },
      { header: 'Rombel (Swasta)', key: 'rombel_s', width: 18 },
      { header: 'Kelas (Swasta)', key: 'kelas_s', width: 15 },
      { header: 'Total Rombel', key: 'total_rombel', width: 18 },
      { header: 'Total Kelas', key: 'total_kelas', width: 18 },
      { header: 'Total Sekolah', key: 'total_sek', width: 18 }, // Tambahan kolom Export
    ];

    tab1Data.forEach(row => worksheet.addRow(row));

    const totalRow = worksheet.addRow({
      jenjang: 'TOTAL KESELURUHAN',
      ...grandTotalTab1
    });

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } }; // Amber 600

    totalRow.font = { bold: true, color: { argb: 'FF78350F' } }; // Amber 900
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Amber 100

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Ketersediaan_Rombel_Kelas_${filterWilayah}_${selectedYear}.xlsx`;
    link.click();
  };

  const handleUnduhTab2 = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Analisa Rasio Kelas per Rombel');

    worksheet.columns = [
      { header: isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan', key: 'wilayah_label', width: 30 },
      ...JENJANG_KEYS.map(k => ({ header: k, key: k, width: 15 })),
    ];

    tab2Data.forEach(row => {
      const excelRow = { wilayah_label: isModeSemua ? row.wilayah : row.kecamatan };
      JENJANG_KEYS.forEach(k => {
        const rombelCount = row[`${k}_rombel`];
        const kelasCount = row[`${k}_kelas`];
        
        if (rombelCount === 0 && kelasCount === 0) excelRow[k] = '-';
        else if (rombelCount === 0 && kelasCount > 0) excelRow[k] = 'Error (0 Rombel)';
        else {
          const ratio = getRawRatio(rombelCount, kelasCount);
          excelRow[k] = `1 : ${ratio.toFixed(1)}`;
        }
      });
      worksheet.addRow(excelRow);
    });

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Analisa_Rasio_Kelas_per_Rombel_${filterWilayah}_${filterStatusTab2}_${selectedYear}.xlsx`;
    link.click();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 opacity-60">
         <Loader2 size={64} className="text-amber-500 mb-4 animate-spin" />
         <p className="font-black text-xl text-amber-800 uppercase tracking-widest">Menarik Data Rasio Kelas...</p>
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
          <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter">Rombel <span className="text-amber-500">VS</span> Ruang Kelas</h2>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Modul Analisa Ketersediaan Ruang Belajar Fisik</p>
        </div>
        <div className="flex items-center bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2 shadow-sm">
          <MapPin size={18} className="text-amber-600 mr-3" />
          <select 
            value={filterWilayah} 
            onChange={(e) => setFilterWilayah(e.target.value)} 
            className="bg-transparent text-sm font-black uppercase text-gray-700 outline-none cursor-pointer min-w-[200px]"
          >
            <option value="SEMUA">SELURUH PROVINSI</option>
            {KABUPATEN_LIST.map(k => (
              <option key={k} value={k}>
                {k === 'SINGKAWANG' || k === 'PONTIANAK' ? 'KOTA' : 'KAB.'} {k}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* TABEL 1: REKAPITULASI JUMLAH */}
      <div className="bg-white rounded-3xl shadow-md border border-gray-100 overflow-hidden">
        <div className="bg-gray-50 px-6 py-5 border-b border-gray-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Building className="text-amber-600" size={24} />
            <h3 className="font-black text-lg text-gray-800 uppercase tracking-tighter">Tabel 1: Ketersediaan Data Utama</h3>
          </div>
          <button onClick={handleUnduhTab1} className="flex items-center gap-2 text-xs font-black uppercase text-amber-600 bg-amber-50 px-4 py-2 rounded-xl hover:bg-amber-100 transition-colors">
            <Download size={14} /> Unduh
          </button>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-center border-separate border-spacing-y-2">
            <thead className="sticky top-0 bg-white z-10 shadow-sm rounded-xl">
              <tr className="text-[10px] font-black uppercase text-gray-500 bg-gray-50">
                <th className="px-4 py-4 rounded-l-xl w-12">No</th>
                <th className="px-4 py-4 text-left">Jenjang</th>
                <th className="px-4 py-4 text-amber-600 border-l border-gray-200">Rombel (Negeri)</th>
                <th className="px-4 py-4 text-amber-600">Kelas (Negeri)</th>
                <th className="px-4 py-4 text-orange-600 border-l border-gray-200">Rombel (Swasta)</th>
                <th className="px-4 py-4 text-orange-600">Kelas (Swasta)</th>
                <th className="px-4 py-4 text-gray-800 border-l border-gray-200 bg-gray-100">Total Rombel</th>
                <th className="px-4 py-4 text-gray-800 border-l border-gray-200 bg-gray-100">Total Kelas</th>
                <th className="px-4 py-4 text-blue-800 rounded-r-xl bg-blue-50/50 border-l border-blue-100">Total Sekolah</th>
              </tr>
            </thead>
            <tbody>
              {tab1Data.map((row, idx) => (
                <tr key={idx} className="bg-white shadow-sm hover:shadow-md transition-all group">
                  <td className="px-4 py-3 rounded-l-xl font-bold text-gray-400 text-xs border-y border-l border-gray-100">{idx + 1}</td>
                  <td className="px-4 py-3 font-black text-gray-800 text-sm uppercase text-left border-y border-gray-100">{row.jenjang}</td>
                  <td className="px-4 py-3 font-bold text-amber-700 bg-amber-50/30 border-y border-l border-gray-100">{row.rombel_n.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-amber-700 bg-amber-50/30 border-y border-gray-100">{row.kelas_n.toLocaleString()}</td>
                  <td className="px-4 py-3 font-bold text-orange-700 bg-orange-50/20 border-y border-l border-gray-100">{row.rombel_s.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-orange-700 bg-orange-50/20 border-y border-gray-100">{row.kelas_s.toLocaleString()}</td>
                  <td className="px-4 py-3 font-bold text-gray-700 bg-gray-50 border-y border-l border-gray-100">{row.total_rombel.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-gray-800 text-base bg-gray-100 border-y border-l border-gray-100">{row.total_kelas.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-blue-700 text-base bg-blue-50/30 border-y border-x border-gray-100 rounded-r-xl">{row.total_sek.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            {/* TFOOT: BARIS GRAND TOTAL */}
            {tab1Data.length > 0 && (
              <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                <tr className="bg-amber-100 text-center font-black uppercase text-xs border-t-2 border-amber-200">
                  <td colSpan="2" className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-amber-200 text-amber-900">
                    TOTAL {isModeSemua ? 'KAL-BAR' : filterWilayah}
                  </td>
                  <td className="px-4 py-4 text-amber-800 border-y border-amber-200">{grandTotalTab1.rombel_n.toLocaleString()}</td>
                  <td className="px-4 py-4 text-amber-900 border-y border-amber-200">{grandTotalTab1.kelas_n.toLocaleString()}</td>
                  <td className="px-4 py-4 text-orange-800 border-y border-amber-200">{grandTotalTab1.rombel_s.toLocaleString()}</td>
                  <td className="px-4 py-4 text-orange-900 border-y border-amber-200">{grandTotalTab1.kelas_s.toLocaleString()}</td>
                  <td className="px-4 py-4 text-amber-950 border-y border-l border-amber-200">{grandTotalTab1.total_rombel.toLocaleString()}</td>
                  <td className="px-4 py-4 text-amber-950 text-base border-y border-l border-amber-200 bg-amber-200/50">{grandTotalTab1.total_kelas.toLocaleString()}</td>
                  <td className="px-4 py-4 text-blue-900 text-base border-y border-x border-blue-200 rounded-r-2xl bg-blue-200/60">{grandTotalTab1.total_sek.toLocaleString()}</td>
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

      {/* TABEL 2: ANALISA RASIO */}
      <div className="bg-white rounded-3xl shadow-md border border-gray-100 overflow-hidden">
        <div className="bg-amber-600 px-6 py-5 border-b border-amber-700 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Activity className="text-amber-100" size={24} />
            <h3 className="font-black text-lg text-white uppercase tracking-tighter">Tabel 2: Hasil Analisa Ketercukupan Ruang Kelas</h3>
          </div>
          
          {/* FILTER STATUS & TOMBOL UNDUH TABEL 2 */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="flex items-center bg-white/10 border border-amber-500/50 rounded-xl px-3 py-1.5 shadow-sm transition-all focus-within:ring-2 focus-within:ring-amber-400 w-full md:w-auto">
              <School size={16} className="text-amber-200 mr-2" />
              <select 
                value={filterStatusTab2} 
                onChange={(e) => setFilterStatusTab2(e.target.value)} 
                className="bg-transparent text-xs font-black uppercase text-white outline-none cursor-pointer w-full [&>option]:bg-amber-800 [&>option]:text-white"
              >
                <option value="SEMUA">Semua Status</option>
                <option value="NEGERI">Negeri</option>
                <option value="SWASTA">Swasta</option>
              </select>
            </div>
            <button onClick={handleUnduhTab2} className="flex items-center justify-center gap-2 text-xs font-black uppercase text-amber-900 bg-white px-4 py-2 rounded-xl hover:bg-amber-50 transition-colors w-full md:w-auto shrink-0 shadow-sm">
              <Download size={14} /> Unduh
            </button>
          </div>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-center border-separate border-spacing-y-2">
            <thead className="sticky top-0 bg-white z-10 shadow-sm rounded-xl">
              <tr className="text-[10px] font-black uppercase text-gray-500 bg-amber-50/50">
                <th className="px-4 py-4 rounded-l-xl w-12">No</th>
                <th className="px-4 py-4 text-left">{isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan'}</th>
                {JENJANG_KEYS.map(k => (
                  <th key={k} className="px-2 py-4 text-amber-800 border-l border-amber-100 whitespace-nowrap">{k}</th>
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
                        {renderRatio(row[`${k}_rombel`], row[`${k}_kelas`], k)}
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
      <div className="bg-amber-50 border border-amber-200 p-6 rounded-3xl flex flex-col md:flex-row items-start gap-6 shadow-sm mb-12">
        <div className="bg-amber-600 text-white p-3 rounded-2xl shrink-0 shadow-md"><Info size={28}/></div>
        <div className="text-sm text-amber-900 leading-relaxed w-full">
          <strong className="font-black text-base uppercase tracking-widest block mb-3 text-amber-800">Acuan Standar Minimum Fasilitas Kelas</strong>
          <p className="font-medium opacity-90 mb-3">
            Berdasarkan prinsip optimalisasi pembelajaran, idealnya setiap rombongan belajar (rombel) menempati satu ruang kelas fisik yang layak.
          </p>
          <div className="grid grid-cols-1 font-bold opacity-90">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-amber-500"></div> Rasio Ideal = 1 Rombel : 1 Ruang Kelas.</div>
          </div>
          <div className="mt-4 pt-4 border-t border-amber-200/50 text-xs italic opacity-80 font-bold">
            * Format Rasio <span className="text-amber-700 font-black">1 : X</span>. Angka <span className="text-amber-700 font-black">1</span> mewakili 1 Rombel, dan <span className="text-amber-700 font-black">X</span> adalah rasio ketersediaan Ruang Kelas Fisik.<br/>
            Warna <span className="text-red-600 font-black">Merah</span> = Kurang Kelas (Jumlah rombel lebih besar dari jumlah kelas, terjadi shift/numpang). Warna <span className="text-emerald-600 font-black">Hijau</span> = Ideal (Minimal 1 Kelas per Rombel).
          </div>
        </div>
      </div>

    </div>
  );
}