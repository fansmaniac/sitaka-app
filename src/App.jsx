import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useNavigate } from 'react-router-dom';
import { 
  Database, 
  FileText, 
  Layers, 
  Home, 
  School, 
  LogIn, 
  LogOut,
  UserCheck,
  Building2,
  Map
} from 'lucide-react';

// --- IMPORT PATHS ---
// Jika Vite masih error 404, artinya file-file ini belum benar-benar dipindahkan ke sub-foldernya.
// Pastikan folder dapodik, rapor, dataATS, admin sudah dibuat dan filenya dimasukkan ke sana.
import DapodikPage from './pages/dapodik/DapodikPage';
import RaporPendidikanPage from './pages/rapor/RaporPendidikanPage';
import DataATSPage from './pages/dataATS/DataATSPage';
// Sesuaikan kembali jika DataSarprasPage belum dipindah. Di screenshot awal dia ada di src/pages/DataSarprasPage.jsx
import DataSarprasPage from './pages/dataSarpras/DataSarprasPage'; 
import LoginPage from './pages/admin/LoginPage';
import AdminDashboard from './pages/admin/AdminDashboard';

// Komponen utama yang berisi logika navigasi
function AppContent() {
  const navigate = useNavigate();

  // --- STATE DENGAN LOCAL STORAGE UNTUK LOGIN ---
  const [isLoggedIn, setIsLoggedIn] = useState(() => {
    return localStorage.getItem('sitaka_isLoggedIn') === 'true';
  });

  // Fungsi login & logout yang otomatis menyimpan status & mengubah URL
  const handleLoginSuccess = () => {
    setIsLoggedIn(true);
    localStorage.setItem('sitaka_isLoggedIn', 'true');
    navigate('/admin-dashboard');
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    localStorage.setItem('sitaka_isLoggedIn', 'false');
    navigate('/');
  };

  // --- KOMPONEN HEADER ---
  const Header = () => (
    <header className="h-16 bg-blue-700 text-white px-4 md:px-6 flex justify-between items-center shadow-lg shrink-0 relative overflow-hidden">
      <div className="flex items-center gap-2 md:gap-3 cursor-pointer active:scale-95 transition-transform z-10 bg-blue-700 pr-2 md:pr-4" onClick={() => navigate('/')}>
        <div className="bg-white/20 p-1.5 rounded-lg">
          <Home className="w-5 h-5 md:w-6 md:h-6" />
        </div>
        <h1 className="text-lg md:text-xl font-black tracking-tight uppercase hidden sm:block">Beranda</h1>
      </div>

      <div className="flex-1 overflow-hidden mx-4 md:mx-8 hidden md:block text-center">
        <div className="whitespace-nowrap animate-marquee">
          <span className="text-lg font-bold tracking-wide italic text-blue-100">
            SITAKA D-PENA KALBAR | Referensi Data Pendidikan BPMP Provinsi Kalbar — Monitoring Data Pendidikan Terpadu Se-Kalimantan Barat — Sinergi Menuju Pendidikan Berkualitas — 
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
              title="Logout"
              className="text-blue-200 hover:text-white border-l border-blue-500 pl-2 md:pl-3 flex items-center justify-center transition-colors hover:scale-110 active:scale-95"
            >
              <LogOut className="w-4 h-4 md:w-5 md:h-5" />
            </button>
          </div>
        ) : (
          <button 
            onClick={() => navigate('/login')} 
            title="Login Admin"
            className="flex items-center justify-center bg-white/10 hover:bg-white/20 p-2 md:p-2.5 rounded-xl transition-all border border-white/30 active:scale-95 shadow-sm hover:scale-110"
          >
            <LogIn className="w-5 h-5 md:w-6 md:h-6" />
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
    <div className="h-screen w-full flex flex-col bg-gray-100 overflow-y-auto overflow-x-hidden">
      <Header />
      <main className="flex-1 w-full flex flex-col items-center justify-start md:justify-center p-4 md:p-6 text-center pt-8 md:pt-4 pb-24 md:pb-8">
        
        {/* HERO SECTION */}
        <div className="mb-6 md:mb-8 flex flex-col items-center">
          <div className="flex items-center justify-center gap-3 md:gap-4 mb-2 md:mb-3">
             <div className="bg-blue-600 p-2.5 md:p-4 rounded-2xl md:rounded-3xl shadow-xl border-2 md:border-4 border-white">
                <School className="w-10 h-10 md:w-16 md:h-16 text-white" />
             </div>
             <h1 className="text-5xl sm:text-7xl md:text-8xl font-black text-gray-900 leading-none uppercase tracking-tighter">
                SITAKA D-PENA KALBAR
             </h1>
          </div>
          <h2 className="text-lg sm:text-xl md:text-2xl font-bold text-blue-600 tracking-[0.1em] md:tracking-[0.2em] px-2">
            Dashboard Pendidikan Kalimantan Barat Berbasis Analisis
          </h2>
          <p className="text-gray-500 text-sm md:text-base mt-2 md:mt-4 max-w-xl mx-auto font-medium italic px-4">
            Sistem Informasi Terpadu Kalimantan Barat. <br className="hidden md:block" /> Silakan pilih menu untuk memulai monitoring data.
          </p>
        </div>

        {/* CARDS GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 w-full max-w-7xl px-2 md:px-4 text-center">
          
          <button onClick={() => navigate('/dapodik')} className="group bg-white p-5 md:p-6 lg:p-8 rounded-[2rem] md:rounded-[2rem] shadow-xl border-2 md:border-4 border-transparent hover:border-blue-500 transition-all active:scale-95 h-40 md:h-56 lg:h-64 flex flex-col justify-between text-left">
            <div className="bg-blue-600 text-white p-3 md:p-4 rounded-2xl w-fit shadow-md md:shadow-lg group-hover:scale-110 transition-transform">
              <Database className="w-6 h-6 md:w-8 md:h-8" />
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-black text-gray-800 mb-0.5 md:mb-1 uppercase">Dapodik</h3>
              <p className="text-gray-400 font-bold uppercase tracking-wider text-[9px] md:text-[10px] leading-tight">Data Pokok Pendidikan</p>
            </div>
          </button>
          
          <button onClick={() => navigate('/rapor-pendidikan')} className="group bg-white p-5 md:p-6 lg:p-8 rounded-[2rem] md:rounded-[2rem] shadow-xl border-2 md:border-4 border-transparent hover:border-emerald-500 transition-all active:scale-95 h-40 md:h-56 lg:h-64 flex flex-col justify-between text-left">
            <div className="bg-emerald-600 text-white p-3 md:p-4 rounded-2xl w-fit shadow-md md:shadow-lg group-hover:scale-110 transition-transform">
              <FileText className="w-6 h-6 md:w-8 md:h-8" />
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-black text-gray-800 mb-0.5 md:mb-1 uppercase">Rapor Pendidikan</h3>
              <p className="text-gray-400 font-bold uppercase tracking-wider text-[9px] md:text-[10px] leading-tight">Evaluasi Mutu Pendidikan</p>
            </div>
          </button>

          <button onClick={() => navigate('/data-ats')} className="group bg-white p-5 md:p-6 lg:p-8 rounded-[2rem] md:rounded-[2rem] shadow-xl border-2 md:border-4 border-transparent hover:border-orange-500 transition-all active:scale-95 h-40 md:h-56 lg:h-64 flex flex-col justify-between text-left">
            <div className="bg-orange-600 text-white p-3 md:p-4 rounded-2xl w-fit shadow-md md:shadow-lg group-hover:scale-110 transition-transform">
              <Layers className="w-6 h-6 md:w-8 md:h-8" />
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-black text-gray-800 mb-0.5 md:mb-1 uppercase">Data ATS</h3>
              <p className="text-gray-400 font-bold uppercase tracking-wider text-[9px] md:text-[10px] leading-tight">Anak Tidak Sekolah</p>
            </div>
          </button>

          <button onClick={() => navigate('/data-sarpras')} className="group bg-white p-5 md:p-6 lg:p-8 rounded-[2rem] md:rounded-[2rem] shadow-xl border-2 md:border-4 border-transparent hover:border-purple-500 transition-all active:scale-95 h-40 md:h-56 lg:h-64 flex flex-col justify-between text-left">
            <div className="bg-purple-600 text-white p-3 md:p-4 rounded-2xl w-fit shadow-md md:shadow-lg group-hover:scale-110 transition-transform">
              <Building2 className="w-6 h-6 md:w-8 md:h-8" />
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-black text-gray-800 mb-0.5 md:mb-1 uppercase">Data Sarpras</h3>
              <p className="text-gray-400 font-bold uppercase tracking-wider text-[9px] md:text-[10px] leading-tight">Sarana Prasarana Sekolah</p>
            </div>
          </button>

          {/* MENU BARU: DAYA TAMPUNG SEKOLAH (Membuka URL di Tab Baru) */}
          <button 
            onClick={() => window.open('https://dashboard-info-sekolah.netlify.app/', '_blank')} 
            className="group bg-white p-5 md:p-6 lg:p-8 rounded-[2rem] md:rounded-[2rem] shadow-xl border-2 md:border-4 border-transparent hover:border-pink-500 transition-all active:scale-95 h-40 md:h-56 lg:h-64 flex flex-col justify-between text-left"
          >
            <div className="bg-pink-600 text-white p-3 md:p-4 rounded-2xl w-fit shadow-md md:shadow-lg group-hover:scale-110 transition-transform">
              <Map className="w-6 h-6 md:w-8 md:h-8" />
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-black text-gray-800 mb-0.5 md:mb-1 uppercase">Daya Tampung</h3>
              <p className="text-gray-400 font-bold uppercase tracking-wider text-[9px] md:text-[10px] leading-tight">Analisa Daya Tampung SPMB</p>
            </div>
          </button>

        </div>
      </main>
    </div>
  );

  // --- LOGIKA ROUTING ---
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/dapodik" element={<DapodikPage onBack={() => navigate('/')} Header={Header} />} />
      <Route path="/rapor-pendidikan" element={<RaporPendidikanPage onBack={() => navigate('/')} Header={Header} />} />
      <Route path="/data-ats" element={<DataATSPage onBack={() => navigate('/')} Header={Header} />} />
      <Route path="/data-sarpras" element={<DataSarprasPage onBack={() => navigate('/')} Header={Header} />} />
      <Route path="/login" element={<LoginPage onLoginSuccess={handleLoginSuccess} onBack={() => navigate('/')} />} />
      <Route path="/admin-dashboard" element={<AdminDashboard Header={Header} />} />
    </Routes>
  );
}

// Komponen Wrapper Router
export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}