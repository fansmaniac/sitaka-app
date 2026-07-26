import React, { useState } from 'react';
import { Database, Calculator, BarChart2 } from 'lucide-react';
import AdminDatabaseMaster from './AdminDatabaseMaster';
import AdminMesinKalkulasi from './AdminMesinKalkulasi';
import AdminRapor from './AdminRapor'; // Import komponen AdminRapor

export default function AdminDashboard({ Header }) {
  const [adminView, setAdminView] = useState('main'); 

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden text-center">
      <Header />
      
      <div className={`flex-1 flex flex-col items-center p-12 overflow-y-auto ${adminView === 'main' ? 'justify-center' : 'justify-start pt-10'}`}>
        
        {/* TAMPILAN MENU UTAMA */}
        {adminView === 'main' && (
          <div className="w-full flex flex-col items-center animate-in fade-in zoom-in duration-300">
            <div className="bg-blue-600 text-white w-20 h-20 rounded-3xl flex items-center justify-center mb-8 shadow-lg">
              <Database size={40} />
            </div>
            <h2 className="text-5xl font-black text-gray-800 mb-12 tracking-tighter uppercase">Sitaka Admin Center</h2>
            
            {/* Ubah grid menjadi 3 kolom dan perlebar max-w agar muat 3 card */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 w-full max-w-7xl">
              {/* CARD MENU DATABASE MASTER */}
              <button 
                onClick={() => setAdminView('input')} 
                className="group bg-white p-12 xl:p-16 rounded-[4rem] shadow-2xl border-4 border-transparent hover:border-blue-500 transition-all flex flex-col items-center gap-6 active:scale-95"
              >
                <div className="bg-blue-600 text-white p-8 rounded-[2.5rem] shadow-lg">
                  <Database size={64} />
                </div>
                <h3 className="text-3xl xl:text-4xl font-black text-gray-800 uppercase tracking-tighter">Database Master</h3>
              </button>

              {/* CARD MENU RAPOR PENDIDIKAN */}
              <button 
                onClick={() => setAdminView('rapor')} 
                className="group bg-white p-12 xl:p-16 rounded-[4rem] shadow-2xl border-4 border-transparent hover:border-emerald-500 transition-all flex flex-col items-center gap-6 active:scale-95"
              >
                <div className="bg-emerald-600 text-white p-8 rounded-[2.5rem] shadow-lg">
                  <BarChart2 size={64} />
                </div>
                <h3 className="text-3xl xl:text-4xl font-black text-gray-800 uppercase tracking-tighter">Rapor Pendidikan</h3>
              </button>

              {/* CARD MENU MESIN KALKULASI */}
              <button 
                onClick={() => setAdminView('kalkulasi')} 
                className="group bg-white p-12 xl:p-16 rounded-[4rem] shadow-2xl border-4 border-transparent hover:border-orange-500 transition-all flex flex-col items-center gap-6 active:scale-95"
              >
                <div className="bg-orange-500 text-white p-8 rounded-[2.5rem] shadow-lg">
                  <Calculator size={64} />
                </div>
                <h3 className="text-3xl xl:text-4xl font-black text-gray-800 uppercase tracking-tighter">Mesin Kalkulasi</h3>
              </button>
            </div>
          </div>
        )}

        {/* RENDER KOMPONEN DATABASE MASTER */}
        {adminView === 'input' && (
          <AdminDatabaseMaster onBack={() => setAdminView('main')} />
        )}

        {/* RENDER KOMPONEN RAPOR PENDIDIKAN */}
        {adminView === 'rapor' && (
          <AdminRapor onBack={() => setAdminView('main')} />
        )}

        {/* RENDER KOMPONEN MESIN KALKULASI */}
        {adminView === 'kalkulasi' && (
          <AdminMesinKalkulasi onBack={() => setAdminView('main')} />
        )}

      </div>
    </div>
  );
}