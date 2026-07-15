import React, { useState, useMemo, useEffect, useTransition } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  School, MapPin, Eye, FileSpreadsheet, 
  Search, X, ChevronLeft, ChevronRight, Building2, Layers, Award, GraduationCap, Loader2
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { db } from '../../firebase/config';
import { collection, query, where, getDocs, limit, doc, getDoc } from 'firebase/firestore';

// IMPORT KOMPONEN MODAL RINCIAN
import RincianStatusSekolah from '../../components/dapodik/dapodikSekolah/RincianStatusSekolah';
import RincianAkreditasiSekolah from '../../components/dapodik/dapodikSekolah/RincianAkreditasiSekolah';
import RincianRombelSekolah from '../../components/dapodik/dapodikSekolah/RincianRombelSekolah';

// =====================================================================
// UTILITY: CACHING LOKAL (BRANKAS BROWSER)
// =====================================================================
const DB_NAME = "SitakaCacheDB_SekolahModul_Agregasi";
const STORE_NAME = "sekolahDataAgg";
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
// UTILITY FUNCTIONS
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

// =====================================================================
// MAPPING STRUKTUR JENJANG DAN TAB MENU
// =====================================================================
const JENJANG_GROUPS = {
  'PAUD': ['TK', 'KB', 'TPA', 'SPS'],
  'SD': ['SD', 'SPK SD'],
  'SMP': ['SMP', 'SPK SMP'],
  'SMA': ['SMA', 'SPK SMA'],
  'SMK': ['SMK'],
  'SLB (Inklusif)': ['SLB'],
  'SLB': ['SLB'],
  'NON FORMAL': ['PKBM', 'SKB']
};

const KATEGORI_BENTUK = {
  'PAUD': ['TK', 'KB', 'TPA', 'SPS'],
  'DASAR': ['SD', 'SPK SD', 'SMP', 'SPK SMP'],
  'MENENGAH': ['SMA', 'SPK SMA', 'SMK'],
  'INKLUSIF': ['SLB'],
  'NON FORMAL': ['PKBM', 'SKB']
};

const TABS_MAPPING = {
  'SEMUA': ['PAUD', 'SD', 'SMP', 'SMA', 'SMK', 'SLB (Inklusif)', 'NON FORMAL'],
  'PAUD': ['TK', 'KB', 'TPA', 'SPS'],
  'DASAR': ['SD', 'SMP'],
  'MENENGAH': ['SMA', 'SMK'],
  'INKLUSIF': ['SLB'],
  'NON FORMAL': ['PKBM', 'SKB']
};

