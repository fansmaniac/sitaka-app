import React, { useState, useEffect } from 'react';
import { 
  School, Users, GraduationCap, LineChart, 
  Layers, Building2, Menu, X, Loader2, RefreshCw 
} from 'lucide-react';
import { db } from '../firebase/config';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';

// IMPORT KOMPONEN
import DapodikSekolah from './DapodikSekolah';
import DapodikGuru from './DapodikGuru'; 
import DapodikPesertaDidik from './DapodikPesertaDidik'; 
import DapodikRasio from './DapodikRasio';
import DapodikSarpras from './DapodikSarpras'; // <-- IMPORT DAPODIK SARPRAS AKTIF

// =====================================================================
// PLACEHOLDER KOMPONEN (Nanti kita pisah ke file masing-masing)
// =====================================================================
const DapodikRombel = () => <div className="p-8 text-center text-gray-500 font-bold animate-in fade-in zoom-in-95">Tampilan Dapodik Rombel (Segera Hadir)</div>;

// =====================================================================
// UTILITY: INDEXED-DB CACHING (BRANKAS LOKAL)
// =====================================================================
const DB_NAME = "SitakaCacheDB";
const STORE_NAME = "dapodikData";
const CACHE_EXPIRY_HOURS = 24;

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveToCache = async (key, data, firestoreLastUpdate) => {
  try {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put({ data, timestamp: Date.now(), firestoreLastUpdate }, key);
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
          if (hoursOld < CACHE_EXPIRY_HOURS) return resolve(result); 
        }
        resolve(null);
      };
      req.onerror = () => resolve(null);
    });
  } catch (err) { return null; }
};

// =====================================================================
// DAFTAR MENU SIDEBAR
// =====================================================================
const MENU_ITEMS = [
  { id: 'sekolah', label: 'Sekolah', icon: School },
  { id: 'guru', label: 'Guru', icon: Users },
  { id: 'peserta_didik', label: 'Peserta Didik', icon: GraduationCap },
  { id: 'rasio', label: 'Rasio / Bandingkan Data', icon: LineChart },
  // Menu Rombel masih dinonaktifkan sementara
  // { id: 'rombel', label: 'Rombel', icon: Layers },
  { id: 'sarpras', label: 'Sarpras', icon: Building2 }, // <-- MENU SARPRAS DIAKTIFKAN
];

