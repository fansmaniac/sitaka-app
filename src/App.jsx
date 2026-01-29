import React, { useState } from 'react';
import { 
  Database, 
  FileText, 
  Layers, 
  Home, 
  School, 
  LogIn, 
  UserCheck 
} from 'lucide-react';
import DapodikPage from './pages/DapodikPage';
import RaporPendidikanPage from './pages/RaporPendidikanPage';
import DataATSPage from './pages/DataATSPage';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';

export default function App() {
  const [currentPage, setCurrentPage] = useState('home');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  const navigateTo = (page) => setCurrentPage(page);

  // --- KOMPONEN HEADER (KODE ASLI TERKUNCI) ---
  const Header = () => (
    <header className="h-16 bg-blue-700 text-white px-6 flex justify-between items-center shadow-lg shrink-0 relative overflow-hidden">
      <div className="flex items-center gap-3 cursor-pointer active:scale-95 transition-transform z-10 bg-blue-700 pr-4" onClick={() => navigateTo('home')}>
        <div className="bg-white/20 p-1.5 rounded-lg"><Home size={24} /></div>
        <h1 className="text-xl font-black tracking-tight uppercase">Beranda</h1>
      </div>

      <div className="flex-1 overflow-hidden mx-8 hidden md:block text-center">
        <div className="whitespace-nowrap animate-marquee">
          <span className="text-lg font-bold tracking-wide italic text-blue-100">
            SITAKA | Referensi Data Pendidikan BPMP Provinsi Kalbar — Monitoring Data Pendidikan Terpadu Se-Kalimantan Barat — Sinergi Menuju Pendidikan Berkualitas — 
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 z-10 bg-blue-700 pl-4">
        {isLoggedIn ? (
          <div className="flex items-center gap-3 bg-blue-800 px-4 py-2 rounded-xl text-sm border border-blue-400">
            <UserCheck size={18} />
            <span className="font-bold">ADMIN MODE</span>
             {/* Logika Logout: Hapus Status & Kembali ke Home */}
            <button 
              onClick={() => { 
                setIsLoggedIn(false); 
                navigateTo('home'); 
              }} 
              className="text-blue-200 font-black hover:text-white border-l border-blue-500 pl-3 transition-colors"
            >
              LOGOUT
            </button>
          </div>
        ) : (
          <button onClick={() => navigateTo('login')} className="flex items-center gap-2 bg-white/10 hover:bg-white/20 px-5 py-2.5 rounded-xl transition-all text-sm font-black border border-white/30 active:scale-95 shadow-sm">
            <LogIn size={20} /><span>LOGIN ADMIN</span>
          </button>
        )}
      </div>
      <style>{`
        @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
        .animate-marquee { display: inline-block; animation: marquee 30s linear infinite; }
      `}</style>
    </header>
  );

  // --- HALAMAN UTAMA (KODE ASLI TERKUNCI) ---
  const HomePage = () => (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      <Header />
      <main className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="mb-12 flex flex-col items-center">
          <div className="flex items-center justify-center gap-6 mb-4">
             <div className="bg-blue-600 p-4 rounded-3xl shadow-xl border-4 border-white">
                <School size={80} className="text-white" />
             </div>
             <h1 className="text-9xl font-black text-gray-900 leading-none uppercase tracking-tighter">SITAKA</h1>
          </div>
          <h2 className="text-3xl font-bold text-blue-600 tracking-[0.2em]">referenSI daTA pendidiKAn</h2>
          <p className="text-gray-500 text-lg mt-6 max-w-xl mx-auto font-medium italic">Sistem Informasi Terpadu Kalimantan Barat. <br></br> Silakan pilih menu untuk memulai monitoring data.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 w-full max-w-6xl px-4 text-center">
          <button onClick={() => navigateTo('dapodik')} className="group bg-white p-10 rounded-[2.5rem] shadow-xl border-4 border-transparent hover:border-blue-500 transition-all active:scale-95 h-72 flex flex-col justify-between text-left">
            <div className="bg-blue-600 text-white p-5 rounded-3xl w-fit shadow-lg"><Database size={48} /></div>
            <div><h3 className="text-3xl font-black text-gray-800 mb-2 uppercase">Dapodik</h3><p className="text-gray-500 font-bold uppercase tracking-wider text-xs">Data Pokok Pendidikan</p></div>
          </button>
          
          <button onClick={() => navigateTo('rapor-pendidikan')} className="group bg-white p-10 rounded-[2.5rem] shadow-xl border-4 border-transparent hover:border-emerald-500 transition-all active:scale-95 h-72 flex flex-col justify-between text-left">
            <div className="bg-emerald-600 text-white p-5 rounded-3xl w-fit shadow-lg"><FileText size={48} /></div>
            <div><h3 className="text-3xl font-black text-gray-800 mb-2 uppercase">Rapor Pendidikan</h3><p className="text-gray-500 font-bold uppercase tracking-wider text-xs">Evaluasi Mutu Pendidikan</p></div>
          </button>

          <button onClick={() => navigateTo('data-ats')} className="group bg-white p-10 rounded-[2.5rem] shadow-xl border-4 border-transparent hover:border-orange-500 transition-all active:scale-95 h-72 flex flex-col justify-between text-left">
            <div className="bg-orange-600 text-white p-5 rounded-3xl w-fit shadow-lg"><Layers size={48} /></div>
            <div><h3 className="text-3xl font-black text-gray-800 mb-2 uppercase">Data ATS</h3><p className="text-gray-500 font-bold uppercase tracking-wider text-xs">Anak Tidak Sekolah</p></div>
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
    case 'login': 
      return (
        <LoginPage 
          onLoginSuccess={() => { setIsLoggedIn(true); navigateTo('admin-dashboard'); }} 
          onBack={() => navigateTo('home')} 
        />
      );
    case 'admin-dashboard': 
      return <AdminDashboard Header={Header} />;
    default: 
      return <HomePage />;
  }
}