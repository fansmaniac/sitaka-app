import React, { useState } from 'react';
import { LineChart, ArrowRightLeft, Layers, Users, School, GraduationCap, AlertCircle } from 'lucide-react';

// IMPORT KOMPONEN ANAK ASLI
import RasioSekolahVsPD from './RasioSekolahVsPD';
import RasioSekolahVsGuru from './RasioSekolahVsGuru'; 
import RasioRombelVsPD from './RasioRombelVsPD'; 
import RasioSekolahVsRombel from './RasioSekolahVsRombel'; 
import RasioRombelVsGuru from './RasioRombelVsGuru'; 

// =====================================================================
// PLACEHOLDER KOMPONEN ANAK YANG BELUM DIBUAT
// =====================================================================
const RasioGuruVsPD = ({ dataSekolah, dataGuru }) => <div className="p-12 text-center text-gray-500 font-bold border-2 border-dashed border-blue-200 rounded-3xl bg-blue-50/30">Menampilkan Komponen: Guru VS Peserta Didik</div>;

// =====================================================================
// MAIN COMPONENT: DAPODIK RASIO
// =====================================================================
export default function DapodikRasio({ selectedYear = '2026' }) {
  // State untuk Dropdown
  const [data1, setData1] = useState('SEKOLAH');
  const [data2, setData2] = useState('PESERTA DIDIK');
  
  // State untuk menandai apakah user sudah mengklik "Bandingkan"
  const [isComparing, setIsComparing] = useState(true); // Default true agar langsung tampil awal
  
  // Opsi Data
  const OPTIONS_DATA_1 = [
    { id: 'SEKOLAH', label: 'Sekolah', icon: School },
    { id: 'ROMBEL', label: 'Rombel', icon: Layers },
    { id: 'GURU', label: 'Guru', icon: Users },
  ];

  const OPTIONS_DATA_2 = [
    { id: 'PESERTA DIDIK', label: 'Peserta Didik', icon: GraduationCap },
    { id: 'GURU', label: 'Guru', icon: Users },
    { id: 'ROMBEL', label: 'Rombel', icon: Layers },
  ];

  // Handler saat Data 1 berubah
  const handleData1Change = (e) => {
    const newVal = e.target.value;
    setData1(newVal);
    setIsComparing(false); 
    
    // Logika Auto-Select untuk mencegah state terjebak di opsi yang disabled
    let currentData2 = data2;

    // 1. Cegah bentrok (Memilih Data 2 yang sama dengan Data 1)
    if (newVal === currentData2) {
      const availableOption = OPTIONS_DATA_2.find(opt => opt.id !== newVal);
      if (availableOption) currentData2 = availableOption.id;
    }

    // 2. Cegah Redudansi (Jika GURU dipilih di Data 1, ROMBEL di-disable, maka Data 2 tidak boleh nyangkut di ROMBEL)
    if (newVal === 'GURU' && currentData2 === 'ROMBEL') {
       currentData2 = 'PESERTA DIDIK'; // Paksa pindah ke opsi yang valid
    }

    setData2(currentData2);
  };

  const handleData2Change = (e) => {
    setData2(e.target.value);
    setIsComparing(false); 
  };

  const handleBandingkan = () => {
    setIsComparing(true);
  };

  // Render Engine
  const renderComparisonResult = () => {
    if (!isComparing) return (
      <div className="flex flex-col items-center justify-center p-20 opacity-40">
         <ArrowRightLeft size={64} className="text-blue-300 mb-4" />
         <p className="font-black text-xl text-blue-800 uppercase tracking-widest">Pilih Data dan Klik Bandingkan</p>
      </div>
    );

    const combo = `${data1}_VS_${data2}`;

    switch (combo) {
      case 'SEKOLAH_VS_PESERTA DIDIK':
        return <RasioSekolahVsPD selectedYear={selectedYear} />;
      case 'SEKOLAH_VS_GURU':
        return <RasioSekolahVsGuru selectedYear={selectedYear} />;
      case 'SEKOLAH_VS_ROMBEL':
        return <RasioSekolahVsRombel selectedYear={selectedYear} />;
      case 'ROMBEL_VS_PESERTA DIDIK':
        return <RasioRombelVsPD selectedYear={selectedYear} />;
      case 'ROMBEL_VS_GURU':
        return <RasioRombelVsGuru selectedYear={selectedYear} />; 
      case 'GURU_VS_PESERTA DIDIK':
        return <RasioGuruVsPD selectedYear={selectedYear} />;
      default:
        return (
          <div className="flex flex-col items-center justify-center p-20 bg-orange-50 rounded-3xl border-2 border-orange-200 border-dashed text-orange-600">
             <AlertCircle size={48} className="mb-4" />
             <p className="font-black text-lg uppercase tracking-widest text-center">
               Perbandingan<br/>"{data1} VS {data2}"<br/>Belum Tersedia atau Tidak Valid.
             </p>
          </div>
        );
    }
  };

  return (
    <div className="h-full flex flex-col animate-in fade-in duration-500 bg-gray-50">
      
      {/* 1. HEADER & KONTROL PERBANDINGAN */}
      <div className="bg-white px-6 py-8 border-b border-gray-200 shadow-sm shrink-0 z-20">
        <div className="max-w-5xl mx-auto flex flex-col items-center">
          
          <div className="text-center mb-8">
            <h2 className="text-3xl font-black text-blue-900 uppercase tracking-tighter flex items-center justify-center gap-3">
              <LineChart className="text-blue-600" size={32} /> Analisa Rasio Data
            </h2>
            <p className="text-sm font-bold text-gray-500 uppercase tracking-widest mt-2">
              Bandingkan Ketersediaan Lintas Entitas • Tahun {selectedYear}
            </p>
          </div>

          {/* BOX KONTROL INPUT */}
          <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8 w-full bg-blue-50/50 p-6 rounded-[2rem] border border-blue-100 shadow-inner">
            
            {/* INPUT DATA 1 */}
            <div className="flex-1 w-full flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase text-blue-600 tracking-widest ml-2">Variabel Utama (Data 1)</label>
              <div className="relative">
                <select 
                  value={data1} 
                  onChange={handleData1Change}
                  className="w-full appearance-none bg-white border-2 border-blue-200 text-blue-900 font-black text-lg px-6 py-4 rounded-2xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 cursor-pointer transition-all shadow-sm"
                >
                  {OPTIONS_DATA_1.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.label}</option>
                  ))}
                </select>
                <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-blue-400">▼</div>
              </div>
            </div>

            {/* IKON VS */}
            <div className="shrink-0 bg-blue-600 text-white p-4 rounded-full shadow-lg mt-4 md:mt-6 z-10 hidden md:flex items-center justify-center">
               <span className="font-black text-xl italic leading-none pr-1">VS</span>
            </div>
            
            {/* IKON VS MOBILE */}
            <div className="md:hidden flex items-center justify-center w-full text-blue-400 py-2">
               <ArrowRightLeft size={24} className="rotate-90" />
            </div>

            {/* INPUT DATA 2 */}
            <div className="flex-1 w-full flex flex-col gap-2">
              <label className="text-[10px] font-black uppercase text-blue-600 tracking-widest ml-2">Pembanding (Data 2)</label>
              <div className="relative">
                <select 
                  value={data2} 
                  onChange={handleData2Change}
                  className="w-full appearance-none bg-white border-2 border-blue-200 text-blue-900 font-black text-lg px-6 py-4 rounded-2xl outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 cursor-pointer transition-all shadow-sm"
                >
                  {OPTIONS_DATA_2.map(opt => {
                    // LOGIKA CEGAH REDUDANSI:
                    // 1. Disable jika ID sama dengan Data 1
                    let isDisabled = opt.id === data1;
                    let customLabel = opt.label;

                    // 2. Disable opsi "ROMBEL" jika Data 1 adalah "GURU" 
                    if (data1 === 'GURU' && opt.id === 'ROMBEL') {
                      isDisabled = true;
                    }

                    if (isDisabled) {
                      if (opt.id === data1) customLabel = `${opt.label} (Terpilih)`;
                      else customLabel = `${opt.label} (Redudansi)`;
                    }

                    return (
                      <option 
                        key={opt.id} 
                        value={opt.id} 
                        disabled={isDisabled} 
                        className={isDisabled ? 'bg-gray-100 text-gray-400 italic' : ''}
                      >
                        {customLabel}
                      </option>
                    )
                  })}
                </select>
                <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-blue-400">▼</div>
              </div>
            </div>

            {/* TOMBOL BANDINGKAN */}
            <div className="w-full md:w-auto mt-4 md:mt-6">
              <button 
                onClick={handleBandingkan}
                disabled={isComparing}
                className={`w-full md:w-auto px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-sm transition-all flex items-center justify-center gap-2 shadow-lg
                  ${isComparing 
                    ? 'bg-emerald-500 text-white scale-[0.98] shadow-inner border-b-0' 
                    : 'bg-blue-600 text-white hover:bg-blue-500 active:scale-95 border-b-4 border-blue-800 hover:border-blue-700'
                  }`}
              >
                {isComparing ? 'Aktif' : 'Bandingkan'}
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* 2. AREA HASIL PERBANDINGAN */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-7xl mx-auto h-full flex flex-col">
           {renderComparisonResult()}
        </div>
      </div>

    </div>
  );
}