import React, { useState, useEffect, useMemo } from 'react';
import { 
  ArrowLeft, 
  MapPin, 
  Loader2, 
  RefreshCw, 
  UserX, 
  UserMinus, 
  UserPlus, 
  Clock,
  AlertCircle,
  UserCheck,
  Users
} from 'lucide-react';
import { db } from '../../firebase/config'; 
import { collection, getDocs, query, where } from 'firebase/firestore';

// Konstanta Menu Utama
const MAIN_TABS = [
  { id: 'MAIN_ATS', label: 'Data Anak Tidak Sekolah', icon: UserMinus, color: 'text-orange-600', bgActive: 'bg-orange-600' },
  { id: 'MAIN_KEMBALI', label: 'Anak Kembali Sekolah', icon: UserCheck, color: 'text-emerald-600', bgActive: 'bg-emerald-600' }
];

// Konstanta Sub Menu ATS
const SUB_TABS_ATS = [
  { id: 'SEMUA', label: 'Total ATS', icon: Users, color: 'text-gray-700', bgActive: 'bg-slate-700' },
  { id: 'DO', label: 'Drop Out (DO)', icon: UserMinus, color: 'text-red-600', bgActive: 'bg-red-600' },
  { id: 'LTM', label: 'Lulus Tidak Melanjutkan (LTM)', icon: UserX, color: 'text-orange-500', bgActive: 'bg-orange-500' },
  { id: 'BPB', label: 'Belum Pernah Bersekolah (BPB)', icon: UserPlus, color: 'text-blue-600', bgActive: 'bg-blue-600' }
];

// Konstanta Sub Menu Anak Kembali
const SUB_TABS_KEMBALI = [
  { id: 'KEMBALI_DO', label: 'Anak DO Kembali Sekolah', icon: UserCheck, color: 'text-emerald-600', bgActive: 'bg-emerald-600' },
  { id: 'KEMBALI_LTM', label: 'Anak LTM Kembali Sekolah', icon: UserCheck, color: 'text-teal-600', bgActive: 'bg-teal-600' }
];