export default function DapodikPage({ Header }) {
  const [activeMenu, setActiveMenu] = useState('sekolah');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // STATE GLOBAL UNTUK DATA
  const [selectedYear, setSelectedYear] = useState('2026'); 
  const [sekolahData, setSekolahData] = useState([]);
  const [ptkData, setPtkData] = useState([]);
  const [kepsekData, setKepsekData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  // --- LOGIKA FETCH DATA ---
  const loadData = async (forceSync = false) => {
    setLoading(true);
    if (forceSync) setIsSyncing(true);
    
    const cacheKey = `dapodik_all_${selectedYear}`;

    try {
      const cached = await getFromCache(cacheKey);
      let shouldFetchFromFirebase = forceSync || !cached;
      let latestFirestoreTime = null;

      if (!shouldFetchFromFirebase && cached) {
        try {
          const checkQ = query(collection(db, 'dapodik_sekolah_chunks'), where("tahun_data", "==", selectedYear), limit(1));
          const snapCheck = await getDocs(checkQ);
          if (!snapCheck.empty) {
             const docData = snapCheck.docs[0].data();
             if (docData.updatedAt) {
                 latestFirestoreTime = new Date(docData.updatedAt).getTime();
                 const cachedTime = cached.firestoreLastUpdate ? new Date(cached.firestoreLastUpdate).getTime() : 0;
                 if (latestFirestoreTime > cachedTime) {
                     shouldFetchFromFirebase = true;
                     setIsSyncing(true);
                 }
             }
          }
        } catch (e) {
           console.warn("Gagal mengecek update terbaru, menggunakan cache.");
        }
      }

      if (!shouldFetchFromFirebase && cached && cached.data) {
          setSekolahData(cached.data.sekolah || []);
          setPtkData(cached.data.ptk || []);
          setKepsekData(cached.data.kepsek || []);
          setLoading(false);
          setIsSyncing(false);
          return;
      }

      const fetchCollectionChunks = async (collectionName) => {
        const q = query(collection(db, collectionName), where("tahun_data", "==", selectedYear));
        const snapshot = await getDocs(q);
        let allData = [];
        let colLatestUpdate = null;

        snapshot.forEach(doc => {
           const docData = doc.data();
           if(docData.data && Array.isArray(docData.data)) {
               allData = allData.concat(docData.data);
           }
           if (docData.updatedAt) {
              const docTime = new Date(docData.updatedAt).getTime();
              if (!colLatestUpdate || docTime > colLatestUpdate) {
                  colLatestUpdate = docTime;
              }
           }
        });
        return { data: allData, lastUpdate: colLatestUpdate };
      };

      const [sekolahRes, ptkRes, kepsekRes] = await Promise.all([
        fetchCollectionChunks('dapodik_sekolah_chunks'),
        fetchCollectionChunks('dapodik_ptk_chunks'),
        fetchCollectionChunks('dapodik_kepsek_chunks') 
      ]);

      const freshData = { sekolah: sekolahRes.data, ptk: ptkRes.data, kepsek: kepsekRes.data };

      setSekolahData(freshData.sekolah);
      setPtkData(freshData.ptk);
      setKepsekData(freshData.kepsek);

      const maxUpdate = Math.max(sekolahRes.lastUpdate || 0, ptkRes.lastUpdate || 0, kepsekRes.lastUpdate || 0);
      const firestoreLastUpdateToSave = maxUpdate > 0 ? new Date(maxUpdate).toISOString() : new Date().toISOString();

      await saveToCache(cacheKey, freshData, firestoreLastUpdateToSave);

    } catch (error) {
      console.error("Error mengambil data SITAKA:", error);
      alert("Gagal memuat data dari server. Menampilkan data lokal jika tersedia.");
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  };

  useEffect(() => { loadData(false); }, [selectedYear]);

  // --- FUNGSI RENDER KONTEN BERDASARKAN MENU ---
  const renderContent = () => {
    if (loading && !isSyncing) {
      return (
        <div className="h-full flex flex-col items-center justify-center italic font-black uppercase tracking-widest text-blue-300">
          <Loader2 className="animate-spin text-blue-600 mb-4" size={64} />
          Memuat Data...
        </div>
      );
    }

    switch (activeMenu) {
      case 'sekolah': return <DapodikSekolah data={sekolahData} selectedYear={selectedYear} />;
      case 'guru': return <DapodikGuru data={ptkData} selectedYear={selectedYear} />;
      case 'peserta_didik': return <DapodikPesertaDidik data={sekolahData} selectedYear={selectedYear} />; 
      case 'rasio': return <DapodikRasio dataSekolah={sekolahData} dataGuru={ptkData} selectedYear={selectedYear} />;
      case 'rombel': return <DapodikRombel />;
      case 'sarpras': return <DapodikSarpras selectedYear={selectedYear} />; // <-- SUNTIKKAN TAHUN KE SARPRAS
      default: return <DapodikSekolah data={sekolahData} selectedYear={selectedYear} />;
    }
  };

  const activeMenuLabel = MENU_ITEMS.find(m => m.id === activeMenu)?.label;

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden font-sans">
      {/* 1. HEADER UTAMA */}
      <Header />

      {/* 2. SUB-HEADER MOBILE (Hanya tampil di HP) */}
      <div className="md:hidden bg-white px-4 py-3 flex items-center justify-between shadow-sm z-30">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsMobileMenuOpen(true)}
            className="p-2 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 active:scale-95 transition-all"
          >
            <Menu size={20} />
          </button>
          <h2 className="font-black text-gray-800 uppercase tracking-tight text-sm">
            {activeMenuLabel}
          </h2>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Tombol Sync Data (Mobile) */}
          <button 
            onClick={() => loadData(true)} 
            disabled={isSyncing} 
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-black text-[10px] uppercase transition-all shadow-sm ${isSyncing ? 'bg-orange-100 text-orange-600 border border-orange-200' : 'bg-blue-50 text-blue-700 hover:bg-blue-100 active:scale-95 border border-blue-200'}`}
          >
            <RefreshCw size={12} className={isSyncing ? "animate-spin" : ""} />
            <span className="hidden sm:inline">{isSyncing ? 'Memproses...' : 'Sinkronisasi'}</span>
            <span className="sm:hidden">{isSyncing ? '...' : 'Sync'}</span>
          </button>

          <select 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(e.target.value)}
            className="bg-gray-100 text-blue-800 font-black text-xs px-2 py-1.5 rounded-lg outline-none border border-gray-200"
          >
            <option value="2024">2024</option>
            <option value="2025">2025</option>
            <option value="2026">2026</option>
          </select>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        
        {/* ================================================================= */}
        {/* 3. SIDEBAR (DESKTOP & MOBILE) */}
        {/* ================================================================= */}
        
        {/* Backdrop untuk Mobile */}
        {isMobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 md:hidden animate-in fade-in"
            onClick={() => setIsMobileMenuOpen(false)}
          />
        )}

        <aside className={`
          absolute md:relative z-50 md:z-20
          inset-y-0 left-0
          w-72 md:w-64 lg:w-72 
          bg-gradient-to-b from-blue-500 via-blue-700 to-blue-950 
          text-white shadow-2xl md:shadow-[4px_0_24px_-4px_rgba(0,0,0,0.1)]
          flex flex-col
          transform transition-transform duration-300 ease-in-out
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
          
          {/* Header Sidebar Mobile */}
          <div className="md:hidden px-6 py-5 flex items-center justify-between border-b border-white/10 shrink-0">
            <h3 className="font-black text-lg uppercase tracking-widest text-white/90">Menu Dapodik</h3>
            <button 
              onClick={() => setIsMobileMenuOpen(false)}
              className="p-2 bg-white/10 rounded-xl hover:bg-red-500 transition-colors"
            >
              <X size={20} />
            </button>
          </div>

          <div className="hidden md:flex px-5 py-5 border-b border-white/10 shrink-0 items-center justify-between gap-2">
            <button 
              onClick={() => loadData(true)} 
              disabled={isSyncing} 
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-wider transition-all shadow-md ${isSyncing ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30 cursor-not-allowed' : 'bg-blue-600/80 text-white hover:bg-blue-500 active:scale-95 border border-blue-400/50'}`}
            >
              <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
              <span className="truncate">{isSyncing ? 'Memproses...' : 'Sinkronisasi Data'}</span>
            </button>

            {/* Year Selector for Desktop */}
            <select 
              value={selectedYear} 
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-white/10 text-white font-black text-[11px] px-2 py-2.5 rounded-xl outline-none border border-white/20 cursor-pointer shrink-0 text-center"
              title="Pilih Tahun Data"
            >
              <option value="2024" className="text-gray-800">2024</option>
              <option value="2025" className="text-gray-800">2025</option>
              <option value="2026" className="text-gray-800">2026</option>
            </select>
          </div>

          {/* List Menu */}
          <nav className="flex-1 overflow-y-auto p-4 space-y-2 scrollbar-hide">
            {MENU_ITEMS.map((menu) => {
              const isActive = activeMenu === menu.id;
              const Icon = menu.icon;
              
              return (
                <button
                  key={menu.id}
                  onClick={() => {
                    setActiveMenu(menu.id);
                    setIsMobileMenuOpen(false); // Otomatis tutup sidebar di HP setelah klik
                  }}
                  className={`
                    w-full flex items-center gap-4 px-4 py-4 rounded-2xl text-left transition-all duration-300 group
                    ${isActive 
                      ? 'bg-white text-blue-800 shadow-[0_8px_30px_rgb(0,0,0,0.12)] scale-[1.02] border-l-4 border-blue-500' 
                      : 'text-blue-50 border-l-4 border-transparent hover:bg-white/10 hover:translate-x-1 hover:text-white'
                    }
                  `}
                >
                  <div className={`p-2 rounded-xl transition-colors ${isActive ? 'bg-blue-100 text-blue-700' : 'bg-white/10 group-hover:bg-white/20'}`}>
                    <Icon size={20} />
                  </div>
                  <span className={`font-black text-sm uppercase tracking-tight ${isActive ? '' : 'opacity-90 group-hover:opacity-100'}`}>
                    {menu.label}
                  </span>
                </button>
              );
            })}
          </nav>
          
          <div className="p-6 shrink-0 opacity-50 text-center border-t border-white/10">
            <p className="text-[10px] font-bold tracking-widest uppercase">SITAKA BPMP KALBAR 2026</p>
          </div>
        </aside>

        {/* ================================================================= */}
        {/* 4. AREA KONTEN UTAMA */}
        {/* ================================================================= */}
        <main className="flex-1 flex flex-col bg-gray-50 overflow-hidden relative z-10">
           <div className="flex-1 overflow-y-auto p-4 md:p-8">
              <div className="bg-white rounded-[2rem] shadow-xl min-h-full border border-gray-100 overflow-hidden flex flex-col">
                 {renderContent()}
              </div>
           </div>
        </main>

      </div>
    </div>
  );
}