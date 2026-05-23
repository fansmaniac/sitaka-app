import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { 
  TrendingUp, 
  School, 
  Users, 
  FileSpreadsheet, 
  Search, 
  MapPin, 
  Eye, 
  GraduationCap,
  Loader2,
  Activity,
  Image,
  BarChart2
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase/config'; 
import ExcelJS from 'exceljs';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts';
import { toPng } from 'html-to-image';

// =====================================================================
// MASTER CONFIGURATION & MAPPING
// =====================================================================
const CATEGORIES = [
  { id: 'SEMUA', label: 'Semua Jenjang' },
  { id: 'PAUD', label: 'PAUD' },
  { id: 'JENJANG DASAR', label: 'Pendidikan Dasar' },
  { id: 'JENJANG MENENGAH', label: 'Pendidikan Menengah' },
  { id: 'JENJANG INKLUSIF', label: 'Pendidikan Inklusif' },
  { id: 'JENJANG NON FORMAL', label: 'Pendidikan Non Formal' }
];

const SUB_TABS_MAPPING = {
  'SEMUA': ['SEMUA', 'PAUD', 'SD', 'SMP', 'SMA', 'SMK', 'SLB', 'NON FORMAL'],
  'PAUD': ['SEMUA', 'TK', 'KB', 'SPS', 'TPA'],
  'JENJANG DASAR': ['SEMUA', 'SD', 'SPK SD', 'SMP', 'SPK SMP'],
  'JENJANG MENENGAH': ['SEMUA', 'SMA', 'SPK SMA', 'SMK'],
  'JENJANG INKLUSIF': ['SEMUA', 'SLB'],
  'JENJANG NON FORMAL': ['SEMUA', 'PKBM', 'SKB']
};

const DAFTAR_WILAYAH = [
  "Semua", "Kabupaten Bengkayang", "Kabupaten Kapuas Hulu", "Kabupaten Kayong Utara",
  "Kabupaten Ketapang", "Kabupaten Kubu Raya", "Kabupaten Landak", "Kabupaten Melawi",
  "Kabupaten Mempawah", "Kabupaten Sambas", "Kabupaten Sanggau", "Kabupaten Sekadau",
  "Kabupaten Sintang", "Kota Pontianak", "Kota Singkawang"
];

const YEARS = ['2024', '2025', '2026'];

export default function TrendData() {
  // State Utama
  const [activeView, setActiveView] = useState('SISWA'); // 'SISWA' | 'SEKOLAH'
  const [selectedCategory, setSelectedCategory] = useState('SEMUA');
  const [activeSubTab, setActiveSubTab] = useState('SEMUA');
  const [selectedWilayah, setSelectedWilayah] = useState('Semua');
  
  // State Data & Loading
  const [dataTrendRaw, setDataTrendRaw] = useState([]);
  const [loading, setLoading] = useState(true);

  // Refs untuk Container DALAM (yang akan diunduh)
  const lineChartRef = useRef(null);
  const barChartRef = useRef(null);

  // Auto-reset sub-tab ketika kategori dropdown atas berubah
  useEffect(() => {
    const availableTabs = SUB_TABS_MAPPING[selectedCategory] || [];
    if (availableTabs.length > 0) {
      setActiveSubTab(availableTabs[0]);
    }
  }, [selectedCategory]);

  // =====================================================================
  // FETCH DATA DARI FIRESTORE (AGREGASI TREN)
  // =====================================================================
  useEffect(() => {
    const fetchTrendData = async () => {
      setLoading(true);
      try {
        const docRef = doc(db, 'dapodik_agregasi', 'trend_data_nasional');
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists()) {
          const payload = docSnap.data();
          setDataTrendRaw(payload.data || []);
        } else {
          setDataTrendRaw([]);
        }
      } catch (error) {
        console.error("Gagal mengambil data tren:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchTrendData();
  }, []);

  // =====================================================================
  // MESIN FILTER & GROUPING LOKAL
  // =====================================================================
  const processedData = useMemo(() => {
    if (!dataTrendRaw || dataTrendRaw.length === 0) return [];

    const cleanSelectedWilayah = selectedWilayah.toUpperCase().replace(/^(KAB\.|KABUPATEN|KOTA)\s+/i, '').trim();

    const checkBentukMatch = (bentukDb, tabActive, catActive) => {
      const dbVal = bentukDb.toUpperCase();
      const tab = tabActive.toUpperCase();

      if (tab === 'SEMUA') {
        if (catActive === 'SEMUA') return true;
        if (catActive === 'PAUD') return ['TK', 'KB', 'SPS', 'TPA', 'PAUD', 'KOBER'].includes(dbVal);
        if (catActive === 'JENJANG DASAR') return ['SD', 'SPK SD', 'SMP', 'SPK SMP'].includes(dbVal);
        if (catActive === 'JENJANG MENENGAH') return ['SMA', 'SPK SMA', 'SMK'].includes(dbVal);
        if (catActive === 'JENJANG INKLUSIF') return ['SLB'].includes(dbVal);
        if (catActive === 'JENJANG NON FORMAL') return ['PKBM', 'SKB', 'NON FORMAL'].includes(dbVal);
      }

      if (tab === 'PAUD') return ['TK', 'KB', 'SPS', 'TPA', 'PAUD', 'KOBER'].includes(dbVal);
      if (tab === 'NON FORMAL') return ['PKBM', 'SKB', 'NON FORMAL'].includes(dbVal);
      if (tab === 'SD') return ['SD', 'SPK SD'].includes(dbVal);
      if (tab === 'SMP') return ['SMP', 'SPK SMP'].includes(dbVal);
      if (tab === 'SMA') return ['SMA', 'SPK SMA'].includes(dbVal);
      
      return dbVal === tab;
    };

    let filtered = dataTrendRaw.filter(item => {
      const bentukDb = String(item.bentuk_pendidikan || item.jenjang || '').toUpperCase().trim();
      const kabDb = String(item.kabupaten || '').toUpperCase();

      const matchBentuk = checkBentukMatch(bentukDb, activeSubTab, selectedCategory);
      const matchWilayah = selectedWilayah === 'Semua' || kabDb.includes(cleanSelectedWilayah);
      
      return matchBentuk && matchWilayah;
    });

    const grouped = {};
    filtered.forEach(item => {
      const kec = item.kecamatan || 'TIDAK DIKETAHUI';
      if (!grouped[kec]) {
        grouped[kec] = {
          kecamatan: kec,
          '2024_n': 0, '2024_s': 0,
          '2025_n': 0, '2025_s': 0,
          '2026_n': 0, '2026_s': 0,
        };
      }

      const year = String(item.tahun || item.tahun_data);
      const statusDb = String(item.status_sekolah || item.status || '').toUpperCase();
      const isNegeri = statusDb === 'NEGERI' || statusDb === 'N';
      
      const val = activeView === 'SISWA' 
        ? (Number(item.jumlah_siswa) || 0) 
        : (Number(item.jumlah_sekolah) || 0);

      if (YEARS.includes(year)) {
        if (isNegeri) {
          grouped[kec][`${year}_n`] += val;
        } else {
          grouped[kec][`${year}_s`] += val;
        }
      }
    });

    return Object.values(grouped).sort((a, b) => a.kecamatan.localeCompare(b.kecamatan));
  }, [dataTrendRaw, activeSubTab, selectedCategory, selectedWilayah, activeView]);

  // Kalkulasi Grand Total Bawah Tabel
  const grandTotals = useMemo(() => {
    return processedData.reduce((acc, curr) => {
      acc['2024_n'] += curr['2024_n']; acc['2024_s'] += curr['2024_s'];
      acc['2025_n'] += curr['2025_n']; acc['2025_s'] += curr['2025_s'];
      acc['2026_n'] += curr['2026_n']; acc['2026_s'] += curr['2026_s'];
      return acc;
    }, {
      '2024_n': 0, '2024_s': 0,
      '2025_n': 0, '2025_s': 0,
      '2026_n': 0, '2026_s': 0
    });
  }, [processedData]);

  // Persiapan Data untuk Grafik Recharts
  const chartData = useMemo(() => {
    if (processedData.length === 0) return [];
    return [
      { 
        tahun: '2024', 
        Negeri: grandTotals['2024_n'], 
        Swasta: grandTotals['2024_s'], 
        Total: grandTotals['2024_n'] + grandTotals['2024_s'] 
      },
      { 
        tahun: '2025', 
        Negeri: grandTotals['2025_n'], 
        Swasta: grandTotals['2025_s'], 
        Total: grandTotals['2025_n'] + grandTotals['2025_s'] 
      },
      { 
        tahun: '2026', 
        Negeri: grandTotals['2026_n'], 
        Swasta: grandTotals['2026_s'], 
        Total: grandTotals['2026_n'] + grandTotals['2026_s'] 
      },
    ];
  }, [grandTotals]);

  // =====================================================================
  // LOGIK UNDUH GRAFIK PRESISI (TANPA INJECT STYLE)
  // =====================================================================
  const handleDownloadChartPNG = useCallback((targetRef, filePrefix) => {
    if (targetRef.current === null) return;

    // Kunci sukses: Jangan paksa style width/height di sini. Biarkan toPng 
    // merender persis seperti yang tampil di UI (yang sudah kita atur min-width-nya).
    // pixelRatio dinaikkan agar resolusi tajam (retina ready).
    toPng(targetRef.current, { 
      cacheBust: true, 
      backgroundColor: '#ffffff',
      pixelRatio: 3 
    })
      .then((dataUrl) => {
        const link = document.createElement('a');
        link.download = `${filePrefix}_${activeView}_${activeSubTab}_${selectedWilayah}.png`;
        link.href = dataUrl;
        link.click();
      })
      .catch((err) => {
        console.error('Gagal mengunduh grafik:', err);
      });
  }, [activeView, activeSubTab, selectedWilayah]);

  // =====================================================================
  // EXPORT EXCEL
  // =====================================================================
  const handleDownloadExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`Trend ${activeView}`);

    worksheet.columns = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Kecamatan', key: 'kecamatan', width: 30 },
      { header: '2024 (Negeri)', key: '2024_n', width: 15 },
      { header: '2024 (Swasta)', key: '2024_s', width: 15 },
      { header: '2024 (Total)', key: '2024_t', width: 15 },
      { header: '2025 (Negeri)', key: '2025_n', width: 15 },
      { header: '2025 (Swasta)', key: '2025_s', width: 15 },
      { header: '2025 (Total)', key: '2025_t', width: 15 },
      { header: '2026 (Negeri)', key: '2026_n', width: 15 },
      { header: '2026 (Swasta)', key: '2026_s', width: 15 },
      { header: '2026 (Total)', key: '2026_t', width: 15 },
    ];

    processedData.forEach((row, idx) => {
      worksheet.addRow({
        no: idx + 1,
        kecamatan: row.kecamatan,
        '2024_n': row['2024_n'], '2024_s': row['2024_s'], '2024_t': row['2024_n'] + row['2024_s'],
        '2025_n': row['2025_n'], '2025_s': row['2025_s'], '2025_t': row['2025_n'] + row['2025_s'],
        '2026_n': row['2026_n'], '2026_s': row['2026_s'], '2026_t': row['2026_n'] + row['2026_s'],
      });
    });

    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0891B2' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Trend_${activeView}_${activeSubTab}_${selectedWilayah}.xlsx`;
    link.click();
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-8 bg-gray-50/30 animate-in fade-in duration-500 overflow-y-auto custom-scrollbar">
      
      {/* 1. TOP BAR: TAB UTAMA TREND & DROPDOWN JENJANG */}
      <div className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 flex flex-col gap-4 mb-6 shrink-0">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          
          {/* Toggle View: Siswa vs Sekolah */}
          <div className="flex items-center bg-gray-100 p-1.5 rounded-2xl w-full md:w-auto">
            <button 
              onClick={() => setActiveView('SISWA')}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${
                activeView === 'SISWA' 
                  ? 'bg-blue-600 text-white shadow-md scale-[1.02]' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Users size={16} />
              Trend Siswa
            </button>
            <button 
              onClick={() => setActiveView('SEKOLAH')}
              className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider transition-all ${
                activeView === 'SEKOLAH' 
                  ? 'bg-emerald-600 text-white shadow-md scale-[1.02]' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <School size={16} />
              Trend Sekolah
            </button>
          </div>

          {/* Filter Dropdown & Tombol Unduh */}
          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            
            {/* Filter Kabupaten */}
            <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm flex-1 md:w-56 shrink-0">
              <MapPin size={16} className="text-gray-400 mr-2" />
              <select
                value={selectedWilayah}
                onChange={(e) => setSelectedWilayah(e.target.value)}
                className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer w-full"
              >
                {DAFTAR_WILAYAH.map(w => <option key={w} value={w}>{w}</option>)}
              </select>
            </div>

            {/* Dropdown Filter Kategori Atas */}
            <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm flex-1 md:w-64 shrink-0">
              <GraduationCap size={16} className="text-gray-400 mr-2" />
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer w-full"
              >
                {CATEGORIES.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
            </div>

            {/* Tombol Unduh Rekap Excel Utama */}
            <button 
              onClick={handleDownloadExcel}
              disabled={processedData.length === 0}
              className={`flex items-center justify-center gap-2 px-5 py-2.5 text-white text-xs md:text-sm font-black uppercase rounded-xl transition-all shadow-md active:scale-95 border ${
              activeView === 'SISWA' ? 'bg-blue-600 hover:bg-blue-700 border-blue-500' : 'bg-emerald-600 hover:bg-emerald-700 border-emerald-500'
            } disabled:opacity-50 disabled:cursor-not-allowed`}>
              <FileSpreadsheet size={16} />
              <span className="hidden sm:inline">Unduh Rekap Excel</span>
            </button>

          </div>

        </div>

        {/* 2. SUB-TAB JENJANG FILTER */}
        <div className="flex items-center gap-1.5 md:gap-2 overflow-x-auto pb-1 custom-scrollbar border-t border-gray-50 pt-3">
          {(SUB_TABS_MAPPING[selectedCategory] || []).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveSubTab(tab)}
              className={`px-4 py-1.5 rounded-lg font-black text-[10px] md:text-xs transition-all duration-300 whitespace-nowrap border uppercase tracking-wider ${
                activeSubTab === tab 
                  ? 'bg-gray-800 text-white border-gray-800 shadow-md' 
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* 3. JUDUL DINAMIS */}
      <div className="mb-4 text-left">
        <h3 className="text-lg md:text-xl font-black text-gray-800 uppercase tracking-tight flex items-center gap-2">
          <TrendingUp size={20} className={activeView === 'SISWA' ? 'text-blue-600' : 'text-emerald-600'} />
          Trend {activeView === 'SISWA' ? 'Siswa' : 'Sekolah'} {activeSubTab === 'SEMUA' ? selectedCategory : activeSubTab} 3 Tahun Terakhir
        </h3>
        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-0.5">
          Ruang Lingkup Wilayah: <span className="text-gray-600">{selectedWilayah}</span>
        </p>
      </div>

      {/* =====================================================================
          LAYOUT GRAFIK TERBELAH DUA (CONTAINER LUAR & CONTAINER DALAM)
         ===================================================================== */}
      {!loading && processedData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 shrink-0">
          
          {/* ======================= KIRI: LINE CHART ======================= */}
          <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-gray-200 flex flex-col justify-between">
            <div className="flex justify-between items-center mb-6">
              <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <Activity size={16} className="text-blue-500" />
                Grafik Garis Pertumbuhan
              </h4>
              <button 
                onClick={() => handleDownloadChartPNG(lineChartRef, 'Trend_Line')}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white text-[10px] font-black uppercase rounded-xl transition-all shadow-sm active:scale-95"
              >
                <Image size={12} /> Unduh Gambar
              </button>
            </div>
            
            {/* Wrapper Scroll. Di layar sempit user bisa geser. Saat difoto, ukurannya aman (min-w-600px) */}
            <div className="w-full overflow-x-auto custom-scrollbar pb-2">
              {/* TARGET UNDUHAN: Diberi padding dan min-width agar proporsional dan tidak bergeser */}
              <div className="min-w-[600px] bg-white p-4 rounded-xl" ref={lineChartRef}>
                <div className="w-full h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 20, right: 40, bottom: 20, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis dataKey="tahun" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 'bold', fill: '#9ca3af' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 'bold', fill: '#9ca3af' }} width={60} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold', fontSize: '12px' }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 'bold', paddingTop: '20px' }} />
                      
                      <Line type="monotone" dataKey="Total" name="Total" stroke={activeView === 'SISWA' ? '#2563eb' : '#059669'} strokeWidth={4} dot={{ r: 5 }} />
                      <Line type="monotone" dataKey="Negeri" name="Negeri" stroke="#10b981" strokeWidth={2} strokeDasharray="4 4" />
                      <Line type="monotone" dataKey="Swasta" name="Swasta" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="4 4" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

          {/* ======================= KANAN: BAR CHART ======================= */}
          <div className="bg-white p-5 md:p-6 rounded-3xl shadow-sm border border-gray-200 flex flex-col justify-between">
            <div className="flex justify-between items-center mb-6">
              <h4 className="text-xs font-black text-gray-500 uppercase tracking-widest flex items-center gap-2">
                <BarChart2 size={16} className="text-emerald-500" />
                Grafik Batang Perbandingan
              </h4>
              <button 
                onClick={() => handleDownloadChartPNG(barChartRef, 'Trend_Bar')}
                className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-900 text-white text-[10px] font-black uppercase rounded-xl transition-all shadow-sm active:scale-95"
              >
                <Image size={12} /> Unduh Gambar
              </button>
            </div>
            
            {/* Wrapper Scroll. Di layar sempit user bisa geser. Saat difoto, ukurannya aman (min-w-600px) */}
            <div className="w-full overflow-x-auto custom-scrollbar pb-2">
              {/* TARGET UNDUHAN: Diberi padding dan min-width agar proporsional dan tidak bergeser */}
              <div className="min-w-[600px] bg-white p-4 rounded-xl" ref={barChartRef}>
                <div className="w-full h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} margin={{ top: 20, right: 40, bottom: 20, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                      <XAxis dataKey="tahun" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 'bold', fill: '#9ca3af' }} dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 'bold', fill: '#9ca3af' }} width={60} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontWeight: 'bold', fontSize: '12px' }}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '12px', fontWeight: 'bold', paddingTop: '20px' }} />
                      
                      <Bar dataKey="Negeri" name="Negeri" fill="#10b981" radius={[4, 4, 0, 0]} barSize={24} />
                      <Bar dataKey="Swasta" name="Swasta" fill="#8b5cf6" radius={[4, 4, 0, 0]} barSize={24} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>

        </div>
      )}

      {/* 4. AREA DATA UTAMA (NESTED HEADERS TABLE) */}
      <div className="bg-white border border-gray-200 rounded-3xl shadow-sm flex flex-col shrink-0">
        <div className="overflow-x-auto custom-scrollbar p-4 max-h-[600px]">
          <table className="w-full text-center border-separate border-spacing-y-1.5">
            <thead className="sticky top-0 z-20 shadow-sm rounded-xl">
              
              {/* HEADER TINGKAT 1 */}
              <tr className="text-[10px] uppercase tracking-widest text-gray-600 font-black bg-gray-100">
                <th rowSpan="2" className="px-4 py-3 text-center rounded-tl-2xl align-middle border-b border-gray-200 w-12 bg-gray-100">No</th>
                <th rowSpan="2" className="px-4 py-3 text-left align-middle border-b border-gray-200 min-w-[180px] bg-gray-100">Kecamatan</th>
                <th colSpan="3" className="px-4 py-2 border-b border-gray-200 bg-blue-50 text-blue-800 font-black">Tahun 2024</th>
                <th colSpan="3" className="px-4 py-2 border-b border-gray-200 bg-emerald-50 text-emerald-800 font-black">Tahun 2025</th>
                <th colSpan="3" className="px-4 py-2 border-b border-gray-200 bg-purple-50 text-purple-800 font-black">Tahun 2026</th>
                <th rowSpan="2" className="px-4 py-3 text-center rounded-tr-2xl align-middle border-b border-gray-200 w-24 bg-gray-100">Aksi</th>
              </tr>

              {/* HEADER TINGKAT 2 (SUB-KOLOM) */}
              <tr className="text-[9px] uppercase tracking-wider text-gray-500 font-black bg-gray-50">
                <th className="px-2 py-2 border-b border-gray-100 bg-blue-50/10">Negeri</th>
                <th className="px-2 py-2 border-b border-gray-100 bg-blue-50/10">Swasta</th>
                <th className="px-2 py-2 border-b border-gray-100 font-black text-blue-700 bg-blue-50/40">Total</th>
                <th className="px-2 py-2 border-b border-gray-100 bg-emerald-50/10">Negeri</th>
                <th className="px-2 py-2 border-b border-gray-100 bg-emerald-50/10">Swasta</th>
                <th className="px-2 py-2 border-b border-gray-100 font-black text-emerald-700 bg-emerald-50/40">Total</th>
                <th className="px-2 py-2 border-b border-gray-100 bg-purple-50/10">Negeri</th>
                <th className="px-2 py-2 border-b border-gray-100 bg-purple-50/10">Swasta</th>
                <th className="px-2 py-2 border-b border-gray-100 font-black text-purple-700 bg-purple-50/40">Total</th>
              </tr>
            </thead>
            <tbody className="text-sm">
              
              {loading ? (
                <tr>
                  <td colSpan="12" className="py-28 text-center bg-white rounded-2xl">
                    <div className="flex flex-col items-center justify-center text-gray-400">
                      <Loader2 size={48} className="mb-4 text-blue-500 animate-spin" />
                      <p className="font-black uppercase tracking-widest text-base text-gray-500">Memuat Data Trend...</p>
                    </div>
                  </td>
                </tr>
              ) : processedData.length === 0 ? (
                <tr>
                  <td colSpan="12" className="py-28 text-center bg-white rounded-2xl">
                    <div className="flex flex-col items-center justify-center text-gray-400">
                      <Search size={54} className="mb-4 opacity-40 animate-pulse" />
                      <p className="font-black uppercase tracking-widest text-base text-gray-500">Belum Ada Data Tersedia</p>
                      <p className="text-xs font-medium text-gray-400 mt-1 max-w-md mx-auto leading-relaxed">
                        Sistem tidak menemukan data yang cocok atau admin belum memproses pra-kalkulasi untuk kategori ini.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                processedData.map((row, idx) => (
                  <tr key={row.kecamatan} className="bg-white shadow-sm hover:shadow-md hover:scale-[1.005] transition-all group text-gray-700">
                    <td className="p-3 text-center font-bold text-gray-400 rounded-l-xl border-y border-l">{idx + 1}</td>
                    <td className="p-3 font-black uppercase text-left border-y whitespace-nowrap">{row.kecamatan}</td>
                    
                    <td className="p-3 border-y bg-blue-50/10">{row['2024_n'].toLocaleString('id-ID')}</td>
                    <td className="p-3 border-y bg-blue-50/10">{row['2024_s'].toLocaleString('id-ID')}</td>
                    <td className="p-3 font-black border-y bg-blue-50/30 text-blue-700">{(row['2024_n'] + row['2024_s']).toLocaleString('id-ID')}</td>
                    
                    <td className="p-3 border-y bg-emerald-50/10">{row['2025_n'].toLocaleString('id-ID')}</td>
                    <td className="p-3 border-y bg-emerald-50/10">{row['2025_s'].toLocaleString('id-ID')}</td>
                    <td className="p-3 font-black border-y bg-emerald-50/30 text-emerald-700">{(row['2025_n'] + row['2025_s']).toLocaleString('id-ID')}</td>
                    
                    <td className="p-3 border-y bg-purple-50/10">{row['2026_n'].toLocaleString('id-ID')}</td>
                    <td className="p-3 border-y bg-purple-50/10">{row['2026_s'].toLocaleString('id-ID')}</td>
                    <td className="p-3 font-black border-y bg-purple-50/30 text-purple-700">{(row['2026_n'] + row['2026_s']).toLocaleString('id-ID')}</td>
                    
                    <td className="p-3 rounded-r-xl border-y border-r">
                      <button className="flex items-center justify-center gap-1 bg-gray-100 hover:bg-gray-800 hover:text-white px-3 py-1.5 rounded-xl text-[10px] font-black uppercase transition-all mx-auto">
                        <Eye size={12} /> Rincian
                      </button>
                    </td>
                  </tr>
                ))
              )}

            </tbody>
            
            {!loading && processedData.length > 0 && (
              <tfoot>
                <tr className="bg-gray-800 text-white font-black text-xs uppercase tracking-wider">
                  <td colSpan="2" className="p-4 text-right rounded-bl-2xl">TOTAL KESELURUHAN :</td>
                  
                  <td className="p-4 bg-blue-600/20 text-blue-200">{grandTotals['2024_n'].toLocaleString('id-ID')}</td>
                  <td className="p-4 bg-blue-600/20 text-blue-200">{grandTotals['2024_s'].toLocaleString('id-ID')}</td>
                  <td className="p-4 bg-blue-500 text-white">{(grandTotals['2024_n'] + grandTotals['2024_s']).toLocaleString('id-ID')}</td>
                  
                  <td className="p-4 bg-emerald-600/20 text-emerald-200">{grandTotals['2025_n'].toLocaleString('id-ID')}</td>
                  <td className="p-4 bg-emerald-600/20 text-emerald-200">{grandTotals['2025_s'].toLocaleString('id-ID')}</td>
                  <td className="p-4 bg-emerald-500 text-white">{(grandTotals['2025_n'] + grandTotals['2025_s']).toLocaleString('id-ID')}</td>
                  
                  <td className="p-4 bg-purple-600/20 text-purple-200">{grandTotals['2026_n'].toLocaleString('id-ID')}</td>
                  <td className="p-4 bg-purple-600/20 text-purple-200">{grandTotals['2026_s'].toLocaleString('id-ID')}</td>
                  <td className="p-4 bg-purple-500 text-white">{(grandTotals['2026_n'] + grandTotals['2026_s']).toLocaleString('id-ID')}</td>
                  
                  <td className="rounded-br-2xl"></td>
                </tr>
              </tfoot>
            )}
            
          </table>
        </div>
      </div>

    </div>
  );
}