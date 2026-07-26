import React, { useState } from 'react';
import { ArrowLeft, Settings, Hammer } from 'lucide-react';
import IndeksSPM from './indeksSPM'; // <-- Import komponen IndeksSPM yang baru dibuat

// Struktur menu diubah menggunakan object untuk membedakan label Mobile & Desktop
const TABS_MENU = [
  { id: "spm", mobile: "Indeks SPM", desktop: "Indeks SPM" },
  { id: "paud", mobile: "PAUD", desktop: "Jenjang PAUD" },
  { id: "sd", mobile: "SD", desktop: "Jenjang SD/Sederajat" },
  { id: "smp", mobile: "SMP", desktop: "Jenjang SMP/Sederajat" },
  { id: "sma", mobile: "SMA", desktop: "Jenjang SMA/Sederajat" },
  { id: "smk", mobile: "SMK", desktop: "Jenjang SMK/Sederajat" }
];

const TAHUN_LIST = ["2023", "2024", "2025"];

export default function RaporPendidikanPage({ onBack, Header }) {
  const [activeTab, setActiveTab] = useState(TABS_MENU[0].id);
  const [selectedYear, setSelectedYear] = useState(TAHUN_LIST[2]); // Default 2025

  // Mengambil data tab yang sedang aktif untuk title konten (dipakai di placeholder)
  const activeTabData = TABS_MENU.find(t => t.id === activeTab);

  return (
    <div className="h-screen flex flex-col bg-slate-50 text-slate-800 font-sans overflow-hidden">
      {/* Header Aplikasi (Jika ada props Header yang dikirim) */}
      {Header && <Header />}

      {/* TOP BAR: Tombol Back & Tab 3 Tahun Terakhir (Kiri Atas) */}
      <div className="bg-white px-4 py-3 md:px-6 shadow-sm flex items-center gap-4 z-20 shrink-0 border-b border-slate-200">
        <button
          onClick={onBack}
          className="p-2.5 md:p-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 active:scale-95 transition-all shadow-sm shrink-0 flex items-center justify-center"
        >
          <ArrowLeft size={24} className="md:w-7 md:h-7" />
        </button>

        {/* Pilihan Tahun */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 shadow-inner overflow-x-auto scrollbar-hide">
          {TAHUN_LIST.map((thn) => (
            <button
              key={thn}
              onClick={() => setSelectedYear(thn)}
              className={`px-4 py-2 md:px-6 md:py-2.5 rounded-lg text-sm md:text-base font-bold transition-all duration-300 ${
                selectedYear === thn
                  ? 'bg-white text-emerald-700 shadow-sm border border-slate-200'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/50'
              }`}
            >
              {thn}
            </button>
          ))}
        </div>
      </div>

      {/* MAIN LAYOUT: Sidebar (Kiri) & Konten (Kanan) */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        
        {/* SIDEBAR MENU (Kiri pada Desktop, Horizontal scroll pada Mobile) */}
        <aside className="w-full md:w-72 lg:w-80 bg-emerald-900 shrink-0 flex flex-row md:flex-col overflow-x-auto md:overflow-y-auto scrollbar-hide [&::-webkit-scrollbar]:hidden border-r border-emerald-950 z-10 shadow-[4px_0_24px_rgba(0,0,0,0.1)]">
          <div className="p-3 md:p-4 flex flex-row md:flex-col gap-2">
            {TABS_MENU.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-3.5 md:py-4 rounded-xl text-sm md:text-[15px] font-black text-left transition-all duration-300 active:scale-95 flex items-center border-2 whitespace-nowrap md:whitespace-normal leading-tight ${
                  activeTab === tab.id
                    ? 'bg-white text-emerald-900 border-white shadow-lg md:translate-x-2'
                    : 'bg-emerald-800/40 text-emerald-100 border-transparent hover:bg-emerald-800 hover:border-emerald-700'
                }`}
              >
                {/* Teks khusus Mobile */}
                <span className="md:hidden">{tab.mobile.toUpperCase()}</span>
                {/* Teks khusus Desktop */}
                <span className="hidden md:inline">{tab.desktop.toUpperCase()}</span>
              </button>
            ))}
          </div>
        </aside>

        {/* CONTENT AREA */}
        <main className="flex-1 flex flex-col bg-slate-100 overflow-hidden">
          
          {/* LOGIKA PENGKONDISIAN TAB */}
          {activeTab === 'spm' ? (
            // Jika Tab Indeks SPM dipilih, tampilkan komponennya dan lempar data tahun
            <IndeksSPM selectedYear={selectedYear} />
          ) : (
            // Jika Tab selain Indeks SPM dipilih, tampilkan Placeholder
            <div className="flex-1 flex flex-col items-center justify-center p-6 md:p-12 text-center overflow-y-auto">
              <div className="bg-white p-10 md:p-16 rounded-[2rem] shadow-sm border border-slate-200 flex flex-col items-center justify-center max-w-4xl w-full">
                
                {/* Animasi Icon Sederhana */}
                <div className="relative mb-8">
                  <Settings className="w-20 h-20 md:w-32 md:h-32 text-emerald-100 animate-[spin_6s_linear_infinite]" />
                  <Hammer className="w-10 h-10 md:w-16 md:h-16 text-emerald-600 absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2" />
                </div>

                <div className="inline-block px-4 py-1.5 bg-amber-100 text-amber-700 font-bold rounded-full text-xs md:text-sm mb-4 uppercase tracking-widest shadow-sm">
                  Tahun Data {selectedYear}
                </div>
                
                <h2 className="text-2xl md:text-4xl lg:text-5xl font-black text-slate-800 mb-4 tracking-tight">
                  <span className="md:hidden">{activeTabData.mobile.toUpperCase()}</span>
                  <span className="hidden md:inline">{activeTabData.desktop.toUpperCase()}</span>
                </h2>
                
                <p className="text-slate-500 text-base md:text-xl font-medium mt-2">
                  Halaman ini sedang dalam pengembangan
                </p>
                <p className="text-slate-400 text-xs md:text-sm mt-4 max-w-md">
                  Modul untuk menu ini akan dipisahkan ke file tersendiri untuk mengoptimalkan performa.
                </p>
              </div>
            </div>
          )}

        </main>
      </div>
    </div>
  );
}