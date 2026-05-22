import React, { useState, useMemo, useEffect } from 'react';
// TAMBAHAN: Import useSearchParams dari react-router-dom
import { useSearchParams } from 'react-router-dom';
import { 
  Download, Users, MapPin, Eye, FileSpreadsheet, 
  Search, X, ChevronLeft, ChevronRight, Building2, 
  BookOpen, Library, GraduationCap, Tent, Shapes
} from 'lucide-react';
import ExcelJS from 'exceljs';

// --- PERBAIKAN IMPORT PATH FIREBASE ---
import { db } from '../../firebase/config';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';

// --- PERBAIKAN IMPORT KOMPONEN MODAL RINCIAN ---
import RincianPDStatusSekolah from '../../components/dapodik/dapodikPesertaDidik/RincianPDStatusSekolah';
import RincianPDJenjangPAUD from '../../components/dapodik/dapodikPesertaDidik/RincianPDJenjangPAUD';
import RincianPDJenjangSD from '../../components/dapodik/dapodikPesertaDidik/RincianPDJenjangSD';
import RincianPDJenjangSMP from '../../components/dapodik/dapodikPesertaDidik/RincianPDJenjangSMP';
import RincianPDJenjangSMA from '../../components/dapodik/dapodikPesertaDidik/RincianPDJenjangSMA';
import RincianPDJenjangSMK from '../../components/dapodik/dapodikPesertaDidik/RincianPDJenjangSMK'; // <-- IMPORT SMK DITAMBAHKAN
import RincianPDJenjangNonFormal from '../../components/dapodik/dapodikPesertaDidik/RincianPDJenjangNonFormal';

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

// =====================================================================
// PENGELOMPOKAN JENJANG (SUDAH DIPISAH SMA DAN SMK)
// =====================================================================
const JENJANG_GROUPS = {
  'SEMUA': [],
  'PAUD': ['TK', 'KB', 'TPA', 'SPS'],
  'SD': ['SD', 'SPK SD'],
  'SMP': ['SMP', 'SPK SMP'],
  'SMA': ['SMA', 'SPK SMA'],
  'SMK': ['SMK'],
  'SLB (Inklusif)': ['SLB'],
  'NON FORMAL': ['PKBM', 'SKB']
};

const JENJANG_KEYS = ['PAUD', 'SD', 'SMP', 'SMA', 'SMK', 'SLB (Inklusif)', 'NON FORMAL'];

const identifyJenjangGroup = (jenjangDb) => {
  const j = String(jenjangDb).trim().toUpperCase();
  for (const group of JENJANG_KEYS) {
    if (JENJANG_GROUPS[group].includes(j)) return group;
  }
  return null;
};

