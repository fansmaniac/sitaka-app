import React, { useState } from 'react';
// TAMBAHAN: Import useSearchParams dari react-router-dom
import { useSearchParams } from 'react-router-dom';
import { LineChart, ArrowRightLeft, Layers, Users, School, GraduationCap, AlertCircle, Building } from 'lucide-react';

// IMPORT KOMPONEN ANAK ASLI
import RasioSekolahVsPD from '../../components/dapodik/dapodikRasio/RasioSekolahVsPD';
import RasioSekolahVsGuru from '../../components/dapodik/dapodikRasio/RasioSekolahVsGuru'; 
import RasioRombelVsPD from '../../components/dapodik/dapodikRasio/RasioRombelVsPD'; 
import RasioSekolahVsRombel from '../../components/dapodik/dapodikRasio/RasioSekolahVsRombel'; 
import RasioRombelVsGuru from '../../components/dapodik/dapodikRasio/RasioRombelVsGuru'; 
import RasioRombelVsKelas from '../../components/dapodik/dapodikRasio/RasioRombelVsKelas';
import RasioGuruVsPD from '../../components/dapodik/dapodikRasio/RasioGuruVsPD'; // <-- IMPORT MODUL GURU VS PD

// =====================================================================
// MAIN COMPONENT: DAPODIK RASIO
// =====================================================================
export default function DapodikRasio({ selectedYear = '2026' }) {
  // --- PERUBAHAN UTAMA: State Dropdown diganti menggunakan URL Parameters ---
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Mengambil nilai dari URL, default ke 'SEKOLAH' & 'PESERTA DIDIK' jika kosong
  const data1 = searchParams.get('data1')?.toUpperCase() || 'SEKOLAH';
  const data2 = searchParams.get('data2')?.toUpperCase() || 'PESERTA DIDIK';
  
  // State untuk menandai apakah user sudah mengklik "Bandingkan" 
  // (Otomatis true saat pertama load agar link yang dishare langsung muncul chart)
  const [isComparing, setIsComparing] = useState(true); 
  
  // Opsi Data 1
  const OPTIONS_DATA_1 = [
    { id: 'SEKOLAH', label: 'Sekolah', icon: School },
    { id: 'ROMBEL', label: 'Rombel', icon: Layers },
    { id: 'GURU', label: 'Guru', icon: Users },
  ];

  // Opsi Data 2
  const OPTIONS_DATA_2 = [
    { id: 'PESERTA DIDIK', label: 'Peserta Didik', icon: GraduationCap },
    { id: 'GURU', label: 'Guru', icon: Users },
    { id: 'ROMBEL', label: 'Rombel', icon: Layers },
    { id: 'RUANG KELAS', label: 'Ruang Kelas', icon: Building }, 
  ];

  // Handler saat Data 1 berubah
  const handleData1Change = (e) => {
    const newVal = e.target.value;
    setIsComparing(false); // Sembunyikan hasil sampai tombol "Bandingkan" diklik
    
    let currentData2 = data2;

    // 1. Cegah ID sama
    if (newVal === currentData2) {
      const availableOption = OPTIONS_DATA_2.find(opt => opt.id !== newVal);
      if (availableOption) currentData2 = availableOption.id;
    }

    // 2. Cegah Redudansi (Guru vs Rombel)
    if (newVal === 'GURU' && currentData2 === 'ROMBEL') {
       currentData2 = 'PESERTA DIDIK'; 
    }
    
    // 3. Cegah Sekolah/Guru vs Ruang Kelas (Karena Ruang Kelas hanya untuk Rombel)
    if ((newVal === 'SEKOLAH' || newVal === 'GURU') && currentData2 === 'RUANG KELAS') {
       currentData2 = 'PESERTA DIDIK'; 
    }

    // Simpan pilihan ke URL Parameter
    setSearchParams(prev => {
      prev.set('data1', newVal);
      prev.set('data2', currentData2);
      return prev;
    });
  };

  const handleData2Change = (e) => {
    const newVal = e.target.value;
    setIsComparing(false); // Sembunyikan hasil
    
    // Simpan pilihan ke URL Parameter
    setSearchParams(prev => {
      prev.set('data1', data1);
      prev.set('data2', newVal);
      return prev;
    });
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
      case 'ROMBEL_VS_RUANG KELAS':
        return <RasioRombelVsKelas selectedYear={selectedYear} />; 
      case 'GURU_VS_PESERTA DIDIK': // <-- MEMANGGIL KOMPONEN ASLI
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
      
      {/* HEADER & KONTROL PERBANDINGAN */}
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

            <div className="shrink-0 bg-blue-600 text-white p-4 rounded-full shadow-lg mt-4 md:mt-6 z-10 hidden md:flex items-center justify-center">
               <span className="font-black text-xl italic leading-none pr-1">VS</span>
            </div>
            
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
                    let isDisabled = opt.id === data1;
                    let customLabel = opt.label;

                    if (data1 === 'GURU' && opt.id === 'ROMBEL') isDisabled = true;
                    // Mencegah Sekolah VS Ruang Kelas (Fokus di Rombel VS Ruang Kelas)
                    if (data1 === 'SEKOLAH' && opt.id === 'RUANG KELAS') isDisabled = true; 
                    if (data1 === 'GURU' && opt.id === 'RUANG KELAS') isDisabled = true;

                    if (isDisabled) {
                      if (opt.id === data1) customLabel = `${opt.label} (Terpilih)`;
                      else customLabel = `${opt.label} (Redudansi/Tidak Valid)`;
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

      {/* AREA HASIL PERBANDINGAN */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8">
        <div className="max-w-7xl mx-auto h-full flex flex-col">
           {renderComparisonResult()}
        </div>
      </div>

    </div>
  );
}