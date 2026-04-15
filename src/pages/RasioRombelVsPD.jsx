import React, { useState, useEffect, useMemo } from 'react';
import { MapPin, Info, Layers, Activity, Search, Download, Loader2 } from 'lucide-react';
import { db } from '../firebase/config';
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

const JENJANG_KEYS = ['PAUD', 'SD', 'SMP', 'SMA/SMK', 'SLB (Inklusif)', 'NON FORMAL'];

// KAPASITAS MAKSIMAL PD PER 1 ROMBEL
const MAX_PD_PER_ROMBEL = {
  'PAUD': 15,          
  'SD': 28,            
  'SMP': 32,           
  'SMA/SMK': 36,       
  'SLB (Inklusif)': 8, 
  'NON FORMAL': 30     
};

// Fungsi hitung angka rasio mentah
const getRawRatio = (rombelCount, pdCount) => {
  if (rombelCount === 0) return 0;
  return (pdCount / rombelCount);
};

// Fungsi render UI rasio dengan logika warna
const renderRatio = (rombelCount, pdCount, jenjang) => {
  if (rombelCount === 0 && pdCount === 0) return <span className="text-gray-300 font-normal">-</span>;
  if (rombelCount === 0 && pdCount > 0) return <span className="text-red-500 font-bold text-[10px]">Overload (0 Rombel)</span>;
  
  const ratio = getRawRatio(rombelCount, pdCount);
  const maxCapacity = MAX_PD_PER_ROMBEL[jenjang];
  const minCapacity = maxCapacity * 0.4; // Kita anggap kelas sepi jika kurang dari 40% kapasitas
  
  let colorClass = 'text-emerald-600'; // IDEAL
  
  if (ratio > maxCapacity) {
    colorClass = 'text-red-600'; // OVERLOAD (Terlalu padat)
  } else if (ratio < minCapacity) {
    colorClass = 'text-blue-600'; // KELAS SEPI
  }

  // Menggunakan pembulatan 0 angka di belakang koma untuk kemudahan membaca (misal 1 : 28)
  return <span className={`font-black ${colorClass} tracking-wider`}>1 : {ratio.toFixed(0)}</span>;
};