// =====================================================================
// MAIN COMPONENT: DAPODIK PESERTA DIDIK
// =====================================================================
export default function DapodikPesertaDidik({ data = [], selectedYear = '2026', lastUpdatedDate }) {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Memastikan bahwa parameter URL selalu sinkron dengan state komponen
  // Gunakan optional chaining dan default value yang solid
  const activeView = (searchParams.get('tab') || 'STATUS').toUpperCase(); 
  const activeJenjang = (searchParams.get('jenjang') || 'SEMUA').toUpperCase(); 
  
  // Fungsi handler untuk memperbarui URL Params yang aman
  const handleTabClick = (viewId) => {
    setSearchParams(prev => {
      prev.set('tab', viewId);
      // Jika yang diklik bukan tab STATUS, paksa reset jenjang ke SEMUA
      if (viewId !== 'STATUS') {
        prev.set('jenjang', 'SEMUA');
      }
      return prev;
    });
  };

  const handleJenjangClick = (jenjangId) => {
    setSearchParams(prev => {
      prev.set('jenjang', jenjangId);
      return prev;
    });
  };

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedWilayah, setSelectedWilayah] = useState('SEMUA');
  const [fetchedDate, setFetchedDate] = useState('');

  // Tarik tanggal update langsung dari dapodik_sekolah_chunks karena data siswa menyatu di sana
  useEffect(() => {
    const getUpdateDate = async () => {
      try {
        const qSek = query(collection(db, 'dapodik_sekolah_chunks'), where('tahun_data', '==', selectedYear), limit(1));
        const snapSek = await getDocs(qSek);
        
        if (!snapSek.empty) {
           const docData = snapSek.docs[0].data();
           if (docData.last_updated) {
             const d = new Date(docData.last_updated);
             const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
             setFetchedDate(`${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()} Pukul ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
           }
        }
      } catch (e) {
        console.error("Gagal menarik tanggal update", e);
      }
    };
    getUpdateDate();
  }, [selectedYear]);

  const displayLastUpdated = fetchedDate || lastUpdatedDate || 'Sesuai Database Terkini';

  const listKabupaten = useMemo(() => {
    const unik = [...new Set(data.map(item => cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'))))];
    return unik.filter(k => k !== 'TIDAK DIKETAHUI').sort((a, b) => getKabupatenRank(a) - getKabupatenRank(b));
  }, [data]);

  // ENGINE AGREGASI PESERTA DIDIK
  const aggregatedData = useMemo(() => {
    const mapAgg = new Map();
    listKabupaten.forEach(kab => {
      mapAgg.set(kab, { 
        wilayah: kab, 
        status_n: 0, status_s: 0, 
        paud_l: 0, paud_p: 0,
        sd_1: 0, sd_2: 0, sd_3: 0, sd_4: 0, sd_5: 0, sd_6: 0,
        smp_7: 0, smp_8: 0, smp_9: 0,
        sma_10: 0, sma_11: 0, sma_12: 0,
        smk_10: 0, smk_11: 0, smk_12: 0, 
        nf_l: 0, nf_p: 0,
        total: 0 
      });
    });

    data.forEach(item => {
       const kab = cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'));
       if (!mapAgg.has(kab)) return; 
       
       const row = mapAgg.get(kab);
       const bentukDb = String(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang') || '').trim().toUpperCase();
       const group = identifyJenjangGroup(bentukDb);
       if (!group) return;

       const isNegeri = String(getVal(item, 'status_sekolah')).toUpperCase() === 'NEGERI';
       const pd_l = parseInt(getVal(item, 'pd_l')) || 0;
       const pd_p = parseInt(getVal(item, 'pd_p')) || 0;
       const pd_total = parseInt(getVal(item, 'pd_total')) || (pd_l + pd_p);

       if (activeView === 'STATUS') {
          const validJenjangList = JENJANG_GROUPS[activeJenjang] || [];
          if (activeJenjang === 'SEMUA' || validJenjangList.includes(bentukDb)) {
             if (isNegeri) row.status_n += pd_total; else row.status_s += pd_total;
             row.total += pd_total;
          }
       } 
       else if (activeView === 'PAUD' && group === 'PAUD') {
          row.paud_l += pd_l;
          row.paud_p += pd_p;
          row.total += pd_total;
       } 
       else if (activeView === 'SD' && group === 'SD') {
          const t1 = (parseInt(getVal(item, 't1_l')) || 0) + (parseInt(getVal(item, 't1_p')) || 0);
          const t2 = (parseInt(getVal(item, 't2_l')) || 0) + (parseInt(getVal(item, 't2_p')) || 0);
          const t3 = (parseInt(getVal(item, 't3_l')) || 0) + (parseInt(getVal(item, 't3_p')) || 0);
          const t4 = (parseInt(getVal(item, 't4_l')) || 0) + (parseInt(getVal(item, 't4_p')) || 0);
          const t5 = (parseInt(getVal(item, 't5_l')) || 0) + (parseInt(getVal(item, 't5_p')) || 0);
          const t6 = (parseInt(getVal(item, 't6_l')) || 0) + (parseInt(getVal(item, 't6_p')) || 0);
          
          row.sd_1 += t1; row.sd_2 += t2; row.sd_3 += t3; row.sd_4 += t4; row.sd_5 += t5; row.sd_6 += t6;
          row.total += (t1+t2+t3+t4+t5+t6);
       } 
       else if (activeView === 'SMP' && group === 'SMP') {
          const t7 = (parseInt(getVal(item, 't7_l')) || 0) + (parseInt(getVal(item, 't7_p')) || 0);
          const t8 = (parseInt(getVal(item, 't8_l')) || 0) + (parseInt(getVal(item, 't8_p')) || 0);
          const t9 = (parseInt(getVal(item, 't9_l')) || 0) + (parseInt(getVal(item, 't9_p')) || 0);
          
          row.smp_7 += t7; row.smp_8 += t8; row.smp_9 += t9;
          row.total += (t7+t8+t9);
       } 
       else if (activeView === 'SMA' && group === 'SMA') {
          const t10 = (parseInt(getVal(item, 't10_l')) || 0) + (parseInt(getVal(item, 't10_p')) || 0);
          const t11 = (parseInt(getVal(item, 't11_l')) || 0) + (parseInt(getVal(item, 't11_p')) || 0);
          const t12 = (parseInt(getVal(item, 't12_l')) || 0) + (parseInt(getVal(item, 't12_p')) || 0);
          
          row.sma_10 += t10; row.sma_11 += t11; row.sma_12 += t12;
          row.total += (t10+t11+t12);
       } 
       else if (activeView === 'SMK' && group === 'SMK') {
          const t10 = (parseInt(getVal(item, 't10_l')) || 0) + (parseInt(getVal(item, 't10_p')) || 0);
          const t11 = (parseInt(getVal(item, 't11_l')) || 0) + (parseInt(getVal(item, 't11_p')) || 0);
          const t12 = (parseInt(getVal(item, 't12_l')) || 0) + (parseInt(getVal(item, 't12_p')) || 0);
          
          row.smk_10 += t10; row.smk_11 += t11; row.smk_12 += t12;
          row.total += (t10+t11+t12);
       } 
       else if (activeView === 'NON_FORMAL' && group === 'NON FORMAL') {
          row.nf_l += pd_l;
          row.nf_p += pd_p;
          row.total += pd_total;
       }
    });

    return Array.from(mapAgg.values()).sort((a, b) => getKabupatenRank(a.wilayah) - getKabupatenRank(b.wilayah));
  }, [data, activeView, activeJenjang, listKabupaten]);

  const grandTotals = useMemo(() => {
    return aggregatedData.reduce((acc, curr) => {
      acc.status_n += curr.status_n; acc.status_s += curr.status_s;
      acc.paud_l += curr.paud_l; acc.paud_p += curr.paud_p;
      acc.sd_1 += curr.sd_1; acc.sd_2 += curr.sd_2; acc.sd_3 += curr.sd_3; acc.sd_4 += curr.sd_4; acc.sd_5 += curr.sd_5; acc.sd_6 += curr.sd_6;
      acc.smp_7 += curr.smp_7; acc.smp_8 += curr.smp_8; acc.smp_9 += curr.smp_9;
      acc.sma_10 += curr.sma_10; acc.sma_11 += curr.sma_11; acc.sma_12 += curr.sma_12;
      acc.smk_10 += curr.smk_10; acc.smk_11 += curr.smk_11; acc.smk_12 += curr.smk_12;
      acc.nf_l += curr.nf_l; acc.nf_p += curr.nf_p;
      acc.total += curr.total;
      return acc;
    }, { 
      status_n: 0, status_s: 0, paud_l: 0, paud_p: 0, 
      sd_1: 0, sd_2: 0, sd_3: 0, sd_4: 0, sd_5: 0, sd_6: 0,
      smp_7: 0, smp_8: 0, smp_9: 0, sma_10: 0, sma_11: 0, sma_12: 0, 
      smk_10: 0, smk_11: 0, smk_12: 0, nf_l: 0, nf_p: 0, total: 0 
    });
  }, [aggregatedData]);

  // EXPORT EXCEL
  const downloadExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const safeJenjang = activeJenjang.replace(/\//g, '-');
    const sheetName = activeView === 'STATUS' ? `PD Status - ${safeJenjang}` : `PD ${activeView}`;
    const worksheet = workbook.addWorksheet(sheetName);

    let columns = [{ header: 'Wilayah (Kabupaten/Kota)', key: 'wilayah', width: 30 }];
    
    if (activeView === 'STATUS') columns.push({header:'PD Negeri',key:'status_n',width:18}, {header:'PD Swasta',key:'status_s',width:18});
    else if (activeView === 'PAUD') columns.push({header:'Laki-laki',key:'paud_l',width:15}, {header:'Perempuan',key:'paud_p',width:15});
    else if (activeView === 'SD') columns.push({header:'Kelas 1',key:'sd_1',width:15}, {header:'Kelas 2',key:'sd_2',width:15}, {header:'Kelas 3',key:'sd_3',width:15}, {header:'Kelas 4',key:'sd_4',width:15}, {header:'Kelas 5',key:'sd_5',width:15}, {header:'Kelas 6',key:'sd_6',width:15});
    else if (activeView === 'SMP') columns.push({header:'Kelas 7',key:'smp_7',width:15}, {header:'Kelas 8',key:'smp_8',width:15}, {header:'Kelas 9',key:'smp_9',width:15});
    else if (activeView === 'SMA') columns.push({header:'Kelas 10',key:'sma_10',width:15}, {header:'Kelas 11',key:'sma_11',width:15}, {header:'Kelas 12',key:'sma_12',width:15});
    else if (activeView === 'SMK') columns.push({header:'Kelas 10',key:'smk_10',width:15}, {header:'Kelas 11',key:'smk_11',width:15}, {header:'Kelas 12',key:'smk_12',width:15});
    else if (activeView === 'NON_FORMAL') columns.push({header:'Laki-laki',key:'nf_l',width:15}, {header:'Perempuan',key:'nf_p',width:15});

    columns.push({ header: 'Total Peserta Didik', key: 'total', width: 22 });
    worksheet.columns = columns;

    aggregatedData.forEach(item => worksheet.addRow(item));

    const totalRowData = { wilayah: 'TOTAL KESELURUHAN', ...grandTotals };
    const totalRow = worksheet.addRow(totalRowData);

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } }; // Light Blue 600
    totalRow.font = { bold: true, color: { argb: 'FF0C4A6E' } }; 
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } }; 

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Rekap_PD_${activeView}_${activeView === 'STATUS' ? safeJenjang : ''}_${selectedYear}.xlsx`;
    link.click();
  };

  const handleBukaRincian = (wilayah) => {
    setSelectedWilayah(wilayah);
    setModalOpen(true);
  };

  const TABS = [
    { id: 'STATUS', label: 'Status Sekolah', icon: Building2, color: 'text-blue-700' },
    { id: 'PAUD', label: 'Jenjang PAUD', icon: Shapes, color: 'text-pink-600' },
    { id: 'SD', label: 'Jenjang SD', icon: BookOpen, color: 'text-emerald-600' },
    { id: 'SMP', label: 'Jenjang SMP', icon: Library, color: 'text-indigo-600' },
    { id: 'SMA', label: 'Jenjang SMA', icon: GraduationCap, color: 'text-rose-600' },
    { id: 'SMK', label: 'Jenjang SMK', icon: GraduationCap, color: 'text-purple-600' },
    { id: 'NON_FORMAL', label: 'Non Formal', icon: Tent, color: 'text-teal-600' },
  ];

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500">
      
      {/* HEADER: TAB UTAMA */}
      <div className="bg-white px-4 md:px-6 py-4 border-b border-gray-100 flex flex-col gap-4 shrink-0 shadow-sm z-20">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
           
           <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-2xl w-full md:w-auto overflow-x-auto custom-scrollbar pb-1">
             {TABS.map(t => (
                <button 
                  key={t.id} 
                  onClick={() => handleTabClick(t.id)} 
                  className={`flex items-center gap-1.5 px-3 py-2 md:py-2.5 rounded-xl font-black text-[10px] md:text-xs transition-all whitespace-nowrap ${activeView === t.id ? `bg-white ${t.color} shadow-sm scale-[1.02]` : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'}`}
                >
                  <t.icon size={14} /> {t.label}
                </button>
             ))}
           </div>

           <button onClick={downloadExcel} className="flex items-center gap-2 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white px-5 py-2.5 rounded-xl font-black uppercase text-[10px] md:text-xs shadow-sm border border-blue-200 transition-all active:scale-95 shrink-0 w-full md:w-auto justify-center">
             <FileSpreadsheet size={16} /> Unduh Rekap
           </button>
        </div>

        {/* JENJANG FILTER (HANYA MUNCUL DI TAB STATUS) */}
        {activeView === 'STATUS' && (
          <div className="flex items-center gap-1.5 md:gap-2 overflow-x-auto pb-1 custom-scrollbar animate-in slide-in-from-top-2 duration-300">
            {Object.keys(JENJANG_GROUPS).map(tab => (
              <button 
                key={tab} 
                onClick={() => handleJenjangClick(tab)} 
                className={`px-4 py-1.5 rounded-lg font-black text-[10px] md:text-xs transition-all duration-300 whitespace-nowrap border ${activeJenjang === tab ? 'bg-gray-800 text-white border-gray-800 shadow-md' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
              >
                {tab}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* AREA TABEL UTAMA */}
      <div className="flex-1 flex flex-col min-h-0 bg-gray-50/50 p-4 md:p-6">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-100 flex-1 flex flex-col overflow-hidden relative">
          <div className="flex-1 overflow-auto p-4 custom-scrollbar">
            <table className="w-full text-center border-separate border-spacing-y-2">
              <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm rounded-xl">
                <tr className="text-[10px] font-black uppercase text-gray-500 whitespace-nowrap">
                  <th className="px-4 py-3 text-left rounded-l-xl">Wilayah</th>
                  
                  {activeView === 'STATUS' && (
                    <><th className="px-4 py-3 text-blue-600">PD Negeri</th><th className="px-4 py-3 text-orange-600">PD Swasta</th></>
                  )}
                  {(activeView === 'PAUD' || activeView === 'NON_FORMAL') && (
                    <><th className="px-4 py-3 text-sky-600">Laki-laki</th><th className="px-4 py-3 text-pink-600">Perempuan</th></>
                  )}
                  {activeView === 'SD' && (
                    <><th className="px-2 py-3 text-red-500">Kls 1</th><th className="px-2 py-3 text-orange-500">Kls 2</th><th className="px-2 py-3 text-amber-500">Kls 3</th><th className="px-2 py-3 text-emerald-500">Kls 4</th><th className="px-2 py-3 text-sky-500">Kls 5</th><th className="px-2 py-3 text-blue-500">Kls 6</th></>
                  )}
                  {activeView === 'SMP' && (
                    <><th className="px-4 py-3 text-indigo-500">Kelas 7</th><th className="px-4 py-3 text-violet-500">Kelas 8</th><th className="px-4 py-3 text-fuchsia-500">Kelas 9</th></>
                  )}
                  {(activeView === 'SMA' || activeView === 'SMK') && (
                    <><th className="px-4 py-3 text-rose-500">Kelas 10</th><th className="px-4 py-3 text-pink-500">Kelas 11</th><th className="px-4 py-3 text-purple-500">Kelas 12</th></>
                  )}

                  <th className="px-4 py-3 text-gray-800">Total PD</th>
                  <th className="px-4 py-3 rounded-r-xl">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {aggregatedData.map((row, idx) => (
                  <tr key={idx} className="bg-white shadow-sm hover:shadow-md hover:scale-[1.01] transition-all group">
                    <td className="px-4 py-3 rounded-l-2xl font-black text-gray-800 uppercase text-left border-y border-l border-gray-100 whitespace-nowrap">{row.wilayah}</td>
                    
                    {activeView === 'STATUS' && (
                      <><td className="px-4 py-3 font-bold text-blue-600 text-sm border-y border-gray-100 bg-blue-50/30">{row.status_n.toLocaleString()}</td><td className="px-4 py-3 font-bold text-orange-600 text-sm border-y border-gray-100 bg-orange-50/30">{row.status_s.toLocaleString()}</td></>
                    )}
                    {(activeView === 'PAUD' || activeView === 'NON_FORMAL') && (
                      <><td className="px-4 py-3 font-bold text-sky-600 text-sm border-y border-gray-100 bg-sky-50/30">{activeView==='PAUD' ? row.paud_l.toLocaleString() : row.nf_l.toLocaleString()}</td><td className="px-4 py-3 font-bold text-pink-600 text-sm border-y border-gray-100 bg-pink-50/30">{activeView==='PAUD' ? row.paud_p.toLocaleString() : row.nf_p.toLocaleString()}</td></>
                    )}
                    {activeView === 'SD' && (
                      <><td className="px-2 py-3 font-bold text-red-500 text-sm border-y border-gray-100 bg-red-50/20">{row.sd_1.toLocaleString()}</td><td className="px-2 py-3 font-bold text-orange-500 text-sm border-y border-gray-100 bg-orange-50/20">{row.sd_2.toLocaleString()}</td><td className="px-2 py-3 font-bold text-amber-500 text-sm border-y border-gray-100 bg-amber-50/20">{row.sd_3.toLocaleString()}</td><td className="px-2 py-3 font-bold text-emerald-500 text-sm border-y border-gray-100 bg-emerald-50/20">{row.sd_4.toLocaleString()}</td><td className="px-2 py-3 font-bold text-sky-500 text-sm border-y border-gray-100 bg-sky-50/20">{row.sd_5.toLocaleString()}</td><td className="px-2 py-3 font-bold text-blue-500 text-sm border-y border-gray-100 bg-blue-50/20">{row.sd_6.toLocaleString()}</td></>
                    )}
                    {activeView === 'SMP' && (
                      <><td className="px-4 py-3 font-bold text-indigo-500 text-sm border-y border-gray-100 bg-indigo-50/20">{row.smp_7.toLocaleString()}</td><td className="px-4 py-3 font-bold text-violet-500 text-sm border-y border-gray-100 bg-violet-50/20">{row.smp_8.toLocaleString()}</td><td className="px-4 py-3 font-bold text-fuchsia-500 text-sm border-y border-gray-100 bg-fuchsia-50/20">{row.smp_9.toLocaleString()}</td></>
                    )}
                    {activeView === 'SMA' && (
                      <><td className="px-4 py-3 font-bold text-rose-500 text-sm border-y border-gray-100 bg-rose-50/20">{row.sma_10.toLocaleString()}</td><td className="px-4 py-3 font-bold text-pink-500 text-sm border-y border-gray-100 bg-pink-50/20">{row.sma_11.toLocaleString()}</td><td className="px-4 py-3 font-bold text-purple-500 text-sm border-y border-gray-100 bg-purple-50/20">{row.sma_12.toLocaleString()}</td></>
                    )}
                    {activeView === 'SMK' && (
                      <><td className="px-4 py-3 font-bold text-rose-500 text-sm border-y border-gray-100 bg-purple-50/20">{row.smk_10.toLocaleString()}</td><td className="px-4 py-3 font-bold text-pink-500 text-sm border-y border-gray-100 bg-purple-50/20">{row.smk_11.toLocaleString()}</td><td className="px-4 py-3 font-bold text-purple-500 text-sm border-y border-gray-100 bg-purple-50/20">{row.smk_12.toLocaleString()}</td></>
                    )}

                    <td className="px-4 py-3 font-black text-gray-800 text-base border-y border-r border-gray-100 bg-gray-50/80">
                      {row.total.toLocaleString()}
                    </td>

                    <td className="px-4 py-3 rounded-r-2xl border-y border-r border-gray-100">
                       <button onClick={() => handleBukaRincian(row.wilayah)} className="flex items-center justify-center gap-2 bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase hover:bg-blue-600 hover:text-white transition-colors mx-auto">
                         <Eye size={14} /> Rincian
                       </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                <tr className="bg-gray-100 text-center font-black uppercase text-xs border-t-2 border-gray-300 whitespace-nowrap">
                  <td className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-gray-300 text-gray-900">TOTAL KALIMANTAN BARAT</td>
                  
                  {activeView === 'STATUS' && (
                    <><td className="px-4 py-4 text-blue-700 border-y border-gray-300">{grandTotals.status_n.toLocaleString()}</td><td className="px-4 py-4 text-orange-700 border-y border-gray-300">{grandTotals.status_s.toLocaleString()}</td></>
                  )}
                  {(activeView === 'PAUD' || activeView === 'NON_FORMAL') && (
                    <><td className="px-4 py-4 text-sky-700 border-y border-gray-300">{activeView==='PAUD' ? grandTotals.paud_l.toLocaleString() : grandTotals.nf_l.toLocaleString()}</td><td className="px-4 py-4 text-pink-700 border-y border-gray-300">{activeView==='PAUD' ? grandTotals.paud_p.toLocaleString() : grandTotals.nf_p.toLocaleString()}</td></>
                  )}
                  {activeView === 'SD' && (
                    <><td className="px-2 py-4 text-red-600 border-y border-gray-300">{grandTotals.sd_1.toLocaleString()}</td><td className="px-2 py-4 text-orange-600 border-y border-gray-300">{grandTotals.sd_2.toLocaleString()}</td><td className="px-2 py-4 text-amber-600 border-y border-gray-300">{grandTotals.sd_3.toLocaleString()}</td><td className="px-2 py-4 text-emerald-600 border-y border-gray-300">{grandTotals.sd_4.toLocaleString()}</td><td className="px-2 py-4 text-sky-600 border-y border-gray-300">{grandTotals.sd_5.toLocaleString()}</td><td className="px-2 py-4 text-blue-600 border-y border-gray-300">{grandTotals.sd_6.toLocaleString()}</td></>
                  )}
                  {activeView === 'SMP' && (
                    <><td className="px-4 py-4 text-indigo-600 border-y border-gray-300">{grandTotals.smp_7.toLocaleString()}</td><td className="px-4 py-4 text-violet-600 border-y border-gray-300">{grandTotals.smp_8.toLocaleString()}</td><td className="px-4 py-4 text-fuchsia-600 border-y border-gray-300">{grandTotals.smp_9.toLocaleString()}</td></>
                  )}
                  {activeView === 'SMA' && (
                    <><td className="px-4 py-4 text-rose-600 border-y border-gray-300">{grandTotals.sma_10.toLocaleString()}</td><td className="px-4 py-4 text-pink-600 border-y border-gray-300">{grandTotals.sma_11.toLocaleString()}</td><td className="px-4 py-4 text-purple-600 border-y border-gray-300">{grandTotals.sma_12.toLocaleString()}</td></>
                  )}
                  {activeView === 'SMK' && (
                    <><td className="px-4 py-4 text-rose-600 border-y border-gray-300">{grandTotals.smk_10.toLocaleString()}</td><td className="px-4 py-4 text-pink-600 border-y border-gray-300">{grandTotals.smk_11.toLocaleString()}</td><td className="px-4 py-4 text-purple-600 border-y border-gray-300">{grandTotals.smk_12.toLocaleString()}</td></>
                  )}

                  <td className="px-4 py-4 text-gray-900 border-y border-gray-300 text-base">
                    {grandTotals.total.toLocaleString()}
                  </td>
                  <td className="px-4 py-4 rounded-r-2xl border-y border-r border-gray-300">
                     <button onClick={() => handleBukaRincian('SEMUA')} className="flex items-center justify-center gap-2 bg-gray-800 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase hover:bg-gray-900 transition-colors mx-auto shadow-md">
                       <Search size={14} /> Semua
                     </button>
                  </td>
                </tr>
              </tfoot>
            </table>
            <div className="mt-4 px-2 text-right text-xs font-bold italic text-gray-400 pb-2">
               Sumber : Data Dapodik Siswa Update Pada Tanggal : {displayLastUpdated}
            </div>
          </div>
        </div>
      </div>

      {/* KONDISIONAL RENDER MODAL BERDASARKAN ACTIVE VIEW */}
      {activeView === 'STATUS' && (
        <RincianPDStatusSekolah 
          isOpen={modalOpen} 
          onClose={() => setModalOpen(false)}
          data={data}
          initialWilayah={selectedWilayah}
          activeJenjang={activeJenjang}
          displayLastUpdated={displayLastUpdated}
        />
      )}

      {activeView === 'PAUD' && (
        <RincianPDJenjangPAUD 
          isOpen={modalOpen} 
          onClose={() => setModalOpen(false)}
          data={data}
          initialWilayah={selectedWilayah}
          displayLastUpdated={displayLastUpdated}
        />
      )}

      {activeView === 'SD' && (
        <RincianPDJenjangSD 
          isOpen={modalOpen} 
          onClose={() => setModalOpen(false)}
          data={data}
          initialWilayah={selectedWilayah}
          displayLastUpdated={displayLastUpdated}
        />
      )}

      {activeView === 'SMP' && (
        <RincianPDJenjangSMP 
          isOpen={modalOpen} 
          onClose={() => setModalOpen(false)}
          data={data}
          initialWilayah={selectedWilayah}
          displayLastUpdated={displayLastUpdated}
        />
      )}

      {activeView === 'SMA' && (
        <RincianPDJenjangSMA 
          isOpen={modalOpen} 
          onClose={() => setModalOpen(false)}
          data={data}
          initialWilayah={selectedWilayah}
          displayLastUpdated={displayLastUpdated}
        />
      )}
      
      {activeView === 'SMK' && (
        <RincianPDJenjangSMK 
          isOpen={modalOpen} 
          onClose={() => setModalOpen(false)}
          data={data}
          initialWilayah={selectedWilayah}
          displayLastUpdated={displayLastUpdated}
        />
      )}

      {activeView === 'NON_FORMAL' && (
        <RincianPDJenjangNonFormal 
          isOpen={modalOpen} 
          onClose={() => setModalOpen(false)}
          data={data}
          initialWilayah={selectedWilayah}
          displayLastUpdated={displayLastUpdated}
        />
      )}

    </div>
  );
}