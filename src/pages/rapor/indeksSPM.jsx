import React, { useState, useEffect } from 'react';
import { Calendar, Clock, Award, TrendingUp, TrendingDown, Minus, Loader2, Database } from 'lucide-react';
import { db } from '../../firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';

export default function IndeksSPM({ selectedYear = '2025' }) {
  const [activeTab, setActiveTab] = useState('provinsi');
  
  // State untuk menampung data dari Firebase
  const [dataSPMProvinsi, setDataSPMProvinsi] = useState([]);
  const [lastUpdate, setLastUpdate] = useState({ tanggal: '-', waktu: '-' });
  const [isLoading, setIsLoading] = useState(true);

  // Fetch Data dari Firebase berdasarkan tahun yang dipilih
  useEffect(() => {
    const fetchSPMData = async () => {
      setIsLoading(true);
      try {
        const q = query(
          collection(db, 'spm_provinsi_chunks'), 
          where("tahun_data", "==", selectedYear)
        );
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
          setDataSPMProvinsi([]);
          setLastUpdate({ tanggal: '-', waktu: '-' });
        } else {
          let combinedData = [];
          let latestUpdate = null;

          // Menggabungkan data dari chunks jika terpecah
          snapshot.forEach(doc => {
            const docData = doc.data();
            if (docData.data && !docData.is_empty) {
              combinedData = [...combinedData, ...docData.data];
            }
            // Mengambil waktu update paling baru
            if (!latestUpdate || new Date(docData.last_updated) > new Date(latestUpdate)) {
              latestUpdate = docData.last_updated;
            }
          });

          setDataSPMProvinsi(combinedData);

          // Format Tanggal & Waktu
          if (latestUpdate) {
            const dateObj = new Date(latestUpdate);
            const formatTanggal = new Intl.DateTimeFormat('id-ID', { 
              day: 'numeric', month: 'long', year: 'numeric' 
            }).format(dateObj);
            
            const formatWaktu = new Intl.DateTimeFormat('id-ID', { 
              hour: '2-digit', minute: '2-digit', timeZoneName: 'short' 
            }).format(dateObj);

            setLastUpdate({ tanggal: formatTanggal, waktu: formatWaktu });
          }
        }
      } catch (error) {
        console.error("Gagal menarik data SPM Provinsi:", error);
        setDataSPMProvinsi([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSPMData();
  }, [selectedYear]);

  // Fungsi pengkategorian SPM
  const getKategoriSPM = (score) => {
    const numScore = parseFloat(score || 0);
    if (numScore >= 100) return { label: 'Tuntas Paripurna', color: 'bg-emerald-600', text: 'text-emerald-900', border: 'border-emerald-500', rentang: '100' };
    if (numScore >= 90) return { label: 'Tuntas Utama', color: 'bg-teal-500', text: 'text-teal-900', border: 'border-teal-400', rentang: '90 - 99' };
    if (numScore >= 80) return { label: 'Tuntas Madya', color: 'bg-blue-500', text: 'text-blue-900', border: 'border-blue-400', rentang: '80 - 89' };
    if (numScore >= 70) return { label: 'Tuntas Pratama', color: 'bg-yellow-500', text: 'text-yellow-900', border: 'border-yellow-400', rentang: '70 - 79' };
    if (numScore >= 60) return { label: 'Tuntas Muda', color: 'bg-amber-500', text: 'text-amber-900', border: 'border-amber-400', rentang: '60 - 69' };
    return { label: 'Belum Tuntas', color: 'bg-red-500', text: 'text-red-900', border: 'border-red-400', rentang: '< 60' };
  };

  // Mencari data agregat "Semua" (Case-insensitive)
  const dataSemua = dataSPMProvinsi.find(d => d.jenjang && d.jenjang.toLowerCase() === 'semua');
  const kategori = getKategoriSPM(dataSemua?.indeks_spm || 0);

  return (
    <div className="w-full flex flex-col h-full overflow-hidden bg-slate-50">
      
      {/* TABS MENU ATAS */}
      <div className="bg-white px-4 pt-4 border-b border-slate-200 shrink-0 shadow-sm z-10">
        <div className="flex gap-4 overflow-x-auto scrollbar-hide">
          <button 
            onClick={() => setActiveTab('provinsi')}
            className={`px-6 py-3 font-bold text-sm md:text-base border-b-4 transition-all whitespace-nowrap ${
              activeTab === 'provinsi' 
                ? 'border-emerald-600 text-emerald-700' 
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Indeks SPM Provinsi
          </button>
          <button 
            onClick={() => setActiveTab('kabkota')}
            className={`px-6 py-3 font-bold text-sm md:text-base border-b-4 transition-all whitespace-nowrap ${
              activeTab === 'kabkota' 
                ? 'border-emerald-600 text-emerald-700' 
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            Indeks SPM Kab/Kota
          </button>
        </div>
      </div>

      {/* KONTEN TAB */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 relative">
        
        {/* Loading Overlay State */}
        {isLoading && (
          <div className="absolute inset-0 bg-slate-50/80 z-20 flex flex-col items-center justify-center backdrop-blur-sm">
            <Loader2 className="w-12 h-12 text-emerald-600 animate-spin mb-4" />
            <p className="text-slate-600 font-bold animate-pulse">Menarik data dari database...</p>
          </div>
        )}

        {activeTab === 'provinsi' && (
          <div className="max-w-6xl mx-auto space-y-6">
            
            {/* Header Konten & Waktu Update */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <h2 className="text-2xl md:text-3xl font-black text-slate-800 uppercase tracking-tight">
                  Ringkasan Capaian SPM
                </h2>
                <h3 className="text-lg md:text-xl font-bold text-emerald-700">
                  Provinsi Kalimantan Barat Tahun {selectedYear}
                </h3>
              </div>
              <div className="flex items-center gap-3 bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm text-xs md:text-sm text-slate-600 font-medium">
                <span className="flex items-center gap-1.5"><Calendar size={14} className="text-emerald-600" /> {lastUpdate.tanggal}</span>
                <span className="text-slate-300">|</span>
                <span className="flex items-center gap-1.5"><Clock size={14} className="text-emerald-600" /> {lastUpdate.waktu}</span>
              </div>
            </div>

            {/* JIKA DATA KOSONG */}
            {!isLoading && dataSPMProvinsi.length === 0 ? (
              <div className="bg-white p-16 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col items-center text-center">
                <Database size={64} className="text-slate-300 mb-4" />
                <h3 className="text-2xl font-black text-slate-700 mb-2">Data Belum Tersedia</h3>
                <p className="text-slate-500">Database Indeks SPM Provinsi untuk tahun {selectedYear} belum diunggah.</p>
              </div>
            ) : (
              <>
                {/* Hero Card: Kotak Menarik Skor Indeks SPM */}
                <div className={`relative overflow-hidden rounded-[2rem] p-8 md:p-12 shadow-sm border-2 ${kategori.border} bg-white flex flex-col md:flex-row items-center justify-between gap-8`}>
                  {/* Dekorasi Latar */}
                  <div className={`absolute -right-20 -top-20 w-64 h-64 rounded-full opacity-10 ${kategori.color} blur-3xl`}></div>
                  
                  <div className="flex flex-col text-center md:text-left z-10">
                    <span className="text-slate-500 font-bold tracking-widest uppercase mb-2 text-sm md:text-base">
                      Skor Indeks SPM (Semua Jenjang)
                    </span>
                    <div className="flex items-baseline justify-center md:justify-start gap-2">
                      <span className="text-7xl md:text-8xl font-black text-slate-800 tracking-tighter">
                        {dataSemua?.indeks_spm ? parseFloat(dataSemua.indeks_spm).toString().replace('.', ',') : '0'}
                      </span>
                      <span className="text-2xl font-bold text-slate-400">/ 100</span>
                    </div>
                  </div>

                  <div className="z-10 flex flex-col items-center">
                    <div className={`${kategori.color} text-white px-8 py-4 rounded-2xl shadow-lg transform md:-rotate-2 border border-white/20 backdrop-blur-sm`}>
                      <div className="flex items-center gap-3">
                        <Award size={32} className="text-white/90" />
                        <span className="text-2xl md:text-3xl font-black tracking-wide uppercase">
                          {kategori.label}
                        </span>
                      </div>
                    </div>
                    <span className="text-slate-400 text-xs font-semibold mt-4">Rentang Nilai: {kategori.rentang}</span>
                  </div>
                </div>

                {/* Tabel Peningkatan SPM per Jenjang */}
                <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
                  <div className="bg-slate-800 p-4 border-b border-slate-700 text-center md:text-left">
                    <h4 className="text-white font-bold tracking-wide uppercase text-sm md:text-base">
                      Rincian Capaian per Jenjang
                    </h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="p-4 text-xs md:text-sm font-black text-slate-600 uppercase w-32">Jenjang</th>
                          <th className="p-4 text-xs md:text-sm font-black text-emerald-700 uppercase"><div className="flex items-center gap-2"><TrendingUp size={16} /> Peningkatan Tertinggi</div></th>
                          <th className="p-4 text-xs md:text-sm font-black text-blue-700 uppercase"><div className="flex items-center gap-2"><Award size={16} /> Capaian Terbaik</div></th>
                          <th className="p-4 text-xs md:text-sm font-black text-red-700 uppercase"><div className="flex items-center gap-2"><TrendingDown size={16} /> Capaian Terendah</div></th>
                        </tr>
                      </thead>
                      <tbody>
                        {dataSPMProvinsi
                          .filter(d => d.jenjang && d.jenjang.toLowerCase() !== 'semua')
                          .map((item, idx) => (
                          <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                            <td className="p-4 font-black text-slate-700 uppercase">{item.jenjang}</td>
                            <td className="p-4 text-sm font-medium text-slate-600">
                              {!item.peningkatan_tertinggi || item.peningkatan_tertinggi.toLowerCase() === 'tidak ada' 
                                ? <span className="inline-flex items-center gap-1.5 text-slate-400 bg-slate-100 px-3 py-1 rounded-full text-xs font-bold"><Minus size={12}/> Tidak Ada</span> 
                                : item.peningkatan_tertinggi}
                            </td>
                            <td className="p-4 text-sm font-medium text-slate-600">{item.capaian_terbaik || '-'}</td>
                            <td className="p-4 text-sm font-medium text-slate-600">{item.capaian_terendah || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'kabkota' && (
          <div className="h-full flex flex-col items-center justify-center min-h-[400px]">
            <div className="bg-white p-8 md:p-12 rounded-[2rem] border border-slate-200 shadow-sm text-center max-w-md w-full">
              <h2 className="text-2xl font-black text-slate-800 mb-2">Indeks SPM Kab/Kota</h2>
              <p className="text-slate-500 font-medium">Halaman ini akan kita lanjutkan nanti. Sedang dalam tahap penyusunan UI.</p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}