// =====================================================================
// PREMIUM PIE CHART COMPONENT
// =====================================================================
const PremiumPieChart = ({ segments, total }) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  if (total === 0) {
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
    <div className="w-full max-w-[280px] md:max-w-[320px] aspect-square relative flex items-center justify-center mx-auto drop-shadow-xl hover:scale-105 transition-transform duration-300">
      <svg viewBox="-1.8 -1.5 3.6 3" className="w-full h-full max-h-[300px] overflow-visible drop-shadow-xl">
        <g transform="rotate(-90)">
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
          {chartData.map((data) => (
            <g 
              key={`label-${data.index}`}
              className={`transition-opacity duration-300 ${hoveredIndex !== null && hoveredIndex !== data.index ? 'opacity-30' : 'opacity-100'}`}
            >
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
// MAIN COMPONENT: DAPODIK SEKOLAH
// =====================================================================
export default function DapodikSekolah({ selectedYear = '2026' }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [dataSekolah, setDataSekolah] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const rawView = searchParams.get('view') ? searchParams.get('view').toUpperCase() : 'STATUS';
  const activeView = ['STATUS', 'AKREDITASI', 'ROMBEL'].includes(rawView) ? rawView : 'STATUS';

  const rawKategori = searchParams.get('kategori') ? searchParams.get('kategori').toUpperCase() : 'SEMUA';
  const activeKategori = Object.keys(TABS_MAPPING).includes(rawKategori) ? rawKategori : 'SEMUA'; 

  const urlJenjang = searchParams.get('jenjang') || 'SEMUA';
  const validTabs = TABS_MAPPING[activeKategori] || [];
  const matchedTab = validTabs.find(t => t.toUpperCase() === urlJenjang.toUpperCase());
  const activeTab = matchedTab || 'SEMUA';

  const [isPending, startTransition] = useTransition();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedWilayah, setSelectedWilayah] = useState('SEMUA');
  const [fetchedDate, setFetchedDate] = useState('');

  const setActiveView = (val) => setSearchParams(prev => { prev.set('view', val); return prev; });
  const setActiveKategori = (val) => setSearchParams(prev => { prev.set('kategori', val); prev.set('jenjang', 'SEMUA'); return prev; });
  const setActiveTab = (val) => setSearchParams(prev => { prev.set('jenjang', val); return prev; });

  // -------------------------------------------------------------------------
  // FETCH AGREGASI
  // -------------------------------------------------------------------------
  useEffect(() => {
    const fetchDataAgregasi = async () => {
      setLoading(true);
      const cacheKey = `sekolah_agregasi_v1_${selectedYear}`;
      
      try {
        // 1. Tarik Dokumen Summary dari Firebase untuk dapatkan tanggal ter-update
        const summaryRef = doc(db, 'sekolah_agregasi', `summary_${selectedYear}`);
        const summarySnap = await getDoc(summaryRef);
        
        let lastUpdatedStr = '';
        if (summarySnap.exists()) {
          const docData = summarySnap.data();
          if (docData.last_updated) {
            const d = new Date(docData.last_updated);
            const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
            lastUpdatedStr = `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()} Pukul ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
            setFetchedDate(lastUpdatedStr); // Langsung set tanggal ke state
          }
        }

        // 2. Cek Cache Lokal untuk Data Tabel
        const cachedData = await getFromCache(cacheKey);
        
        if (cachedData) {
          // Jika ada cache, render dari cache
          if (Array.isArray(cachedData)) {
             setDataSekolah(cachedData); 
          } else {
             setDataSekolah(cachedData.data || []); 
          }
          setLoading(false);
          return; // Berhenti di sini, tidak perlu unduh chunk lagi
        }

        // 3. Jika tidak ada Cache, baru fetch chunk dari Firebase
        const qChunks = query(collection(db, 'sekolah_agregasi'), where('tahun_data', '==', selectedYear));
        const snapChunks = await getDocs(qChunks);
        
        let allData = [];
        snapChunks.forEach(doc => {
          if (doc.id.includes('_chunk_')) {
             const chunkArr = doc.data().data_agregasi || [];
             allData.push(...chunkArr);
          }
        });

        setDataSekolah(allData);
        // Simpan data beserta tanggal update terbarunya ke cache
        await saveToCache(cacheKey, { data: allData, date: lastUpdatedStr });

      } catch (e) {
        console.error("Gagal menarik data sekolah agregasi", e);
        setDataSekolah([]); 
      } finally {
        setLoading(false);
      }
    };
    
    fetchDataAgregasi();
  }, [selectedYear]);

  const displayLastUpdated = fetchedDate || 'Belum Di-Kalkulasi oleh Admin';
  const safeDataSekolah = Array.isArray(dataSekolah) ? dataSekolah : [];

  const listKabupaten = useMemo(() => {
    const unik = [...new Set(safeDataSekolah.map(item => item.kabupaten))];
    return unik.filter(Boolean).sort((a, b) => getKabupatenRank(a) - getKabupatenRank(b));
  }, [safeDataSekolah]);

  // ENGINE AGREGASI MATRIKS 
  const aggregatedData = useMemo(() => {
    const filteredData = safeDataSekolah.filter(item => {
      const bentukDb = String(item.bentuk_pendidikan || '').trim().toUpperCase();
      
      if (activeKategori === 'SEMUA') {
         if (activeTab === 'SEMUA') return true;
         const allowed = JENJANG_GROUPS[activeTab] || [];
         return allowed.includes(bentukDb);
      } else {
         if (activeTab === 'SEMUA') {
            const allowed = KATEGORI_BENTUK[activeKategori] || [];
            return allowed.includes(bentukDb);
         } else {
            const allowed = JENJANG_GROUPS[activeTab] || [];
            if (allowed.length > 0) return allowed.includes(bentukDb);
            return bentukDb === activeTab;
         }
      }
    });

    const mapAgg = new Map();
    listKabupaten.forEach(kab => {
      mapAgg.set(kab, { 
        wilayah: kab, 
        status_n: 0, status_s: 0, 
        akr_a: 0, akr_b: 0, akr_c: 0, akr_tt: 0, akr_belum: 0, 
        rombel_n: 0, rombel_s: 0,
        total_sek: 0, total_rombel: 0,
        // Properti Khusus View Semua Jenjang (Dipecah N dan S)
        j_paud_n: 0, j_paud_s: 0, 
        j_sd_n: 0, j_sd_s: 0, 
        j_smp_n: 0, j_smp_s: 0, 
        j_sma_n: 0, j_sma_s: 0, 
        j_smk_n: 0, j_smk_s: 0, 
        j_slb_n: 0, j_slb_s: 0, 
        j_nonformal_n: 0, j_nonformal_s: 0
      });
    });

    filteredData.forEach(item => {
       const kab = item.kabupaten;
       if (!mapAgg.has(kab)) return; 

       const row = mapAgg.get(kab);
       const isNegeri = item.status_sekolah === 'NEGERI';
       const akr = item.akreditasi;
       const rombelTotal = item.rombel_total || 0;
       const bentukDb = String(item.bentuk_pendidikan || '').trim().toUpperCase();

       // 1. STATUS SEKOLAH
       if (isNegeri) row.status_n++; else row.status_s++;
       
       // 2. AKREDITASI 
       if (akr === 'A') row.akr_a++;
       else if (akr === 'B') row.akr_b++;
       else if (akr === 'C') row.akr_c++;
       else if (akr === 'TT') row.akr_tt++;
       else row.akr_belum++; 

       // 3. ROMBEL
       if (isNegeri) row.rombel_n += rombelTotal; else row.rombel_s += rombelTotal;

       // 4. PEMETAAN JENJANG (Khusus Tampilan "Semua Jenjang")
       if (JENJANG_GROUPS['PAUD'].includes(bentukDb)) { isNegeri ? row.j_paud_n++ : row.j_paud_s++; }
       else if (JENJANG_GROUPS['SD'].includes(bentukDb)) { isNegeri ? row.j_sd_n++ : row.j_sd_s++; }
       else if (JENJANG_GROUPS['SMP'].includes(bentukDb)) { isNegeri ? row.j_smp_n++ : row.j_smp_s++; }
       else if (JENJANG_GROUPS['SMA'].includes(bentukDb)) { isNegeri ? row.j_sma_n++ : row.j_sma_s++; }
       else if (JENJANG_GROUPS['SMK'].includes(bentukDb)) { isNegeri ? row.j_smk_n++ : row.j_smk_s++; }
       else if (JENJANG_GROUPS['SLB (Inklusif)'].includes(bentukDb) || JENJANG_GROUPS['SLB'].includes(bentukDb)) { isNegeri ? row.j_slb_n++ : row.j_slb_s++; }
       else if (JENJANG_GROUPS['NON FORMAL'].includes(bentukDb)) { isNegeri ? row.j_nonformal_n++ : row.j_nonformal_s++; }

       row.total_sek++;
       row.total_rombel += rombelTotal;
    });

    return Array.from(mapAgg.values()).sort((a, b) => getKabupatenRank(a.wilayah) - getKabupatenRank(b.wilayah));
  }, [safeDataSekolah, activeKategori, activeTab, listKabupaten]);

  const grandTotals = useMemo(() => {
    return aggregatedData.reduce((acc, curr) => {
      acc.status_n += curr.status_n;
      acc.status_s += curr.status_s;
      acc.akr_a += curr.akr_a;
      acc.akr_b += curr.akr_b;
      acc.akr_c += curr.akr_c;
      acc.akr_tt += curr.akr_tt;
      acc.akr_belum += curr.akr_belum;
      acc.rombel_n += curr.rombel_n;
      acc.rombel_s += curr.rombel_s;
      acc.total_sek += curr.total_sek;
      acc.total_rombel += curr.total_rombel;
      
      acc.j_paud_n += curr.j_paud_n; acc.j_paud_s += curr.j_paud_s;
      acc.j_sd_n += curr.j_sd_n; acc.j_sd_s += curr.j_sd_s;
      acc.j_smp_n += curr.j_smp_n; acc.j_smp_s += curr.j_smp_s;
      acc.j_sma_n += curr.j_sma_n; acc.j_sma_s += curr.j_sma_s;
      acc.j_smk_n += curr.j_smk_n; acc.j_smk_s += curr.j_smk_s;
      acc.j_slb_n += curr.j_slb_n; acc.j_slb_s += curr.j_slb_s;
      acc.j_nonformal_n += curr.j_nonformal_n; acc.j_nonformal_s += curr.j_nonformal_s;
      
      return acc;
    }, { 
      status_n: 0, status_s: 0, akr_a: 0, akr_b: 0, akr_c: 0, akr_tt: 0, akr_belum: 0, 
      rombel_n: 0, rombel_s: 0, total_sek: 0, total_rombel: 0,
      j_paud_n: 0, j_paud_s: 0, j_sd_n: 0, j_sd_s: 0, j_smp_n: 0, j_smp_s: 0,
      j_sma_n: 0, j_sma_s: 0, j_smk_n: 0, j_smk_s: 0, j_slb_n: 0, j_slb_s: 0, j_nonformal_n: 0, j_nonformal_s: 0
    });
  }, [aggregatedData]);

  let activeLabel = 'SEMUA';
  if (activeKategori === 'SEMUA') {
      activeLabel = activeTab;
  } else {
      activeLabel = activeTab === 'SEMUA' ? activeKategori : activeTab;
  }

  let pieSegments = [];
  let pieTotal = 0;
  
  if (activeView === 'STATUS') {
     pieSegments = [
       { name: 'Negeri', value: grandTotals.status_n, color: '#2563eb' }, 
       { name: 'Swasta', value: grandTotals.status_s, color: '#f97316' }  
     ];
     pieTotal = grandTotals.total_sek;
  } else if (activeView === 'AKREDITASI') {
     pieSegments = [
       { name: 'Akreditasi A', value: grandTotals.akr_a, color: '#10b981' }, 
       { name: 'Akreditasi B', value: grandTotals.akr_b, color: '#3b82f6' }, 
       { name: 'Akreditasi C', value: grandTotals.akr_c, color: '#f59e0b' }, 
       { name: 'TT', value: grandTotals.akr_tt, color: '#ef4444' },
       { name: 'Belum', value: grandTotals.akr_belum, color: '#64748b' }
     ];
     pieTotal = grandTotals.total_sek;
  } else if (activeView === 'ROMBEL') {
     pieSegments = [
       { name: 'Rombel Negeri', value: grandTotals.rombel_n, color: '#2563eb' }, 
       { name: 'Rombel Swasta', value: grandTotals.rombel_s, color: '#f97316' }  
     ];
     pieTotal = grandTotals.total_rombel;
  }

  const downloadExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const safeLabel = activeLabel.replace(/\//g, '-');
    const worksheet = workbook.addWorksheet(`Rekap ${activeView} - ${safeLabel}`);

    if (activeKategori === 'SEMUA' && activeTab === 'SEMUA') {
        worksheet.columns = [
          { header: 'No', key: 'no', width: 5 },
          { header: 'Wilayah (Kabupaten/Kota)', key: 'wilayah', width: 30 },
          { header: 'PAUD Negeri', key: 'j_paud_n', width: 12 },
          { header: 'PAUD Swasta', key: 'j_paud_s', width: 12 },
          { header: 'SD Negeri', key: 'j_sd_n', width: 12 },
          { header: 'SD Swasta', key: 'j_sd_s', width: 12 },
          { header: 'SMP Negeri', key: 'j_smp_n', width: 12 },
          { header: 'SMP Swasta', key: 'j_smp_s', width: 12 },
          { header: 'SMA Negeri', key: 'j_sma_n', width: 12 },
          { header: 'SMA Swasta', key: 'j_sma_s', width: 12 },
          { header: 'SMK Negeri', key: 'j_smk_n', width: 12 },
          { header: 'SMK Swasta', key: 'j_smk_s', width: 12 },
          { header: 'SLB Negeri', key: 'j_slb_n', width: 12 },
          { header: 'SLB Swasta', key: 'j_slb_s', width: 12 },
          { header: 'Non Formal Negeri', key: 'j_nonformal_n', width: 15 },
          { header: 'Non Formal Swasta', key: 'j_nonformal_s', width: 15 },
          { header: 'Total Sekolah', key: 'total_sek', width: 15 },
        ];
    } else if (activeView === 'STATUS') {
       worksheet.columns = [
         { header: 'No', key: 'no', width: 5 },
         { header: 'Wilayah (Kabupaten/Kota)', key: 'wilayah', width: 30 },
         { header: 'Negeri', key: 'status_n', width: 15 },
         { header: 'Swasta', key: 'status_s', width: 15 },
         { header: 'Jumlah Unit', key: 'total_sek', width: 15 },
       ];
    } else if (activeView === 'AKREDITASI') {
       worksheet.columns = [
         { header: 'No', key: 'no', width: 5 },
         { header: 'Wilayah (Kabupaten/Kota)', key: 'wilayah', width: 30 },
         { header: 'Akreditasi A', key: 'akr_a', width: 15 },
         { header: 'Akreditasi B', key: 'akr_b', width: 15 },
         { header: 'Akreditasi C', key: 'akr_c', width: 15 },
         { header: 'TT (Tidak Terakreditasi)', key: 'akr_tt', width: 25 },
         { header: 'Belum Terakreditasi', key: 'akr_belum', width: 20 },
         { header: 'Jumlah Unit', key: 'total_sek', width: 15 },
       ];
    } else if (activeView === 'ROMBEL') {
       worksheet.columns = [
         { header: 'No', key: 'no', width: 5 },
         { header: 'Wilayah (Kabupaten/Kota)', key: 'wilayah', width: 30 },
         { header: 'Rombel Negeri', key: 'rombel_n', width: 15 },
         { header: 'Rombel Swasta', key: 'rombel_s', width: 15 },
         { header: 'Total Rombel', key: 'total_rombel', width: 15 },
       ];
    }

    aggregatedData.forEach((item, idx) => worksheet.addRow({ ...item, no: idx + 1 }));

    const totalRowData = { no: '', wilayah: 'TOTAL KESELURUHAN' };
    
    if (activeKategori === 'SEMUA' && activeTab === 'SEMUA') {
        Object.assign(totalRowData, grandTotals);
    } else if (activeView === 'STATUS') {
       totalRowData.status_n = grandTotals.status_n; totalRowData.status_s = grandTotals.status_s; totalRowData.total_sek = grandTotals.total_sek;
    } else if (activeView === 'AKREDITASI') {
       totalRowData.akr_a = grandTotals.akr_a; totalRowData.akr_b = grandTotals.akr_b; totalRowData.akr_c = grandTotals.akr_c; 
       totalRowData.akr_tt = grandTotals.akr_tt; totalRowData.akr_belum = grandTotals.akr_belum; totalRowData.total_sek = grandTotals.total_sek;
    } else if (activeView === 'ROMBEL') {
       totalRowData.rombel_n = grandTotals.rombel_n; totalRowData.rombel_s = grandTotals.rombel_s; totalRowData.total_rombel = grandTotals.total_rombel;
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
    link.download = `Rekap_${activeView}_${activeLabel === 'SEMUA' ? 'Keseluruhan' : safeLabel}_${selectedYear}.xlsx`;
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
    slate: { bg: 'bg-slate-50', border: 'border-slate-200', hover: 'hover:bg-slate-100', dot: 'bg-slate-500', textMain: 'text-slate-700', textVal: 'text-slate-600', textPct: 'text-slate-500' }
  };

  if (loading) {
    return (
      <div className="h-full flex flex-col items-center justify-center italic font-black uppercase tracking-widest text-indigo-300">
        <Loader2 className="animate-spin text-indigo-600 mb-4" size={64} />
        Memuat Agregasi Data Sekolah...
      </div>
    );
  }

  // Apakah Mode "Semua Jenjang" Aktif?
  const isSemuaJenjangView = activeKategori === 'SEMUA' && activeTab === 'SEMUA';

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 animate-in fade-in duration-500">
      
      {/* TABS HEADER: FILTER KATEGORI & VIEW */}
      <div className="bg-white px-4 md:px-6 py-4 border-b border-gray-100 flex flex-col gap-4 shrink-0 shadow-sm z-20 sticky top-0">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
           {/* MAIN VIEW TOGGLE */}
           <div className="flex items-center bg-gray-100 p-1.5 rounded-2xl w-full md:w-auto overflow-x-auto">
             <button onClick={() => setActiveView('STATUS')} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition-all whitespace-nowrap ${activeView === 'STATUS' ? 'bg-white text-blue-700 shadow-sm scale-[1.02]' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'}`}>
                <School size={16} /> Status Sekolah
             </button>
             <button onClick={() => setActiveView('AKREDITASI')} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition-all whitespace-nowrap ${activeView === 'AKREDITASI' ? 'bg-white text-emerald-700 shadow-sm scale-[1.02]' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'}`}>
                <Award size={16} /> Akreditasi
             </button>
             <button onClick={() => setActiveView('ROMBEL')} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-black text-xs transition-all whitespace-nowrap ${activeView === 'ROMBEL' ? 'bg-white text-orange-700 shadow-sm scale-[1.02]' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200'}`}>
                <Layers size={16} /> Rombongan Belajar
             </button>
           </div>
           
           {/* DROPDOWN KATEGORI & UNDUH */}
           <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm w-full md:w-auto transition-colors focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100">
                <GraduationCap size={16} className="text-gray-400 mr-2" />
                <select 
                  value={activeKategori} 
                  onChange={(e) => setActiveKategori(e.target.value)} 
                  className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer w-full"
                >
                  <option value="SEMUA">Semua Jenjang</option>
                  <option value="PAUD">PAUD</option>
                  <option value="DASAR">Pendidikan Dasar</option>
                  <option value="MENENGAH">Pendidikan Menengah</option>
                  <option value="INKLUSIF">Pendidikan Inklusif</option>
                  <option value="NON FORMAL">Pendidikan Non Formal</option>
                </select>
              </div>
              <button onClick={downloadExcel} className="flex items-center justify-center gap-2 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white px-5 py-2.5 rounded-xl font-black uppercase text-xs shadow-sm border border-blue-200 transition-all active:scale-95 shrink-0">
                <FileSpreadsheet size={16} /> Unduh
              </button>
           </div>
        </div>

        {/* TABS SUB-JENJANG (BENTUK PENDIDIKAN) */}
        <div className="flex items-center gap-1.5 md:gap-2 overflow-x-auto pb-1 mt-1">
          <button 
            onClick={() => setActiveTab('SEMUA')} 
            className={`px-4 py-1.5 rounded-lg font-black text-[10px] md:text-xs transition-all duration-300 whitespace-nowrap border ${activeTab === 'SEMUA' ? 'bg-gray-800 text-white border-gray-800 shadow-md' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
          >
            {activeKategori === 'SEMUA' ? 'SEMUA JENJANG' : `SEMUA ${activeKategori}`}
          </button>
          {TABS_MAPPING[activeKategori]?.map(tab => (
            <button 
              key={tab} 
              onClick={() => setActiveTab(tab)} 
              className={`px-4 py-1.5 rounded-lg font-black text-[10px] md:text-xs transition-all duration-300 whitespace-nowrap border ${activeTab === tab ? 'bg-gray-800 text-white border-gray-800 shadow-md' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* TOP SECTION: PREMIUM PIE CHART & CARDS */}
      <div className="bg-white border-b border-gray-200 py-6 px-4 md:px-8 shrink-0">
         {/* DIGANTI max-w-7xl menjadi max-w-[98%] agar memaksimalkan ruang kosong */}
         <div className="w-full max-w-[98%] mx-auto flex flex-col lg:flex-row items-center justify-between gap-8">
            {/* Judul & Visualisasi */}
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

            {/* Rekap Statistik / Cards */}
            <div className="flex-1 w-full lg:max-w-2xl">
               {activeView === 'STATUS' && (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <StatCard label="Sekolah Negeri" value={grandTotals.status_n} percentage={pieTotal > 0 ? ((grandTotals.status_n/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.blue} />
                    <StatCard label="Sekolah Swasta" value={grandTotals.status_s} percentage={pieTotal > 0 ? ((grandTotals.status_s/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.orange} />
                 </div>
               )}

               {activeView === 'AKREDITASI' && (
                 <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                    <StatCard label="Akreditasi A" value={grandTotals.akr_a} percentage={pieTotal > 0 ? ((grandTotals.akr_a/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.emerald} />
                    <StatCard label="Akreditasi B" value={grandTotals.akr_b} percentage={pieTotal > 0 ? ((grandTotals.akr_b/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.blue} />
                    <StatCard label="Akreditasi C" value={grandTotals.akr_c} percentage={pieTotal > 0 ? ((grandTotals.akr_c/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.amber} />
                    <StatCard label="Tidak Terakred (TT)" value={grandTotals.akr_tt} percentage={pieTotal > 0 ? ((grandTotals.akr_tt/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.red} />
                    <StatCard label="Belum Terakred" value={grandTotals.akr_belum} percentage={pieTotal > 0 ? ((grandTotals.akr_belum/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.slate} />
                 </div>
               )}

               {activeView === 'ROMBEL' && (
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <StatCard label="Rombel Negeri" value={grandTotals.rombel_n} percentage={pieTotal > 0 ? ((grandTotals.rombel_n/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.blue} />
                    <StatCard label="Rombel Swasta" value={grandTotals.rombel_s} percentage={pieTotal > 0 ? ((grandTotals.rombel_s/pieTotal)*100).toFixed(1) : 0} colorClasses={colors.orange} />
                 </div>
               )}
            </div>
         </div>
      </div>

      {/* BOTTOM SECTION: MAIN TABLE */}
      {/* Container dibuat lebar penuh dengan max-w-[98%] dan px-4 */}
      <div className="flex-1 w-full max-w-[98%] mx-auto p-4 md:p-6 mb-12">
        <div className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
          {/* max-h-[600px] dihapus agar tabel tidak perlu di-scroll secara internal dan menyesuaikan tinggi aslinya */}
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-center border-separate border-spacing-0">
              <thead className="sticky top-0 bg-gray-50 z-10 shadow-sm">
                
                <tr className="text-[10px] md:text-xs font-black uppercase text-gray-500 whitespace-nowrap">
                  <th rowSpan={isSemuaJenjangView ? 2 : 1} className="px-4 py-4 text-center border-b-2 border-gray-200 bg-gray-50 text-gray-700 w-16">Nomor</th>
                  <th rowSpan={isSemuaJenjangView ? 2 : 1} className="px-4 py-4 text-left border-b-2 border-gray-200 bg-gray-50 text-gray-700 sticky left-0 z-20 w-48 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] border-r">Kabupaten / Kota</th>
                  
                  {isSemuaJenjangView ? (
                    <>
                       <th colSpan="2" className="px-3 py-3 border-b-2 border-gray-200 hover:bg-gray-100 transition-colors text-pink-600 border-x">PAUD</th>
                       <th colSpan="2" className="px-3 py-3 border-b-2 border-gray-200 hover:bg-gray-100 transition-colors text-red-600 border-r">SD</th>
                       <th colSpan="2" className="px-3 py-3 border-b-2 border-gray-200 hover:bg-gray-100 transition-colors text-blue-600 border-r">SMP</th>
                       <th colSpan="2" className="px-3 py-3 border-b-2 border-gray-200 hover:bg-gray-100 transition-colors text-slate-600 border-r">SMA</th>
                       <th colSpan="2" className="px-3 py-3 border-b-2 border-gray-200 hover:bg-gray-100 transition-colors text-violet-600 border-r">SMK</th>
                       <th colSpan="2" className="px-3 py-3 border-b-2 border-gray-200 hover:bg-gray-100 transition-colors text-emerald-600 border-r">SLB</th>
                       <th colSpan="2" className="px-3 py-3 border-b-2 border-gray-200 hover:bg-gray-100 transition-colors text-orange-600 border-r">Non Formal</th>
                       <th rowSpan="2" className="px-4 py-4 border-b-2 border-gray-200 text-gray-900 bg-gray-100">Total Sekolah</th>
                    </>
                  ) : (
                    <>
                      {activeView === 'STATUS' && (
                        <><th className="px-4 py-4 border-b-2 border-gray-200 text-blue-600">Negeri</th><th className="px-4 py-4 border-b-2 border-gray-200 text-orange-600">Swasta</th><th className="px-4 py-4 border-b-2 border-gray-200 text-gray-800">Jumlah Unit</th></>
                      )}
                      
                      {activeView === 'AKREDITASI' && (
                        <><th className="px-3 py-4 border-b-2 border-gray-200 text-emerald-600">A</th><th className="px-3 py-4 border-b-2 border-gray-200 text-blue-600">B</th><th className="px-3 py-4 border-b-2 border-gray-200 text-amber-600">C</th><th className="px-3 py-4 border-b-2 border-gray-200 text-red-600">TT</th><th className="px-3 py-4 border-b-2 border-gray-200 text-slate-500">Belum</th><th className="px-4 py-4 border-b-2 border-gray-200 text-gray-800">Total Unit</th></>
                      )}

                      {activeView === 'ROMBEL' && (
                        <><th className="px-4 py-4 border-b-2 border-gray-200 text-blue-600">Rombel Negeri</th><th className="px-4 py-4 border-b-2 border-gray-200 text-orange-600">Rombel Swasta</th><th className="px-4 py-4 border-b-2 border-gray-200 text-gray-800">Total Rombel</th></>
                      )}
                    </>
                  )}

                  {!isSemuaJenjangView && <th className="px-4 py-4 border-b-2 border-gray-200 w-32">Aksi</th>}
                </tr>

                {/* BARIS KEDUA KHUSUS SEMUA JENJANG */}
                {isSemuaJenjangView && (
                  <tr className="text-[10px] font-black uppercase text-gray-500 whitespace-nowrap bg-white">
                    <th className="px-2 py-2 border-b-2 border-gray-200 text-blue-600 border-l border-r border-gray-100">Negeri</th>
                    <th className="px-2 py-2 border-b-2 border-gray-200 text-orange-600 border-r border-gray-100">Swasta</th>
                    <th className="px-2 py-2 border-b-2 border-gray-200 text-blue-600 border-r border-gray-100">Negeri</th>
                    <th className="px-2 py-2 border-b-2 border-gray-200 text-orange-600 border-r border-gray-100">Swasta</th>
                    <th className="px-2 py-2 border-b-2 border-gray-200 text-blue-600 border-r border-gray-100">Negeri</th>
                    <th className="px-2 py-2 border-b-2 border-gray-200 text-orange-600 border-r border-gray-100">Swasta</th>
                    <th className="px-2 py-2 border-b-2 border-gray-200 text-blue-600 border-r border-gray-100">Negeri</th>
                    <th className="px-2 py-2 border-b-2 border-gray-200 text-orange-600 border-r border-gray-100">Swasta</th>
                    <th className="px-2 py-2 border-b-2 border-gray-200 text-blue-600 border-r border-gray-100">Negeri</th>
                    <th className="px-2 py-2 border-b-2 border-gray-200 text-orange-600 border-r border-gray-100">Swasta</th>
                    <th className="px-2 py-2 border-b-2 border-gray-200 text-blue-600 border-r border-gray-100">Negeri</th>
                    <th className="px-2 py-2 border-b-2 border-gray-200 text-orange-600 border-r border-gray-100">Swasta</th>
                    <th className="px-2 py-2 border-b-2 border-gray-200 text-blue-600 border-r border-gray-100">Negeri</th>
                    <th className="px-2 py-2 border-b-2 border-gray-200 text-orange-600 border-r border-gray-100">Swasta</th>
                  </tr>
                )}
              </thead>
              
              <tbody className="divide-y divide-gray-100">
                {aggregatedData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="px-4 py-3 font-bold text-xs md:text-sm text-gray-500 text-center">{idx + 1}</td>
                    <td className="px-4 py-3 font-black text-xs md:text-sm text-gray-800 uppercase text-left sticky left-0 bg-white group-hover:bg-blue-50/30 z-10 whitespace-nowrap shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] border-r border-gray-100">{row.wilayah}</td>
                    
                    {isSemuaJenjangView ? (
                      <>
                        <td className="px-2 py-3 font-bold text-blue-600 border-l border-r border-gray-50">{row.j_paud_n > 0 ? row.j_paud_n.toLocaleString() : '-'}</td>
                        <td className="px-2 py-3 font-bold text-orange-600 border-r border-gray-50">{row.j_paud_s > 0 ? row.j_paud_s.toLocaleString() : '-'}</td>
                        <td className="px-2 py-3 font-bold text-blue-600 border-r border-gray-50">{row.j_sd_n > 0 ? row.j_sd_n.toLocaleString() : '-'}</td>
                        <td className="px-2 py-3 font-bold text-orange-600 border-r border-gray-50">{row.j_sd_s > 0 ? row.j_sd_s.toLocaleString() : '-'}</td>
                        <td className="px-2 py-3 font-bold text-blue-600 border-r border-gray-50">{row.j_smp_n > 0 ? row.j_smp_n.toLocaleString() : '-'}</td>
                        <td className="px-2 py-3 font-bold text-orange-600 border-r border-gray-50">{row.j_smp_s > 0 ? row.j_smp_s.toLocaleString() : '-'}</td>
                        <td className="px-2 py-3 font-bold text-blue-600 border-r border-gray-50">{row.j_sma_n > 0 ? row.j_sma_n.toLocaleString() : '-'}</td>
                        <td className="px-2 py-3 font-bold text-orange-600 border-r border-gray-50">{row.j_sma_s > 0 ? row.j_sma_s.toLocaleString() : '-'}</td>
                        <td className="px-2 py-3 font-bold text-blue-600 border-r border-gray-50">{row.j_smk_n > 0 ? row.j_smk_n.toLocaleString() : '-'}</td>
                        <td className="px-2 py-3 font-bold text-orange-600 border-r border-gray-50">{row.j_smk_s > 0 ? row.j_smk_s.toLocaleString() : '-'}</td>
                        <td className="px-2 py-3 font-bold text-blue-600 border-r border-gray-50">{row.j_slb_n > 0 ? row.j_slb_n.toLocaleString() : '-'}</td>
                        <td className="px-2 py-3 font-bold text-orange-600 border-r border-gray-50">{row.j_slb_s > 0 ? row.j_slb_s.toLocaleString() : '-'}</td>
                        <td className="px-2 py-3 font-bold text-blue-600 border-r border-gray-50">{row.j_nonformal_n > 0 ? row.j_nonformal_n.toLocaleString() : '-'}</td>
                        <td className="px-2 py-3 font-bold text-orange-600 border-r border-gray-50">{row.j_nonformal_s > 0 ? row.j_nonformal_s.toLocaleString() : '-'}</td>
                        
                        <td className="px-4 py-3 font-black text-gray-900 bg-gray-50 group-hover:bg-gray-100 transition-colors border-l border-gray-200">{row.total_sek.toLocaleString()}</td>
                      </>
                    ) : (
                      <>
                        {activeView === 'STATUS' && (
                          <>
                            <td className="px-4 py-3 font-bold text-blue-600">{row.status_n.toLocaleString()}</td>
                            <td className="px-4 py-3 font-bold text-orange-600">{row.status_s.toLocaleString()}</td>
                            <td className="px-4 py-3 font-black text-gray-800 bg-gray-50">{row.total_sek.toLocaleString()}</td>
                          </>
                        )}

                        {activeView === 'AKREDITASI' && (
                          <>
                            <td className="px-3 py-3 font-bold text-emerald-600">{row.akr_a.toLocaleString()}</td>
                            <td className="px-3 py-3 font-bold text-blue-600">{row.akr_b.toLocaleString()}</td>
                            <td className="px-3 py-3 font-bold text-amber-600">{row.akr_c.toLocaleString()}</td>
                            <td className="px-3 py-3 font-bold text-red-500">{row.akr_tt.toLocaleString()}</td>
                            <td className="px-3 py-3 font-bold text-slate-500">{row.akr_belum.toLocaleString()}</td>
                            <td className="px-4 py-3 font-black text-gray-800 bg-gray-50">{row.total_sek.toLocaleString()}</td>
                          </>
                        )}

                        {activeView === 'ROMBEL' && (
                          <>
                            <td className="px-4 py-3 font-bold text-blue-600">{row.rombel_n.toLocaleString()}</td>
                            <td className="px-4 py-3 font-bold text-orange-600">{row.rombel_s.toLocaleString()}</td>
                            <td className="px-4 py-3 font-black text-gray-800 bg-gray-50">{row.total_rombel.toLocaleString()}</td>
                          </>
                        )}

                        <td className="px-4 py-3 border-l border-gray-100">
                           <button onClick={() => handleBukaRincian(row.wilayah)} className="flex items-center justify-center gap-1.5 bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-black uppercase hover:bg-blue-600 hover:text-white transition-colors mx-auto">
                             <Eye size={14} /> Rincian
                           </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
              
              <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]">
                <tr className="bg-gray-100 text-center font-black uppercase text-[10px] md:text-xs border-t-2 border-gray-300">
                  <td className="px-4 py-4 border-t-2 border-gray-300"></td>
                  <td className="px-4 py-4 text-left text-gray-900 border-t-2 border-gray-300 sticky left-0 bg-gray-100 z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] border-r">TOTAL KALBAR</td>
                  
                  {isSemuaJenjangView ? (
                    <>
                       <td className="px-2 py-4 border-t-2 border-gray-300 border-l border-gray-200 text-blue-700">{grandTotals.j_paud_n.toLocaleString()}</td>
                       <td className="px-2 py-4 border-t-2 border-gray-300 border-r border-gray-200 text-orange-700">{grandTotals.j_paud_s.toLocaleString()}</td>
                       
                       <td className="px-2 py-4 border-t-2 border-gray-300 text-blue-700">{grandTotals.j_sd_n.toLocaleString()}</td>
                       <td className="px-2 py-4 border-t-2 border-gray-300 border-r border-gray-200 text-orange-700">{grandTotals.j_sd_s.toLocaleString()}</td>
                       
                       <td className="px-2 py-4 border-t-2 border-gray-300 text-blue-700">{grandTotals.j_smp_n.toLocaleString()}</td>
                       <td className="px-2 py-4 border-t-2 border-gray-300 border-r border-gray-200 text-orange-700">{grandTotals.j_smp_s.toLocaleString()}</td>
                       
                       <td className="px-2 py-4 border-t-2 border-gray-300 text-blue-700">{grandTotals.j_sma_n.toLocaleString()}</td>
                       <td className="px-2 py-4 border-t-2 border-gray-300 border-r border-gray-200 text-orange-700">{grandTotals.j_sma_s.toLocaleString()}</td>
                       
                       <td className="px-2 py-4 border-t-2 border-gray-300 text-blue-700">{grandTotals.j_smk_n.toLocaleString()}</td>
                       <td className="px-2 py-4 border-t-2 border-gray-300 border-r border-gray-200 text-orange-700">{grandTotals.j_smk_s.toLocaleString()}</td>
                       
                       <td className="px-2 py-4 border-t-2 border-gray-300 text-blue-700">{grandTotals.j_slb_n.toLocaleString()}</td>
                       <td className="px-2 py-4 border-t-2 border-gray-300 border-r border-gray-200 text-orange-700">{grandTotals.j_slb_s.toLocaleString()}</td>
                       
                       <td className="px-2 py-4 border-t-2 border-gray-300 text-blue-700">{grandTotals.j_nonformal_n.toLocaleString()}</td>
                       <td className="px-2 py-4 border-t-2 border-gray-300 border-r border-gray-200 text-orange-700">{grandTotals.j_nonformal_s.toLocaleString()}</td>
                       
                       <td className="px-4 py-4 border-t-2 border-gray-300 text-gray-900 bg-gray-200/50 text-sm">{grandTotals.total_sek.toLocaleString()}</td>
                    </>
                  ) : (
                    <>
                      {activeView === 'STATUS' && (
                        <><td className="px-4 py-4 text-blue-700 border-t-2 border-gray-300">{grandTotals.status_n.toLocaleString()}</td><td className="px-4 py-4 text-orange-700 border-t-2 border-gray-300">{grandTotals.status_s.toLocaleString()}</td><td className="px-4 py-4 text-gray-900 border-t-2 border-gray-300 text-sm bg-gray-200/50">{grandTotals.total_sek.toLocaleString()}</td></>
                      )}

                      {activeView === 'AKREDITASI' && (
                        <><td className="px-3 py-4 text-emerald-700 border-t-2 border-gray-300">{grandTotals.akr_a.toLocaleString()}</td><td className="px-3 py-4 text-blue-700 border-t-2 border-gray-300">{grandTotals.akr_b.toLocaleString()}</td><td className="px-3 py-4 text-amber-700 border-t-2 border-gray-300">{grandTotals.akr_c.toLocaleString()}</td><td className="px-3 py-4 text-red-700 border-t-2 border-gray-300">{grandTotals.akr_tt.toLocaleString()}</td><td className="px-3 py-4 text-slate-700 border-t-2 border-gray-300">{grandTotals.akr_belum.toLocaleString()}</td><td className="px-4 py-4 text-gray-900 border-t-2 border-gray-300 text-sm bg-gray-200/50">{grandTotals.total_sek.toLocaleString()}</td></>
                      )}

                      {activeView === 'ROMBEL' && (
                        <><td className="px-4 py-4 text-blue-700 border-t-2 border-gray-300">{grandTotals.rombel_n.toLocaleString()}</td><td className="px-4 py-4 text-orange-700 border-t-2 border-gray-300">{grandTotals.rombel_s.toLocaleString()}</td><td className="px-4 py-4 text-gray-900 border-t-2 border-gray-300 text-sm bg-gray-200/50">{grandTotals.total_rombel.toLocaleString()}</td></>
                      )}

                      <td className="px-4 py-4 border-t-2 border-gray-300 border-l border-gray-200">
                         <button onClick={() => handleBukaRincian('SEMUA')} className="flex items-center justify-center gap-1.5 bg-gray-800 text-white px-3 py-1.5 rounded-lg text-[10px] md:text-xs font-black uppercase hover:bg-gray-900 transition-colors mx-auto shadow-md">
                           <Search size={14} /> Semua
                         </button>
                      </td>
                    </>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="bg-gray-50 px-4 py-3 text-right text-xs font-bold italic text-gray-400 border-t border-gray-200">
              Sumber : Data Dapodik Update Pada Tanggal : {displayLastUpdated}
          </div>
        </div>
      </div>

      {/* KONDISIONAL RENDER MODAL BERDASARKAN ACTIVE VIEW */}
      {!isSemuaJenjangView && activeView === 'STATUS' && (
        <RincianStatusSekolah 
          isOpen={modalOpen} 
          onClose={() => setModalOpen(false)}
          data={safeDataSekolah}
          initialWilayah={selectedWilayah}
          activeJenjang={activeLabel}
          displayLastUpdated={displayLastUpdated}
        />
      )}

      {!isSemuaJenjangView && activeView === 'AKREDITASI' && (
        <RincianAkreditasiSekolah 
          isOpen={modalOpen} 
          onClose={() => setModalOpen(false)}
          data={safeDataSekolah}
          initialWilayah={selectedWilayah}
          activeJenjang={activeLabel}
          displayLastUpdated={displayLastUpdated}
        />
      )}

      {!isSemuaJenjangView && activeView === 'ROMBEL' && (
        <RincianRombelSekolah 
          isOpen={modalOpen} 
          onClose={() => setModalOpen(false)}
          data={safeDataSekolah}
          initialWilayah={selectedWilayah}
          activeJenjang={activeLabel}
          displayLastUpdated={displayLastUpdated}
        />
      )}

    </div>
  );
}