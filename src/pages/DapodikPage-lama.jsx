import React, { useState, useMemo, useEffect } from 'react';
import { MapPin, Layers, Loader2, ChevronDown, RefreshCw, School } from 'lucide-react';
import { KABUPATEN_LIST } from '../constants/listData';
import { StatusDoughnut } from '../components/StatusDoughnut';
import { db } from '../firebase/config';
import { collection, getDocs, query, where, limit } from 'firebase/firestore';
import DetailGuruPage from './DetailGuruPage';
import DetailSekolah from './DetailSekolah'; // Import Detail Sekolah

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
// UTILITY: AMAN BACA KOLOM
// =====================================================================
const getSafeVal = (obj, ...possibleKeys) => {
  if (!obj) return '';
  for (let key of possibleKeys) {
    if (obj[key] !== undefined && obj[key] !== null) {
      return String(obj[key]).trim();
    }
  }
  return '';
};

const FILTER_JENJANG = ['TK', 'SD', 'SMP', 'SMA', 'SMK', 'SLB', 'PKBM', 'TPA', 'SPS', 'SKB', 'KB'];

export default function DapodikPage({ Header }) {
  const [selectedJenjang, setSelectedJenjang] = useState(FILTER_JENJANG);
  const [selectedKabupaten, setSelectedKabupaten] = useState(KABUPATEN_LIST);
  const [selectedYear, setSelectedYear] = useState('2026'); 
  const [sekolahData, setSekolahData] = useState([]);
  const [ptkData, setPtkData] = useState([]);
  const [kepsekData, setKepsekData] = useState([]);
  
  const [loading, setLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false); 
  const [viewMode, setViewMode] = useState('main'); // 'main', 'detail_guru', 'detail_sekolah'
  const [showMobileKabupaten, setShowMobileKabupaten] = useState(false);

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

  // --- 3. FILTER LOGIC & SANITASI NIK (SUPER KETAT & IDENTIK DGN DETAILGURUPAGE) ---
  const filtered = useMemo(() => {
    const isSemuaJenjang = selectedJenjang.length === FILTER_JENJANG.length;
    const isSemuaKab = selectedKabupaten.length === KABUPATEN_LIST.length;
    
    const jenjangSet = new Set(selectedJenjang.map(j => j.toUpperCase()));
    const kabSet = new Set(selectedKabupaten.map(k => k.replace(/^(Kab\.|Kota)\s+/i, '').trim().toUpperCase()));

    const filterWilayahJenjang = (d) => {
      if (isSemuaJenjang && isSemuaKab) return true;
      const jenjangDb = getSafeVal(d, 'bentuk_pendidikan', 'Bentuk Pendidikan', 'jenjang').toUpperCase() || 'TIDAK DIKETAHUI';
      if (!isSemuaJenjang && !jenjangSet.has(jenjangDb)) return false;
      const kabDb = getSafeVal(d, 'kabupaten', 'Kabupaten/Kota', 'Kab/Kota').replace(/^(Kab\.|Kota)\s+/i, '').toUpperCase();
      if (!isSemuaKab && !kabSet.has(kabDb)) return false;
      return true;
    };

    // Filter Sekolah
    const fSekolah = sekolahData.filter(filterWilayahJenjang);

    // --- LOGIKA FILTER PTK (Membersihkan Induk & Duplikat SEBELUM filter wilayah) ---
    // Logika ini menjamin angka yang dihasilkan akan 100% cocok dengan DetailGuruPage
    const uniqueMap = new Map();
    
    for (let i = 0; i < ptkData.length; i++) {
        const ptk = ptkData[i];
        
        // Cek Induk
        const isInduk = String(getSafeVal(ptk, 'status_tugas', 'ptk_induk', 'PTK Induk')).trim().toUpperCase() === 'INDUK' || String(getSafeVal(ptk, 'status_tugas', 'ptk_induk', 'PTK Induk')).trim() === '1';
        
        // Cek Guru
        const isGuru = getSafeVal(ptk, 'jenis_ptk', 'Jenis PTK').toUpperCase().includes('GURU');
        
        // Hanya yang statusnya Guru dan Induk yang masuk mesin anti-duplikat
        if (isGuru && isInduk) {
            const nik = String(getSafeVal(ptk, 'nik', 'NIK')).replace(/\D/g, '');
            const docId = nik ? nik : Math.random().toString();
            
            // Simpan yang pertama kali ketemu saja
            if (!uniqueMap.has(docId)) {
                uniqueMap.set(docId, ptk);
            }
        } 
        // Jika bukan guru induk (misal tendik), kita simpan sementara dengan kunci acak agar tetap lolos
        else if (!isGuru) {
            uniqueMap.set(Math.random().toString(), ptk);
        }
    }

    // Ubah map jadi array, lalu BARU filter berdasarkan wilayah & jenjang
    const sanitizedPtkArray = Array.from(uniqueMap.values());
    const fPtk = sanitizedPtkArray.filter(filterWilayahJenjang);

    return {
      sekolah: fSekolah,
      ptk: fPtk
    };
  }, [sekolahData, ptkData, selectedJenjang, selectedKabupaten]);

  const displayTitle = useMemo(() => {
    if (selectedKabupaten.length === KABUPATEN_LIST.length) return `PROVINSI KALIMANTAN BARAT`;
    if (selectedKabupaten.length === 1) return `KABUPATEN ${selectedKabupaten[0].toUpperCase()}`;
    return "WILAYAH TERPILIH";
  }, [selectedKabupaten]);

  // --- 4. HELPER PERHITUNGAN ---
  const getPtkStatus = (item) => {
    const statusSekolahDb = getSafeVal(item, 'status_sekolah').toUpperCase();
    if (statusSekolahDb === 'NEGERI') return 'NEGERI';
    if (statusSekolahDb === 'SWASTA') return 'SWASTA';
    
    // Fallback jika ternyata data lama/kosong
    const sp = getSafeVal(item, 'status_kepegawaian', 'Status Kepegawaian').toUpperCase();
    if (sp.includes('PNS') || sp.includes('PPPK') || sp.includes('DAERAH') || sp.includes('PROV') || sp.includes('KAB')) return 'NEGERI';
    if (sp.includes('GTY') || sp.includes('PTY') || sp.includes('YAYASAN') || sp.includes('SEKOLAH')) return 'SWASTA';
    return 'UNKNOWN';
  };

  const sekolahStats = useMemo(() => {
    const res = { sekolah: { total: 0, negeri: 0 }, pdTotal: { total: 0, negeri: 0 }, rombel: { total: 0, negeri: 0 }, tendik: { total: 0, negeri: 0 }, kepsek: { total: 0, negeri: 0, kosong: 0 }, unitPerJenjang: {} };
    FILTER_JENJANG.forEach(j => res.unitPerJenjang[j] = 0);

    for (let i = 0; i < filtered.sekolah.length; i++) {
      const s = filtered.sekolah[i];
      const status = getSafeVal(s, 'status_sekolah', 'Status Sekolah').toUpperCase();
      const isNegeri = status === 'NEGERI';
      
      res.sekolah.total++; if (isNegeri) res.sekolah.negeri++;
      const pd = parseFloat(getSafeVal(s, 'pd_total').replace(/[^0-9.-]+/g, "")) || 0;
      res.pdTotal.total += pd; if (isNegeri) res.pdTotal.negeri += pd;
      const tdk = parseFloat(getSafeVal(s, 'tendik').replace(/[^0-9.-]+/g, "")) || 0;
      res.tendik.total += tdk; if (isNegeri) res.tendik.negeri += tdk;

      let rmbl = 0;
      for (const key in s) {
        if (key.toLowerCase().includes('rombel_')) rmbl += parseFloat(String(s[key]).replace(/[^0-9.-]+/g, "")) || 0;
      }
      res.rombel.total += rmbl; if (isNegeri) res.rombel.negeri += rmbl;

      const namaKepsek = getSafeVal(s, 'nama_kepala_sekolah', 'Nama Kepala Sekolah').toLowerCase();
      res.kepsek.total++; 
      if (namaKepsek === '' || namaKepsek === 'null' || namaKepsek === '-' || namaKepsek === 'undefined') {
          res.kepsek.kosong++; 
      } else {
          if (isNegeri) res.kepsek.negeri++; 
      }

      const jenjangDb = getSafeVal(s, 'bentuk_pendidikan', 'Bentuk Pendidikan', 'jenjang').toUpperCase();
      if (res.unitPerJenjang[jenjangDb] !== undefined) res.unitPerJenjang[jenjangDb]++;
    }
    return res;
  }, [filtered.sekolah]);

  const ptkStats = useMemo(() => {
    const res = { guru: { total: 0, negeri: 0 } };
    
    for (let i = 0; i < filtered.ptk.length; i++) {
      const p = filtered.ptk[i];
      const jenis = getSafeVal(p, 'jenis_ptk', 'Jenis PTK').toUpperCase();
      if (jenis.includes('GURU')) {
          res.guru.total++;
          if (getPtkStatus(p) === 'NEGERI') {
              res.guru.negeri++;
          }
      }
    }
    return res;
  }, [filtered.ptk]);

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
        
        {/* SIDEBAR WILAYAH */}
        <aside className="hidden md:flex w-64 lg:w-72 bg-blue-50/40 border-r border-blue-100 flex-col shrink-0 z-20 shadow-[2px_0_15px_-3px_rgba(0,0,0,0.05)]">
          <div className="px-5 py-4 border-b border-blue-200 flex justify-between items-center bg-blue-100/60 shrink-0">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-1.5 rounded-lg text-white shadow-sm"><MapPin size={18} /></div>
              <h3 className="font-black text-blue-900 uppercase text-sm tracking-wider">Wilayah</h3>
            </div>
            <button onClick={() => setSelectedKabupaten(KABUPATEN_LIST)} className={`text-[10px] font-black px-3 py-1.5 rounded-lg transition-all ${selectedKabupaten.length === KABUPATEN_LIST.length ? 'bg-blue-700 text-white shadow-md' : 'bg-white text-blue-700 border border-blue-200 hover:bg-blue-100 active:scale-95'}`}>RESET</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5 text-left scrollbar-hide">
            {KABUPATEN_LIST.map(kab => {
              const active = selectedKabupaten.length === 1 && selectedKabupaten[0] === kab;
              return (
                <button key={kab} onClick={() => setSelectedKabupaten([kab])} className={`w-full text-left px-5 py-3.5 rounded-2xl text-sm font-black border-2 transition-all duration-200 active:scale-[0.98] ${active ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-transparent shadow-lg shadow-blue-500/30 translate-x-1' : 'bg-white text-slate-600 border-white hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 shadow-sm'}`}>{kab}</button>
              );
            })}
          </div>
        </aside>

        {/* AREA KONTEN UTAMA */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          
          <div className="bg-white border-b px-4 md:px-6 py-3 flex flex-col gap-3 shrink-0 shadow-sm relative z-20">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="flex gap-1.5 md:gap-2">
                  {["2024", "2025", "2026"].map(y => (
                    <button key={y} onClick={() => setSelectedYear(y)} className={`px-4 py-1.5 md:py-2 rounded-xl font-black text-xs md:text-sm transition-all ${selectedYear === y ? 'bg-blue-700 text-white shadow-md' : 'bg-gray-100 text-gray-500'}`}>{y}</button>
                  ))}
                </div>
                <button onClick={() => loadData(true)} disabled={isSyncing} className={`flex items-center gap-2 px-3 py-1.5 md:py-2 ml-1 md:ml-2 rounded-xl text-[10px] md:text-xs font-black border-2 transition-all ${isSyncing ? 'bg-orange-100 text-orange-600 border-orange-200' : 'bg-white text-blue-600 border-blue-100 hover:bg-blue-50 active:scale-95'}`}>
                  <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} /><span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync Data'}</span>
                </button>

                <div className="md:hidden relative ml-1">
                  <button onClick={() => setShowMobileKabupaten(!showMobileKabupaten)} className="flex items-center gap-1.5 bg-blue-50 text-blue-700 px-3 py-1.5 rounded-xl border border-blue-200 font-black text-[10px] uppercase">
                    <MapPin size={12} /><span className="max-w-[70px] truncate">{selectedKabupaten.length === KABUPATEN_LIST.length ? 'Semua' : selectedKabupaten[0]}</span><ChevronDown size={12} className={`transition-transform ${showMobileKabupaten ? 'rotate-180' : ''}`} />
                  </button>
                  {showMobileKabupaten && (
                    <div className="absolute left-0 top-full mt-2 w-48 max-h-64 overflow-y-auto bg-white rounded-2xl shadow-2xl border border-blue-100 z-50 flex flex-col p-2 animate-in fade-in zoom-in-95">
                      <button onClick={() => { setSelectedKabupaten(KABUPATEN_LIST); setShowMobileKabupaten(false); }} className={`text-left px-3 py-2.5 rounded-xl text-xs font-black mb-1 ${selectedKabupaten.length === KABUPATEN_LIST.length ? 'bg-blue-600 text-white' : 'bg-gray-50 text-blue-600'}`}>SEMUA WILAYAH</button>
                      {KABUPATEN_LIST.map(kab => (
                        <button key={kab} onClick={() => { setSelectedKabupaten([kab]); setShowMobileKabupaten(false); }} className={`text-left px-3 py-2.5 rounded-xl text-xs font-black transition-all ${selectedKabupaten.length === 1 && selectedKabupaten[0] === kab ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-blue-50'}`}>{kab}</button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="hidden md:flex flex-col items-end text-right ml-auto">
                <h2 className="text-xl font-black text-blue-800 uppercase tracking-tighter leading-none">DASHBOARD DAPODIK</h2>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">{displayTitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1 w-full">
              <button onClick={() => selectedJenjang.length === FILTER_JENJANG.length ? setSelectedJenjang([]) : setSelectedJenjang(FILTER_JENJANG)} className="px-4 py-2 text-xs md:px-5 md:py-2.5 md:text-sm font-black rounded-xl md:rounded-2xl bg-red-600 text-white uppercase shadow-sm active:scale-95 transition-all shrink-0">
                {selectedJenjang.length === FILTER_JENJANG.length ? 'Kosongkan' : 'Semua / Kosongkan'}
              </button>
              {FILTER_JENJANG.map(j => ( 
                <button key={j} onClick={() => setSelectedJenjang(prev => prev.includes(j) ? prev.filter(i => i !== j) : [...prev, j])} className={`px-4 py-2 text-xs md:px-5 md:py-2.5 md:text-sm font-black rounded-xl md:rounded-2xl border-2 whitespace-nowrap shrink-0 transition-colors shadow-sm active:scale-95 ${selectedJenjang.includes(j) ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-blue-300'}`}>{j}</button> 
              ))}
            </div>
          </div>

          {/* MAIN CONTENT */}
          <div className="flex-1 p-3 md:p-5 flex flex-col min-h-0 bg-gray-100 relative z-10 overflow-hidden">
            {viewMode === 'main' ? (
              <div className="animate-in fade-in duration-500 h-full flex flex-col lg:flex-row gap-4 min-h-0">
                <div className="flex-1 min-h-0 overflow-y-auto pr-1 sm:pr-2 scrollbar-hide">
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 md:gap-4 content-start">
                    
                    <div onClick={() => setViewMode('detail_guru')} className="cursor-pointer hover:scale-[1.02] transition-transform active:scale-95">
                      <StatusDoughnut label="Jumlah Guru" total={ptkStats.guru.total} nValue={ptkStats.guru.negeri} />
                    </div>
                    
                    <StatusDoughnut 
                       label="Jumlah Kepsek" 
                       total={sekolahStats.kepsek.total} 
                       nValue={sekolahStats.kepsek.negeri} 
                       xValue={sekolahStats.kepsek.kosong}
                       xLabel="Tdk. Ada Kepsek"
                    />
                    <StatusDoughnut label="Jumlah Siswa" total={sekolahStats.pdTotal.total} nValue={sekolahStats.pdTotal.negeri} />
                    <StatusDoughnut label="Jumlah Rombel" total={sekolahStats.rombel.total} nValue={sekolahStats.rombel.negeri} />
                    <StatusDoughnut label="Jumlah Tendik" total={sekolahStats.tendik.total} nValue={sekolahStats.tendik.negeri} />
                    
                    {/* Klik untuk masuk ke DetailSekolah */}
                    <div onClick={() => setViewMode('detail_sekolah')} className="cursor-pointer hover:scale-[1.02] transition-transform active:scale-95">
                      <StatusDoughnut label="Satuan Pendidikan" total={sekolahStats.sekolah.total} nValue={sekolahStats.sekolah.negeri} />
                    </div>

                  </div>
                </div>

                <div className="w-full lg:w-64 xl:w-80 bg-blue-900 p-4 md:p-5 rounded-3xl md:rounded-[2rem] text-white shadow-xl flex flex-col shrink-0 max-h-[350px] lg:max-h-full">
                  <div className="flex items-center justify-between mb-4 border-b border-blue-800 pb-3 shrink-0">
                    <h3 className="text-xs md:text-sm font-black uppercase tracking-widest text-blue-200 flex items-center gap-2">
                      <School size={16} className="text-white" /> Unit Sekolah
                    </h3>
                  </div>
                  <div className="grid grid-cols-4 lg:grid-cols-2 gap-2 md:gap-3 flex-1 overflow-y-auto content-start pr-1 scrollbar-hide">
                    {FILTER_JENJANG.map(j => {
                      const isSelected = selectedJenjang.includes(j);
                      return (
                        <div key={j} className={`p-2 md:p-4 rounded-xl md:rounded-2xl text-center border-2 transition-all ${isSelected ? 'bg-white/10 border-white/20 shadow-md' : 'bg-black/20 border-transparent opacity-40'}`}>
                          <span className="text-[9px] md:text-xs font-black text-blue-300 uppercase mb-1 block tracking-wider">{j}</span>
                          <p className="text-sm md:text-2xl font-black">{sekolahStats.unitPerJenjang[j].toLocaleString()}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            ) : viewMode === 'detail_guru' ? (
              <div className="animate-in slide-in-from-right duration-500 h-full flex flex-col min-h-0 bg-white rounded-3xl shadow-sm overflow-hidden">
                <DetailGuruPage 
                  data={filtered.ptk.filter(d => getSafeVal(d, 'jenis_ptk', 'Jenis PTK').toUpperCase().includes("GURU"))} 
                  onBack={() => setViewMode('main')}
                  selectedYear={selectedYear}
                  title={displayTitle}
                />
              </div>
            ) : viewMode === 'detail_sekolah' ? (
              <div className="animate-in slide-in-from-right duration-500 h-full flex flex-col min-h-0 bg-white rounded-3xl shadow-sm overflow-hidden">
                <DetailSekolah 
                  // Melempar data sekolah yang sudah tersaring berdasarkan wilayah
                  data={filtered.sekolah} 
                  onBack={() => setViewMode('main')}
                  selectedYear={selectedYear}
                  title={displayTitle}
                />
              </div>
            ) : null}
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