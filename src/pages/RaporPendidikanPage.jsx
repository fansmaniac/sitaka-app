import React, { useState, useMemo } from 'react';
import { MapPin, ArrowLeft } from 'lucide-react';
import { KABUPATEN_LIST, RAPOR_CATEGORIES } from '../constants/listData';

export default function RaporPendidikanPage({ onBack, Header }) {
  const [selectedKabupaten, setSelectedKabupaten] = useState(KABUPATEN_LIST);
  const [activeTab, setActiveTab] = useState(RAPOR_CATEGORIES[0]);
  const [selectedYear, setSelectedYear] = useState('2025');

  const handleKabSelect = (kab) => { setSelectedKabupaten([kab]); };
  const handleSelectAll = () => { setSelectedKabupaten(KABUPATEN_LIST); };

  const kabTitleDisplay = useMemo(() => {
    if (selectedKabupaten.length === KABUPATEN_LIST.length) return "Provinsi Kalimantan Barat";
    if (selectedKabupaten.length === 1) return `Kabupaten ${selectedKabupaten[0]}`;
    return "-";
  }, [selectedKabupaten]);

  const categoryData = useMemo(() => {
    if (selectedKabupaten.length === 0) return 0;
    const baseValues = { 
      "Kemampuan Literasi": 78, "Kemampuan Numerasi": 72, "Kualitas Pembelajaran": 81, 
      "Iklim Keamanan Satuan Pendidikan": 88, "Iklim Kebinekaan": 92, 
      "Iklim Inklusivitas": 85, "Angka Partisipasi Sekolah": 94 
    };
    return baseValues[activeTab] + Math.floor(Math.random() * 5);
  }, [activeTab, selectedKabupaten]);

  const getJenjangColor = (jenjang) => {
    switch(jenjang) { 
      case 'PAUD': return 'bg-emerald-200 hover:bg-emerald-300';
      case 'SD': return 'bg-red-200 hover:bg-red-300'; 
      case 'SMP': return 'bg-blue-200 hover:bg-blue-300'; 
      case 'SMA': return 'bg-gray-300 hover:bg-gray-400'; 
      default: return 'bg-white';
    }
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden text-center">
      <Header />
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Filter Wilayah */}
        <aside className="w-60 bg-emerald-50 border-r border-emerald-100 flex flex-col shrink-0 text-center">
          <div className="p-4 border-b border-emerald-200 flex justify-between items-center bg-emerald-100/50">
            <div className="flex items-center gap-2">
              <MapPin size={22} className="text-emerald-700" />
              <h3 className="font-black text-emerald-800 uppercase text-base tracking-wider">Wilayah</h3>
            </div>
            <button onClick={handleSelectAll} className={`text-[10px] font-black px-3 py-1.5 rounded-lg shadow-md active:scale-90 uppercase transition-all ${selectedKabupaten.length === KABUPATEN_LIST.length ? 'bg-emerald-700 text-white' : 'bg-white text-emerald-600'}`}>Semua</button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {KABUPATEN_LIST.map(kab => {
              const isActive = selectedKabupaten.length === 1 && selectedKabupaten[0] === kab;
              return (
                <button key={kab} onClick={() => handleKabSelect(kab)} className={`w-full text-left px-4 py-4 rounded-xl text-sm font-black transition-all border-2 flex items-center justify-between active:scale-95 ${isActive ? 'bg-emerald-600 text-white border-emerald-600 shadow-lg translate-x-1' : 'bg-white text-gray-600 border-white hover:border-emerald-200 shadow-sm'}`}>
                  <span className="truncate pr-1">{kab}</span>
                  {isActive && <div className="w-2.5 h-2.5 bg-white rounded-full shrink-0"></div>}
                </button>
              );
            })}
          </div>
          <div className="p-4 bg-emerald-700 text-white text-sm font-black text-center uppercase tracking-widest shrink-0">
            {selectedKabupaten.length === KABUPATEN_LIST.length ? "MODE PROVINSI" : "1 WILAYAH TERPILIH"}
          </div>
        </aside>

        {/* Dashboard Content */}
        <div className="flex-1 flex flex-col overflow-hidden text-center">
          <div className="bg-white border-b px-6 py-4 flex flex-col gap-4 shrink-0 shadow-sm">
            <div className="flex items-center gap-4">
              <button onClick={onBack} className="p-3 bg-gray-100 rounded-2xl active:scale-90 hover:bg-gray-200 shadow-sm shrink-0"><ArrowLeft size={24} className="text-gray-700" /></button>
              <div className="flex-1 flex flex-wrap justify-center gap-2">
                {RAPOR_CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => setActiveTab(cat)} className={`px-5 py-2.5 rounded-xl font-black text-[10px] transition-all active:scale-95 border-2 ${activeTab === cat ? 'bg-emerald-700 text-white border-emerald-700 shadow-xl' : 'bg-emerald-100 text-emerald-900 border-emerald-200 hover:bg-emerald-200'}`}>
                    {cat.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col p-8 space-y-6 bg-gray-100 overflow-hidden">
            <div className="flex items-center justify-between shrink-0">
              <h2 className="text-2xl font-black text-gray-800 flex items-center gap-4 tracking-tighter uppercase whitespace-nowrap overflow-hidden">
                <div className="h-8 w-2 bg-emerald-600 rounded-full shrink-0"></div>
                DATA ANALITIK {activeTab}
              </h2>
              <div className="flex items-center gap-3">
                {["2023", "2024", "2025"].map(y => (
                  <button key={y} onClick={() => setSelectedYear(y)} className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${selectedYear === y ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 shadow-sm' : 'bg-white text-gray-400 border'}`}>
                    {y}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 flex gap-6 overflow-hidden h-full">
              <div className="flex-[3] bg-white p-6 rounded-[3rem] border border-gray-100 shadow-sm flex flex-col items-center justify-center text-center overflow-hidden h-full">
                <h3 className="text-xl font-black text-gray-400 uppercase tracking-widest mb-4 italic">Indeks SPM {kabTitleDisplay}</h3>
                <div className="text-8xl font-black text-emerald-600 leading-none tracking-tighter mb-4">
                  {categoryData}<span className="text-3xl text-gray-300 ml-2 font-bold">%</span>
                </div>
                <div className="text-4xl font-black text-emerald-900 tracking-wider bg-emerald-200/50 px-10 py-3 rounded-2xl italic shadow-inner uppercase">"TUNTAS MUDA"</div>
              </div>
              <div className="flex-[1] flex flex-col gap-3 min-w-[220px] h-full">
                {['PAUD', 'SD', 'SMP', 'SMA'].map((jenjang) => (
                  <button key={jenjang} onClick={() => alert(`Detail ${jenjang}`)} className={`flex-1 ${getJenjangColor(jenjang)} rounded-3xl px-4 flex flex-col items-center justify-center group active:scale-95 transition-all shadow-md border border-black/5 overflow-hidden`}>
                    <div className="text-black font-black text-4xl uppercase tracking-tighter">{jenjang}</div>
                    <div className="text-black/60 text-[9px] font-black uppercase tracking-widest mt-1">klik untuk informasi detail</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}