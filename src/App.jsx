import React, { useState, useEffect } from 'react';
import { 
  Database, 
  FileText, 
  Layers, 
  Home, 
  School, 
  LogIn, 
  UserCheck,
  Building2 
} from 'lucide-react';

import DapodikPage from './pages/DapodikPage';
import RaporPendidikanPage from './pages/RaporPendidikanPage';
import DataATSPage from './pages/DataATSPage';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import DataSarprasPage from './pages/DataSarprasPage';

export default function App() {
  // --- STATE DENGAN LOCAL STORAGE ---
  // Mengambil state awal dari localStorage agar bertahan meski di-refresh
  const [currentPage, setCurrentPage] = useState(() => {
    return localStorage.getItem('sitaka_currentPage') || 'home';
  });
  
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('sitaka_isLoggedIn') === 'true';
  });

  // Fungsi navigasi yang otomatis menyimpan posisi terakhir ke localStorage
  const navigateTo = (page) => {
    setCurrentPage(page);
    localStorage.setItem('sitaka_currentPage', page);
  };

  // Fungsi login & logout yang otomatis menyimpan status
  const handleLoginSuccess = () => {
    setIsLoggedIn(true);
    localStorage.setItem('sitaka_isLoggedIn', 'true');
    navigateTo('admin-dashboard');
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.setItem('sitaka_isLoggedIn', 'false');
    navigateTo('home');
  };

  // --- KOMPONEN HEADER ---
  const Header = () => (
    <header className="h-16 bg-blue-700 text-white px-4 md:px-6 flex justify-between items-center shadow-lg shrink-0 relative overflow-hidden">
      <div className="flex items-center gap-2 md:gap-3 cursor-pointer active:scale-95 transition-transform z-10 bg-blue-700 pr-2 md:pr-4" onClick={() => navigateTo('home')}>
        <div className="bg-white/20 p-1.5 rounded-lg">
          <Home className="w-5 h-5 md:w-6 md:h-6" />
        </div>
        <h1 className="text-lg md:text-xl font-black tracking-tight uppercase hidden sm:block">Beranda</h1>
      </div>

      <div className="flex-1 overflow-hidden mx-4 md:mx-8 hidden md:block text-center">
        <div className="whitespace-nowrap animate-marquee">
          <span className="text-lg font-bold tracking-wide italic text-blue-100">
            SITAKA | Referensi Data Pendidikan BPMP Provinsi Kalbar — Monitoring Data Pendidikan Terpadu Se-Kalimantan Barat — Sinergi Menuju Pendidikan Berkualitas — 
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4 z-10 bg-blue-700 pl-2 md:pl-4">
        {isLoggedIn ? (
          <div className="flex items-center gap-2 md:gap-3 bg-blue-800 px-3 md:px-4 py-1.5 md:py-2 rounded-xl text-xs md:text-sm border border-blue-400">
            <UserCheck className="w-4 h-4 md:w-5 md:h-5" />
            <span className="font-bold hidden sm:inline">ADMIN MODE</span>
            <span className="font-bold sm:hidden">ADMIN</span>
            <button 
              onClick={handleLogout} 
              className="text-blue-200 font-black hover:text-white border-l border-blue-500 pl-2 md:pl-3 transition-colors"
            >
              LOGOUT
            </button>
          </div>
        ) : (
          <button onClick={() => navigateTo('login')} className="flex items-center gap-1.5 md:gap-2 bg-white/10 hover:bg-white/20 px-3 md:px-5 py-2 md:py-2.5 rounded-xl transition-all text-xs md:text-sm font-black border border-white/30 active:scale-95 shadow-sm">
            <LogIn className="w-4 h-4 md:w-5 md:h-5" />
            <span className="hidden sm:inline">LOGIN ADMIN</span>
            <span className="sm:hidden">LOGIN</span>
          </button>
        )}
      </div>
      <style>{`
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .animate-marquee { display: inline-block; animation: marquee 30s linear infinite; }
      `}</style>
    </header>
  );

  // --- HALAMAN UTAMA ---
  const HomePage = () => (
    <div className="h-screen flex flex-col bg-gray-100 overflow-y-auto md:overflow-hidden">
      <Header />
      <main className="flex-1 flex flex-col items-center justify-start md:justify-center p-4 md:p-6 text-center pt-8 md:pt-6">
        
        {/* HERO SECTION */}
        <div className="mb-8 md:mb-12 flex flex-col items-center">
          <div className="flex items-center justify-center gap-3 md:gap-6 mb-3 md:mb-4">
             <div className="bg-blue-600 p-2.5 md:p-4 rounded-2xl md:rounded-3xl shadow-xl border-2 md:border-4 border-white">
                <School className="w-10 h-10 md:w-20 md:h-20 text-white" />
             </div>
             <h1 className="text-5xl sm:text-7xl md:text-9xl font-black text-gray-900 leading-none uppercase tracking-tighter">
               SITAKA
             </h1>
          </div>
          <h2 className="text-lg sm:text-xl md:text-3xl font-bold text-blue-600 tracking-[0.1em] md:tracking-[0.2em] px-2">
            referenSI daTA pendidiKAn
          </h2>
          <p className="text-gray-500 text-sm md:text-lg mt-3 md:mt-6 max-w-xl mx-auto font-medium italic px-4">
            Sistem Informasi Terpadu Kalimantan Barat. <br className="hidden md:block" /> Silakan pilih menu untuk memulai monitoring data.
          </p>
        </div>

        {/* CARDS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 w-full max-w-7xl px-2 md:px-4 text-center pb-12 md:pb-0">
          <button onClick={() => navigateTo('dapodik')} className="group bg-white p-5 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-xl border-2 md:border-4 border-transparent hover:border-blue-500 transition-all active:scale-95 h-40 md:h-72 flex flex-col justify-between text-left">
            <div className="bg-blue-600 text-white p-3 md:p-5 rounded-2xl md:rounded-3xl w-fit shadow-md md:shadow-lg group-hover:scale-110 transition-transform">
              <Database className="w-6 h-6 md:w-10 md:h-10" />
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-black text-gray-800 mb-0.5 md:mb-1 uppercase">Dapodik</h3>
              <p className="text-gray-400 font-bold uppercase tracking-wider text-[9px] md:text-[10px]">Data Pokok Pendidikan</p>
            </div>
          </button>
          
          <button onClick={() => navigateTo('rapor-pendidikan')} className="group bg-white p-5 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-xl border-2 md:border-4 border-transparent hover:border-emerald-500 transition-all active:scale-95 h-40 md:h-72 flex flex-col justify-between text-left">
            <div className="bg-emerald-600 text-white p-3 md:p-5 rounded-2xl md:rounded-3xl w-fit shadow-md md:shadow-lg group-hover:scale-110 transition-transform">
              <FileText className="w-6 h-6 md:w-10 md:h-10" />
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-black text-gray-800 mb-0.5 md:mb-1 uppercase">Rapor Pendidikan</h3>
              <p className="text-gray-400 font-bold uppercase tracking-wider text-[9px] md:text-[10px]">Evaluasi Mutu Pendidikan</p>
            </div>
          </button>

          <button onClick={() => navigateTo('data-ats')} className="group bg-white p-5 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-xl border-2 md:border-4 border-transparent hover:border-orange-500 transition-all active:scale-95 h-40 md:h-72 flex flex-col justify-between text-left">
            <div className="bg-orange-600 text-white p-3 md:p-5 rounded-2xl md:rounded-3xl w-fit shadow-md md:shadow-lg group-hover:scale-110 transition-transform">
              <Layers className="w-6 h-6 md:w-10 md:h-10" />
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-black text-gray-800 mb-0.5 md:mb-1 uppercase">Data ATS</h3>
              <p className="text-gray-400 font-bold uppercase tracking-wider text-[9px] md:text-[10px]">Anak Tidak Sekolah</p>
            </div>
          </button>

          <button onClick={() => navigateTo('data-sarpras')} className="group bg-white p-5 md:p-8 rounded-[2rem] md:rounded-[2.5rem] shadow-xl border-2 md:border-4 border-transparent hover:border-purple-500 transition-all active:scale-95 h-40 md:h-72 flex flex-col justify-between text-left">
            <div className="bg-purple-600 text-white p-3 md:p-5 rounded-2xl md:rounded-3xl w-fit shadow-md md:shadow-lg group-hover:scale-110 transition-transform">
              <Building2 className="w-6 h-6 md:w-10 md:h-10" />
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-black text-gray-800 mb-0.5 md:mb-1 uppercase">Data Sarpras</h3>
              <p className="text-gray-400 font-bold uppercase tracking-wider text-[9px] md:text-[10px]">Sarana Prasarana Sekolah</p>
            </div>
          </button>
        </div>
      </main>
    </div>
  );

  // --- LOGIKA NAVIGASI (ROUTING) ---
  switch (currentPage) {
    case 'dapodik': 
      return <DapodikPage onBack={() => navigateTo('home')} Header={Header} />;
    case 'rapor-pendidikan': 
      return <RaporPendidikanPage onBack={() => navigateTo('home')} Header={Header} />;
    case 'data-ats': 
      return <DataATSPage onBack={() => navigateTo('home')} Header={Header} />;
    case 'data-sarpras': 
      return <DataSarprasPage onBack={() => navigateTo('home')} Header={Header} />;
    case 'login': 
      return (
        <LoginPage 
          onLoginSuccess={handleLoginSuccess} 
          onBack={() => navigateTo('home')} 
        />
      );
    case 'admin-dashboard': 
      return <AdminDashboard Header={Header} />;
    default: 
      return <HomePage />;
  }
}