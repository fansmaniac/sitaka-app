import React, { useState, useMemo, useEffect, useTransition } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Download, Users, MapPin, Eye, FileSpreadsheet, 
  Search, X, ChevronLeft, ChevronRight, Building2, 
  Award, Briefcase, GraduationCap, Clock, CalendarDays, Loader2
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { db } from '../../firebase/config';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';

// IMPORT SELURUH KOMPONEN MODAL RINCIAN
import RincianStatusSekolahGuru from '../../components/dapodik/dapodikGuru/RincianStatusSekolahGuru';
import RincianGenderGuru from '../../components/dapodik/dapodikGuru/RincianGenderGuru';
import RincianKualifikasiGuru from '../../components/dapodik/dapodikGuru/RincianKualifikasiGuru';
import RincianKepegawaianGuru from '../../components/dapodik/dapodikGuru/RincianKepegawaianGuru';
import RincianProfesiGuru from '../../components/dapodik/dapodikGuru/RincianProfesiGuru';
import RincianUsiaGuru from '../../components/dapodik/dapodikGuru/RincianUsiaGuru';
import RincianProyeksiPensiunGuru from '../../components/dapodik/dapodikGuru/RincianProyeksiPensiunGuru';

// =====================================================================
// UTILITY: CACHING LOKAL (BRANKAS BROWSER)
// =====================================================================
const DB_NAME = "SitakaCacheDB_GuruModul_Agregasi";
const STORE_NAME = "guruDataAgg";
const CACHE_EXPIRY_HOURS = 12;

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2); 
    request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
        }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = (e) => {
        console.warn("IndexedDB Error:", e);
        reject(request.error);
    };
  });
};

const saveToCache = async (key, data) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ data, timestamp: Date.now() }, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) { console.warn("Gagal menyimpan ke cache lokal", err); }
};

const getFromCache = async (key) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => {
        const result = req.result;
        if (result) {
          const hoursOld = (Date.now() - result.timestamp) / (1000 * 60 * 60);
          if (hoursOld < CACHE_EXPIRY_HOURS) return resolve(result.data);
        }
        resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  } catch (err) { return null; }
};

// =====================================================================
// UTILITY FUNCTIONS & CONFIG
// =====================================================================
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

