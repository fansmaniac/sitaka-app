import React, { useState, useMemo, useEffect } from 'react';
// TAMBAHAN: Import useSearchParams dari react-router-dom
import { useSearchParams } from 'react-router-dom';
import { 
  Download, Users, MapPin, Eye, FileSpreadsheet, 
  Search, X, ChevronLeft, ChevronRight, Building2, 
  Award, Briefcase, GraduationCap, Clock, CalendarDays
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { db } from '../firebase/config';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';

// IMPORT SELURUH KOMPONEN MODAL RINCIAN
import RincianStatusSekolahGuru from './RincianStatusSekolahGuru';
import RincianGenderGuru from './RincianGenderGuru';
import RincianKualifikasiGuru from './RincianKualifikasiGuru';
import RincianKepegawaianGuru from './RincianKepegawaianGuru';
import RincianProfesiGuru from './RincianProfesiGuru';
import RincianUsiaGuru from './RincianUsiaGuru';
import RincianProyeksiPensiunGuru from './RincianProyeksiPensiunGuru';

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

// =====================================================================
// PENGELOMPOKAN KATEGORI DROPDOWN SINKRON DENGAN DAPODIK SEKOLAH
// =====================================================================
const KATEGORI_MAPPING = {
  'PAUD': ['TK', 'KB', 'TPA', 'SPS'],
  'PENDIDIKAN DASAR': ['SD', 'SPK SD', 'SMP', 'SPK SMP'],
  'PENDIDIKAN MENENGAH': ['SMA', 'SPK SMA', 'SMK'],
  'PENDIDIKAN INKLUSIF': ['SLB'],
  'PENDIDIKAN NON FORMAL': ['PKBM', 'SKB']
};

const SEMUA_SUBTABS_MAPPING = {
  'PAUD': ['TK', 'KB', 'TPA', 'SPS'],
  'SD': ['SD', 'SPK SD'],
  'SMP': ['SMP', 'SPK SMP'],
  'SMA': ['SMA', 'SPK SMA'],
  'SMK': ['SMK'],
  'SLB (Inklusif)': ['SLB', 'SDLB', 'SMPLB', 'SMALB'],
  'NON FORMAL': ['PKBM', 'SKB']
};

// =====================================================================
// PREMIUM PIE CHART COMPONENT
// =====================================================================
const PremiumPieChart = ({ segments, total }) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  if (total === 0 || !total) {
    return (
      <div className="w-full h-full flex items-center justify-center min-h-[250px]">
        <div className="w-32 h-32 rounded-full bg-gray-50 flex items-center justify-center border-4 border-dashed border-gray-200">
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
    
    let pathData;
    if (percentage === 1) {
      pathData = `M 1 0 A 1 1 0 1 1 -1 0 A 1 1 0 1 1 1 0`;
    } else {
      pathData = `M 0 0 L ${startX} ${startY} A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY} Z`;
    }

    const [lineStartX, lineStartY] = getCoordinatesForPercent(midPercent, 1);
    const [lineMidX, lineMidY] = getCoordinatesForPercent(midPercent, 1.2);
    const isRightSide = lineMidX > 0;
    const lineEndX = isRightSide ? lineMidX + 0.2 : lineMidX - 0.2;
    const lineEndY = lineMidY;
    const textX = isRightSide ? lineEndX + 0.05 : lineEndX - 0.05;
    const textAnchor = isRightSide ? "start" : "end";
    
    const isHovered = hoveredIndex === i;
    const popOutOffset = 0.05;
    const [popX, popY] = getCoordinatesForPercent(midPercent, popOutOffset);
    const transform = isHovered && percentage < 1 ? `translate(${popX}, ${popY}) scale(1.05)` : 'scale(1)';

    return {
      ...s, index: i, pathData, percentage: (percentage * 100).toFixed(1),
      lineStartX, lineStartY, lineMidX, lineMidY, lineEndX, lineEndY,
      textX, textAnchor, transform, isRightSide
    };
  }).filter(Boolean);

  return (
    <div className="w-full max-w-[280px] aspect-square relative flex items-center justify-center mx-auto drop-shadow-xl hover:scale-105 transition-transform duration-300">
      <svg viewBox="-1.8 -1.5 3.6 3" className="w-full h-full max-h-[300px] overflow-visible drop-shadow-xl">
        <g transform="rotate(-90)">
          {chartData.map((data) => (
            <path 
              key={`slice-${data.index}`} d={data.pathData} fill={data.color} transform={data.transform}
              onMouseEnter={() => setHoveredIndex(data.index)} onMouseLeave={() => setHoveredIndex(null)}
              className="cursor-pointer transition-all duration-300 stroke-white stroke-[0.015]"
              style={{ transformOrigin: '0px 0px' }}
            />
          ))}
          {chartData.map((data) => (
            <g key={`label-${data.index}`} className={`transition-opacity duration-300 ${hoveredIndex !== null && hoveredIndex !== data.index ? 'opacity-30' : 'opacity-100'}`}>
              <polyline points={`${data.lineStartX},${data.lineStartY} ${data.lineMidX},${data.lineMidY} ${data.lineEndX},${data.lineEndY}`} fill="none" stroke={data.color} strokeWidth="0.015" strokeLinejoin="round" />
              <circle cx={data.lineStartX} cy={data.lineStartY} r="0.04" fill={data.color} />
              <circle cx={data.lineEndX} cy={data.lineEndY} r="0.03" fill={data.color} />
              <g transform={`rotate(90 ${data.textX} ${data.lineEndY})`}>
                <text x={data.textX} y={data.lineEndY - 0.04} textAnchor={data.textAnchor} fill={data.color} className="font-black text-[0.14px] uppercase">{data.percentage}%</text>
                <text x={data.textX} y={data.lineEndY + 0.12} textAnchor={data.textAnchor} fill="#4B5563" className="font-bold text-[0.09px] tracking-widest">
                  {data.name}
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
// MAIN COMPONENT: DAPODIK GURU
// =====================================================================
export default function DapodikGuru({ data = [], selectedYear = '2026', lastUpdatedDate }) {
  // --- PERUBAHAN UTAMA: Mengganti useState menjadi URL Parameters ---
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Membaca parameter 'tab' dari URL, jika kosong default ke 'STATUS'
  const activeView = searchParams.get('tab')?.toUpperCase() || 'STATUS';
  
  // Fungsi untuk mengubah URL saat tab diklik (misal menjadi ?tab=gender)
  const setActiveView = (viewId) => {
    setSearchParams(prev => {
      prev.set('tab', viewId.toLowerCase());
      return prev;
    });
  };
  // ------------------------------------------------------------------
  
  const [activeKategori, setActiveKategori] = useState('SEMUA'); 
  const [activeBentuk, setActiveBentuk] = useState('SEMUA'); 

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedWilayah, setSelectedWilayah] = useState('SEMUA');
  const [fetchedDate, setFetchedDate] = useState('');

  useEffect(() => {
    const getUpdateDate = async () => {
      try {
        const qPtk = query(collection(db, 'dapodik_ptk_chunks'), where('tahun_data', '==', selectedYear), limit(1));
        const snapPtk = await getDocs(qPtk);
        let dateString = null;
        
        if (!snapPtk.empty) {
          const docData = snapPtk.docs[0].data();
          if (docData.last_updated && typeof docData.last_updated === 'string') dateString = docData.last_updated;
        }
        
        if (!dateString) {
           const qSek = query(collection(db, 'dapodik_sekolah_chunks'), where('tahun_data', '==', selectedYear), limit(1));
           const snapSek = await getDocs(qSek);
           if (!snapSek.empty) {
              const docData = snapSek.docs[0].data();
              if (docData.last_updated && typeof docData.last_updated === 'string') dateString = docData.last_updated;
           }
        }
        
        if (dateString) {
          const d = new Date(dateString);
          const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
          setFetchedDate(`${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()} Pukul ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
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

  const activeLabel = activeKategori === 'SEMUA' ? (activeBentuk === 'SEMUA' ? 'SEMUA JENJANG' : activeBentuk) : (activeBentuk === 'SEMUA' ? activeKategori : activeBentuk);

  const aggregatedData = useMemo(() => {
    const filteredData = data.filter(item => {
      const bentukDb = String(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang') || '').trim().toUpperCase();
      
      if (activeKategori === 'SEMUA') {
         if (activeBentuk !== 'SEMUA') {
            const allowed = SEMUA_SUBTABS_MAPPING[activeBentuk] || [];
            if (!allowed.includes(bentukDb)) return false;
         }
      } else {
         if (activeBentuk !== 'SEMUA') {
            if (bentukDb !== activeBentuk) return false;
         } else {
            const allowedBentuk = KATEGORI_MAPPING[activeKategori] || [];
            if (!allowedBentuk.includes(bentukDb)) return false;
         }
      }
      return true;
    });

    const mapAgg = new Map();
    listKabupaten.forEach(kab => {
      mapAgg.set(kab, { 
        wilayah: kab, 
        status_n: 0, status_s: 0, 
        gen_l: 0, gen_p: 0,
        kual_s1: 0, kual_s2: 0, kual_kurang: 0, kual_lain: 0,
        peg_pns: 0, peg_pppk: 0, peg_gty: 0, peg_honor: 0, peg_lain: 0,
        sert_sudah: 0, sert_belum: 0,
        usia_30: 0, usia_40: 0, usia_50: 0, usia_51: 0,
        pens_5: 0, pens_4: 0, pens_3: 0, pens_2: 0, pens_1: 0,
        total: 0 
      });
    });

    filteredData.forEach(item => {
       const kab = cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'));
       if (!mapAgg.has(kab)) return; 
       const row = mapAgg.get(kab);

       const isNegeri = String(getVal(item, 'status_sekolah')).toUpperCase() === 'NEGERI';
       if (isNegeri) row.status_n++; else row.status_s++;

       const gender = String(getVal(item, 'gender') || getVal(item, 'jenis_kelamin')).trim().toUpperCase();
       if (gender === 'L' || gender === 'LAKI-LAKI') row.gen_l++;
       else if (gender === 'P' || gender === 'PEREMPUAN') row.gen_p++;

       const pend = String(getVal(item, 'pendidikan') || '').toUpperCase();
       if (pend.includes('S1') || pend.includes('D4')) row.kual_s1++;
       else if (pend.includes('S2') || pend.includes('S3')) row.kual_s2++;
       else if (pend.includes('D1') || pend.includes('D2') || pend.includes('D3') || pend.includes('SMA') || pend.includes('SMK')) row.kual_kurang++;
       else row.kual_lain++;

       const peg = String(getVal(item, 'status_kepegawaian') || '').toUpperCase();
       if (peg === 'PNS') row.peg_pns++;
       else if (peg === 'PPPK') row.peg_pppk++;
       else if (peg.includes('GTY') || peg.includes('PTY')) row.peg_gty++;
       else if (peg.includes('HONOR')) row.peg_honor++;
       else row.peg_lain++;

       const sert = String(getVal(item, 'bidang_studi_sertifikasi') || '').trim();
       if (sert && sert !== '-' && sert !== '0') row.sert_sudah++;
       else row.sert_belum++;

       const tglLahir = getVal(item, 'tanggal_lahir');
       const age = calculateAge(tglLahir);
       if (age !== null) {
          if (age <= 30) row.usia_30++;
          else if (age <= 40) row.usia_40++;
          else if (age <= 50) row.usia_50++;
          else row.usia_51++;

          if (age === 56) row.pens_5++;
          else if (age === 57) row.pens_4++;
          else if (age === 58) row.pens_3++;
          else if (age === 59) row.pens_2++;
          else if (age === 60) row.pens_1++;
       }

       row.total++;
    });

    return Array.from(mapAgg.values()).sort((a, b) => getKabupatenRank(a.wilayah) - getKabupatenRank(b.wilayah));
  }, [data, activeKategori, activeBentuk, listKabupaten]);

  const grandTotals = useMemo(() => {
    return aggregatedData.reduce((acc, curr) => {
      acc.status_n += curr.status_n; acc.status_s += curr.status_s;
      acc.gen_l += curr.gen_l; acc.gen_p += curr.gen_p;
      acc.kual_s1 += curr.kual_s1; acc.kual_s2 += curr.kual_s2; acc.kual_kurang += curr.kual_kurang; acc.kual_lain += curr.kual_lain;
      acc.peg_pns += curr.peg_pns; acc.peg_pppk += curr.peg_pppk; acc.peg_gty += curr.peg_gty; acc.peg_honor += curr.peg_honor; acc.peg_lain += curr.peg_lain;
      acc.sert_sudah += curr.sert_sudah; acc.sert_belum += curr.sert_belum;
      acc.usia_30 += curr.usia_30; acc.usia_40 += curr.usia_40; acc.usia_50 += curr.usia_50; acc.usia_51 += curr.usia_51;
      acc.pens_5 += curr.pens_5; acc.pens_4 += curr.pens_4; acc.pens_3 += curr.pens_3; acc.pens_2 += curr.pens_2; acc.pens_1 += curr.pens_1;
      acc.total += curr.total;
      return acc;
    }, { 
      status_n: 0, status_s: 0, gen_l: 0, gen_p: 0,
      kual_s1: 0, kual_s2: 0, kual_kurang: 0, kual_lain: 0,
      peg_pns: 0, peg_pppk: 0, peg_gty: 0, peg_honor: 0, peg_lain: 0,
      sert_sudah: 0, sert_belum: 0,
      usia_30: 0, usia_40: 0, usia_50: 0, usia_51: 0,
      pens_5: 0, pens_4: 0, pens_3: 0, pens_2: 0, pens_1: 0, total: 0 
    });
  }, [aggregatedData]);

  let pieSegments = [];
  let pieTotal = grandTotals.total;
  
  if (activeView === 'STATUS') {
     pieSegments = [
       { name: 'Negeri', value: grandTotals.status_n, color: '#2563eb' }, 
       { name: 'Swasta', value: grandTotals.status_s, color: '#f97316' }  
     ];
  } else if (activeView === 'GENDER') {
     pieSegments = [
       { name: 'Laki-laki', value: grandTotals.gen_l, color: '#3b82f6' }, 
       { name: 'Perempuan', value: grandTotals.gen_p, color: '#ec4899' }  
     ];
  } else if (activeView === 'KUALIFIKASI') {
     pieSegments = [
       { name: 'S1 / D4', value: grandTotals.kual_s1, color: '#10b981' }, 
       { name: 'S2 / S3', value: grandTotals.kual_s2, color: '#3b82f6' }, 
       { name: '< S1', value: grandTotals.kual_kurang, color: '#f59e0b' },
       { name: 'Lainnya', value: grandTotals.kual_lain, color: '#6b7280' }
     ];
  } else if (activeView === 'KEPEGAWAIAN') {
     pieSegments = [
       { name: 'PNS', value: grandTotals.peg_pns, color: '#3b82f6' }, 
       { name: 'PPPK', value: grandTotals.peg_pppk, color: '#10b981' }, 
       { name: 'GTY/PTY', value: grandTotals.peg_gty, color: '#f97316' },
       { name: 'Honor', value: grandTotals.peg_honor, color: '#ef4444' },
       { name: 'Lainnya', value: grandTotals.peg_lain, color: '#6b7280' }
     ];
  } else if (activeView === 'SERTIFIKASI') {
     pieSegments = [
       { name: 'Sertifikasi', value: grandTotals.sert_sudah, color: '#10b981' }, 
       { name: 'Belum', value: grandTotals.sert_belum, color: '#ef4444' }  
     ];
  } else if (activeView === 'USIA') {
     pieSegments = [
       { name: '<= 30 Thn', value: grandTotals.usia_30, color: '#10b981' }, 
       { name: '31-40 Thn', value: grandTotals.usia_40, color: '#3b82f6' }, 
       { name: '41-50 Thn', value: grandTotals.usia_50, color: '#f59e0b' },
       { name: '>= 51 Thn', value: grandTotals.usia_51, color: '#ef4444' }
     ];
  } else if (activeView === 'PENSIUN') {
     pieTotal = grandTotals.pens_5 + grandTotals.pens_4 + grandTotals.pens_3 + grandTotals.pens_2 + grandTotals.pens_1;
     pieSegments = [
       { name: '5 Thn (56)', value: grandTotals.pens_5, color: '#10b981' }, 
       { name: '4 Thn (57)', value: grandTotals.pens_4, color: '#3b82f6' }, 
       { name: '3 Thn (58)', value: grandTotals.pens_3, color: '#f59e0b' },
       { name: '2 Thn (59)', value: grandTotals.pens_2, color: '#f97316' },
       { name: '1 Thn (60)', value: grandTotals.pens_1, color: '#ef4444' }
     ];
  }

  const downloadExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const safeJenjangName = activeLabel.replace(/\//g, '-');
    const worksheet = workbook.addWorksheet(`Rekap ${activeView} - ${safeJenjangName}`);

    let columns = [{ header: 'Wilayah (Kabupaten/Kota)', key: 'wilayah', width: 30 }];
    
    if (activeView === 'STATUS') columns.push({header:'Negeri',key:'status_n',width:15}, {header:'Swasta',key:'status_s',width:15});
    else if (activeView === 'GENDER') columns.push({header:'Laki-laki',key:'gen_l',width:15}, {header:'Perempuan',key:'gen_p',width:15});
    else if (activeView === 'KUALIFIKASI') columns.push({header:'S1/D4',key:'kual_s1',width:15}, {header:'S2/S3',key:'kual_s2',width:15}, {header:'Kurang S1',key:'kual_kurang',width:15}, {header:'Lainnya',key:'kual_lain',width:15});
    else if (activeView === 'KEPEGAWAIAN') columns.push({header:'PNS',key:'peg_pns',width:15}, {header:'PPPK',key:'peg_pppk',width:15}, {header:'GTY/PTY',key:'peg_gty',width:15}, {header:'Honor',key:'peg_honor',width:15}, {header:'Lainnya',key:'peg_lain',width:15});
    else if (activeView === 'SERTIFIKASI') columns.push({header:'Sertifikasi',key:'sert_sudah',width:15}, {header:'Belum',key:'sert_belum',width:15});
    else if (activeView === 'USIA') columns.push({header:'<=30 Thn',key:'usia_30',width:15}, {header:'31-40 Thn',key:'usia_40',width:15}, {header:'41-50 Thn',key:'usia_50',width:15}, {header:'>=51 Thn',key:'usia_51',width:15});
    else if (activeView === 'PENSIUN') columns.push({header:'Usia 56 (5 Thn)',key:'pens_5',width:15}, {header:'Usia 57 (4 Thn)',key:'pens_4',width:15}, {header:'Usia 58 (3 Thn)',key:'pens_3',width:15}, {header:'Usia 59 (2 Thn)',key:'pens_2',width:15}, {header:'Usia 60 (1 Thn)',key:'pens_1',width:15});

    if (activeView === 'PENSIUN') columns.push({ header: 'Total Proyeksi Pensiun', key: 'total_pensiun', width: 25 });
    else columns.push({ header: 'Total Guru', key: 'total', width: 15 });

    worksheet.columns = columns;

    aggregatedData.forEach(item => {
       const row = {...item};
       if (activeView === 'PENSIUN') row.total_pensiun = row.pens_1 + row.pens_2 + row.pens_3 + row.pens_4 + row.pens_5;
       worksheet.addRow(row);
    });

    const totalRowData = { wilayah: 'TOTAL KESELURUHAN', ...grandTotals };
    if (activeView === 'PENSIUN') totalRowData.total_pensiun = grandTotals.pens_1 + grandTotals.pens_2 + grandTotals.pens_3 + grandTotals.pens_4 + grandTotals.pens_5;
    
    const totalRow = worksheet.addRow(totalRowData);

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D4ED8' } };
    totalRow.font = { bold: true, color: { argb: 'FF1E3A8A' } };
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Rekap_Guru_${activeView}_${safeJenjangName}_${selectedYear}.xlsx`;
    link.click();
  };

  const handleBukaRincian = (wilayah) => {
    setSelectedWilayah(wilayah);
    setModalOpen(true);
  };

  const StatCard = ({ label, value, percentage, colorClasses }) => (
    <div className={`flex flex-col justify-between ${colorClasses.bg} p-3 md:p-4 rounded-2xl border ${colorClasses.border} transition-colors ${colorClasses.hover}`}>
       <div className="flex items-center gap-2 mb-2">
          <div className={`w-3 h-3 rounded-full ${colorClasses.dot} shadow-inner`}></div>
          <span className={`font-black text-[10px] md:text-[11px] ${colorClasses.textMain} uppercase leading-tight tracking-wide`}>{label}</span>
       </div>
       <div className="flex items-end justify-between">
          <span className={`font-black text-lg md:text-xl ${colorClasses.textVal} leading-none`}>{value.toLocaleString()}</span>
          <span className={`font-bold text-[10px] md:text-[11px] ${colorClasses.textPct}`}>({percentage}%)</span>
       </div>
    </div>
  );

  const colors = {
    blue: { bg: 'bg-blue-50', border: 'border-blue-100', hover: 'hover:bg-blue-100', dot: 'bg-blue-600', textMain: 'text-blue-900', textVal: 'text-blue-700', textPct: 'text-blue-500' },
    orange: { bg: 'bg-orange-50', border: 'border-orange-100', hover: 'hover:bg-orange-100', dot: 'bg-orange-500', textMain: 'text-orange-900', textVal: 'text-orange-600', textPct: 'text-orange-400' },
    emerald: { bg: 'bg-emerald-50', border: 'border-emerald-100', hover: 'hover:bg-emerald-100', dot: 'bg-emerald-500', textMain: 'text-emerald-900', textVal: 'text-emerald-600', textPct: 'text-emerald-500' },
    amber: { bg: 'bg-amber-50', border: 'border-amber-100', hover: 'hover:bg-amber-100', dot: 'bg-amber-500', textMain: 'text-amber-900', textVal: 'text-amber-600', textPct: 'text-amber-500' },
    red: { bg: 'bg-red-50', border: 'border-red-100', hover: 'hover:bg-red-100', dot: 'bg-red-500', textMain: 'text-red-900', textVal: 'text-red-600', textPct: 'text-red-500' },
    pink: { bg: 'bg-pink-50', border: 'border-pink-100', hover: 'hover:bg-pink-100', dot: 'bg-pink-500', textMain: 'text-pink-900', textVal: 'text-pink-600', textPct: 'text-pink-500' },
    gray: { bg: 'bg-gray-100', border: 'border-gray-200', hover: 'hover:bg-gray-200', dot: 'bg-gray-500', textMain: 'text-gray-700', textVal: 'text-gray-600', textPct: 'text-gray-500' }
  };

  const TABS = [
    { id: 'STATUS', label: 'Status Sekolah', icon: Building2, color: 'text-blue-700' },
    { id: 'GENDER', label: 'Gender', icon: Users, color: 'text-pink-700' },
    { id: 'KUALIFIKASI', label: 'Kualifikasi', icon: GraduationCap, color: 'text-purple-700' },
    { id: 'KEPEGAWAIAN', label: 'Kepegawaian', icon: Briefcase, color: 'text-teal-700' },
    { id: 'SERTIFIKASI', label: 'Profesi Guru', icon: Award, color: 'text-amber-700' },
    { id: 'USIA', label: 'Usia', icon: Clock, color: 'text-rose-700' },
    { id: 'PENSIUN', label: 'Proyeksi Pensiun', icon: CalendarDays, color: 'text-slate-700' },
  ];

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500">
      
      <div className="bg-white px-4 md:px-6 py-4 border-b border-gray-100 flex flex-col gap-4 shrink-0 shadow-sm z-20">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
           
           <div className="flex items-center gap-2 bg-gray-100 p-1.5 rounded-2xl w-full md:w-auto overflow-x-auto custom-scrollbar pb-1">
             {TABS.map(t => (
                <button 
                  key={t.id} 
                  onClick={() => setActiveView(t.id)} 
                  className={`flex items-center gap-1.5 px-3 py-2 md:py-2.5 rounded-xl font-black text-[10px] md:text-xs transition-all whitespace-nowrap ${activeView === t.id ? `bg-white ${t.color} shadow-sm scale-[1.02]` : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'}`}
                >
                  <t.icon size={14} /> {t.label}
                </button>
             ))}
           </div>

           <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm w-full md:w-auto transition-colors focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
                <GraduationCap size={16} className="text-gray-400 mr-2" />
                <select 
                  value={activeKategori} 
                  onChange={(e) => { 
                    setActiveKategori(e.target.value); 
                    setActiveBentuk('SEMUA'); 
                  }} 
                  className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer w-full"
                >
                  <option value="SEMUA">Semua Jenjang</option>
                  <option value="PAUD">PAUD</option>
                  <option value="PENDIDIKAN DASAR">Pendidikan Dasar</option>
                  <option value="PENDIDIKAN MENENGAH">Pendidikan Menengah</option>
                  <option value="PENDIDIKAN INKLUSIF">Pendidikan Inklusif</option>
                  <option value="PENDIDIKAN NON FORMAL">Pendidikan Non Formal</option>
                </select>
              </div>

              <button onClick={downloadExcel} className="flex items-center justify-center gap-2 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white px-5 py-2.5 rounded-xl font-black uppercase text-[10px] md:text-xs shadow-sm border border-blue-200 transition-all active:scale-95 shrink-0 w-full md:w-auto">
                <FileSpreadsheet size={16} /> Unduh
              </button>
           </div>
        </div>

        <div className="flex items-center gap-1.5 md:gap-2 overflow-x-auto pb-1 mt-1">
          <button 
            onClick={() => setActiveBentuk('SEMUA')} 
            className={`px-4 py-1.5 rounded-lg font-black text-[10px] md:text-xs transition-all duration-300 whitespace-nowrap border ${activeBentuk === 'SEMUA' ? 'bg-gray-800 text-white border-gray-800 shadow-md' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
          >
            Semua {activeKategori === 'SEMUA' ? 'Jenjang' : activeKategori}
          </button>
          {activeKategori === 'SEMUA' ? (
            Object.keys(SEMUA_SUBTABS_MAPPING).map(tab => (
              <button 
                key={tab} 
                onClick={() => setActiveBentuk(tab)} 
                className={`px-4 py-1.5 rounded-lg font-black text-[10px] md:text-xs transition-all duration-300 whitespace-nowrap border ${activeBentuk === tab ? 'bg-gray-800 text-white border-gray-800 shadow-md' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
              >
                {tab}
              </button>
            ))
          ) : (
            KATEGORI_MAPPING[activeKategori].map(tab => (
              <button 
                key={tab} 
                onClick={() => setActiveBentuk(tab)} 
                className={`px-4 py-1.5 rounded-lg font-black text-[10px] md:text-xs transition-all duration-300 whitespace-nowrap border ${activeBentuk === tab ? 'bg-gray-800 text-white border-gray-800 shadow-md' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
              >
                {tab}
              </button>
            ))
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row min-h-0 bg-gray-50/50">
        
        <div className="flex-1 lg:w-2/3 p-4 md:p-6 flex flex-col min-h-0 overflow-hidden border-r border-gray-200">
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 flex-1 flex flex-col overflow-hidden relative">
            <div className="flex-1 overflow-auto p-4 custom-scrollbar">
              <table className="w-full text-center border-separate border-spacing-y-2">
                <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm rounded-xl">
                  <tr className="text-[10px] font-black uppercase text-gray-500 whitespace-nowrap">
                    <th className="px-4 py-3 text-left rounded-l-xl">Wilayah</th>
                    
                    {activeView === 'STATUS' && (
                      <><th className="px-4 py-3 text-blue-600">Negeri</th><th className="px-4 py-3 text-orange-600">Swasta</th></>
                    )}
                    {activeView === 'GENDER' && (
                      <><th className="px-4 py-3 text-blue-600">Laki-laki</th><th className="px-4 py-3 text-pink-600">Perempuan</th></>
                    )}
                    {activeView === 'KUALIFIKASI' && (
                      <><th className="px-3 py-3 text-emerald-600">S1/D4</th><th className="px-3 py-3 text-blue-600">S2/S3</th><th className="px-3 py-3 text-amber-600">&lt; S1</th><th className="px-3 py-3 text-gray-500">Lainnya</th></>
                    )}
                    {activeView === 'KEPEGAWAIAN' && (
                      <><th className="px-3 py-3 text-blue-600">PNS</th><th className="px-3 py-3 text-emerald-600">PPPK</th><th className="px-3 py-3 text-orange-600">GTY/PTY</th><th className="px-3 py-3 text-red-600">Honor</th><th className="px-3 py-3 text-gray-500">Lainnya</th></>
                    )}
                    {activeView === 'SERTIFIKASI' && (
                      <><th className="px-4 py-3 text-emerald-600">Sertifikasi</th><th className="px-4 py-3 text-red-600">Belum</th></>
                    )}
                    {activeView === 'USIA' && (
                      <><th className="px-3 py-3 text-emerald-600">&lt;= 30</th><th className="px-3 py-3 text-blue-600">31-40</th><th className="px-3 py-3 text-amber-600">41-50</th><th className="px-3 py-3 text-red-600">&gt;= 51</th></>
                    )}
                    {activeView === 'PENSIUN' && (
                      <><th className="px-2 py-3 text-emerald-600">Usia 56</th><th className="px-2 py-3 text-blue-600">Usia 57</th><th className="px-2 py-3 text-amber-600">Usia 58</th><th className="px-2 py-3 text-orange-600">Usia 59</th><th className="px-2 py-3 text-red-600">Usia 60</th></>
                    )}

                    <th className="px-4 py-3 text-gray-800">{activeView === 'PENSIUN' ? 'Total Proyeksi' : 'Total Guru'}</th>
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
                      {activeView === 'GENDER' && (
                        <><td className="px-4 py-3 font-bold text-blue-600 text-sm border-y border-gray-100 bg-blue-50/30">{row.gen_l.toLocaleString()}</td><td className="px-4 py-3 font-bold text-pink-600 text-sm border-y border-gray-100 bg-pink-50/30">{row.gen_p.toLocaleString()}</td></>
                      )}
                      {activeView === 'KUALIFIKASI' && (
                        <><td className="px-3 py-3 font-bold text-emerald-600 text-sm border-y border-gray-100 bg-emerald-50/30">{row.kual_s1.toLocaleString()}</td><td className="px-3 py-3 font-bold text-blue-600 text-sm border-y border-gray-100 bg-blue-50/30">{row.kual_s2.toLocaleString()}</td><td className="px-3 py-3 font-bold text-amber-600 text-sm border-y border-gray-100 bg-amber-50/30">{row.kual_kurang.toLocaleString()}</td><td className="px-3 py-3 font-bold text-gray-500 text-sm border-y border-gray-100 bg-gray-50/50">{row.kual_lain.toLocaleString()}</td></>
                      )}
                      {activeView === 'KEPEGAWAIAN' && (
                        <><td className="px-3 py-3 font-bold text-blue-600 text-sm border-y border-gray-100 bg-blue-50/30">{row.peg_pns.toLocaleString()}</td><td className="px-3 py-3 font-bold text-emerald-600 text-sm border-y border-gray-100 bg-emerald-50/30">{row.peg_pppk.toLocaleString()}</td><td className="px-3 py-3 font-bold text-orange-600 text-sm border-y border-gray-100 bg-orange-50/30">{row.peg_gty.toLocaleString()}</td><td className="px-3 py-3 font-bold text-red-600 text-sm border-y border-gray-100 bg-red-50/30">{row.peg_honor.toLocaleString()}</td><td className="px-3 py-3 font-bold text-gray-500 text-sm border-y border-gray-100 bg-gray-50/50">{row.peg_lain.toLocaleString()}</td></>
                      )}
                      {activeView === 'SERTIFIKASI' && (
                        <><td className="px-4 py-3 font-bold text-emerald-600 text-sm border-y border-gray-100 bg-emerald-50/30">{row.sert_sudah.toLocaleString()}</td><td className="px-4 py-3 font-bold text-red-600 text-sm border-y border-gray-100 bg-red-50/30">{row.sert_belum.toLocaleString()}</td></>
                      )}
                      {activeView === 'USIA' && (
                        <><td className="px-3 py-3 font-bold text-emerald-600 text-sm border-y border-gray-100 bg-emerald-50/30">{row.usia_30.toLocaleString()}</td><td className="px-3 py-3 font-bold text-blue-600 text-sm border-y border-gray-100 bg-blue-50/30">{row.usia_40.toLocaleString()}</td><td className="px-3 py-3 font-bold text-amber-600 text-sm border-y border-gray-100 bg-amber-50/30">{row.usia_50.toLocaleString()}</td><td className="px-3 py-3 font-bold text-red-600 text-sm border-y border-gray-100 bg-red-50/30">{row.usia_51.toLocaleString()}</td></>
                      )}
                      {activeView === 'PENSIUN' && (
                        <><td className="px-2 py-3 font-bold text-emerald-600 text-sm border-y border-gray-100 bg-emerald-50/30">{row.pens_5.toLocaleString()}</td><td className="px-2 py-3 font-bold text-blue-600 text-sm border-y border-gray-100 bg-blue-50/30">{row.pens_4.toLocaleString()}</td><td className="px-2 py-3 font-bold text-amber-600 text-sm border-y border-gray-100 bg-amber-50/30">{row.pens_3.toLocaleString()}</td><td className="px-2 py-3 font-bold text-orange-600 text-sm border-y border-gray-100 bg-orange-50/30">{row.pens_2.toLocaleString()}</td><td className="px-2 py-3 font-bold text-red-600 text-sm border-y border-gray-100 bg-red-50/30">{row.pens_1.toLocaleString()}</td></>
                      )}

                      <td className="px-4 py-3 font-black text-gray-800 text-base border-y border-gray-100 bg-gray-50/80">
                        {activeView === 'PENSIUN' ? (row.pens_1 + row.pens_2 + row.pens_3 + row.pens_4 + row.pens_5).toLocaleString() : row.total.toLocaleString()}
                      </td>

                      <td className="px-4 py-3 rounded-r-2xl border-y border-r border-gray-100">
                         <button onClick={() => handleBukaRincian(row.wilayah)} className="flex items-center justify-center gap-2 bg-blue-50 text-blue-600 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase hover:bg-blue-600 hover:text-white transition-colors mx-auto">
                           <Eye size={14} /> Rincian
                         </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {aggregatedData.length > 0 && (
                  <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                    <tr className="bg-gray-100 text-center font-black uppercase text-xs border-t-2 border-gray-300 whitespace-nowrap">
                      <td className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-gray-300 text-gray-900">TOTAL KALIMANTAN BARAT</td>
                      
                      {activeView === 'STATUS' && (
                        <><td className="px-4 py-4 text-blue-700 border-y border-gray-300">{grandTotals.status_n.toLocaleString()}</td><td className="px-4 py-4 text-orange-700 border-y border-gray-300">{grandTotals.status_s.toLocaleString()}</td></>
                      )}
                      {activeView === 'GENDER' && (
                        <><td className="px-4 py-4 text-blue-700 border-y border-gray-300">{grandTotals.gen_l.toLocaleString()}</td><td className="px-4 py-4 text-pink-700 border-y border-gray-300">{grandTotals.gen_p.toLocaleString()}</td></>
                      )}
                      {activeView === 'KUALIFIKASI' && (
                        <><td className="px-3 py-4 text-emerald-700 border-y border-gray-300">{grandTotals.kual_s1.toLocaleString()}</td><td className="px-3 py-4 text-blue-700 border-y border-gray-300">{grandTotals.kual_s2.toLocaleString()}</td><td className="px-3 py-4 text-amber-700 border-y border-gray-300">{grandTotals.kual_kurang.toLocaleString()}</td><td className="px-3 py-4 text-gray-600 border-y border-gray-300">{grandTotals.kual_lain.toLocaleString()}</td></>
                      )}
                      {activeView === 'KEPEGAWAIAN' && (
                        <><td className="px-3 py-4 text-blue-700 border-y border-gray-300">{grandTotals.peg_pns.toLocaleString()}</td><td className="px-3 py-4 text-emerald-700 border-y border-gray-300">{grandTotals.peg_pppk.toLocaleString()}</td><td className="px-3 py-4 text-orange-700 border-y border-gray-300">{grandTotals.peg_gty.toLocaleString()}</td><td className="px-3 py-4 text-red-700 border-y border-gray-300">{grandTotals.peg_honor.toLocaleString()}</td><td className="px-3 py-4 text-gray-600 border-y border-gray-300">{grandTotals.peg_lain.toLocaleString()}</td></>
                      )}
                      {activeView === 'SERTIFIKASI' && (
                        <><td className="px-4 py-4 text-emerald-700 border-y border-gray-300">{grandTotals.sert_sudah.toLocaleString()}</td><td className="px-4 py-4 text-red-700 border-y border-gray-300">{grandTotals.sert_belum.toLocaleString()}</td></>
                      )}
                      {activeView === 'USIA' && (
                        <><td className="px-3 py-4 text-emerald-700 border-y border-gray-300">{grandTotals.usia_30.toLocaleString()}</td><td className="px-3 py-4 text-blue-700 border-y border-gray-300">{grandTotals.usia_40.toLocaleString()}</td><td className="px-3 py-4 text-amber-700 border-y border-gray-300">{grandTotals.usia_50.toLocaleString()}</td><td className="px-3 py-4 text-red-700 border-y border-gray-300">{grandTotals.usia_51.toLocaleString()}</td></>
                      )}
                      {activeView === 'PENSIUN' && (
                        <><td className="px-2 py-4 text-emerald-700 border-y border-gray-300">{grandTotals.pens_5.toLocaleString()}</td><td className="px-2 py-4 text-blue-700 border-y border-gray-300">{grandTotals.pens_4.toLocaleString()}</td><td className="px-2 py-4 text-amber-700 border-y border-gray-300">{grandTotals.pens_3.toLocaleString()}</td><td className="px-2 py-4 text-orange-700 border-y border-gray-300">{grandTotals.pens_2.toLocaleString()}</td><td className="px-2 py-4 text-red-700 border-y border-gray-300">{grandTotals.pens_1.toLocaleString()}</td></>
                      )}

                      <td className="px-4 py-4 text-gray-900 border-y border-gray-300 text-base">
                        {activeView === 'PENSIUN' ? (grandTotals.pens_1 + grandTotals.pens_2 + grandTotals.pens_3 + grandTotals.pens_4 + grandTotals.pens_5).toLocaleString() : grandTotals.total.toLocaleString()}
                      </td>
                      <td className="px-4 py-4 rounded-r-2xl border-y border-r border-gray-300">
                         <button onClick={() => handleBukaRincian('SEMUA')} className="flex items-center justify-center gap-2 bg-gray-800 text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase hover:bg-gray-900 transition-colors mx-auto shadow-md">
                           <Search size={14} /> Semua
                         </button>
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
              <div className="mt-4 px-2 text-right text-xs font-bold italic text-gray-400 pb-2">
                 Sumber : Data Dapodik PTK Update Pada Tanggal : {displayLastUpdated}
              </div>
            </div>
          </div>
        </div>

        <div className="lg:w-1/3 flex flex-col bg-white border-l border-gray-100 relative overflow-y-auto custom-scrollbar">
          
          <div className="text-center w-full px-4 pt-6 pb-2 shrink-0">
            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter">Proporsi {activeView}</h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
              Jenjang {activeLabel}
            </p>
          </div>

          <div className="flex items-center justify-center min-h-[220px] relative px-4 shrink-0">
             <PremiumPieChart segments={pieSegments} total={pieTotal} />
          </div>

          <div className="px-4 pb-6 pt-2 w-full shrink-0">
             
             {activeView === 'STATUS' && (
                <div className="flex flex-col gap-2">
                   <StatCard label="Guru Negeri" value={grandTotals.status_n} percentage={pieTotal > 0 ? ((grandTotals.status_n/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.blue} />
                   <StatCard label="Guru Swasta" value={grandTotals.status_s} percentage={pieTotal > 0 ? ((grandTotals.status_s/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.orange} />
                </div>
             )}

             {activeView === 'GENDER' && (
                <div className="flex flex-col gap-2">
                   <StatCard label="Laki-Laki" value={grandTotals.gen_l} percentage={pieTotal > 0 ? ((grandTotals.gen_l/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.blue} />
                   <StatCard label="Perempuan" value={grandTotals.gen_p} percentage={pieTotal > 0 ? ((grandTotals.gen_p/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.pink} />
                </div>
             )}

             {activeView === 'KUALIFIKASI' && (
                <div className="grid grid-cols-2 gap-2">
                   <StatCard label="S1 / D4" value={grandTotals.kual_s1} percentage={pieTotal > 0 ? ((grandTotals.kual_s1/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.emerald} />
                   <StatCard label="S2 / S3" value={grandTotals.kual_s2} percentage={pieTotal > 0 ? ((grandTotals.kual_s2/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.blue} />
                   <StatCard label="< S1" value={grandTotals.kual_kurang} percentage={pieTotal > 0 ? ((grandTotals.kual_kurang/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.amber} />
                   <StatCard label="Lainnya" value={grandTotals.kual_lain} percentage={pieTotal > 0 ? ((grandTotals.kual_lain/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.gray} />
                </div>
             )}

             {activeView === 'KEPEGAWAIAN' && (
                <div className="flex flex-col gap-2">
                   <div className="grid grid-cols-2 gap-2">
                     <StatCard label="PNS" value={grandTotals.peg_pns} percentage={pieTotal > 0 ? ((grandTotals.peg_pns/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.blue} />
                     <StatCard label="PPPK" value={grandTotals.peg_pppk} percentage={pieTotal > 0 ? ((grandTotals.peg_pppk/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.emerald} />
                   </div>
                   <StatCard label="GTY / PTY" value={grandTotals.peg_gty} percentage={pieTotal > 0 ? ((grandTotals.peg_gty/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.orange} />
                   <div className="grid grid-cols-2 gap-2">
                     <StatCard label="Honor" value={grandTotals.peg_honor} percentage={pieTotal > 0 ? ((grandTotals.peg_honor/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.red} />
                     <StatCard label="Lainnya" value={grandTotals.peg_lain} percentage={pieTotal > 0 ? ((grandTotals.peg_lain/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.gray} />
                   </div>
                </div>
             )}

             {activeView === 'SERTIFIKASI' && (
                <div className="flex flex-col gap-2">
                   <StatCard label="Sudah Sertifikasi" value={grandTotals.sert_sudah} percentage={pieTotal > 0 ? ((grandTotals.sert_sudah/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.emerald} />
                   <StatCard label="Belum Sertifikasi" value={grandTotals.sert_belum} percentage={pieTotal > 0 ? ((grandTotals.sert_belum/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.red} />
                </div>
             )}

             {activeView === 'USIA' && (
                <div className="grid grid-cols-2 gap-2">
                   <StatCard label="<= 30 Tahun" value={grandTotals.usia_30} percentage={pieTotal > 0 ? ((grandTotals.usia_30/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.emerald} />
                   <StatCard label="31 - 40 Tahun" value={grandTotals.usia_40} percentage={pieTotal > 0 ? ((grandTotals.usia_40/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.blue} />
                   <StatCard label="41 - 50 Tahun" value={grandTotals.usia_50} percentage={pieTotal > 0 ? ((grandTotals.usia_50/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.amber} />
                   <StatCard label=">= 51 Tahun" value={grandTotals.usia_51} percentage={pieTotal > 0 ? ((grandTotals.usia_51/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.red} />
                </div>
             )}

             {activeView === 'PENSIUN' && (
                <div className="flex flex-col gap-2">
                   <div className="grid grid-cols-2 gap-2">
                     <StatCard label="1 Thn Lagi (Usia 60)" value={grandTotals.pens_1} percentage={pieTotal > 0 ? ((grandTotals.pens_1/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.red} />
                     <StatCard label="2 Thn Lagi (Usia 59)" value={grandTotals.pens_2} percentage={pieTotal > 0 ? ((grandTotals.pens_2/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.orange} />
                   </div>
                   <StatCard label="3 Thn Lagi (Usia 58)" value={grandTotals.pens_3} percentage={pieTotal > 0 ? ((grandTotals.pens_3/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.amber} />
                   <div className="grid grid-cols-2 gap-2">
                     <StatCard label="4 Thn Lagi (Usia 57)" value={grandTotals.pens_4} percentage={pieTotal > 0 ? ((grandTotals.pens_4/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.blue} />
                     <StatCard label="5 Thn Lagi (Usia 56)" value={grandTotals.pens_5} percentage={pieTotal > 0 ? ((grandTotals.pens_5/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.emerald} />
                   </div>
                </div>
             )}

          </div>
        </div>

      </div>

      {activeView === 'STATUS' && (
        <RincianStatusSekolahGuru 
          isOpen={modalOpen} 
          onClose={() => setModalOpen(false)}
          data={data}
          initialWilayah={selectedWilayah}
          activeJenjang={activeLabel}
          displayLastUpdated={displayLastUpdated}
        />
      )}

      {activeView === 'GENDER' && (
        <RincianGenderGuru 
          isOpen={modalOpen} 
          onClose={() => setModalOpen(false)}
          data={data}
          initialWilayah={selectedWilayah}
          activeJenjang={activeLabel}
          displayLastUpdated={displayLastUpdated}
        />
      )}

      {activeView === 'KUALIFIKASI' && (
        <RincianKualifikasiGuru 
          isOpen={modalOpen} 
          onClose={() => setModalOpen(false)}
          data={data}
          initialWilayah={selectedWilayah}
          activeJenjang={activeLabel}
          displayLastUpdated={displayLastUpdated}
        />
      )}

      {activeView === 'KEPEGAWAIAN' && (
        <RincianKepegawaianGuru 
          isOpen={modalOpen} 
          onClose={() => setModalOpen(false)}
          data={data}
          initialWilayah={selectedWilayah}
          activeJenjang={activeLabel}
          displayLastUpdated={displayLastUpdated}
        />
      )}

      {activeView === 'SERTIFIKASI' && (
        <RincianProfesiGuru 
          isOpen={modalOpen} 
          onClose={() => setModalOpen(false)}
          data={data}
          initialWilayah={selectedWilayah}
          activeJenjang={activeLabel}
          displayLastUpdated={displayLastUpdated}
        />
      )}

      {activeView === 'USIA' && (
        <RincianUsiaGuru 
          isOpen={modalOpen} 
          onClose={() => setModalOpen(false)}
          data={data}
          initialWilayah={selectedWilayah}
          activeJenjang={activeLabel}
          displayLastUpdated={displayLastUpdated}
        />
      )}

      {activeView === 'PENSIUN' && (
        <RincianProyeksiPensiunGuru 
          isOpen={modalOpen} 
          onClose={() => setModalOpen(false)}
          data={data}
          initialWilayah={selectedWilayah}
          activeJenjang={activeLabel}
          displayLastUpdated={displayLastUpdated}
        />
      )}

    </div>
  );
}