import React, { useState, useMemo, useEffect } from 'react';
import { MapPin, ArrowLeft, Layers, Loader2 } from 'lucide-react';
import { KABUPATEN_LIST, JENJANG_LIST } from '../constants/listData';
import { StatusDoughnut } from '../components/StatusDoughnut';
import { db } from '../firebase/config';
import { collection, getDocs, query, where } from 'firebase/firestore';
import DetailGuruPage from './DetailGuruPage';

export default function DapodikPage({ onBack, Header }) {
  // --- 1. STATE ---
  const [selectedJenjang, setSelectedJenjang] = useState(JENJANG_LIST);
  const [selectedKabupaten, setSelectedKabupaten] = useState(KABUPATEN_LIST);
  const [selectedYear, setSelectedYear] = useState('2025'); 
  const [sekolahData, setSekolahData] = useState([]);
  const [ptkData, setPtkData] = useState([]);
  const [kepsekData, setKepsekData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState('main'); 

  // --- 2. FETCH DATA ---
  useEffect(() => {
    const fetchAllData = async () => {
      setLoading(true);
      try {
        const qPtk = query(collection(db, 'dapodik_ptk'), where("tahun_data", "==", selectedYear));
        const qSekolah = query(collection(db, 'dapodik_sekolah'), where("tahun_data", "==", selectedYear));
        const qKepsek = query(collection(db, 'dapodik_kepsek'), where("tahun_data", "==", selectedYear));

        const [sekolahSnap, ptkSnap, kepsekSnap] = await Promise.all([
          getDocs(qSekolah), getDocs(qPtk), getDocs(qKepsek)
        ]);

        setSekolahData(sekolahSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setPtkData(ptkSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setKepsekData(kepsekSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (error) {
        console.error("Error SITAKA:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAllData();
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
    // Menambahkan selectedYear ke dependency agar sinkron saat tahun berubah
  }, [sekolahData, ptkData, kepsekData, selectedJenjang, selectedKabupaten, selectedYear]);

  const displayTitle = useMemo(() => {
    if (selectedKabupaten.length === KABUPATEN_LIST.length) return `PROVINSI KALIMANTAN BARAT`;
    if (selectedKabupaten.length === 1) return `KABUPATEN ${selectedKabupaten[0].toUpperCase()}`;
    return "WILAYAH TERPILIH";
  }, [selectedKabupaten]);

  // --- 4. HELPER PERHITUNGAN (LOGIKA SITAKA) ---
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
      
      // Logika SITAKA: Mencari semua yang mengandung kata "GURU"
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
      
      // Khusus Tenaga Kependidikan
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

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-gray-100 italic font-black uppercase tracking-widest text-gray-400">
      <Loader2 className="animate-spin text-blue-600 mb-4" size={64} />
      Menyinkronkan Database SITAKA...
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden text-center">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        {/* SIDEBAR */}
        <aside className="w-60 bg-blue-50 border-r border-blue-100 flex flex-col shrink-0">
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

        <div className="flex-1 flex flex-col overflow-hidden">
          {/* HEADER DASHBOARD */}
          <div className="bg-white border-b px-6 py-4 flex flex-col gap-4 shrink-0 shadow-sm">
            <div className="flex items-center gap-4">
              <button onClick={onBack} className="p-3 bg-gray-100 rounded-2xl active:scale-90 shadow-sm hover:bg-gray-200"><ArrowLeft size={24} /></button>
              <div className="flex gap-2">
                {["2024", "2025", "2026"].map(y => (
                  <button key={y} onClick={() => setSelectedYear(y)} className={`px-8 py-3 rounded-2xl font-black text-base transition-all ${selectedYear === y ? 'bg-blue-700 text-white shadow-xl' : 'bg-gray-100 text-gray-500'}`}>{y}</button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 min-w-[160px]">
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest text-left">Jenjang:</span>
                <button onClick={() => selectedJenjang.length === JENJANG_LIST.length ? setSelectedJenjang([]) : setSelectedJenjang(JENJANG_LIST)} className="px-3 py-1.5 rounded-xl text-[9px] font-black bg-red-600 text-white uppercase border-2 border-red-600">
                  {selectedJenjang.length === JENJANG_LIST.length ? 'Kosongkan Semua' : 'Pilih Semua'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {JENJANG_LIST.map(j => ( 
                  <button key={j} onClick={() => setSelectedJenjang(prev => prev.includes(j) ? prev.filter(i => i !== j) : [...prev, j])} className={`px-3 py-1.5 rounded-xl text-[9px] font-black border-2 ${selectedJenjang.includes(j) ? 'bg-blue-600 text-white border-blue-600' : 'bg-gray-50 text-gray-400 border-gray-100'}`}>{j}</button> 
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-8 bg-gray-100 text-center">
            {viewMode === 'main' ? (
              <div className="animate-in fade-in duration-500 space-y-8">
                <h2 className="text-4xl font-black text-gray-800 flex items-center gap-4 tracking-tighter uppercase justify-center">
                  <div className="h-10 w-3 bg-blue-700 rounded-full"></div>
                  DASHBOARD DAPODIK {displayTitle} {selectedYear}
                </h2>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-8">
                  <div onClick={() => setViewMode('detail_guru')} className="cursor-pointer hover:scale-105 transition-transform active:scale-95">
                    <StatusDoughnut label="Jumlah Guru" total={countGuru()} nValue={countGuru(true)} />
                  </div>
                  <StatusDoughnut label="Jumlah Kepsek" total={countGeneric('kepsek')} nValue={countGeneric('kepsek', true)} />
                  <StatusDoughnut label="Jumlah Siswa" total={getStat('sekolah', 'PD_Total')} nValue={getStat('sekolah', 'PD_Total', true)} />
                  <StatusDoughnut label="Jumlah Rombel" total={getStat('sekolah', 'Jumlah Rombel')} nValue={getStat('sekolah', 'Jumlah Rombel', true)} />
                  <StatusDoughnut label="Jumlah Tendik" total={countTendik()} nValue={countTendik(true)} />
                  <StatusDoughnut label="Satuan Pendidikan" total={countGeneric('sekolah')} nValue={countGeneric('sekolah', true)} />
                </div>

                <div className="bg-gray-800 p-8 rounded-[3rem] text-white shadow-2xl">
                  <h3 className="text-sm font-black uppercase tracking-[0.4em] mb-8 text-gray-400 flex items-center gap-3 justify-center"><Layers size={20} className="text-blue-500" /> Unit Sekolah per Jenjang</h3>
                  <div className="grid grid-cols-3 md:grid-cols-5 xl:grid-cols-7 gap-4">
                    {JENJANG_LIST.map(j => (
                      <div key={j} className={`p-6 rounded-3xl text-center border transition-all ${selectedJenjang.includes(j) ? 'bg-white/10 border-white/30 shadow-lg' : 'bg-black/20 opacity-20'}`}>
                        <span className="text-sm font-black text-blue-400 uppercase mb-2 block">{j}</span>
                        <p className="text-3xl font-black">{jenjangTotals[j].toLocaleString()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="animate-in slide-in-from-right duration-500 h-full">
                <DetailGuruPage 
                  // Filter sinkron dengan dashboard: Hanya ambil yang mengandung "GURU"
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
    </div>
  );
}