const calculateAge = (birthDateString) => {
  if (!birthDateString || birthDateString === '-') return null;
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

const JENJANG_LABELS = [
  {id: 'PAUD', label: 'PAUD'},
  {id: 'SD', label: 'SD'},
  {id: 'SMP', label: 'SMP'},
  {id: 'SMA', label: 'SMA'},
  {id: 'SMK', label: 'SMK'},
  {id: 'SLB', label: 'SLB'},
  {id: 'NF', label: 'Non Formal'}
];

const BASE_KEYS = [
  'status_n', 'status_s', 'gen_l', 'gen_p', 
  'kual_s1', 'kual_s2', 'kual_kurang', 'kual_lain', 
  'peg_pns', 'peg_pppk', 'peg_gty', 'peg_honor', 'peg_lain', 
  'sert_sudah', 'sert_belum', 
  'usia_30', 'usia_40', 'usia_50', 'usia_51', 
  'pens_5', 'pens_4', 'pens_3', 'pens_2', 'pens_1'
];

// Helper untuk Render Kolom Dinamis berdasarkan View
const getColumnsForView = (viewId, prefix = '') => {
  switch(viewId) {
      case 'STATUS': return [
          {key: `${prefix}status_n`, label: 'Negeri', color: 'text-blue-600'},
          {key: `${prefix}status_s`, label: 'Swasta', color: 'text-orange-600'}
      ];
      case 'GENDER': return [
          {key: `${prefix}gen_l`, label: 'Laki-laki', color: 'text-blue-600'},
          {key: `${prefix}gen_p`, label: 'Perempuan', color: 'text-pink-600'}
      ];
      case 'KUALIFIKASI': return [
          {key: `${prefix}kual_s1`, label: 'S1/D4', color: 'text-emerald-600'},
          {key: `${prefix}kual_s2`, label: 'S2/S3', color: 'text-blue-600'},
          {key: `${prefix}kual_kurang`, label: '< S1', color: 'text-amber-600'},
          {key: `${prefix}kual_lain`, label: 'Lainnya', color: 'text-slate-500'}
      ];
      case 'KEPEGAWAIAN': return [
          {key: `${prefix}peg_pns`, label: 'PNS', color: 'text-blue-600'},
          {key: `${prefix}peg_pppk`, label: 'PPPK', color: 'text-emerald-600'},
          {key: `${prefix}peg_gty`, label: 'GTY/PTY', color: 'text-orange-600'},
          {key: `${prefix}peg_honor`, label: 'Honor', color: 'text-red-600'},
          {key: `${prefix}peg_lain`, label: 'Lainnya', color: 'text-slate-500'}
      ];
      case 'SERTIFIKASI': return [
          {key: `${prefix}sert_sudah`, label: 'Sertifikasi', color: 'text-emerald-600'},
          {key: `${prefix}sert_belum`, label: 'Belum', color: 'text-red-600'}
      ];
      case 'USIA': return [
          {key: `${prefix}usia_30`, label: '<= 30', color: 'text-emerald-600'},
          {key: `${prefix}usia_40`, label: '31-40', color: 'text-blue-600'},
          {key: `${prefix}usia_50`, label: '41-50', color: 'text-amber-600'},
          {key: `${prefix}usia_51`, label: '>= 51', color: 'text-red-600'}
      ];
      case 'PENSIUN': return [
          {key: `${prefix}pens_5`, label: 'Usia 56', color: 'text-emerald-600'},
          {key: `${prefix}pens_4`, label: 'Usia 57', color: 'text-blue-600'},
          {key: `${prefix}pens_3`, label: 'Usia 58', color: 'text-amber-600'},
          {key: `${prefix}pens_2`, label: 'Usia 59', color: 'text-orange-600'},
          {key: `${prefix}pens_1`, label: 'Usia 60', color: 'text-red-600'}
      ];
      default: return [];
  }
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
    <div className="w-full max-w-[280px] md:max-w-[320px] aspect-square relative flex items-center justify-center mx-auto drop-shadow-xl hover:scale-105 transition-transform duration-300">
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
                <text x={data.textX} y={data.lineEndY + 0.12} textAnchor={data.textAnchor} fill="#4B5563" className="font-bold text-[0.1px] tracking-widest">
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
// MAIN COMPONENT: DAPODIK GURU
// =====================================================================
export default function DapodikGuru({ selectedYear = '2026' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [dataGuru, setDataGuru] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const activeView = searchParams.get('tab')?.toUpperCase() || 'STATUS';
  const setActiveView = (viewId) => {
    setSearchParams(prev => {
      prev.set('tab', viewId.toLowerCase());
      return prev;
    });
  };
  
  const [activeKategori, setActiveKategori] = useState('SEMUA'); 
  const [activeBentuk, setActiveBentuk] = useState('SEMUA'); 

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedWilayah, setSelectedWilayah] = useState('SEMUA');
  const [fetchedDate, setFetchedDate] = useState('');

  const isSemuaJenjangView = activeKategori === 'SEMUA' && activeBentuk === 'SEMUA';

  // -------------------------------------------------------------------------
  // MENGAMBIL DATA DARI KOLEKSI "guru_agregasi"
  // -------------------------------------------------------------------------
  useEffect(() => {
    const fetchDataAgregasi = async () => {
      setLoading(true);
      const cacheKey = `guru_agregasi_v1_${selectedYear}`;
      
      try {
        const summaryRef = doc(db, 'guru_agregasi', `summary_${selectedYear}`);
        const summarySnap = await getDoc(summaryRef);
        
        let lastUpdatedStr = '';
        if (summarySnap.exists()) {
          const docData = summarySnap.data();
          if (docData.last_updated) {
            const d = new Date(docData.last_updated);
            const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
            lastUpdatedStr = `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()} Pukul ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            setFetchedDate(lastUpdatedStr); 
          }
        }

        const cachedData = await getFromCache(cacheKey);
        if (cachedData) {
          if (Array.isArray(cachedData)) {
             setDataGuru(cachedData); 
          } else {
             setDataGuru(cachedData.data || []); 
          }
          setLoading(false);
          return; 
        }

        const qChunks = query(collection(db, 'guru_agregasi'), where('tahun_data', '==', selectedYear));
        const snapChunks = await getDocs(qChunks);
        
        let allData = [];
        snapChunks.forEach(doc => {
          if (doc.id.includes('_chunk_')) {
             const chunkArr = doc.data().data_agregasi || [];
             allData.push(...chunkArr);
          }
        });

        setDataGuru(allData);
        await saveToCache(cacheKey, { data: allData, date: lastUpdatedStr });

      } catch (e) {
        console.error("Gagal menarik data guru agregasi", e);
        setDataGuru([]); 
      } finally {
        setLoading(false);
      }
    };
    
    fetchDataAgregasi();
  }, [selectedYear]);

  const displayLastUpdated = fetchedDate || 'Belum Di-Kalkulasi oleh Admin';
  const safeDataGuru = Array.isArray(dataGuru) ? dataGuru : [];

  const listKabupaten = useMemo(() => {
    const unik = [...new Set(safeDataGuru.map(item => item.kabupaten))];
    return unik.filter(k => k && k !== 'TIDAK DIKETAHUI').sort((a, b) => getKabupatenRank(a) - getKabupatenRank(b));
  }, [safeDataGuru]);

  const activeLabel = activeKategori === 'SEMUA' ? (activeBentuk === 'SEMUA' ? 'SEMUA JENJANG' : activeBentuk) : (activeBentuk === 'SEMUA' ? activeKategori : activeBentuk);

  // -------------------------------------------------------------------------
  // ENGINE AGREGASI DATA (DI-UPGRADE UNTUK MENDUKUNG NESTED HEADERS)
  // -------------------------------------------------------------------------
  const aggregatedData = useMemo(() => {
    const filteredData = safeDataGuru.filter(item => {
      const bentukDb = String(item.bentuk_pendidikan || '').trim().toUpperCase();
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
      const row = { wilayah: kab, total: 0 };
      // Init base keys
      BASE_KEYS.forEach(k => row[k] = 0);
      // Init jenjang specific keys
      JENJANG_LABELS.forEach(j => {
          row[`${j.id}_total`] = 0;
          BASE_KEYS.forEach(k => row[`${j.id}_${k}`] = 0);
      });
      mapAgg.set(kab, row);
    });

    filteredData.forEach(item => {
       const kab = item.kabupaten;
       if (!mapAgg.has(kab)) return; 
       const row = mapAgg.get(kab);

       const bentukDb = String(item.bentuk_pendidikan || '').trim().toUpperCase();
       let jGroup = '';
       if (KATEGORI_MAPPING['PAUD'].includes(bentukDb)) jGroup = 'PAUD';
       else if (['SD', 'SPK SD'].includes(bentukDb)) jGroup = 'SD';
       else if (['SMP', 'SPK SMP'].includes(bentukDb)) jGroup = 'SMP';
       else if (['SMA', 'SPK SMA'].includes(bentukDb)) jGroup = 'SMA';
       else if (['SMK'].includes(bentukDb)) jGroup = 'SMK';
       else if (['SLB', 'SDLB', 'SMPLB', 'SMALB'].includes(bentukDb)) jGroup = 'SLB';
       else if (['PKBM', 'SKB'].includes(bentukDb)) jGroup = 'NF';

       const inc = (key) => {
           row[key]++;
           if (jGroup) row[`${jGroup}_${key}`]++;
       };

       const isNegeri = String(item.status_sekolah).toUpperCase() === 'NEGERI';
       if (isNegeri) inc('status_n'); else inc('status_s');

       const gender = String(item.gender).trim().toUpperCase();
       if (gender === 'L' || gender === 'LAKI-LAKI') inc('gen_l');
       else if (gender === 'P' || gender === 'PEREMPUAN') inc('gen_p');

       const pend = String(item.pendidikan || '').toUpperCase();
       if (pend.includes('S1') || pend.includes('D4')) inc('kual_s1');
       else if (pend.includes('S2') || pend.includes('S3')) inc('kual_s2');
       else if (pend.includes('D1') || pend.includes('D2') || pend.includes('D3') || pend.includes('SMA') || pend.includes('SMK')) inc('kual_kurang');
       else inc('kual_lain');

       const peg = String(item.status_kepegawaian || '').toUpperCase();
       if (peg === 'PNS') inc('peg_pns');
       else if (peg === 'PPPK') inc('peg_pppk');
       else if (peg.includes('GTY') || peg.includes('PTY')) inc('peg_gty');
       else if (peg.includes('HONOR')) inc('peg_honor');
       else inc('peg_lain');

       const sert = String(item.bidang_studi_sertifikasi || '').trim();
       if (sert && sert !== '-' && sert !== '0') inc('sert_sudah');
       else inc('sert_belum');

       const tglLahir = item.tanggal_lahir;
       const age = calculateAge(tglLahir);
       if (age !== null) {
          if (age <= 30) inc('usia_30');
          else if (age <= 40) inc('usia_40');
          else if (age <= 50) inc('usia_50');
          else inc('usia_51');

          if (age === 56) inc('pens_5');
          else if (age === 57) inc('pens_4');
          else if (age === 58) inc('pens_3');
          else if (age === 59) inc('pens_2');
          else if (age === 60) inc('pens_1');
       }

       inc('total');
    });

    return Array.from(mapAgg.values()).sort((a, b) => getKabupatenRank(a.wilayah) - getKabupatenRank(b.wilayah));
  }, [safeDataGuru, activeKategori, activeBentuk, listKabupaten]);

  const grandTotals = useMemo(() => {
    const initial = { total: 0 };
    BASE_KEYS.forEach(k => initial[k] = 0);
    JENJANG_LABELS.forEach(j => {
        initial[`${j.id}_total`] = 0;
        BASE_KEYS.forEach(k => initial[`${j.id}_${k}`] = 0);
    });

    return aggregatedData.reduce((acc, curr) => {
        Object.keys(initial).forEach(k => {
            acc[k] += curr[k] || 0;
        });
        return acc;
    }, initial);
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

  // -------------------------------------------------------------------------
  // FUNGSI UNDUH EXCEL DINAMIS
  // -------------------------------------------------------------------------
  const downloadExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const safeJenjangName = activeLabel.replace(/\//g, '-');
    const worksheet = workbook.addWorksheet(`Rekap ${activeView} - ${safeJenjangName}`);

    let columns = [{ header: 'Wilayah (Kabupaten/Kota)', key: 'wilayah', width: 30 }];
    
    // Sesuaikan Header Excel jika berada di mode "Semua Jenjang"
    if (isSemuaJenjangView) {
        JENJANG_LABELS.forEach(j => {
            getColumnsForView(activeView, `${j.id}_`).forEach(col => {
                columns.push({ header: `${j.label} - ${col.label}`, key: col.key, width: 15 });
            });
        });
    } else {
        getColumnsForView(activeView).forEach(col => {
            columns.push({ header: col.label, key: col.key, width: 15 });
        });
    }

    if (activeView === 'PENSIUN') columns.push({ header: 'Total Proyeksi Pensiun', key: 'total_pensiun', width: 25 });
    else columns.push({ header: 'Total Guru', key: 'total', width: 15 });

    worksheet.columns = columns;

    aggregatedData.forEach(item => {
       const row = {...item};
       if (activeView === 'PENSIUN') {
           row.total_pensiun = row.pens_1 + row.pens_2 + row.pens_3 + row.pens_4 + row.pens_5;
       }
       worksheet.addRow(row);
    });

    const totalRowData = { wilayah: 'TOTAL KESELURUHAN', ...grandTotals };
    if (activeView === 'PENSIUN') {
        totalRowData.total_pensiun = grandTotals.pens_1 + grandTotals.pens_2 + grandTotals.pens_3 + grandTotals.pens_4 + grandTotals.pens_5;
    }
    
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
    <div className={`flex flex-col justify-between ${colorClasses.bg} p-4 rounded-2xl border ${colorClasses.border} transition-colors ${colorClasses.hover} h-full`}>
       <div className="flex items-center gap-2 mb-2">
          <div className={`w-3 h-3 rounded-full ${colorClasses.dot} shadow-inner`}></div>
          <span className={`font-black text-[11px] md:text-xs ${colorClasses.textMain} uppercase leading-tight tracking-wide`}>{label}</span>
       </div>
       <div className="flex items-end justify-between">
          <span className={`font-black text-xl md:text-2xl ${colorClasses.textVal} leading-none`}>{value.toLocaleString()}</span>
          <span className={`font-bold text-[11px] md:text-sm ${colorClasses.textPct}`}>({percentage}%)</span>
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
    gray: { bg: 'bg-slate-50', border: 'border-slate-200', hover: 'hover:bg-slate-100', dot: 'bg-slate-500', textMain: 'text-slate-700', textVal: 'text-slate-600', textPct: 'text-slate-500' }
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

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center italic font-black uppercase tracking-widest text-teal-300">
        <Loader2 className="animate-spin text-teal-600 mb-4" size={64} />
        Memuat Agregasi Data Guru...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 animate-in fade-in duration-500">
      
      {/* TABS HEADER: FILTER TAB VIEW & DROPDOWNS */}
      <div className="bg-white px-4 md:px-6 py-4 border-b border-gray-100 flex flex-col gap-4 shrink-0 shadow-sm z-20 sticky top-0">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
           
           {/* MAIN VIEW TOGGLE (PTK TABS) */}
           <div className="flex items-center bg-gray-100 p-1.5 rounded-2xl w-full md:w-auto overflow-x-auto custom-scrollbar">
             {TABS.map(t => (
                <button 
                  key={t.id} 
                  onClick={() => setActiveView(t.id)} 
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition-all whitespace-nowrap ${activeView === t.id ? `bg-white ${t.color} shadow-sm scale-[1.02]` : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'}`}
                >
                  <t.icon size={16} /> {t.label}
                </button>
             ))}
           </div>

           {/* DROPDOWN KATEGORI & UNDUH */}
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

              <button onClick={downloadExcel} className="flex items-center justify-center gap-2 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white px-5 py-2.5 rounded-xl font-black uppercase text-xs shadow-sm border border-blue-200 transition-all active:scale-95 shrink-0">
                <FileSpreadsheet size={16} /> Unduh
              </button>
           </div>
        </div>

        {/* HORIZONTAL SUB-TABS FILTER */}
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

      {/* TOP SECTION: VISUALISASI GRAFIK & STAT CARDS */}
      <div className="bg-white border-b border-gray-200 py-6 px-4 md:px-8 shrink-0">
         <div className="w-full max-w-[98%] mx-auto flex flex-col lg:flex-row items-center justify-between gap-8">
            
            {/* Bagian Kiri: Judul & Komponen PremiumPieChart */}
            <div className="flex-1 w-full max-w-sm flex flex-col items-center lg:items-start text-center lg:text-left">
               <h2 className="text-2xl md:text-3xl font-black text-gray-800 uppercase tracking-tighter leading-tight">
                  Proporsi {activeView}
               </h2>
               <p className="text-sm md:text-base font-bold text-gray-400 uppercase tracking-widest mt-1 mb-6">
                  Jenjang {activeLabel}
               </p>
               <div className="w-full h-full min-h-[220px]">
                  <PremiumPieChart segments={pieSegments} total={pieTotal} />
               </div>
            </div>

            {/* Bagian Kanan: Komponen StatCard (Grid Layout) */}
            <div className="flex-1 w-full lg:max-w-2xl">
               {activeView === 'STATUS' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <StatCard label="Guru Negeri" value={grandTotals.status_n} percentage={pieTotal > 0 ? ((grandTotals.status_n/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.blue} />
                     <StatCard label="Guru Swasta" value={grandTotals.status_s} percentage={pieTotal > 0 ? ((grandTotals.status_s/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.orange} />
                  </div>
               )}

               {activeView === 'GENDER' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <StatCard label="Laki-Laki" value={grandTotals.gen_l} percentage={pieTotal > 0 ? ((grandTotals.gen_l/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.blue} />
                     <StatCard label="Perempuan" value={grandTotals.gen_p} percentage={pieTotal > 0 ? ((grandTotals.gen_p/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.pink} />
                  </div>
               )}

               {activeView === 'KUALIFIKASI' && (
                  <div className="grid grid-cols-2 gap-4">
                     <StatCard label="S1 / D4" value={grandTotals.kual_s1} percentage={pieTotal > 0 ? ((grandTotals.kual_s1/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.emerald} />
                     <StatCard label="S2 / S3" value={grandTotals.kual_s2} percentage={pieTotal > 0 ? ((grandTotals.kual_s2/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.blue} />
                     <StatCard label="< S1" value={grandTotals.kual_kurang} percentage={pieTotal > 0 ? ((grandTotals.kual_kurang/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.amber} />
                     <StatCard label="Lainnya" value={grandTotals.kual_lain} percentage={pieTotal > 0 ? ((grandTotals.kual_lain/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.gray} />
                  </div>
               )}

               {activeView === 'KEPEGAWAIAN' && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                     <StatCard label="PNS" value={grandTotals.peg_pns} percentage={pieTotal > 0 ? ((grandTotals.peg_pns/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.blue} />
                     <StatCard label="PPPK" value={grandTotals.peg_pppk} percentage={pieTotal > 0 ? ((grandTotals.peg_pppk/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.emerald} />
                     <StatCard label="GTY / PTY" value={grandTotals.peg_gty} percentage={pieTotal > 0 ? ((grandTotals.peg_gty/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.orange} />
                     <StatCard label="Honor" value={grandTotals.peg_honor} percentage={pieTotal > 0 ? ((grandTotals.peg_honor/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.red} />
                     <StatCard label="Lainnya" value={grandTotals.peg_lain} percentage={pieTotal > 0 ? ((grandTotals.peg_lain/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.gray} />
                  </div>
               )}

               {activeView === 'SERTIFIKASI' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <StatCard label="Sudah Sertifikasi" value={grandTotals.sert_sudah} percentage={pieTotal > 0 ? ((grandTotals.sert_sudah/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.emerald} />
                     <StatCard label="Belum Sertifikasi" value={grandTotals.sert_belum} percentage={pieTotal > 0 ? ((grandTotals.sert_belum/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.red} />
                  </div>
               )}

               {activeView === 'USIA' && (
                  <div className="grid grid-cols-2 gap-4">
                     <StatCard label="<= 30 Tahun" value={grandTotals.usia_30} percentage={pieTotal > 0 ? ((grandTotals.usia_30/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.emerald} />
                     <StatCard label="31 - 40 Tahun" value={grandTotals.usia_40} percentage={pieTotal > 0 ? ((grandTotals.usia_40/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.blue} />
                     <StatCard label="41 - 50 Tahun" value={grandTotals.usia_50} percentage={pieTotal > 0 ? ((grandTotals.usia_50/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.amber} />
                     <StatCard label=">= 51 Tahun" value={grandTotals.usia_51} percentage={pieTotal > 0 ? ((grandTotals.usia_51/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.red} />
                  </div>
               )}

               {activeView === 'PENSIUN' && (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                     <StatCard label="1 Thn (Usia 60)" value={grandTotals.pens_1} percentage={pieTotal > 0 ? ((grandTotals.pens_1/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.red} />
                     <StatCard label="2 Thn (Usia 59)" value={grandTotals.pens_2} percentage={pieTotal > 0 ? ((grandTotals.pens_2/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.orange} />
                     <StatCard label="3 Thn (Usia 58)" value={grandTotals.pens_3} percentage={pieTotal > 0 ? ((grandTotals.pens_3/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.amber} />
                     <StatCard label="4 Thn (Usia 57)" value={grandTotals.pens_4} percentage={pieTotal > 0 ? ((grandTotals.pens_4/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.blue} />
                     <StatCard label="5 Thn (Usia 56)" value={grandTotals.pens_5} percentage={pieTotal > 0 ? ((grandTotals.pens_5/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.emerald} />
                  </div>
               )}
            </div>
         </div>
      </div>

      {/* BOTTOM SECTION: MAIN TABLE (DINAMIS MENDUKUNG KOLOM BERSARANG) */}
      <div className="flex-1 w-full max-w-[98%] mx-auto p-4 md:p-6 mb-12">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-center border-separate border-spacing-0">
              
              <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm">
                {isSemuaJenjangView ? (
                   <>
                     <tr className="text-[10px] md:text-xs font-black uppercase text-gray-500 whitespace-nowrap">
                       <th rowSpan={2} className="px-4 py-4 text-center border-b-2 border-gray-200 bg-gray-50 text-gray-700 w-16">Nomor</th>
                       <th rowSpan={2} className="px-4 py-4 text-left border-b-2 border-gray-200 bg-gray-50 text-gray-700 sticky left-0 z-20 w-48 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] border-r">Wilayah / Kabupaten / Kota</th>
                       
                       {/* NESTED HEADERS UNTUK SEMUA JENJANG */}
                       {JENJANG_LABELS.map(j => (
                         <th key={j.id} colSpan={getColumnsForView(activeView).length} className="px-4 py-2 border-b border-gray-200 text-center border-r bg-gray-100 text-gray-700 tracking-wide">
                           {j.label}
                         </th>
                       ))}
                       
                       <th rowSpan={2} className="px-4 py-4 border-b-2 border-gray-200 text-gray-800 w-32 border-l">{activeView === 'PENSIUN' ? 'Total Proyeksi' : 'Total Guru'}</th>
                       <th rowSpan={2} className="px-4 py-4 border-b-2 border-gray-200 w-32">Aksi</th>
                     </tr>
                     <tr className="text-[10px] md:text-xs font-black uppercase text-gray-500 whitespace-nowrap">
                       {JENJANG_LABELS.map(j => (
                         getColumnsForView(activeView, `${j.id}_`).map((col, cIdx, arr) => (
                           <th key={col.key} className={`px-2 py-2 border-b-2 border-gray-200 ${col.color} ${cIdx === arr.length - 1 ? 'border-r' : ''}`}>
                             {col.label}
                           </th>
                         ))
                       ))}
                     </tr>
                   </>
                ) : (
                   <tr className="text-[10px] md:text-xs font-black uppercase text-gray-500 whitespace-nowrap">
                     <th className="px-4 py-4 text-center border-b-2 border-gray-200 bg-gray-50 text-gray-700 w-16">Nomor</th>
                     <th className="px-4 py-4 text-left border-b-2 border-gray-200 bg-gray-50 text-gray-700 sticky left-0 z-20 w-48 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] border-r">Wilayah / Kabupaten / Kota</th>
                     
                     {getColumnsForView(activeView).map(col => (
                       <th key={col.key} className={`px-4 py-4 border-b-2 border-gray-200 ${col.color}`}>{col.label}</th>
                     ))}
                     
                     <th className="px-4 py-4 border-b-2 border-gray-200 text-gray-800 w-32">{activeView === 'PENSIUN' ? 'Total Proyeksi' : 'Total Guru'}</th>
                     <th className="px-4 py-4 border-b-2 border-gray-200 w-32">Aksi</th>
                   </tr>
                )}
              </thead>
              
              <tbody className="divide-y divide-gray-100">
                {aggregatedData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-4 py-3 font-bold text-xs md:text-sm text-gray-500 text-center">{idx + 1}</td>
                    <td className="px-4 py-3 font-black text-xs md:text-sm text-gray-800 uppercase text-left sticky left-0 bg-white group-hover:bg-blue-50/30 z-10 whitespace-nowrap shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] border-r border-gray-100">{row.wilayah}</td>
                    
                    {/* ISI TABEL DINAMIS */}
                    {isSemuaJenjangView ? (
                       JENJANG_LABELS.map(j => (
                         getColumnsForView(activeView, `${j.id}_`).map((col, cIdx, arr) => (
                           <td key={col.key} className={`px-2 py-3 font-bold text-xs ${col.color} ${cIdx === arr.length - 1 ? 'border-r border-gray-100' : ''}`}>
                             {row[col.key].toLocaleString()}
                           </td>
                         ))
                       ))
                    ) : (
                       getColumnsForView(activeView).map(col => (
                         <td key={col.key} className={`px-4 py-3 font-bold text-xs md:text-sm ${col.color}`}>
                           {row[col.key].toLocaleString()}
                         </td>
                       ))
                    )}

                    <td className="px-4 py-3 font-black text-xs md:text-sm text-gray-800 bg-gray-50 border-l border-gray-100">
                      {activeView === 'PENSIUN' ? (row.pens_1 + row.pens_2 + row.pens_3 + row.pens_4 + row.pens_5).toLocaleString() : row.total.toLocaleString()}
                    </td>

                    <td className="px-4 py-3 border-l border-gray-100">
                       <button onClick={() => handleBukaRincian(row.wilayah)} className="flex items-center justify-center gap-1.5 bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-black uppercase hover:bg-blue-600 hover:text-white transition-colors mx-auto">
                         <Eye size={14} /> Rincian
                       </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              
              <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                <tr className="bg-gray-100 text-center font-black uppercase text-[10px] md:text-xs border-t-2 border-gray-300">
                  <td className="px-4 py-4 border-t-2 border-gray-300"></td>
                  <td className="px-4 py-4 text-left text-gray-900 border-t-2 border-gray-300 sticky left-0 bg-gray-100 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] border-r">TOTAL KALBAR</td>
                  
                  {/* FOOTER TOTAL DINAMIS */}
                  {isSemuaJenjangView ? (
                     JENJANG_LABELS.map(j => (
                       getColumnsForView(activeView, `${j.id}_`).map((col, cIdx, arr) => (
                         <td key={col.key} className={`px-2 py-4 border-t-2 border-gray-300 ${col.color} ${cIdx === arr.length - 1 ? 'border-r border-gray-200' : ''}`}>
                           {grandTotals[col.key].toLocaleString()}
                         </td>
                       ))
                     ))
                  ) : (
                     getColumnsForView(activeView).map(col => (
                       <td key={col.key} className={`px-4 py-4 border-t-2 border-gray-300 ${col.color}`}>
                         {grandTotals[col.key].toLocaleString()}
                       </td>
                     ))
                  )}

                  <td className="px-4 py-4 text-gray-900 border-t-2 border-gray-300 text-sm bg-gray-200/50 border-l border-gray-200">
                    {activeView === 'PENSIUN' ? (grandTotals.pens_1 + grandTotals.pens_2 + grandTotals.pens_3 + grandTotals.pens_4 + grandTotals.pens_5).toLocaleString() : grandTotals.total.toLocaleString()}
                  </td>
                  <td className="px-4 py-4 border-t-2 border-gray-300 border-l border-gray-200">
                     <button onClick={() => handleBukaRincian('SEMUA')} className="flex items-center justify-center gap-1.5 bg-gray-800 text-white px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-black uppercase hover:bg-gray-900 transition-colors mx-auto shadow-md">
                       <Search size={14} /> Semua
                     </button>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="bg-gray-50 px-4 py-3 text-right text-[10px] md:text-xs font-bold italic text-gray-400 border-t border-gray-200">
              Sumber : Data Dapodik PTK Update Pada Tanggal : {displayLastUpdated}
          </div>
        </div>
      </div>

      {/* KONDISIONAL RENDER MODAL RINCIAN */}
      {modalOpen && activeView === 'STATUS' && (
        <RincianStatusSekolahGuru 
          isOpen={modalOpen} onClose={() => setModalOpen(false)}
          data={safeDataGuru} initialWilayah={selectedWilayah}
          activeJenjang={activeLabel} displayLastUpdated={displayLastUpdated}
        />
      )}

      {modalOpen && activeView === 'GENDER' && (
        <RincianGenderGuru 
          isOpen={modalOpen} onClose={() => setModalOpen(false)}
          data={safeDataGuru} initialWilayah={selectedWilayah}
          activeJenjang={activeLabel} displayLastUpdated={displayLastUpdated}
        />
      )}

      {modalOpen && activeView === 'KUALIFIKASI' && (
        <RincianKualifikasiGuru 
          isOpen={modalOpen} onClose={() => setModalOpen(false)}
          data={safeDataGuru} initialWilayah={selectedWilayah}
          activeJenjang={activeLabel} displayLastUpdated={displayLastUpdated}
        />
      )}

      {modalOpen && activeView === 'KEPEGAWAIAN' && (
        <RincianKepegawaianGuru 
          isOpen={modalOpen} onClose={() => setModalOpen(false)}
          data={safeDataGuru} initialWilayah={selectedWilayah}
          activeJenjang={activeLabel} displayLastUpdated={displayLastUpdated}
        />
      )}

      {modalOpen && activeView === 'SERTIFIKASI' && (
        <RincianProfesiGuru 
          isOpen={modalOpen} onClose={() => setModalOpen(false)}
          data={safeDataGuru} initialWilayah={selectedWilayah}
          activeJenjang={activeLabel} displayLastUpdated={displayLastUpdated}
        />
      )}

      {modalOpen && activeView === 'USIA' && (
        <RincianUsiaGuru 
          isOpen={modalOpen} onClose={() => setModalOpen(false)}
          data={safeDataGuru} initialWilayah={selectedWilayah}
          activeJenjang={activeLabel} displayLastUpdated={displayLastUpdated}
        />
      )}

      {modalOpen && activeView === 'PENSIUN' && (
        <RincianProyeksiPensiunGuru 
          isOpen={modalOpen} onClose={() => setModalOpen(false)}
          data={safeDataGuru} initialWilayah={selectedWilayah}
          activeJenjang={activeLabel} displayLastUpdated={displayLastUpdated}
        />
      )}

    </div>
  );
}