export default function DataATSPage({ onBack }) {
  const [activeMainTab, setActiveMainTab] = useState('MAIN_ATS');
  const [activeSubTab, setActiveSubTab] = useState('SEMUA'); // Default awal
  const [selectedWilayah, setSelectedWilayah] = useState('SEMUA');
  const [loading, setLoading] = useState(true);
  const [rawData, setRawData] = useState([]);
  const [lastUpdated, setLastUpdated] = useState('');

  // Handle pergantian Main Tab
  const handleMainTabChange = (tabId) => {
    setActiveMainTab(tabId);
    if (tabId === 'MAIN_ATS') setActiveSubTab('SEMUA');
    if (tabId === 'MAIN_KEMBALI') setActiveSubTab('KEMBALI_DO');
  };

  // Fungsi Mengambil Data dari Firestore Lokal
  const fetchAtsData = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'data_ats_chunks'), where('tahun_data', '==', '2026'));
      const snap = await getDocs(q);
      
      let fetchedData = [];
      let latestTime = null;

      snap.forEach(doc => {
        const data = doc.data();
        fetchedData.push(data);
        
        if (data.last_updated) {
          const docTime = data.last_updated.toDate();
          if (!latestTime || docTime > latestTime) {
            latestTime = docTime;
          }
        }
      });

      setRawData(fetchedData);

      if (latestTime) {
        const options = { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' };
        setLastUpdated(latestTime.toLocaleDateString('id-ID', options) + ' WIB');
      }

    } catch (error) {
      console.error("Gagal mengambil data ATS:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAtsData();
  }, []);

  const daftarWilayah = useMemo(() => {
    const list = rawData.map(d => d.nama_kabupaten).sort();
    return ['SEMUA', ...list];
  }, [rawData]);

  // ENGINE PENGOLAH DATA
  const processedData = useMemo(() => {
    if (rawData.length === 0) return [];

    let result = [];

    if (selectedWilayah === 'SEMUA') {
      rawData.forEach(kab => {
        let sumDO = 0, sumLTM = 0, sumBPB = 0, sumTotal = 0;
        let sumKembaliDO = 0, sumKembaliLTM = 0;
        
        let detDO = { paud: 0, sd: 0, smp: 0, sma_smk: 0 };
        let detLTM = { sd: 0, smp: 0 };
        let detBPB = { u_3_4: 0, u_5_6: 0, u_7_12: 0, u_13_15: 0, u_16_18: 0, u_19_24: 0, u_25_plus: 0 };
        
        let detKembaliDO = { paud: 0, sd: 0, smp: 0, sma_smk: 0 };
        let detKembaliLTM = { sd: 0, smp: 0 };
        
        if (kab.kecamatan_chunks) {
          kab.kecamatan_chunks.forEach(kec => {
            sumDO += kec.jumlah_do || 0;
            sumLTM += kec.jumlah_ltm || 0;
            sumBPB += kec.jumlah_bpb || 0;
            sumTotal += kec.total_ats || 0;
            sumKembaliDO += kec.jumlah_kembali_do || 0;
            sumKembaliLTM += kec.jumlah_kembali_ltm || 0;

            // Agregasi ATS
            if (kec.detail_do) {
              detDO.paud += kec.detail_do.paud || 0;
              detDO.sd += kec.detail_do.sd || 0;
              detDO.smp += kec.detail_do.smp || 0;
              detDO.sma_smk += kec.detail_do.sma_smk || 0;
            }
            if (kec.detail_ltm) {
              detLTM.sd += kec.detail_ltm.sd || 0;
              detLTM.smp += kec.detail_ltm.smp || 0;
            }
            if (kec.detail_bpb) {
              detBPB.u_3_4 += kec.detail_bpb.u_3_4 || 0;
              detBPB.u_5_6 += kec.detail_bpb.u_5_6 || 0;
              detBPB.u_7_12 += kec.detail_bpb.u_7_12 || 0;
              detBPB.u_13_15 += kec.detail_bpb.u_13_15 || 0;
              detBPB.u_16_18 += kec.detail_bpb.u_16_18 || 0;
              detBPB.u_19_24 += kec.detail_bpb.u_19_24 || 0;
              detBPB.u_25_plus += kec.detail_bpb.u_25_plus || 0;
            }
            // Agregasi KEMBALI
            if (kec.detail_kembali_do) {
              detKembaliDO.paud += kec.detail_kembali_do.paud || 0;
              detKembaliDO.sd += kec.detail_kembali_do.sd || 0;
              detKembaliDO.smp += kec.detail_kembali_do.smp || 0;
              detKembaliDO.sma_smk += kec.detail_kembali_do.sma_smk || 0;
            }
            if (kec.detail_kembali_ltm) {
              detKembaliLTM.sd += kec.detail_kembali_ltm.sd || 0;
              detKembaliLTM.smp += kec.detail_kembali_ltm.smp || 0;
            }
          });
        }

        result.push({
          id: kab.kode_kabupaten,
          wilayah: kab.nama_kabupaten,
          jumlah_do: sumDO,
          jumlah_ltm: sumLTM,
          jumlah_bpb: sumBPB,
          total_ats: sumTotal,
          jumlah_kembali_do: sumKembaliDO,
          jumlah_kembali_ltm: sumKembaliLTM,
          detail_do: detDO,
          detail_ltm: detLTM,
          detail_bpb: detBPB,
          detail_kembali_do: detKembaliDO,
          detail_kembali_ltm: detKembaliLTM
        });
      });
    } else {
      const kabTarget = rawData.find(k => k.nama_kabupaten === selectedWilayah);
      if (kabTarget && kabTarget.kecamatan_chunks) {
        result = kabTarget.kecamatan_chunks.map(kec => ({
          id: kec.kode_kecamatan,
          wilayah: kec.nama_kecamatan,
          jumlah_do: kec.jumlah_do || 0,
          jumlah_ltm: kec.jumlah_ltm || 0,
          jumlah_bpb: kec.jumlah_bpb || 0,
          total_ats: kec.total_ats || 0,
          jumlah_kembali_do: kec.jumlah_kembali_do || 0,
          jumlah_kembali_ltm: kec.jumlah_kembali_ltm || 0,
          detail_do: kec.detail_do || { paud: 0, sd: 0, smp: 0, sma_smk: 0 },
          detail_ltm: kec.detail_ltm || { sd: 0, smp: 0 },
          detail_bpb: kec.detail_bpb || { u_3_4: 0, u_5_6: 0, u_7_12: 0, u_13_15: 0, u_16_18: 0, u_19_24: 0, u_25_plus: 0 },
          detail_kembali_do: kec.detail_kembali_do || { paud: 0, sd: 0, smp: 0, sma_smk: 0 },
          detail_kembali_ltm: kec.detail_kembali_ltm || { sd: 0, smp: 0 }
        }));
      }
    }

    return result.sort((a, b) => {
      if (activeSubTab === 'DO') return b.jumlah_do - a.jumlah_do;
      if (activeSubTab === 'LTM') return b.jumlah_ltm - a.jumlah_ltm;
      if (activeSubTab === 'BPB') return b.jumlah_bpb - a.jumlah_bpb;
      if (activeSubTab === 'KEMBALI_DO') return b.jumlah_kembali_do - a.jumlah_kembali_do;
      if (activeSubTab === 'KEMBALI_LTM') return b.jumlah_kembali_ltm - a.jumlah_kembali_ltm;
      return b.total_ats - a.total_ats;
    });
  }, [rawData, selectedWilayah, activeSubTab]);

  // Kalkulasi Total Utama (sebagai pembagi persentase) yang menyesuaikan Tab
  const totalAkumulasiAktif = useMemo(() => {
    if (activeSubTab === 'DO') return processedData.reduce((acc, curr) => acc + curr.jumlah_do, 0);
    if (activeSubTab === 'LTM') return processedData.reduce((acc, curr) => acc + curr.jumlah_ltm, 0);
    if (activeSubTab === 'BPB') return processedData.reduce((acc, curr) => acc + curr.jumlah_bpb, 0);
    if (activeSubTab === 'KEMBALI_DO') return processedData.reduce((acc, curr) => acc + curr.jumlah_kembali_do, 0);
    if (activeSubTab === 'KEMBALI_LTM') return processedData.reduce((acc, curr) => acc + curr.jumlah_kembali_ltm, 0);
    return processedData.reduce((acc, curr) => acc + curr.total_ats, 0);
  }, [processedData, activeSubTab]);

  const activeSubTabsList = activeMainTab === 'MAIN_ATS' ? SUB_TABS_ATS : SUB_TABS_KEMBALI;
  const isTabKembali = activeSubTab === 'KEMBALI_DO' || activeSubTab === 'KEMBALI_LTM';

  return (
    <div className="h-screen bg-slate-50 flex flex-col font-sans">
      
      {/* Header Sticky */}
      <div className="bg-gradient-to-r from-orange-600 to-amber-500 shadow-md sticky top-0 z-30 flex-none text-white border-b border-orange-700">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                onClick={onBack}
                className="p-2 hover:bg-white/10 rounded-full transition-colors text-white active:scale-95"
              >
                <ArrowLeft className="w-5 h-5 text-white" />
              </button>
              <div>
                <h1 className="text-xl md:text-2xl font-black text-white tracking-wide">
                  Data Verval ATS
                </h1>
                <p className="text-xs md:text-sm text-orange-100 font-medium opacity-90">
                  Anak Tidak Sekolah Provinsi Kalimantan Barat
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button 
                onClick={fetchAtsData}
                disabled={loading}
                title="Refresh Data Lokal"
                className="p-2 bg-white/10 text-white hover:bg-white/20 border border-white/20 rounded-xl transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Konten Utama */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-orange-50/40 p-4 md:p-6 rounded-2xl shadow-sm border border-orange-100/70">
            <div className="flex items-center gap-3 text-orange-900 bg-white px-4 py-2.5 rounded-xl border border-orange-100 shadow-sm">
              <Clock className="w-5 h-5 text-orange-600" />
              <div>
                <p className="text-[10px] font-black text-orange-400 uppercase tracking-wider">Update Terakhir Sinkronisasi</p>
                <p className="text-sm font-black text-orange-800">{lastUpdated || 'Belum ada data'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="p-2.5 bg-orange-100 rounded-xl border border-orange-200">
                <MapPin className="w-5 h-5 text-orange-600" />
              </div>
              <select
                value={selectedWilayah}
                onChange={(e) => setSelectedWilayah(e.target.value)}
                disabled={loading}
                className="flex-1 md:w-64 bg-white border-2 border-orange-200 text-orange-900 text-sm font-black rounded-xl focus:ring-orange-500 focus:border-orange-500 block p-2.5 outline-none transition-all disabled:opacity-50 shadow-sm"
              >
                {daftarWilayah.map(wil => (
                  <option key={wil} value={wil}>
                    {wil === 'SEMUA' ? 'Semua Kabupaten / Kota' : wil}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* NAVIGASI 2 TINGKAT */}
          <div className="space-y-4">
            {/* TINGKAT 1 : Main Menu */}
            <div className="flex overflow-x-auto hide-scrollbar gap-3 pb-2 border-b-2 border-gray-200">
              {MAIN_TABS.map(tab => {
                const Icon = tab.icon;
                const isActive = activeMainTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => handleMainTabChange(tab.id)}
                    className={`flex items-center gap-2 px-6 py-3 font-black text-sm whitespace-nowrap transition-all border-b-4 ${
                      isActive 
                        ? `${tab.color} border-current` 
                        : `text-gray-400 border-transparent hover:text-gray-600 hover:border-gray-300`
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {tab.label}
                  </button>
                )
              })}
            </div>

            {/* TINGKAT 2 : Sub Menu */}
            <div className="flex overflow-x-auto hide-scrollbar gap-3 pb-2">
              {activeSubTabsList.map(tab => {
                const Icon = tab.icon;
                const isActive = activeSubTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveSubTab(tab.id)}
                    disabled={loading}
                    className={`flex items-center gap-2 px-5 py-3 rounded-xl font-black text-xs md:text-sm whitespace-nowrap transition-all border-2 disabled:opacity-50
                      ${isActive 
                        ? `${tab.bgActive} text-white border-transparent shadow-md scale-[1.02]` 
                        : `bg-white text-gray-500 border-gray-100 hover:bg-gray-50`
                      }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white/80' : tab.color}`} />
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mt-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center p-20 gap-4">
                <Loader2 className="w-10 h-10 text-orange-500 animate-spin" />
                <p className="font-bold text-gray-500">
                  Mengkalkulasi Data ATS lokal...
                </p>
              </div>
            ) : processedData.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-20 gap-4">
                <AlertCircle className="w-12 h-12 text-gray-300" />
                <p className="font-bold text-gray-400">Data ATS belum tersedia atau server lokal sedang sinkronisasi.</p>
              </div>
            ) : (
              <div className="w-full overflow-x-auto overflow-y-visible">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b-2 border-gray-200">
                      <th rowSpan={isTabKembali ? 2 : 1} className="p-4 text-center font-black text-gray-500 text-xs w-16 align-middle border-r border-gray-100">NO</th>
                      <th rowSpan={isTabKembali ? 2 : 1} className="p-4 font-black text-gray-500 text-xs uppercase align-middle border-r border-gray-100">
                        {selectedWilayah === 'SEMUA' ? 'Kabupaten / Kota' : 'Kecamatan'}
                      </th>
                      
                      {/* HEADER ATS BIASA */}
                      {activeSubTab === 'SEMUA' && (
                        <>
                          <th className="p-4 text-center font-black text-gray-500 text-xs uppercase">Drop Out (DO)</th>
                          <th className="p-4 text-center font-black text-gray-500 text-xs uppercase">Lulus Tdk Lanjut</th>
                          <th className="p-4 text-center font-black text-gray-500 text-xs uppercase">Belum Sekolah</th>
                          <th className="p-4 text-center font-black text-gray-800 bg-gray-100 text-xs uppercase">Total ATS</th>
                        </>
                      )}

                      {activeSubTab === 'DO' && (
                        <>
                          <th className="p-4 text-center font-black text-red-500 text-xs uppercase">PAUD</th>
                          <th className="p-4 text-center font-black text-red-500 text-xs uppercase">SD</th>
                          <th className="p-4 text-center font-black text-red-500 text-xs uppercase">SMP</th>
                          <th className="p-4 text-center font-black text-red-500 text-xs uppercase">SMA/SMK</th>
                          <th className="p-4 text-center font-black text-red-700 bg-red-50 text-xs uppercase">Total DO</th>
                        </>
                      )}

                      {activeSubTab === 'LTM' && (
                        <>
                          <th className="p-4 text-center font-black text-orange-500 text-xs uppercase">SD</th>
                          <th className="p-4 text-center font-black text-orange-500 text-xs uppercase">SMP</th>
                          <th className="p-4 text-center font-black text-orange-700 bg-orange-50 text-xs uppercase">Total LTM</th>
                        </>
                      )}

                      {activeSubTab === 'BPB' && (
                        <>
                          <th className="p-4 text-center font-black text-blue-500 text-xs uppercase whitespace-nowrap">3-4 Thn</th>
                          <th className="p-4 text-center font-black text-blue-500 text-xs uppercase whitespace-nowrap">5-6 Thn</th>
                          <th className="p-4 text-center font-black text-blue-500 text-xs uppercase whitespace-nowrap">7-12 Thn</th>
                          <th className="p-4 text-center font-black text-blue-500 text-xs uppercase whitespace-nowrap">13-15 Thn</th>
                          <th className="p-4 text-center font-black text-blue-500 text-xs uppercase whitespace-nowrap">16-18 Thn</th>
                          <th className="p-4 text-center font-black text-blue-500 text-xs uppercase whitespace-nowrap">19-24 Thn</th>
                          <th className="p-4 text-center font-black text-blue-500 text-xs uppercase whitespace-nowrap">25+ Thn</th>
                          <th className="p-4 text-center font-black text-blue-700 bg-blue-50 text-xs uppercase whitespace-nowrap">Total BPB</th>
                        </>
                      )}

                      {/* HEADER KEMBALI DO */}
                      {activeSubTab === 'KEMBALI_DO' && (
                        <>
                          <th colSpan="2" className="p-3 text-center font-black text-emerald-700 bg-emerald-50 text-xs uppercase border-b border-r border-emerald-200">Jenjang PAUD</th>
                          <th colSpan="2" className="p-3 text-center font-black text-emerald-700 bg-emerald-50 text-xs uppercase border-b border-r border-emerald-200">Jenjang SD</th>
                          <th colSpan="2" className="p-3 text-center font-black text-emerald-700 bg-emerald-50 text-xs uppercase border-b border-r border-emerald-200">Jenjang SMP</th>
                          <th colSpan="2" className="p-3 text-center font-black text-emerald-700 bg-emerald-50 text-xs uppercase border-b border-r border-emerald-200">Jenjang SMA/SMK</th>
                          <th colSpan="2" className="p-3 text-center font-black text-gray-800 bg-gray-100 text-xs uppercase border-b border-gray-200">TOTAL KESELURUHAN</th>
                        </>
                      )}

                      {/* HEADER KEMBALI LTM */}
                      {activeSubTab === 'KEMBALI_LTM' && (
                        <>
                          <th colSpan="2" className="p-3 text-center font-black text-teal-700 bg-teal-50 text-xs uppercase border-b border-r border-teal-200">Jenjang SD</th>
                          <th colSpan="2" className="p-3 text-center font-black text-teal-700 bg-teal-50 text-xs uppercase border-b border-r border-teal-200">Jenjang SMP</th>
                          <th colSpan="2" className="p-3 text-center font-black text-gray-800 bg-gray-100 text-xs uppercase border-b border-gray-200">TOTAL KESELURUHAN</th>
                        </>
                      )}
                    </tr>

                    {/* Baris Header Kedua (Khusus Tab Kembali Sekolah DO) */}
                    {activeSubTab === 'KEMBALI_DO' && (
                      <tr className="bg-gray-50 border-b-2 border-gray-200">
                        {/* PAUD */}
                        <th className="p-2 text-center font-black text-red-500 text-[10px] uppercase border-r border-gray-100">ATS DO</th>
                        <th className="p-2 text-center font-black text-emerald-600 text-[10px] uppercase border-r border-emerald-200 bg-emerald-50/50">KEMBALI</th>
                        {/* SD */}
                        <th className="p-2 text-center font-black text-red-500 text-[10px] uppercase border-r border-gray-100">ATS DO</th>
                        <th className="p-2 text-center font-black text-emerald-600 text-[10px] uppercase border-r border-emerald-200 bg-emerald-50/50">KEMBALI</th>
                        {/* SMP */}
                        <th className="p-2 text-center font-black text-red-500 text-[10px] uppercase border-r border-gray-100">ATS DO</th>
                        <th className="p-2 text-center font-black text-emerald-600 text-[10px] uppercase border-r border-emerald-200 bg-emerald-50/50">KEMBALI</th>
                        {/* SMA/SMK */}
                        <th className="p-2 text-center font-black text-red-500 text-[10px] uppercase border-r border-gray-100">ATS DO</th>
                        <th className="p-2 text-center font-black text-emerald-600 text-[10px] uppercase border-r border-emerald-200 bg-emerald-50/50">KEMBALI</th>
                        {/* TOTAL */}
                        <th className="p-2 text-center font-black text-red-600 text-[10px] uppercase bg-gray-100 border-r border-gray-200">TOT. DO</th>
                        <th className="p-2 text-center font-black text-emerald-700 text-[10px] uppercase bg-emerald-100">TOT. KEMBALI</th>
                      </tr>
                    )}

                    {/* Baris Header Kedua (Khusus Tab Kembali Sekolah LTM) */}
                    {activeSubTab === 'KEMBALI_LTM' && (
                      <tr className="bg-gray-50 border-b-2 border-gray-200">
                        {/* SD */}
                        <th className="p-2 text-center font-black text-orange-500 text-[10px] uppercase border-r border-gray-100">ATS LTM</th>
                        <th className="p-2 text-center font-black text-teal-600 text-[10px] uppercase border-r border-teal-200 bg-teal-50/50">KEMBALI</th>
                        {/* SMP */}
                        <th className="p-2 text-center font-black text-orange-500 text-[10px] uppercase border-r border-gray-100">ATS LTM</th>
                        <th className="p-2 text-center font-black text-teal-600 text-[10px] uppercase border-r border-teal-200 bg-teal-50/50">KEMBALI</th>
                        {/* TOTAL */}
                        <th className="p-2 text-center font-black text-orange-600 text-[10px] uppercase bg-gray-100 border-r border-gray-200">TOT. LTM</th>
                        <th className="p-2 text-center font-black text-teal-700 text-[10px] uppercase bg-teal-100">TOT. KEMBALI</th>
                      </tr>
                    )}
                  </thead>
                  
                  <tbody className="divide-y divide-gray-100">
                    {processedData.map((row, idx) => {
                      // Logic nilai target persentase (untuk ATS biasa)
                      let valTarget = 0;
                      if (activeSubTab === 'DO') valTarget = row.jumlah_do;
                      else if (activeSubTab === 'LTM') valTarget = row.jumlah_ltm;
                      else if (activeSubTab === 'BPB') valTarget = row.jumlah_bpb;
                      else if (activeSubTab === 'SEMUA') valTarget = row.total_ats;
                      
                      const persentase = totalAkumulasiAktif > 0 ? ((valTarget / totalAkumulasiAktif) * 100).toFixed(1) : '0.0';
                      
                      // Persentase konversi Anak Kembali Sekolah per wilayah
                      const rasioKembaliDO = row.jumlah_do > 0 ? ((row.jumlah_kembali_do / row.jumlah_do) * 100).toFixed(1) : '0.0';
                      const rasioKembaliLTM = row.jumlah_ltm > 0 ? ((row.jumlah_kembali_ltm / row.jumlah_ltm) * 100).toFixed(1) : '0.0';

                      return (
                        <tr key={row.id || idx} className="hover:bg-orange-50/30 transition-colors">
                          <td className="p-4 text-center text-sm font-bold text-gray-400 border-r border-gray-50">{idx + 1}</td>
                          <td className="p-4 text-sm font-black text-gray-700 whitespace-nowrap border-r border-gray-50">{row.wilayah}</td>
                          
                          {/* KONTEN BERDASARKAN SUB TAB ATS */}
                          {activeSubTab === 'SEMUA' && (
                            <>
                              <td className="p-4 text-center text-sm font-bold text-gray-500">{row.jumlah_do.toLocaleString('id-ID')}</td>
                              <td className="p-4 text-center text-sm font-bold text-gray-500">{row.jumlah_ltm.toLocaleString('id-ID')}</td>
                              <td className="p-4 text-center text-sm font-bold text-gray-500">{row.jumlah_bpb.toLocaleString('id-ID')}</td>
                              <td className="p-4 text-center text-sm font-black bg-orange-50/20 text-orange-900">
                                <div className="flex items-center justify-center gap-2">
                                  <span>{row.total_ats.toLocaleString('id-ID')}</span>
                                  <span className="text-[10px] md:text-xs font-black px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-md border border-orange-200">{persentase}%</span>
                                </div>
                              </td>
                            </>
                          )}

                          {activeSubTab === 'DO' && (
                            <>
                              <td className="p-4 text-center text-sm font-bold text-gray-500">{row.detail_do.paud.toLocaleString('id-ID')}</td>
                              <td className="p-4 text-center text-sm font-bold text-gray-500">{row.detail_do.sd.toLocaleString('id-ID')}</td>
                              <td className="p-4 text-center text-sm font-bold text-gray-500">{row.detail_do.smp.toLocaleString('id-ID')}</td>
                              <td className="p-4 text-center text-sm font-bold text-gray-500">{row.detail_do.sma_smk.toLocaleString('id-ID')}</td>
                              <td className="p-4 text-center text-sm font-black bg-red-50/20 text-red-700">
                                <div className="flex items-center justify-center gap-2">
                                  <span>{row.jumlah_do.toLocaleString('id-ID')}</span>
                                  <span className="text-[10px] md:text-xs font-black px-1.5 py-0.5 bg-red-100 text-red-700 rounded-md border border-red-200">{persentase}%</span>
                                </div>
                              </td>
                            </>
                          )}

                          {activeSubTab === 'LTM' && (
                            <>
                              <td className="p-4 text-center text-sm font-bold text-gray-500">{row.detail_ltm.sd.toLocaleString('id-ID')}</td>
                              <td className="p-4 text-center text-sm font-bold text-gray-500">{row.detail_ltm.smp.toLocaleString('id-ID')}</td>
                              <td className="p-4 text-center text-sm font-black bg-orange-50/20 text-orange-700">
                                <div className="flex items-center justify-center gap-2">
                                  <span>{row.jumlah_ltm.toLocaleString('id-ID')}</span>
                                  <span className="text-[10px] md:text-xs font-black px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded-md border border-orange-200">{persentase}%</span>
                                </div>
                              </td>
                            </>
                          )}

                          {activeSubTab === 'BPB' && (
                            <>
                              <td className="p-4 text-center text-sm font-bold text-gray-500">{row.detail_bpb.u_3_4.toLocaleString('id-ID')}</td>
                              <td className="p-4 text-center text-sm font-bold text-gray-500">{row.detail_bpb.u_5_6.toLocaleString('id-ID')}</td>
                              <td className="p-4 text-center text-sm font-bold text-gray-500">{row.detail_bpb.u_7_12.toLocaleString('id-ID')}</td>
                              <td className="p-4 text-center text-sm font-bold text-gray-500">{row.detail_bpb.u_13_15.toLocaleString('id-ID')}</td>
                              <td className="p-4 text-center text-sm font-bold text-gray-500">{row.detail_bpb.u_16_18.toLocaleString('id-ID')}</td>
                              <td className="p-4 text-center text-sm font-bold text-gray-500">{row.detail_bpb.u_19_24.toLocaleString('id-ID')}</td>
                              <td className="p-4 text-center text-sm font-bold text-gray-500">{row.detail_bpb.u_25_plus.toLocaleString('id-ID')}</td>
                              <td className="p-4 text-center text-sm font-black bg-blue-50/20 text-blue-700">
                                <div className="flex items-center justify-center gap-2">
                                  <span>{row.jumlah_bpb.toLocaleString('id-ID')}</span>
                                  <span className="text-[10px] md:text-xs font-black px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded-md border border-blue-200">{persentase}%</span>
                                </div>
                              </td>
                            </>
                          )}

                          {/* KONTEN BERDASARKAN SUB TAB KEMBALI */}
                          {activeSubTab === 'KEMBALI_DO' && (
                            <>
                              {/* PAUD */}
                              <td className="p-3 text-center text-sm font-bold text-red-400 border-r border-gray-50 bg-red-50/30">{row.detail_do.paud.toLocaleString('id-ID')}</td>
                              <td className="p-3 text-center text-sm font-bold text-emerald-600 border-r border-emerald-100 bg-emerald-50/40">{row.detail_kembali_do.paud.toLocaleString('id-ID')}</td>
                              {/* SD */}
                              <td className="p-3 text-center text-sm font-bold text-red-400 border-r border-gray-50 bg-red-50/30">{row.detail_do.sd.toLocaleString('id-ID')}</td>
                              <td className="p-3 text-center text-sm font-bold text-emerald-600 border-r border-emerald-100 bg-emerald-50/40">{row.detail_kembali_do.sd.toLocaleString('id-ID')}</td>
                              {/* SMP */}
                              <td className="p-3 text-center text-sm font-bold text-red-400 border-r border-gray-50 bg-red-50/30">{row.detail_do.smp.toLocaleString('id-ID')}</td>
                              <td className="p-3 text-center text-sm font-bold text-emerald-600 border-r border-emerald-100 bg-emerald-50/40">{row.detail_kembali_do.smp.toLocaleString('id-ID')}</td>
                              {/* SMA/SMK */}
                              <td className="p-3 text-center text-sm font-bold text-red-400 border-r border-gray-50 bg-red-50/30">{row.detail_do.sma_smk.toLocaleString('id-ID')}</td>
                              <td className="p-3 text-center text-sm font-bold text-emerald-600 border-r border-emerald-100 bg-emerald-50/40">{row.detail_kembali_do.sma_smk.toLocaleString('id-ID')}</td>
                              {/* TOTAL */}
                              <td className="p-3 text-center text-sm font-black text-red-500 bg-gray-100/50 border-r border-gray-200">{row.jumlah_do.toLocaleString('id-ID')}</td>
                              <td className="p-3 text-center text-sm font-black text-emerald-800 bg-emerald-50">
                                <div className="flex flex-col md:flex-row items-center justify-center gap-1.5">
                                  <span>{row.jumlah_kembali_do.toLocaleString('id-ID')}</span>
                                  {row.jumlah_kembali_do > 0 && (
                                    <span className="text-[9px] md:text-[10px] font-black px-1.5 py-0.5 bg-emerald-200 text-emerald-800 rounded-md border border-emerald-300">
                                      {rasioKembaliDO}%
                                    </span>
                                  )}
                                </div>
                              </td>
                            </>
                          )}

                          {activeSubTab === 'KEMBALI_LTM' && (
                            <>
                              {/* SD */}
                              <td className="p-3 text-center text-sm font-bold text-orange-400 border-r border-gray-50 bg-orange-50/30">{row.detail_ltm.sd.toLocaleString('id-ID')}</td>
                              <td className="p-3 text-center text-sm font-bold text-teal-600 border-r border-teal-100 bg-teal-50/40">{row.detail_kembali_ltm.sd.toLocaleString('id-ID')}</td>
                              {/* SMP */}
                              <td className="p-3 text-center text-sm font-bold text-orange-400 border-r border-gray-50 bg-orange-50/30">{row.detail_ltm.smp.toLocaleString('id-ID')}</td>
                              <td className="p-3 text-center text-sm font-bold text-teal-600 border-r border-teal-100 bg-teal-50/40">{row.detail_kembali_ltm.smp.toLocaleString('id-ID')}</td>
                              {/* TOTAL */}
                              <td className="p-3 text-center text-sm font-black text-orange-500 bg-gray-100/50 border-r border-gray-200">{row.jumlah_ltm.toLocaleString('id-ID')}</td>
                              <td className="p-3 text-center text-sm font-black text-teal-800 bg-teal-50">
                                <div className="flex flex-col md:flex-row items-center justify-center gap-1.5">
                                  <span>{row.jumlah_kembali_ltm.toLocaleString('id-ID')}</span>
                                  {row.jumlah_kembali_ltm > 0 && (
                                    <span className="text-[9px] md:text-[10px] font-black px-1.5 py-0.5 bg-teal-200 text-teal-800 rounded-md border border-teal-300">
                                      {rasioKembaliLTM}%
                                    </span>
                                  )}
                                </div>
                              </td>
                            </>
                          )}

                        </tr>
                      );
                    })}
                    
                    {/* BARIS TOTAL KESELURUHAN BAWAH */}
                    <tr className="bg-slate-800 text-white border-t-4 border-slate-900">
                      <td colSpan="2" className="p-4 text-right text-sm font-black uppercase">Total Keseluruhan</td>
                      
                      {/* FOOTER ATS BIASA */}
                      {activeSubTab === 'SEMUA' && (
                        <>
                          <td className="p-4 text-center text-sm font-black text-red-300">{processedData.reduce((acc, curr) => acc + curr.jumlah_do, 0).toLocaleString('id-ID')}</td>
                          <td className="p-4 text-center text-sm font-black text-orange-300">{processedData.reduce((acc, curr) => acc + curr.jumlah_ltm, 0).toLocaleString('id-ID')}</td>
                          <td className="p-4 text-center text-sm font-black text-blue-300">{processedData.reduce((acc, curr) => acc + curr.jumlah_bpb, 0).toLocaleString('id-ID')}</td>
                          <td className="p-4 text-center text-base font-black text-orange-400 bg-slate-900">
                            <div className="flex items-center justify-center gap-2">
                              <span>{totalAkumulasiAktif.toLocaleString('id-ID')}</span>
                              <span className="text-[10px] md:text-xs font-black px-1.5 py-0.5 bg-orange-500 text-white rounded-md">100%</span>
                            </div>
                          </td>
                        </>
                      )}

                      {activeSubTab === 'DO' && (
                        <>
                          <td className="p-4 text-center text-sm font-black text-red-300">{processedData.reduce((acc, curr) => acc + curr.detail_do.paud, 0).toLocaleString('id-ID')}</td>
                          <td className="p-4 text-center text-sm font-black text-red-300">{processedData.reduce((acc, curr) => acc + curr.detail_do.sd, 0).toLocaleString('id-ID')}</td>
                          <td className="p-4 text-center text-sm font-black text-red-300">{processedData.reduce((acc, curr) => acc + curr.detail_do.smp, 0).toLocaleString('id-ID')}</td>
                          <td className="p-4 text-center text-sm font-black text-red-300">{processedData.reduce((acc, curr) => acc + curr.detail_do.sma_smk, 0).toLocaleString('id-ID')}</td>
                          <td className="p-4 text-center text-base font-black text-red-400 bg-slate-900">
                            <div className="flex items-center justify-center gap-2">
                              <span>{totalAkumulasiAktif.toLocaleString('id-ID')}</span>
                              <span className="text-[10px] md:text-xs font-black px-1.5 py-0.5 bg-red-500 text-white rounded-md">100%</span>
                            </div>
                          </td>
                        </>
                      )}

                      {activeSubTab === 'LTM' && (
                        <>
                          <td className="p-4 text-center text-sm font-black text-orange-300">{processedData.reduce((acc, curr) => acc + curr.detail_ltm.sd, 0).toLocaleString('id-ID')}</td>
                          <td className="p-4 text-center text-sm font-black text-orange-300">{processedData.reduce((acc, curr) => acc + curr.detail_ltm.smp, 0).toLocaleString('id-ID')}</td>
                          <td className="p-4 text-center text-base font-black text-orange-400 bg-slate-900">
                            <div className="flex items-center justify-center gap-2">
                              <span>{totalAkumulasiAktif.toLocaleString('id-ID')}</span>
                              <span className="text-[10px] md:text-xs font-black px-1.5 py-0.5 bg-orange-500 text-white rounded-md">100%</span>
                            </div>
                          </td>
                        </>
                      )}

                      {activeSubTab === 'BPB' && (
                        <>
                          <td className="p-4 text-center text-sm font-black text-blue-300">{processedData.reduce((acc, curr) => acc + curr.detail_bpb.u_3_4, 0).toLocaleString('id-ID')}</td>
                          <td className="p-4 text-center text-sm font-black text-blue-300">{processedData.reduce((acc, curr) => acc + curr.detail_bpb.u_5_6, 0).toLocaleString('id-ID')}</td>
                          <td className="p-4 text-center text-sm font-black text-blue-300">{processedData.reduce((acc, curr) => acc + curr.detail_bpb.u_7_12, 0).toLocaleString('id-ID')}</td>
                          <td className="p-4 text-center text-sm font-black text-blue-300">{processedData.reduce((acc, curr) => acc + curr.detail_bpb.u_13_15, 0).toLocaleString('id-ID')}</td>
                          <td className="p-4 text-center text-sm font-black text-blue-300">{processedData.reduce((acc, curr) => acc + curr.detail_bpb.u_16_18, 0).toLocaleString('id-ID')}</td>
                          <td className="p-4 text-center text-sm font-black text-blue-300">{processedData.reduce((acc, curr) => acc + curr.detail_bpb.u_19_24, 0).toLocaleString('id-ID')}</td>
                          <td className="p-4 text-center text-sm font-black text-blue-300">{processedData.reduce((acc, curr) => acc + curr.detail_bpb.u_25_plus, 0).toLocaleString('id-ID')}</td>
                          <td className="p-4 text-center text-base font-black text-blue-400 bg-slate-900">
                            <div className="flex items-center justify-center gap-2">
                              <span>{totalAkumulasiAktif.toLocaleString('id-ID')}</span>
                              <span className="text-[10px] md:text-xs font-black px-1.5 py-0.5 bg-blue-500 text-white rounded-md">100%</span>
                            </div>
                          </td>
                        </>
                      )}

                      {/* FOOTER KEMBALI DO */}
                      {activeSubTab === 'KEMBALI_DO' && (() => {
                        const totDOPaud = processedData.reduce((acc, curr) => acc + curr.detail_do.paud, 0);
                        const totKembaliPaud = processedData.reduce((acc, curr) => acc + curr.detail_kembali_do.paud, 0);
                        
                        const totDOSd = processedData.reduce((acc, curr) => acc + curr.detail_do.sd, 0);
                        const totKembaliSd = processedData.reduce((acc, curr) => acc + curr.detail_kembali_do.sd, 0);
                        
                        const totDOSmp = processedData.reduce((acc, curr) => acc + curr.detail_do.smp, 0);
                        const totKembaliSmp = processedData.reduce((acc, curr) => acc + curr.detail_kembali_do.smp, 0);
                        
                        const totDOSma = processedData.reduce((acc, curr) => acc + curr.detail_do.sma_smk, 0);
                        const totKembaliSma = processedData.reduce((acc, curr) => acc + curr.detail_kembali_do.sma_smk, 0);

                        const totalSeluruhDO = processedData.reduce((acc, curr) => acc + curr.jumlah_do, 0);
                        const rasioTotalKembali = totalSeluruhDO > 0 ? ((totalAkumulasiAktif / totalSeluruhDO) * 100).toFixed(1) : '0.0';

                        return (
                          <>
                            {/* PAUD */}
                            <td className="p-4 text-center text-sm font-black text-red-300 border-r border-slate-700">{totDOPaud.toLocaleString('id-ID')}</td>
                            <td className="p-4 text-center text-sm font-black text-emerald-400 border-r border-slate-700">{totKembaliPaud.toLocaleString('id-ID')}</td>
                            {/* SD */}
                            <td className="p-4 text-center text-sm font-black text-red-300 border-r border-slate-700">{totDOSd.toLocaleString('id-ID')}</td>
                            <td className="p-4 text-center text-sm font-black text-emerald-400 border-r border-slate-700">{totKembaliSd.toLocaleString('id-ID')}</td>
                            {/* SMP */}
                            <td className="p-4 text-center text-sm font-black text-red-300 border-r border-slate-700">{totDOSmp.toLocaleString('id-ID')}</td>
                            <td className="p-4 text-center text-sm font-black text-emerald-400 border-r border-slate-700">{totKembaliSmp.toLocaleString('id-ID')}</td>
                            {/* SMA/SMK */}
                            <td className="p-4 text-center text-sm font-black text-red-300 border-r border-slate-700">{totDOSma.toLocaleString('id-ID')}</td>
                            <td className="p-4 text-center text-sm font-black text-emerald-400 border-r border-slate-700">{totKembaliSma.toLocaleString('id-ID')}</td>
                            {/* TOTAL */}
                            <td className="p-4 text-center text-base font-black text-red-400 bg-slate-900 border-r border-slate-700">{totalSeluruhDO.toLocaleString('id-ID')}</td>
                            <td className="p-4 text-center text-base font-black text-emerald-400 bg-emerald-900">
                              <div className="flex flex-col items-center justify-center gap-1">
                                <span>{totalAkumulasiAktif.toLocaleString('id-ID')}</span>
                                <span className="text-[10px] font-black px-1.5 py-0.5 bg-emerald-500 text-white rounded border border-emerald-400">
                                  {rasioTotalKembali}% Keberhasilan
                                </span>
                              </div>
                            </td>
                          </>
                        )
                      })()}

                      {/* FOOTER KEMBALI LTM */}
                      {activeSubTab === 'KEMBALI_LTM' && (() => {
                        const totLTMSd = processedData.reduce((acc, curr) => acc + curr.detail_ltm.sd, 0);
                        const totKembaliLTMSd = processedData.reduce((acc, curr) => acc + curr.detail_kembali_ltm.sd, 0);
                        
                        const totLTMSmp = processedData.reduce((acc, curr) => acc + curr.detail_ltm.smp, 0);
                        const totKembaliLTMSmp = processedData.reduce((acc, curr) => acc + curr.detail_kembali_ltm.smp, 0);
                        
                        const totalSeluruhLTM = processedData.reduce((acc, curr) => acc + curr.jumlah_ltm, 0);
                        const rasioTotalKembaliLTM = totalSeluruhLTM > 0 ? ((totalAkumulasiAktif / totalSeluruhLTM) * 100).toFixed(1) : '0.0';

                        return (
                          <>
                            {/* SD */}
                            <td className="p-4 text-center text-sm font-black text-orange-300 border-r border-slate-700">{totLTMSd.toLocaleString('id-ID')}</td>
                            <td className="p-4 text-center text-sm font-black text-teal-400 border-r border-slate-700">{totKembaliLTMSd.toLocaleString('id-ID')}</td>
                            {/* SMP */}
                            <td className="p-4 text-center text-sm font-black text-orange-300 border-r border-slate-700">{totLTMSmp.toLocaleString('id-ID')}</td>
                            <td className="p-4 text-center text-sm font-black text-teal-400 border-r border-slate-700">{totKembaliLTMSmp.toLocaleString('id-ID')}</td>
                            {/* TOTAL */}
                            <td className="p-4 text-center text-base font-black text-orange-400 bg-slate-900 border-r border-slate-700">{totalSeluruhLTM.toLocaleString('id-ID')}</td>
                            <td className="p-4 text-center text-base font-black text-teal-400 bg-teal-900">
                              <div className="flex flex-col items-center justify-center gap-1">
                                <span>{totalAkumulasiAktif.toLocaleString('id-ID')}</span>
                                <span className="text-[10px] font-black px-1.5 py-0.5 bg-teal-500 text-white rounded border border-teal-400">
                                  {rasioTotalKembaliLTM}% Keberhasilan
                                </span>
                              </div>
                            </td>
                          </>
                        )
                      })()}

                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}