import React, { useState, useMemo } from 'react';
import { MapPin, ArrowLeft, ArrowLeftCircle, TrendingUp } from 'lucide-react';
import { KABUPATEN_LIST, ATS_CATEGORIES, ATS_JENJANG_Y } from '../constants/listData';

export default function DataATSPage({ onBack, Header }) {
  const [selectedKabupaten, setSelectedKabupaten] = useState(KABUPATEN_LIST);
  const [activeTab, setActiveTab] = useState("SEMUA");
  const [selectedYearATS, setSelectedYearATS] = useState('2026');
  const [detailView, setDetailView] = useState(null);

  const handleKabSelect = (kab) => { setSelectedKabupaten([kab]); setDetailView(null); };
  const handleSelectAll = () => { setSelectedKabupaten(KABUPATEN_LIST); setDetailView(null); };

  const kabTitleDisplay = useMemo(() => {
    if (selectedKabupaten.length === KABUPATEN_LIST.length) return "Provinsi Kalimantan Barat";
    if (selectedKabupaten.length === 1) return `Kabupaten ${selectedKabupaten[0]}`;
    return "-";
  }, [selectedKabupaten]);

  const barData = useMemo(() => {
    return ATS_JENJANG_Y.map(label => ({ label, value: Math.floor(Math.random() * 8000) + 500 }));
  }, [activeTab, selectedKabupaten, selectedYearATS]);

  const totalSum = useMemo(() => barData.reduce((acc, curr) => acc + curr.value, 0), [barData]);
  const maxValue = Math.max(...barData.map(d => d.value));

  // --- TAMPILAN DETAIL (SAAT GRAFIK DIKLIK) ---
  if (detailView) {
    return (
      <div className="h-screen flex flex-col bg-gray-100 overflow-hidden text-center animate-in zoom-in duration-300">
        <Header />
        <div className="flex-1 flex flex-col p-12 items-center justify-center">
          <div className="bg-white p-16 rounded-[4rem] shadow-2xl border border-orange-100 text-center max-w-4xl w-full">
            <button onClick={() => setDetailView(null)} className="flex items-center gap-2 text-orange-600 font-black uppercase mb-8 hover:opacity-70 transition-opacity">
              <ArrowLeftCircle /> Kembali ke Dashboard Utama ATS
            </button>
            <div className="bg-orange-600 text-white w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-lg"><TrendingUp size={40} /></div>
            <h2 className="text-5xl font-black text-gray-800 mb-4 tracking-tighter uppercase">DETAIL JENJANG {detailView}</h2>
            <h3 className="text-2xl font-bold text-orange-500 mb-8 italic uppercase">{activeTab} - {kabTitleDisplay}</h3>
            <p className="text-xl text-gray-500 italic mb-10">Data rinci siswa per satuan pendidikan sedang disiapkan.</p>
            <div className="grid grid-cols-2 gap-6">
              <div className="p-8 bg-orange-50 rounded-3xl border-2 border-orange-100 font-black text-orange-700 uppercase">Analisis Sekolah</div>
              <div className="p-8 bg-gray-50 rounded-3xl border-2 border-gray-100 font-black text-gray-400 uppercase">Peta Sebaran</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden text-center">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-60 bg-orange-50 border-r border-orange-100 flex flex-col shrink-0">
          <div className="p-4 border-b border-orange-200 flex justify-between items-center bg-orange-100/50">
            <div className="flex items-center gap-2"><MapPin size={22} className="text-orange-700" /><h3 className="font-black text-orange-800 uppercase text-base tracking-wider">Wilayah</h3></div>
            <button onClick={handleSelectAll} className={`text-[10px] font-black px-3 py-1.5 rounded-lg shadow-md active:scale-90 uppercase transition-all ${selectedKabupaten.length === KABUPATEN_LIST.length ? 'bg-orange-600 text-white' : 'bg-white text-orange-600'}`}>Semua</button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {KABUPATEN_LIST.map(kab => {
              const isActive = selectedKabupaten.length === 1 && selectedKabupaten[0] === kab;
              return (
                <button key={kab} onClick={() => handleKabSelect(kab)} className={`w-full text-left px-4 py-4 rounded-xl text-sm font-black transition-all border-2 flex items-center justify-between active:scale-95 ${isActive ? 'bg-orange-600 text-white border-orange-600 shadow-lg translate-x-1' : 'bg-white text-gray-600 border-white hover:border-orange-200 shadow-sm'}`}>
                  <span className="truncate pr-1">{kab}</span>
                  {isActive && <div className="w-2.5 h-2.5 bg-white rounded-full shrink-0"></div>}
                </button>
              );
            })}
          </div>
          <div className="p-4 bg-orange-700 text-white text-sm font-black text-center uppercase tracking-widest shrink-0">
            {selectedKabupaten.length === KABUPATEN_LIST.length ? "MODE PROVINSI" : "1 WILAYAH TERPILIH"}
          </div>
        </aside>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="bg-white border-b px-6 py-4 flex flex-col gap-4 shrink-0 shadow-sm">
            <div className="flex items-center gap-4">
              <button onClick={onBack} className="p-3 bg-gray-100 rounded-2xl active:scale-90 hover:bg-gray-200 shadow-sm shrink-0"><ArrowLeft size={24} className="text-gray-700" /></button>
              <div className="flex-1 flex flex-wrap justify-center gap-2">
                {ATS_CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => { setActiveTab(cat); setDetailView(null); }} className={`px-5 py-2.5 rounded-xl font-black text-[10px] transition-all active:scale-95 border-2 ${activeTab === cat ? 'bg-orange-600 text-white border-orange-600 shadow-xl' : 'bg-orange-50 text-orange-900 border-orange-100 hover:bg-orange-200'}`}>
                    {cat.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col p-8 space-y-6 bg-gray-100 overflow-hidden">
            <div className="flex items-center justify-between shrink-0">
              <h2 className="text-2xl font-black text-gray-800 flex items-center gap-4 tracking-tighter uppercase whitespace-nowrap overflow-hidden">
                <div className="h-8 w-2 bg-orange-600 rounded-full shrink-0"></div>
                DASHBOARD ATS {activeTab}
              </h2>
              <div className="flex items-center gap-2">
                {["2024", "2025", "2026"].map(year => (
                  <button key={year} onClick={() => setSelectedYearATS(year)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${selectedYearATS === year ? 'bg-orange-600 text-white shadow-md' : 'bg-white text-gray-400 border border-gray-200 hover:border-orange-300'}`}>
                    {year}
                  </button>
                ))}
              </div>
            </div>

            {/* GRAFIK BATANG (LOCKED UI) */}
            <div className="flex-1 bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm flex flex-col overflow-hidden h-full">
               <div className="mb-6 flex items-center justify-between">
                  <div className="flex flex-col items-start text-left shrink-0">
                     <span className="text-sm font-black text-gray-400 uppercase tracking-widest italic leading-tight">Data Siswa {activeTab}</span>
                     <span className="text-sm font-black text-orange-600 uppercase tracking-widest italic leading-tight">{kabTitleDisplay}</span>
                  </div>
                  <div className="bg-orange-600 text-white px-8 py-3 rounded-full font-black text-sm uppercase tracking-widest border border-orange-700 shadow-lg flex items-center gap-3">
                     <span>JUMLAH TOTAL:</span><span className="text-xl text-yellow-300">{totalSum.toLocaleString()}</span>
                  </div>
               </div>
               <div className="flex-1 flex flex-col justify-between py-2 overflow-visible">
                  {barData.map((item) => (
                     <div key={item.label} className="flex items-center gap-6 group cursor-pointer" onClick={() => setDetailView(item.label)}>
                        <div className="w-48 text-right shrink-0"><span className="text-base font-black text-gray-600 uppercase tracking-tighter leading-none group-hover:text-orange-600 transition-colors">{item.label}</span></div>
                        <div className="flex-1 relative h-12 bg-gray-50 rounded-2xl overflow-hidden shadow-inner border border-gray-100">
                           <div className="h-full bg-gradient-to-r from-orange-400 to-orange-600 transition-all duration-1000 ease-out flex items-center justify-end px-4 shadow-lg group-hover:from-orange-500 group-hover:to-orange-700" style={{ width: `${(item.value / maxValue) * 92}%` }}>
                              <span className="text-white font-black text-lg drop-shadow-md whitespace-nowrap">{item.value.toLocaleString()}</span>
                           </div>
                        </div>
                     </div>
                  ))}
               </div>
               <div className="mt-4 flex justify-between px-2 pl-[210px] border-t border-gray-100 pt-3">
                  {[0, 25, 50, 75, 100].map(p => ( <div key={p} className="text-[9px] font-black text-gray-300 uppercase tracking-widest">{Math.round((maxValue * p) / 100).toLocaleString()}</div> ))}
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}