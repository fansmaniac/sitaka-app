import React, { useState, useMemo, useEffect } from 'react';
import { MapPin, ArrowLeft, Layers, Loader2, ChevronDown, RefreshCw } from 'lucide-react';
import { KABUPATEN_LIST, JENJANG_LIST } from '../constants/listData';
import { StatusDoughnut } from '../components/StatusDoughnut';
import { db } from '../firebase/config';
import { collection, getDocs, query, where } from 'firebase/firestore';
import DetailGuruPage from './DetailGuruPage';

// =====================================================================
// UTILITY: INDEXED-DB CACHING (BRANKAS LOKAL BROWSER)
// Berfungsi menyimpan jutaan baris data di browser agar tidak perlu
// download ulang dari Firebase setiap kali halaman di-refresh.
// =====================================================================
const DB_NAME = "SitakaCacheDB";
const STORE_NAME = "dapodikData";
const CACHE_EXPIRY_HOURS = 12; // Cache kedaluwarsa setelah 12 jam

const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
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
        resolve(null); // Cache tidak ada atau sudah kedaluwarsa
      };
      req.onerror = () => resolve(null);
    });
  } catch (err) { return null; }
};
// =====================================================================

export default function DapodikPage({ onBack, Header }) {
  // --- 1. STATE ---
  const [selectedJenjang, setSelectedJenjang] = useState(JENJANG_LIST);
  const [selectedKabupaten, setSelectedKabupaten] = useState(KABUPATEN_LIST);
  const [selectedYear, setSelectedYear] = useState('2026'); 
  const [sekolahData, setSekolahData] = useState([]);
  const [ptkData, setPtkData] = useState([]);
  const [kepsekData, setKepsekData] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false); // State untuk animasi tombol sync
  const [viewMode, setViewMode] = useState('main'); 
  
  const [showMobileKabupaten, setShowMobileKabupaten] = useState(false);

  // --- 2. FETCH DATA DENGAN LOGIKA CACHE ---
  const loadData = async (forceSync = false) => {
    setLoading(true);
    if (forceSync) setIsSyncing(true);
    
    const cacheKey = `dapodik_all_${selectedYear}`;

    try {
      // 1. Cek Brankas Lokal dulu (kecuali user menekan tombol Force Sync)
      if (!forceSync) {
        const cachedData = await getFromCache(cacheKey);
        if (cachedData) {
          setSekolahData(cachedData.sekolah);
          setPtkData(cachedData.ptk);
          setKepsekData(cachedData.kepsek);
          setLoading(false);
          return; // Langsung tampilkan tanpa hit ke Firebase
        }
      }

      // 2. Jika tidak ada di cache atau Force Sync, Download dari Firebase
      const qPtk = query(collection(db, 'dapodik_ptk'), where("tahun_data", "==", selectedYear));
      const qSekolah = query(collection(db, 'dapodik_sekolah'), where("tahun_data", "==", selectedYear));
      const qKepsek = query(collection(db, 'dapodik_kepsek'), where("tahun_data", "==", selectedYear));

      const [sekolahSnap, ptkSnap, kepsekSnap] = await Promise.all([
        getDocs(qSekolah), getDocs(qPtk), getDocs(qKepsek)
      ]);

      const freshData = {
        sekolah: sekolahSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        ptk: ptkSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        kepsek: kepsekSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      };

      // 3. Simpan ke State
      setSekolahData(freshData.sekolah);
      setPtkData(freshData.ptk);
      setKepsekData(freshData.kepsek);

      // 4. Simpan ke Brankas Lokal (IndexedDB)
      await saveToCache(cacheKey, freshData);

    } catch (error) {
      console.error("Error mengambil data SITAKA:", error);
    } finally {
      setLoading(false);
      setIsSyncing(false);
    }
  };

  // Otomatis load data saat komponen dirender atau tahun berubah
  useEffect(() => {
    loadData(false);
  }, [selectedYear]);

  // --- 3. FILTER LOGIC ---
  const filtered = useMemo(() => {
    const filterFn = (d) => {
      const matchJenjang = selectedJenjang.some(j => 
        j.trim().toUpperCase() === String(d['Bentuk Pendidikan'] || '').trim().toUpperCase()
      );
      const matchKab = selectedKabupaten.some(k => 
        k.trim().toUpperCase() === String(d['Kabupaten/Kota'] || d['Kab/Kota'] || '').trim().toUpperCase()
      );
      return matchJenjang && matchKab;
    };
    return {
      sekolah: sekolahData.filter(filterFn),
      ptk: ptkData.filter(filterFn),
      kepsek: kepsekData.filter(filterFn)
    };
  }, [sekolahData, ptkData, kepsekData, selectedJenjang, selectedKabupaten, selectedYear]);

  const displayTitle = useMemo(() => {
    if (selectedKabupaten.length === KABUPATEN_LIST.length) return `PROVINSI KALIMANTAN BARAT`;
    if (selectedKabupaten.length === 1) return `KABUPATEN ${selectedKabupaten[0].toUpperCase()}`;
    return "WILAYAH TERPILIH";
  }, [selectedKabupaten]);

  // --- 4. HELPER PERHITUNGAN ---
  const getStat = (source, field, isStatusNegeri = null) => {
    return filtered[source]
      .filter(d => {
        if (isStatusNegeri === null) return true;
        const status = String(d['Status Sekolah'] || '').trim().toUpperCase();
        return isStatusNegeri ? status === 'NEGERI' : status === 'SWASTA';
      })
      .reduce((sum, item) => {
        let val = String(item[field] || '0').replace(/[^0-9.-]+/g, "");
        return sum + (parseFloat(val) || 0);
      }, 0);
  };

  const countGuru = (isStatusNegeri = null) => {
    return filtered.ptk.filter(d => {
      const jenis = String(d['Jenis PTK'] || '').trim().toUpperCase();
      const isGuru = jenis.includes("GURU"); 
      
      if (!isGuru) return false;
      if (isStatusNegeri === null) return true;
      
      const status = String(d['Status Sekolah'] || '').trim().toUpperCase();
      return isStatusNegeri ? status === 'NEGERI' : status === 'SWASTA';
    }).length;
  };

  const countTendik = (isStatusNegeri = null) => {
    return filtered.ptk.filter(d => {
      const jenis = String(d['Jenis PTK'] || '').trim().toUpperCase();
      const isTendik = jenis === "TENAGA KEPENDIDIKAN";
      
      if (!isTendik) return false;
      if (isStatusNegeri === null) return true;
      
      const status = String(d['Status Sekolah'] || '').trim().toUpperCase();
      return isStatusNegeri ? status === 'NEGERI' : status === 'SWASTA';
    }).length;
  };

  const countGeneric = (source, isStatusNegeri = null) => {
    return filtered[source].filter(d => {
      if (isStatusNegeri === null) return true;
      const status = String(d['Status Sekolah'] || '').trim().toUpperCase();
      return isStatusNegeri ? status === 'NEGERI' : status === 'SWASTA';
    }).length;
  };

  const jenjangTotals = useMemo(() => { 
    const counts = {}; 
    JENJANG_LIST.forEach(j => { 
      counts[j] = filtered.sekolah.filter(d => 
        String(d['Bentuk Pendidikan'] || '').trim().toUpperCase() === j.trim().toUpperCase()
      ).length; 
    }); 
    return counts; 
  }, [filtered.sekolah]);

  if (loading && !isSyncing) return (
    <div className="h-screen flex flex-col items-center justify-center bg-gray-100 italic font-black uppercase tracking-widest text-gray-400">
      <Loader2 className="animate-spin text-blue-600 mb-4" size={64} />
      Memuat Data SITAKA...
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden text-center relative">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        
        {/* SIDEBAR (HANYA MUNCUL DI TABLET & DESKTOP) */}
        <aside className="hidden md:flex w-60 bg-blue-50 border-r border-blue-100 flex-col shrink-0">
          <div className="p-4 border-b border-blue-200 flex justify-between items-center bg-blue-100/50">
            <div className="flex items-center gap-2">
              <MapPin size={20} className="text-blue-700" />
              <h3 className="font-black text-blue-800 uppercase text-sm tracking-wider">Wilayah</h3>
            </div>
            <button onClick={() => setSelectedKabupaten(KABUPATEN_LIST)} className={`text-[10px] font-black px-3 py-1.5 rounded-lg ${selectedKabupaten.length === KABUPATEN_LIST.length ? 'bg-blue-700 text-white' : 'bg-white text-blue-600'}`}>Semua</button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5 text-left">
            {KABUPATEN_LIST.map(kab => {
              const active = selectedKabupaten.length === 1 && selectedKabupaten[0] === kab;
              return (
                <button key={kab} onClick={() => setSelectedKabupaten([kab])} className={`w-full text-left px-4 py-4 rounded-xl text-sm font-black border-2 transition-all ${active ? 'bg-blue-600 text-white border-blue-600 shadow-lg translate-x-1' : 'bg-white text-gray-600 border-white hover:border-blue-200 shadow-sm'}`}>
                  {kab}
                </button>
              );
            })}
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          
          {/* HEADER DASHBOARD */}
          <div className="bg-white border-b px-4 md:px-6 py-4 flex flex-col gap-4 shrink-0 shadow-sm relative z-20">
            
            {/* Baris Pertama */}
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2 md:gap-4">
                <button onClick={onBack} className="p-2.5 md:p-3 bg-gray-100 rounded-xl md:rounded-2xl active:scale-90 shadow-sm hover:bg-gray-200">
                  <ArrowLeft className="w-5 h-5 md:w-6 md:h-6" />
                </button>
                
                <div className="flex gap-1.5 md:gap-2">
                  {["2024", "2025", "2026"].map(y => (
                    <button key={y} onClick={() => setSelectedYear(y)} className={`px-4 md:px-6 py-2 md:py-3 rounded-xl md:rounded-2xl font-black text-sm md:text-base transition-all ${selectedYear === y ? 'bg-blue-700 text-white shadow-xl' : 'bg-gray-100 text-gray-500'}`}>
                      {y}
                    </button>
                  ))}
                </div>

                {/* Tombol Sinkronisasi Paksa (Force Update Cache) */}
                <button 
                  onClick={() => loadData(true)} 
                  disabled={isSyncing}
                  className={`flex items-center gap-2 px-3 py-2 md:py-3 ml-2 md:ml-4 rounded-xl md:rounded-2xl text-xs md:text-sm font-black border-2 transition-all ${isSyncing ? 'bg-orange-100 text-orange-600 border-orange-200' : 'bg-white text-blue-600 border-blue-100 hover:bg-blue-50 active:scale-95'}`}
                  title="Tarik data terbaru dari server (Abaikan Cache)"
                >
                  <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} />
                  <span className="hidden sm:inline">{isSyncing ? 'Menyinkronkan...' : 'Sinkron Ulang'}</span>
                </button>
              </div>

              {/* Tombol Pilih Wilayah KHUSUS MOBILE */}
              <div className="md:hidden relative">
                <button 
                  onClick={() => setShowMobileKabupaten(!showMobileKabupaten)}
                  className="flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-2 rounded-xl border border-blue-200 font-black text-[10px] sm:text-xs uppercase"
                >
                  <MapPin size={14} />
                  <span className="max-w-[80px] truncate">
                    {selectedKabupaten.length === KABUPATEN_LIST.length ? 'Semua' : selectedKabupaten[0]}
                  </span>
                  <ChevronDown size={14} className={`transition-transform ${showMobileKabupaten ? 'rotate-180' : ''}`} />
                </button>
                
                {/* Dropdown Wilayah Mobile */}
                {showMobileKabupaten && (
                  <div className="absolute right-0 top-full mt-2 w-56 max-h-80 overflow-y-auto bg-white rounded-2xl shadow-2xl border border-blue-100 z-50 flex flex-col p-2 animate-in fade-in zoom-in-95">
                    <button onClick={() => { setSelectedKabupaten(KABUPATEN_LIST); setShowMobileKabupaten(false); }} className={`text-left px-4 py-3 rounded-xl text-xs font-black mb-1 ${selectedKabupaten.length === KABUPATEN_LIST.length ? 'bg-blue-600 text-white' : 'bg-gray-50 text-blue-600'}`}>
                      SEMUA WILAYAH
                    </button>
                    {KABUPATEN_LIST.map(kab => (
                      <button key={kab} onClick={() => { setSelectedKabupaten([kab]); setShowMobileKabupaten(false); }} className={`text-left px-4 py-3 rounded-xl text-xs font-black transition-all ${selectedKabupaten.length === 1 && selectedKabupaten[0] === kab ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-blue-50'}`}>
                        {kab}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Baris Kedua: Filter Jenjang */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 md:gap-4 overflow-hidden">
              <div className="flex items-center justify-between sm:justify-start gap-2 min-w-[160px] shrink-0">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Jenjang:</span>
                <button onClick={() => selectedJenjang.length === JENJANG_LIST.length ? setSelectedJenjang([]) : setSelectedJenjang(JENJANG_LIST)} className="px-3 py-1.5 rounded-lg md:rounded-xl text-[9px] font-black bg-red-600 text-white uppercase border-2 border-red-600">
                  {selectedJenjang.length === JENJANG_LIST.length ? 'Kosongkan' : 'Pilih Semua'}
                </button>
              </div>
              <div className="flex flex-row gap-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-hide w-full">
                {JENJANG_LIST.map(j => ( 
                  <button key={j} onClick={() => setSelectedJenjang(prev => prev.includes(j) ? prev.filter(i => i !== j) : [...prev, j])} className={`px-3 py-1.5 rounded-lg md:rounded-xl text-[9px] md:text-[10px] font-black border-2 whitespace-nowrap shrink-0 transition-colors ${selectedJenjang.includes(j) ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-400 border-gray-100 hover:border-blue-200'}`}>
                    {j}
                  </button> 
                ))}
              </div>
            </div>
          </div>

          {/* MAIN CONTENT / GRAFIK */}
          <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 md:space-y-8 bg-gray-100 text-center relative z-10">
            {viewMode === 'main' ? (
              <div className="animate-in fade-in duration-500 space-y-6 md:space-y-8 pb-10">
                
                <h2 className="text-xl md:text-4xl font-black text-gray-800 flex flex-col md:flex-row items-center gap-2 md:gap-4 tracking-tighter uppercase justify-center">
                  <div className="hidden md:block h-10 w-3 bg-blue-700 rounded-full"></div>
                  <span className="text-blue-600 md:text-gray-800">DASHBOARD DAPODIK</span>
                  <span className="text-sm md:text-4xl">{displayTitle} {selectedYear}</span>
                </h2>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 md:gap-8">
                  <div onClick={() => setViewMode('detail_guru')} className="cursor-pointer hover:scale-[1.02] transition-transform active:scale-95">
                    <StatusDoughnut label="Jumlah Guru" total={countGuru()} nValue={countGuru(true)} />
                  </div>
                  <StatusDoughnut label="Jumlah Kepsek" total={countGeneric('kepsek')} nValue={countGeneric('kepsek', true)} />
                  <StatusDoughnut label="Jumlah Siswa" total={getStat('sekolah', 'PD_Total')} nValue={getStat('sekolah', 'PD_Total', true)} />
                  <StatusDoughnut label="Jumlah Rombel" total={getStat('sekolah', 'Jumlah Rombel')} nValue={getStat('sekolah', 'Jumlah Rombel', true)} />
                  <StatusDoughnut label="Jumlah Tendik" total={countTendik()} nValue={countTendik(true)} />
                  <StatusDoughnut label="Satuan Pendidikan" total={countGeneric('sekolah')} nValue={countGeneric('sekolah', true)} />
                </div>

                <div className="bg-gray-800 p-6 md:p-8 rounded-[2rem] md:rounded-[3rem] text-white shadow-2xl">
                  <h3 className="text-xs md:text-sm font-black uppercase tracking-[0.2em] md:tracking-[0.4em] mb-6 md:mb-8 text-gray-400 flex items-center gap-2 md:gap-3 justify-center">
                    <Layers size={20} className="text-blue-500" /> Unit Sekolah per Jenjang
                  </h3>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-7 gap-3 md:gap-4">
                    {JENJANG_LIST.map(j => (
                      <div key={j} className={`p-3 md:p-6 rounded-2xl md:rounded-3xl text-center border transition-all ${selectedJenjang.includes(j) ? 'bg-white/10 border-white/30 shadow-lg' : 'bg-black/20 opacity-20'}`}>
                        <span className="text-[10px] md:text-sm font-black text-blue-400 uppercase mb-1 md:mb-2 block">{j}</span>
                        <p className="text-xl md:text-3xl font-black">{jenjangTotals[j].toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="animate-in slide-in-from-right duration-500 h-full">
                <DetailGuruPage 
                  data={filtered.ptk.filter(d => String(d['Jenis PTK'] || '').toUpperCase().includes("GURU"))} 
                  onBack={() => setViewMode('main')}
                  selectedYear={selectedYear}
                  title={displayTitle}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {showMobileKabupaten && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 md:hidden" 
          onClick={() => setShowMobileKabupaten(false)}
        />
      )}
    </div>
  );
}