// =====================================================================
// MAIN COMPONENT
// =====================================================================
export default function RasioRombelVsPD({ selectedYear }) {
  const [filterWilayah, setFilterWilayah] = useState('SEMUA');
  
  const [tab2DataRaw, setTab2DataRaw] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // --- FETCH DATA PRE-CALCULATED DARI FIREBASE ---
  useEffect(() => {
    const fetchAgregasi = async () => {
      setLoading(true);
      setError(null);
      try {
        const docRef = doc(db, 'dapodik_agregasi', `rasio_rombel_pd_${selectedYear}`);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setTab2DataRaw(data.tabel2 || []);
        } else {
          setError(`Data rasio Rombel VS Peserta Didik tahun ${selectedYear} belum dikalkulasi oleh Admin.`);
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
    JENJANG_KEYS.forEach(k => resMap.set(k, { jenjang: k, rombel_n: 0, pd_n: 0, rombel_s: 0, pd_s: 0, total_rombel: 0, total_pd: 0 }));

    tab2DataRaw.forEach(row => {
      if (!isModeSemua && row.wilayah !== filterWilayah) return;

      JENJANG_KEYS.forEach(k => {
        const agg = resMap.get(k);
        agg.rombel_n += (row[`${k}_rombel_n`] || 0);
        agg.pd_n += (row[`${k}_pd_n`] || 0);
        agg.rombel_s += (row[`${k}_rombel_s`] || 0);
        agg.pd_s += (row[`${k}_pd_s`] || 0);
        
        agg.total_rombel += (row[`${k}_rombel`] || 0);
        agg.total_pd += (row[`${k}_pd`] || 0);
      });
    });

    return Array.from(resMap.values());
  }, [tab2DataRaw, filterWilayah, isModeSemua]);

  // HITUNG GRAND TOTAL TABEL 1
  const grandTotalTab1 = useMemo(() => {
    return tab1Data.reduce((acc, curr) => {
      acc.rombel_n += curr.rombel_n;
      acc.pd_n += curr.pd_n;
      acc.rombel_s += curr.rombel_s;
      acc.pd_s += curr.pd_s;
      acc.total_rombel += curr.total_rombel;
      acc.total_pd += curr.total_pd;
      return acc;
    }, { rombel_n: 0, pd_n: 0, rombel_s: 0, pd_s: 0, total_rombel: 0, total_pd: 0 });
  }, [tab1Data]);


  // =====================================================================
  // DATA ENGINE (TABEL 2)
  // =====================================================================
  const tab2Data = useMemo(() => {
    if (!tab2DataRaw || tab2DataRaw.length === 0) return [];
    
    if (isModeSemua) {
      const mapKab = new Map();
      tab2DataRaw.forEach(row => {
         const kab = row.wilayah;
         if(!mapKab.has(kab)) {
             const init = { wilayah: kab, kecamatan: kab }; 
             JENJANG_KEYS.forEach(k => { init[`${k}_rombel`] = 0; init[`${k}_pd`] = 0; });
             mapKab.set(kab, init);
         }
         const aggRow = mapKab.get(kab);
         JENJANG_KEYS.forEach(k => { 
             aggRow[`${k}_rombel`] += (row[`${k}_rombel`] || 0); 
             aggRow[`${k}_pd`] += (row[`${k}_pd`] || 0); 
         });
      });
      return Array.from(mapKab.values()).sort((a, b) => {
         const rankA = KABUPATEN_LIST.indexOf(a.wilayah.toUpperCase());
         const rankB = KABUPATEN_LIST.indexOf(b.wilayah.toUpperCase());
         return (rankA !== -1 ? rankA : 99) - (rankB !== -1 ? rankB : 99);
      });
    } else {
      return tab2DataRaw.filter(r => r.wilayah === filterWilayah).sort((a,b) => a.kecamatan.localeCompare(b.kecamatan));
    }
  }, [tab2DataRaw, filterWilayah, isModeSemua]);

  // =====================================================================
  // EXCEL EXPORTS
  // =====================================================================
  const handleUnduhTab1 = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Ketersediaan Data Rombel');

    worksheet.columns = [
      { header: 'Jenjang', key: 'jenjang', width: 20 },
      { header: 'Rombel (Negeri)', key: 'rombel_n', width: 18 },
      { header: 'PD (Negeri)', key: 'pd_n', width: 15 },
      { header: 'Rombel (Swasta)', key: 'rombel_s', width: 18 },
      { header: 'PD (Swasta)', key: 'pd_s', width: 15 },
      { header: 'Total Rombel', key: 'total_rombel', width: 18 },
      { header: 'Total PD', key: 'total_pd', width: 18 },
    ];

    tab1Data.forEach(row => worksheet.addRow(row));

    // Tambahkan Baris Total di Excel
    const totalRow = worksheet.addRow({
      jenjang: 'TOTAL KESELURUHAN',
      ...grandTotalTab1
    });

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9333EA' } };
    
    totalRow.font = { bold: true, color: { argb: 'FF581C87' } }; // Purple 900
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3E8FF' } }; // Purple 100

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Ketersediaan_Rombel_PD_${filterWilayah}_${selectedYear}.xlsx`;
    link.click();
  };

  const handleUnduhTab2 = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Analisa Rasio Kepadatan');

    worksheet.columns = [
      { header: isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan', key: 'wilayah_label', width: 30 },
      ...JENJANG_KEYS.map(k => ({ header: k, key: k, width: 15 })),
    ];

    tab2Data.forEach(row => {
      const excelRow = { wilayah_label: isModeSemua ? row.wilayah : row.kecamatan };
      JENJANG_KEYS.forEach(k => {
        const rombelCount = row[`${k}_rombel`];
        const pdCount = row[`${k}_pd`];
        
        if (rombelCount === 0 && pdCount === 0) excelRow[k] = '-';
        else if (rombelCount === 0 && pdCount > 0) excelRow[k] = 'Overload (0 Rombel)';
        else {
          const ratio = getRawRatio(rombelCount, pdCount, k);
          excelRow[k] = `1 : ${ratio.toFixed(0)}`;
        }
      });
      worksheet.addRow(excelRow);
    });

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9333EA' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Analisa_Rasio_Kepadatan_Rombel_${filterWilayah}_${selectedYear}.xlsx`;
    link.click();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 opacity-60">
         <Loader2 size={64} className="text-purple-500 mb-4 animate-spin" />
         <p className="font-black text-xl text-purple-800 uppercase tracking-widest">Menarik Data Rasio Kepadatan...</p>
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
          <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter">Rombel <span className="text-orange-500">VS</span> Peserta Didik</h2>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Modul Analisa Kepadatan Kelas</p>
        </div>
        <div className="flex items-center bg-gray-50 border border-gray-200 rounded-2xl px-4 py-2 shadow-sm">
          <MapPin size={18} className="text-orange-600 mr-3" />
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
            <Layers className="text-purple-600" size={24} />
            <h3 className="font-black text-lg text-gray-800 uppercase tracking-tighter">Tabel 1: Ketersediaan Data Rombel</h3>
          </div>
          <button onClick={handleUnduhTab1} className="flex items-center gap-2 text-xs font-black uppercase text-purple-600 bg-purple-50 px-4 py-2 rounded-xl hover:bg-purple-100 transition-colors">
            <Download size={14} /> Unduh
          </button>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-center border-separate border-spacing-y-2">
            <thead className="sticky top-0 bg-white z-10 shadow-sm rounded-xl">
              <tr className="text-[10px] font-black uppercase text-gray-500 bg-gray-50">
                <th className="px-4 py-4 rounded-l-xl w-12">No</th>
                <th className="px-4 py-4 text-left">Jenjang</th>
                <th className="px-4 py-4 text-purple-600 border-l border-gray-200">Rombel (Negeri)</th>
                <th className="px-4 py-4 text-purple-600">PD (Negeri)</th>
                <th className="px-4 py-4 text-orange-600 border-l border-gray-200">Rombel (Swasta)</th>
                <th className="px-4 py-4 text-orange-600">PD (Swasta)</th>
                <th className="px-4 py-4 text-gray-800 border-l border-gray-200 bg-gray-100">Total Rombel</th>
                <th className="px-4 py-4 text-gray-800 rounded-r-xl bg-gray-100">Total PD</th>
              </tr>
            </thead>
            <tbody>
              {tab1Data.map((row, idx) => (
                <tr key={idx} className="bg-white shadow-sm hover:shadow-md transition-all group">
                  <td className="px-4 py-3 rounded-l-xl font-bold text-gray-400 text-xs border-y border-l border-gray-100">{idx + 1}</td>
                  <td className="px-4 py-3 font-black text-gray-800 text-sm uppercase text-left border-y border-gray-100">{row.jenjang}</td>
                  <td className="px-4 py-3 font-bold text-purple-700 bg-purple-50/30 border-y border-l border-gray-100">{row.rombel_n.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-purple-700 bg-purple-50/30 border-y border-gray-100">{row.pd_n.toLocaleString()}</td>
                  <td className="px-4 py-3 font-bold text-orange-700 bg-orange-50/20 border-y border-l border-gray-100">{row.rombel_s.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-orange-700 bg-orange-50/20 border-y border-gray-100">{row.pd_s.toLocaleString()}</td>
                  <td className="px-4 py-3 font-bold text-gray-700 bg-gray-50 border-y border-l border-gray-100">{row.total_rombel.toLocaleString()}</td>
                  <td className="px-4 py-3 font-black text-gray-800 text-base bg-gray-100 border-y border-r border-gray-100 rounded-r-xl">{row.total_pd.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            {/* BARIS TOTAL KESELURUHAN */}
            {tab1Data.length > 0 && (
              <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                <tr className="bg-purple-100 text-center font-black uppercase text-xs border-t-2 border-purple-200">
                  <td colSpan="2" className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-purple-200 text-purple-900">
                    TOTAL KESELURUHAN
                  </td>
                  <td className="px-4 py-4 text-purple-800 border-y border-purple-200">{grandTotalTab1.rombel_n.toLocaleString()}</td>
                  <td className="px-4 py-4 text-purple-900 border-y border-purple-200">{grandTotalTab1.pd_n.toLocaleString()}</td>
                  <td className="px-4 py-4 text-orange-800 border-y border-purple-200">{grandTotalTab1.rombel_s.toLocaleString()}</td>
                  <td className="px-4 py-4 text-orange-900 border-y border-purple-200">{grandTotalTab1.pd_s.toLocaleString()}</td>
                  <td className="px-4 py-4 text-purple-900 border-y border-purple-200">{grandTotalTab1.total_rombel.toLocaleString()}</td>
                  <td className="px-4 py-4 text-purple-900 text-base border-y border-r border-purple-200 rounded-r-2xl">{grandTotalTab1.total_pd.toLocaleString()}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* TABEL 2 */}
      <div className="bg-white rounded-3xl shadow-md border border-gray-100 overflow-hidden">
        <div className="bg-orange-600 px-6 py-5 border-b border-orange-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Activity className="text-orange-200" size={24} />
            <h3 className="font-black text-lg text-white uppercase tracking-tighter">Tabel 2: Hasil Analisa Kepadatan per Kelas</h3>
          </div>
          <button onClick={handleUnduhTab2} className="flex items-center gap-2 text-xs font-black uppercase text-orange-900 bg-white px-4 py-2 rounded-xl hover:bg-orange-50 transition-colors">
            <Download size={14} /> Unduh
          </button>
        </div>
        <div className="overflow-x-auto p-4">
          <table className="w-full text-center border-separate border-spacing-y-2">
            <thead className="sticky top-0 bg-white z-10 shadow-sm rounded-xl">
              <tr className="text-[10px] font-black uppercase text-gray-500 bg-orange-50/50">
                <th className="px-4 py-4 rounded-l-xl w-12">No</th>
                <th className="px-4 py-4 text-left">{isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan'}</th>
                {JENJANG_KEYS.map(k => (
                  <th key={k} className="px-2 py-4 text-orange-800 border-l border-orange-100 whitespace-nowrap">{k}</th>
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
                        {renderRatio(row[`${k}_rombel`], row[`${k}_pd`], k)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          
          {tab2Data.length === 0 && (
             <div className="py-20 flex flex-col items-center opacity-30 text-gray-500">
               <Search size={64} className="mb-4" />
               <p className="font-black uppercase tracking-widest text-xl">Tidak Ada Data</p>
             </div>
          )}
        </div>
      </div>

      {/* INFO BOX */}
      <div className="bg-orange-50 border border-orange-200 p-6 rounded-3xl flex flex-col md:flex-row items-start gap-6 shadow-sm mb-12">
        <div className="bg-orange-500 text-white p-3 rounded-2xl shrink-0 shadow-md"><Info size={28}/></div>
        <div className="text-sm text-orange-900 leading-relaxed w-full">
          <strong className="font-black text-base uppercase tracking-widest block mb-3 text-orange-800">Acuan Permendikdasmen No. 14 Tahun 2026</strong>
          <p className="font-medium opacity-90 mb-3">
            Batas maksimal kepadatan jumlah siswa dalam 1 Rombongan Belajar:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-3 font-bold opacity-90">
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-orange-500"></div> PAUD: Max 15 Siswa / Rombel</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-orange-500"></div> SD: Max 28 Siswa / Rombel</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-orange-500"></div> SMP: Max 32 Siswa / Rombel</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-orange-500"></div> SMA/SMK: Max 36 Siswa / Rombel</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-orange-500"></div> SLB: Max 8 Siswa / Rombel</div>
            <div className="flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-orange-500"></div> NON FORMAL: Max 30 Siswa / Rombel</div>
          </div>
          <div className="mt-4 pt-4 border-t border-orange-200/50 text-xs italic opacity-80 font-bold">
            * Format Rasio <span className="text-orange-700 font-black">1 : X</span>. Angka <span className="text-orange-700 font-black">1</span> adalah 1 Rombel, dan <span className="text-red-600 font-black">X</span> adalah Jumlah Rata-rata Peserta Didik. <br/>
            Warna <span className="text-emerald-600 font-black">Hijau</span> = Ideal. Warna <span className="text-red-600 font-black">Merah</span> = Overload (Kelebihan Kapasitas Siswa dalam 1 kelas). Warna <span className="text-blue-600 font-black">Biru</span> = Kelas Sepi.
          </div>
        </div>
      </div>

    </div>
  );
}