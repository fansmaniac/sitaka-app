import React, { useState, useMemo, useEffect } from 'react';
import { 
  ArrowLeft, Building2, Download, MapPin, Loader2, 
  ChevronRight, Eye, X, Search, Info,
  Bot, Send, Sparkles 
} from 'lucide-react';
import { KABUPATEN_LIST } from '../constants/listData';
import { db } from '../firebase/config';
import { collection, getDocs, query, where } from 'firebase/firestore';
import ExcelJS from 'exceljs';
import { GoogleGenerativeAI } from "@google/generative-ai";

// --- SETUP GEMINI AI API ---
// Mengambil kunci dari env dengan aman
const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

// Menambahkan proteksi agar aplikasi tidak crash saat API Key kosong
let genAI = null;
if (apiKey && apiKey.trim() !== "") {
  genAI = new GoogleGenerativeAI(apiKey);
} else {
  console.error("Gawat Sob! API Key Gemini tidak terdeteksi oleh Vite.");
}

// --- DICTIONARY NAMA RUANG & KONDISI ---
const ROOM_LABELS = {
  'ruang_kelas': 'Ruang Kelas',
  'ruang_perpustakaan': 'Perpustakaan',
  'ruang_lab_komputer': 'Lab Komputer',
  'ruang_lab_bahasa': 'Lab Bahasa',
  'ruang_lab_ipa': 'Lab IPA',
  'ruang_lab_fisika': 'Lab Fisika',
  'ruang_lab_biologi': 'Lab Biologi',
  'ruang_ruang_kepsek': 'Ruang Kepsek',
  'ruang_ruang_guru': 'Ruang Guru',
  'ruang_ruang_tu': 'Ruang TU',
  'ruang_wc_siswa_laki_laki': 'WC Siswa (L)',
  'ruang_wc_siswa_perempuan': 'WC Siswa (P)',
  'ruang_wc_guru_laki_laki': 'WC Guru (L)',
  'ruang_wc_guru_perempuan': 'WC Guru (P)'
};

const CONDITIONS = [
  { key: 'baik', label: 'Baik', color: 'text-emerald-600' },
  { key: 'rusak_ringan', label: 'R.Ringan', color: 'text-blue-500' },
  { key: 'rusak_sedang', label: 'R.Sedang', color: 'text-yellow-500' },
  { key: 'rusak_berat', label: 'R.Berat', color: 'text-orange-500' },
  { key: 'tidak_bisa_dipakai', label: 'Tdk Dipakai', color: 'text-red-600' }
];

export default function DataSarprasPage({ onBack, Header }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState('2026');
  const [activeTab, setActiveTab] = useState('SEMUA'); 
  
  const [activeRowModal, setActiveRowModal] = useState(null);
  const [modalSearchQuery, setModalSearchQuery] = useState('');

  // --- STATE UNTUK AI ASSISTANT ---
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [chatHistory, setChatHistory] = useState([
    { role: 'ai', text: 'Halo Sob! Saya Asisten AI SITAKA. Ada yang ingin saya analisis dari data Sarpras di layar saat ini?' }
  ]);

  // --- STATE UNTUK TOUR GUIDE AI ---
  const [showTour, setShowTour] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const JENJANG_GROUPS = [
    { id: 'PAUD', label: 'Jenjang PAUD', types: ['TK', 'KB'] },
    { id: 'DASAR', label: 'Jenjang Dasar', types: ['SD'] },
    { id: 'MENENGAH', label: 'Jenjang Menengah', types: ['SMP', 'SMA', 'SMK'] },
    { id: 'INKLUSIF', label: 'Jenjang Inklusif', types: ['SLB'] },
    { id: 'NON_FORMAL', label: 'Jenjang Non Formal', types: ['PKBM', 'SPS', 'TPA'] },
  ];

  const TABS = [{ id: 'SEMUA', label: 'Semua Jenjang' }, ...JENJANG_GROUPS];

  const getRequiredRooms = (jenjang) => {
    const base = [
      'ruang_kelas', 'ruang_perpustakaan', 'ruang_ruang_kepsek', 
      'ruang_ruang_guru', 'ruang_ruang_tu', 'ruang_wc_siswa_laki_laki', 
      'ruang_wc_siswa_perempuan', 'ruang_wc_guru_laki_laki', 'ruang_wc_guru_perempuan'
    ];
    if (jenjang === 'SD') return [...base, 'ruang_lab_komputer'];
    if (jenjang === 'SMP') return [...base, 'ruang_lab_komputer', 'ruang_lab_ipa'];
    if (['SMA', 'SMK'].includes(jenjang)) return [...base, 'ruang_lab_komputer', 'ruang_lab_ipa', 'ruang_lab_fisika', 'ruang_lab_biologi', 'ruang_lab_bahasa'];
    return base;
  };

  // --- INIT FETCH & CHECK TOUR GUIDE ---
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'data_sarpras'), where("tahun_data", "==", selectedYear));
        const snap = await getDocs(q);
        setData(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      } catch (err) { console.error(err); }
      finally { setLoading(false); }
    };
    fetchData();

    const isTourHidden = localStorage.getItem('hideSitakaAiTour');
    if (!isTourHidden) {
      setTimeout(() => setShowTour(true), 1500); 
    }
  }, [selectedYear]);

  const closeTourGuide = () => {
    if (dontShowAgain) {
      localStorage.setItem('hideSitakaAiTour', 'true');
    }
    setShowTour(false);
  };

  // --- LOGIKA KALKULASI SARPRAS ---
  const auditSarpras = (school) => {
    const jenjang = String(school.jenjang || '').toUpperCase();
    const reqRooms = getRequiredRooms(jenjang);
    
    let sumBaik = 0;
    let sumTotal = 0;
    let missingCount = 0;

    reqRooms.forEach(room => {
      const baik = parseInt(school[`${room}_baik`]) || 0;
      const rr = parseInt(school[`${room}_rusak_ringan`]) || 0;
      const rs = parseInt(school[`${room}_rusak_sedang`]) || 0;
      const rb = parseInt(school[`${room}_rusak_berat`]) || 0;
      const tbd = parseInt(school[`${room}_tidak_bisa_dipakai`]) || 0;
      const total = baik + rr + rs + rb + tbd;

      if (total === 0) missingCount++;
      sumBaik += baik;
      sumTotal += total;
    });

    const percentBaik = sumTotal > 0 ? (sumBaik / sumTotal) * 100 : 0;

    if (missingCount > 5 || percentBaik < 50) return 'Sangat Kurang';
    if (percentBaik >= 90) return 'Lengkap';
    if (percentBaik >= 80) return 'Cukup';
    if (percentBaik >= 50) return 'Kurang';
    return 'Sangat Kurang';
  };

  const summaryTable = useMemo(() => {
    if (activeTab === 'SEMUA') {
      return JENJANG_GROUPS.map(jg => {
        const schoolsInGroup = data.filter(s => jg.types.includes(String(s.jenjang || '').toUpperCase()));
        const stats = { lengkap: 0, cukup: 0, kurang: 0, sangatKurang: 0, schoolList: [] };
        
        schoolsInGroup.forEach(s => {
          const cat = auditSarpras(s);
          s.auditCategory = cat;
          stats.schoolList.push(s);
          if (cat === 'Lengkap') stats.lengkap++;
          else if (cat === 'Cukup') stats.cukup++;
          else if (cat === 'Kurang') stats.kurang++;
          else stats.sangatKurang++;
        });

        return {
          rowLabel: jg.label,
          modalTitle: jg.label,
          modalSubtitle: 'Semua Kabupaten/Kota',
          totalRow: stats.lengkap + stats.cukup + stats.kurang + stats.sangatKurang,
          ...stats
        };
      });
    } else {
      const activeGroupDef = JENJANG_GROUPS.find(g => g.id === activeTab);
      return KABUPATEN_LIST.map(kab => {
        const schoolsInGroup = data.filter(s => 
          String(s.kabupaten || '').toUpperCase().includes(kab.toUpperCase()) && 
          activeGroupDef.types.includes(String(s.jenjang || '').toUpperCase())
        );

        const stats = { lengkap: 0, cukup: 0, kurang: 0, sangatKurang: 0, schoolList: [] };
        schoolsInGroup.forEach(s => {
          const cat = auditSarpras(s);
          s.auditCategory = cat;
          stats.schoolList.push(s);
          if (cat === 'Lengkap') stats.lengkap++;
          else if (cat === 'Cukup') stats.cukup++;
          else if (cat === 'Kurang') stats.kurang++;
          else stats.sangatKurang++;
        });

        return {
          rowLabel: kab,
          modalTitle: kab,
          modalSubtitle: activeGroupDef.label,
          totalRow: stats.lengkap + stats.cukup + stats.kurang + stats.sangatKurang,
          ...stats
        };
      });
    }
  }, [data, activeTab]);

  const tableTotals = useMemo(() => {
    return summaryTable.reduce((acc, row) => {
      acc.lengkap += row.lengkap;
      acc.cukup += row.cukup;
      acc.kurang += row.kurang;
      acc.sangatKurang += row.sangatKurang;
      acc.total += row.totalRow;
      return acc;
    }, { lengkap: 0, cukup: 0, kurang: 0, sangatKurang: 0, total: 0 });
  }, [summaryTable]);

  // --- FUNGSI AI ASSISTANT (INTEGRASI GEMINI API DENGAN PROTEKSI KETAT) ---
  const handleSendAiMessage = async () => {
    if (!aiInput.trim()) return;

    const userMessage = { role: 'user', text: aiInput };
    setChatHistory(prev => [...prev, userMessage]);
    setAiInput('');
    setIsAiTyping(true);

    try {
      // Proteksi khusus jika API Key gagal dimuat oleh Vite
      if (!genAI) {
        throw new Error("API_KEY_MISSING");
      }

      const model = genAI.getGenerativeModel({ model: "gemini-pro" });

      const dataContext = `
        Konteks Aplikasi: SITAKA (Sistem Informasi Terpadu Kalimantan Barat)
        Tahun Data yang dianalisis: ${selectedYear}
        Tab yang sedang dibuka user: ${activeTab}
        
        Rekapitulasi Angka Saat Ini:
        - Total Sekolah: ${tableTotals.total.toLocaleString()}
        - Sarpras Lengkap: ${tableTotals.lengkap.toLocaleString()}
        - Sarpras Cukup: ${tableTotals.cukup.toLocaleString()}
        - Sarpras Kurang: ${tableTotals.kurang.toLocaleString()}
        - Sangat Kurang: ${tableTotals.sangatKurang.toLocaleString()}

        Aturan Penilaian Kelayakan:
        1. Kategori "Lengkap": Jika 90% - 100% ruangan wajib berkondisi BAIK.
        2. Kategori "Cukup": Jika 80% - 89% ruangan wajib berkondisi BAIK.
        3. Kategori "Kurang": Jika 50% - 79% ruangan wajib berkondisi BAIK.
        4. Kategori "Sangat Kurang": Jika < 50% ruangan wajib berkondisi BAIK, ATAU tidak memiliki lebih dari 5 ruangan wajib.

        Daftar Ruangan Wajib Berdasarkan Jenjang:
        - PAUD / Inklusif / Non Formal: Kelas, Perpus, Kepsek, Guru, TU, WC Siswa, WC Guru.
        - SD: Sama seperti di atas + Lab Komputer.
        - SMP: Sama seperti SD + Lab IPA.
        - SMA/SMK: Sama seperti SMP + Lab Fisika, Lab Biologi, Lab Bahasa.
      `;

      const prompt = `
        Kamu adalah Asisten Data SITAKA. Jawab pertanyaan user berdasarkan data berikut:
        ${dataContext}
        
        Pertanyaan User: "${userMessage.text}"
        
        Instruksi untuk AI:
        - Jawab dengan bahasa Indonesia yang asik, ramah, dan ringkas. Gunakan sapaan "Sob".
        - Gunakan format markdown (*bold*, list) agar rapi.
        - Jika user bertanya darimana asal usul angka "Lengkap" atau cara hitungnya, jelaskan aturan penilaiannya.
        - Jika pertanyaan tidak relevan dengan data di atas, jawab dengan sopan bahwa kamu hanya bisa menganalisis data sarpras yang sedang aktif.
      `;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      setChatHistory(prev => [...prev, { role: 'ai', text: responseText }]);
    } catch (error) {
      console.error("Error AI:", error);
      
      // Memberikan feedback yang lebih jelas ke user jika error terjadi
      if (error.message === "API_KEY_MISSING" || error.message.includes("API_KEY_INVALID")) {
        setChatHistory(prev => [...prev, { role: 'ai', text: "Maaf Sob, Kunci API Gemini belum terpasang dengan benar di sistem server. Silakan hubungi admin IT (Pastikan penamaan variabel di Netlify adalah VITE_GEMINI_API_KEY)." }]);
      } else {
        setChatHistory(prev => [...prev, { role: 'ai', text: "Maaf Sob, saat ini koneksi ke server AI sedang terganggu atau memakan waktu terlalu lama. Silakan coba tanyakan lagi nanti ya." }]);
      }
    } finally {
      setIsAiTyping(false);
    }
  };

  const downloadDetailExcel = async (title, schoolList) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Detail Sarpras Lengkap');
    
    const columns = [
      { header: 'NPSN', key: 'npsn', width: 15 },
      { header: 'NAMA SEKOLAH', key: 'nama', width: 40 },
      { header: 'JENJANG', key: 'jenjang', width: 10 },
      { header: 'KABUPATEN', key: 'kab', width: 20 },
      { header: 'STATUS KELAYAKAN', key: 'status', width: 20 }
    ];

    Object.entries(ROOM_LABELS).forEach(([roomKey, roomLabel]) => {
      CONDITIONS.forEach(cond => {
        columns.push({
          header: `${roomLabel} - ${cond.label}`,
          key: `${roomKey}_${cond.key}`,
          width: 15
        });
      });
    });

    sheet.columns = columns;

    schoolList.forEach(s => {
      const rowData = { npsn: s.npsn, nama: s.nama_sekolah, jenjang: s.jenjang, kab: s.kabupaten, status: s.auditCategory };
      Object.keys(ROOM_LABELS).forEach(roomKey => {
        CONDITIONS.forEach(cond => { rowData[`${roomKey}_${cond.key}`] = parseInt(s[`${roomKey}_${cond.key}`]) || 0; });
      });
      sheet.addRow(rowData);
    });

    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6B21A8' } }; 
    sheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

    const buffer = await workbook.xlsx.writeBuffer();
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([buffer]));
    link.download = `SITAKA_Rincian_Sarpras_${title.replace(/ /g, '_')}_${selectedYear}.xlsx`;
    link.click();
  };

  const renderCellWithPct = (value, total, colorClass) => {
    const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
    return (
      <div className={`flex items-baseline justify-center gap-1.5 ${colorClass}`}>
        <span className="font-black text-base">{value.toLocaleString()}</span>
        <span className="text-[10px] font-bold opacity-70">({pct}%)</span>
      </div>
    );
  };

  const filteredAndSortedModalList = useMemo(() => {
    if (!activeRowModal) return [];
    let list = activeRowModal.schoolList;

    if (modalSearchQuery) {
      const query = modalSearchQuery.toLowerCase();
      list = list.filter(s => 
        String(s.nama_sekolah || '').toLowerCase().includes(query) ||
        String(s.npsn || '').toLowerCase().includes(query)
      );
    }

    const sortOrder = { 'Lengkap': 1, 'Cukup': 2, 'Kurang': 3, 'Sangat Kurang': 4 };
    return [...list].sort((a, b) => sortOrder[a.auditCategory] - sortOrder[b.auditCategory]);
  }, [activeRowModal, modalSearchQuery]);

  const handleCloseModal = () => {
    setActiveRowModal(null);
    setModalSearchQuery('');
  };

  if (loading) return (
    <div className="h-screen flex flex-col items-center justify-center bg-gray-50 italic font-black uppercase tracking-widest text-gray-400">
      <Loader2 className="animate-spin text-purple-600 mb-4" size={64} />
      Menganalisis Detail Kondisi Sarpras...
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden relative">
      <Header />
      
      <main className="flex-1 flex p-6 gap-6 overflow-hidden relative">
        
        {/* SIDEBAR TAHUN */}
        <div className="w-64 shrink-0 flex flex-col gap-6">
          <button onClick={onBack} className="flex items-center gap-3 p-4 bg-white text-purple-600 rounded-[2rem] shadow-sm border border-gray-100 hover:bg-purple-50 transition-all font-black uppercase text-sm active:scale-95">
            <ArrowLeft size={20} /> Kembali
          </button>

          <div className="bg-white p-4 rounded-[2.5rem] shadow-sm border border-gray-100 flex flex-col gap-2">
            <div className="px-4 py-3">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Tab Tahun</h3>
            </div>
            {["2026", "2025", "2024"].map(y => (
              <button 
                key={y} 
                onClick={() => { setSelectedYear(y); setActiveTab('SEMUA'); }} 
                className={`w-full text-left px-6 py-4 rounded-2xl font-black text-lg transition-all flex justify-between items-center
                  ${selectedYear === y ? 'bg-purple-700 text-white shadow-lg' : 'bg-transparent text-gray-500 hover:bg-gray-100'}`}
              >
                {y}
                {selectedYear === y && <ChevronRight size={20} />}
              </button>
            ))}
          </div>
        </div>

        {/* MAIN CONTENT AREA */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex items-center justify-between mb-4 bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 shrink-0">
            <div className="flex items-center gap-4">
              <div className="bg-purple-100 p-4 rounded-2xl text-purple-600">
                <Building2 size={28} />
              </div>
              <div>
                <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter leading-none">Monitoring Sarana Prasarana</h2>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mt-1">Audit Kelayakan Ruang Belajar & Penunjang Se-Kalbar</p>
              </div>
            </div>
            <div className="bg-purple-50 px-5 py-2 rounded-2xl border border-purple-100 flex items-center gap-2">
              <span className="text-purple-600 font-black uppercase text-sm">Tahun {selectedYear}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-4 shrink-0 overflow-x-auto pb-2 scrollbar-hide">
            {TABS.map(tab => (
              <button 
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-6 py-3 rounded-2xl font-black uppercase text-xs transition-all whitespace-nowrap border-b-4 
                  ${activeTab === tab.id ? 'bg-white text-purple-700 border-purple-700 shadow-md' : 'bg-gray-200/50 text-gray-500 border-transparent hover:bg-white hover:text-purple-500'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex-1 bg-white rounded-[3rem] shadow-xl border border-gray-100 overflow-hidden flex flex-col min-h-0">
            <div className="bg-purple-700 text-white p-4 text-center shrink-0">
              <h3 className="font-black uppercase tracking-widest text-sm">Rekapitulasi {TABS.find(g=>g.id === activeTab).label}</h3>
              <p className="text-[10px] opacity-80 mt-1">
                {activeTab === 'SEMUA' 
                  ? 'Pilih tab jenjang di atas untuk melihat rincian kondisi sekolah masing-masing wilayah.' 
                  : 'Klik pada baris wilayah untuk melihat daftar sekolah secara detail.'}
              </p>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <table className="w-full text-center border-separate border-spacing-y-2">
                <thead className="sticky top-0 bg-white z-10 shadow-sm">
                  <tr className="text-[11px] font-black uppercase text-gray-400 tracking-widest">
                    <th className="px-4 py-4 w-12">No</th>
                    <th className="px-4 py-4 text-left">{activeTab === 'SEMUA' ? 'Jenjang Pendidikan' : 'Kabupaten/Kota'}</th>
                    <th className="px-4 py-4 text-emerald-600">Sarpras Lengkap</th>
                    <th className="px-4 py-4 text-blue-600">Sarpras Cukup</th>
                    <th className="px-4 py-4 text-orange-600">Sarpras Kurang</th>
                    <th className="px-4 py-4 text-red-600">Sgt. Kurang</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryTable.map((row, idx) => (
                    <tr 
                      key={idx} 
                      onClick={() => activeTab !== 'SEMUA' && setActiveRowModal(row)}
                      className={`bg-gray-50 transition-colors group ${activeTab !== 'SEMUA' ? 'hover:bg-purple-50 cursor-pointer active:scale-[0.99]' : ''}`}
                    >
                      <td className={`px-4 py-4 rounded-l-2xl font-black text-gray-400 text-xs ${activeTab !== 'SEMUA' && 'group-hover:text-purple-600'}`}>{idx + 1}</td>
                      <td className={`px-4 py-4 text-left font-black text-gray-700 text-sm uppercase ${activeTab !== 'SEMUA' && 'group-hover:text-purple-800'}`}>
                        <div className="flex items-center gap-2">
                          {row.rowLabel}
                          {activeTab !== 'SEMUA' && <Eye size={14} className="opacity-0 group-hover:opacity-100 text-purple-500 transition-opacity" />}
                        </div>
                      </td>
                      <td className="px-4 py-4">{renderCellWithPct(row.lengkap, row.totalRow, 'text-emerald-600')}</td>
                      <td className="px-4 py-4">{renderCellWithPct(row.cukup, row.totalRow, 'text-blue-600')}</td>
                      <td className="px-4 py-4">{renderCellWithPct(row.kurang, row.totalRow, 'text-orange-600')}</td>
                      <td className="px-4 py-4 rounded-r-2xl">{renderCellWithPct(row.sangatKurang, row.totalRow, 'text-red-600')}</td>
                    </tr>
                  ))}

                  <tr className="bg-purple-100/50 shadow-inner">
                    <td className="px-4 py-5 rounded-l-2xl"></td>
                    <td className="px-4 py-5 text-left font-black text-purple-900 text-base uppercase tracking-wider">TOTAL KESELURUHAN</td>
                    <td className="px-4 py-5">{renderCellWithPct(tableTotals.lengkap, tableTotals.total, 'text-emerald-700')}</td>
                    <td className="px-4 py-5">{renderCellWithPct(tableTotals.cukup, tableTotals.total, 'text-blue-700')}</td>
                    <td className="px-4 py-5">{renderCellWithPct(tableTotals.kurang, tableTotals.total, 'text-orange-700')}</td>
                    <td className="px-4 py-5 rounded-r-2xl">{renderCellWithPct(tableTotals.sangatKurang, tableTotals.total, 'text-red-700')}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* TOUR GUIDE & AI ASSISTANT WIDGET */}
        {/* ========================================================= */}
        
        {/* TOUR GUIDE POPUP */}
        {showTour && !isAiOpen && (
          <div className="fixed bottom-28 right-8 w-[22rem] bg-white rounded-[2rem] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.4)] border-2 border-purple-100 p-6 z-50 animate-in slide-in-from-bottom-8 fade-in duration-500">
            {/* Segitiga Penunjuk (Pointer) */}
            <div className="absolute -bottom-3 right-10 w-5 h-5 bg-white border-b-2 border-r-2 border-purple-100 transform rotate-45"></div>
            
            <div className="relative z-10 flex flex-col gap-3">
              <div className="flex items-center gap-2 text-purple-600">
                <Sparkles size={20} className="animate-pulse" />
                <h4 className="font-black uppercase tracking-tight text-lg">Fitur Baru!</h4>
              </div>
              <p className="text-sm text-gray-600 font-medium leading-relaxed">
                Bingung menganalisis data sebanyak ini? Tanya saja pada <b>Asisten AI</b>! Dia bisa membantu merangkum dan memberi kesimpulan instan.
              </p>
              
              <div className="mt-3 flex flex-col gap-3">
                <label className="flex items-center gap-2 cursor-pointer group w-fit">
                  <input 
                    type="checkbox" 
                    checked={dontShowAgain}
                    onChange={(e) => setDontShowAgain(e.target.checked)}
                    className="w-4 h-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500 cursor-pointer"
                  />
                  <span className="text-[11px] font-black text-gray-400 group-hover:text-gray-600 transition-colors uppercase tracking-wider">Jangan tampilkan lagi</span>
                </label>
                
                <button 
                  onClick={closeTourGuide}
                  className="w-full bg-purple-100 text-purple-700 hover:bg-purple-600 hover:text-white py-3 rounded-xl font-black uppercase text-xs transition-all active:scale-95"
                >
                  OK, Mengerti!
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TOMBOL AI (PILL SHAPE DENGAN TEKS) */}
        <button 
          onClick={() => { setIsAiOpen(true); setShowTour(false); }}
          className={`fixed bottom-8 right-8 px-6 py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-[2rem] shadow-2xl hover:scale-105 active:scale-95 transition-all z-40 flex items-center gap-3 group ${isAiOpen ? 'hidden' : 'flex'}`}
        >
          <Sparkles size={24} className="group-hover:animate-spin" />
          <span className="font-black uppercase tracking-wider text-sm">Tanya Asisten AI</span>
        </button>

        {/* PANEL CHAT AI */}
        {isAiOpen && (
          <div className="fixed bottom-6 right-6 w-[24rem] h-[32rem] bg-white rounded-[2rem] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.5)] border border-gray-200 flex flex-col overflow-hidden z-50 animate-in slide-in-from-bottom-10 fade-in duration-300">
            <div className="bg-gradient-to-r from-purple-700 to-indigo-700 p-4 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/20 rounded-xl"><Bot size={20} /></div>
                <div>
                  <h4 className="font-black tracking-tight leading-tight">SITAKA AI</h4>
                  <p className="text-[9px] font-bold text-purple-200 uppercase tracking-widest">Asisten Analisis Data</p>
                </div>
              </div>
              <button onClick={() => setIsAiOpen(false)} className="p-2 bg-white/10 hover:bg-red-500 rounded-xl transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 bg-gray-50 flex flex-col gap-4">
              {chatHistory.map((chat, idx) => (
                <div key={idx} className={`flex w-full ${chat.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`p-3 max-w-[85%] rounded-2xl text-sm shadow-sm ${
                    chat.role === 'user' 
                      ? 'bg-purple-600 text-white rounded-tr-none' 
                      : 'bg-white border border-gray-100 text-gray-700 rounded-tl-none font-medium whitespace-pre-wrap'
                  }`}>
                    {chat.text}
                  </div>
                </div>
              ))}
              {isAiTyping && (
                <div className="flex w-full justify-start">
                  <div className="p-4 max-w-[80%] rounded-2xl bg-white border border-gray-100 rounded-tl-none flex items-center gap-1 shadow-sm">
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                  </div>
                </div>
              )}
            </div>

            <div className="p-4 bg-white border-t border-gray-100 flex items-center gap-2 shrink-0">
              <input 
                type="text" 
                value={aiInput}
                onChange={(e) => setAiInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendAiMessage()}
                placeholder="Ketik pertanyaanmu..." 
                className="flex-1 bg-gray-100 border-none rounded-xl py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50 font-medium"
              />
              <button 
                onClick={handleSendAiMessage}
                disabled={!aiInput.trim() || isAiTyping}
                className="p-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 transition-colors shadow-md"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        )}
      </main>

      {/* ========================================================= */}
      {/* MODAL RINCIAN SEKOLAH */}
      {/* ========================================================= */}
      {activeRowModal && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-6 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-7xl h-[95vh] rounded-[3rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
            
            <div className="bg-purple-700 p-6 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-4">
                <div className="bg-white/20 p-3 rounded-2xl"><MapPin size={24} /></div>
                <div>
                  <h3 className="text-2xl font-black uppercase tracking-tight">Rincian Sarpras: {activeRowModal.modalTitle}</h3>
                  <p className="text-xs font-bold text-purple-200 uppercase tracking-widest mt-1">
                    {activeRowModal.modalSubtitle} • Tahun {selectedYear}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => downloadDetailExcel(activeRowModal.modalTitle, filteredAndSortedModalList)}
                    className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 px-5 py-3 rounded-xl font-black uppercase text-xs transition-all shadow-lg active:scale-95"
                  >
                    <Download size={16} /> Unduh Format Rinci (.xlsx)
                  </button>
                  <button onClick={handleCloseModal} className="p-3 bg-white/10 hover:bg-red-500 rounded-xl transition-colors">
                    <X size={24} />
                  </button>
                </div>
                <span className="text-[10px] text-purple-200 font-medium flex items-center gap-1">
                  <Info size={12} /> Ingin data per ruangan? Klik unduh format rinci.
                </span>
              </div>
            </div>

            <div className="px-8 py-4 bg-white border-b border-gray-100 flex items-center justify-between shrink-0 shadow-sm z-10">
              <div className="relative w-[28rem]">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Cari Nama Sekolah atau NPSN..." 
                  value={modalSearchQuery}
                  onChange={(e) => setModalSearchQuery(e.target.value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-2xl py-3 pl-12 pr-4 text-sm focus:outline-none focus:border-purple-500 focus:ring-4 focus:ring-purple-500/10 font-bold text-gray-700 transition-all"
                />
              </div>
              <div className="text-xs font-black text-gray-400 uppercase tracking-widest bg-gray-100 px-4 py-2 rounded-xl">
                Menampilkan <span className="text-purple-600">{filteredAndSortedModalList.length}</span> Sekolah
              </div>
            </div>

            <div className="flex-1 overflow-auto p-8 bg-gray-50">
              <div className="flex flex-col gap-6">
                {filteredAndSortedModalList.length === 0 ? (
                  <div className="text-center py-20 text-gray-400 font-black uppercase tracking-widest">
                    {modalSearchQuery ? 'Pencarian Tidak Ditemukan.' : 'Tidak ada data sekolah.'}
                  </div>
                ) : (
                  filteredAndSortedModalList.map((school, i) => {
                    const statusColors = {
                      'Lengkap': 'bg-emerald-100 text-emerald-800 border-emerald-200',
                      'Cukup': 'bg-blue-100 text-blue-800 border-blue-200',
                      'Kurang': 'bg-orange-100 text-orange-800 border-orange-200',
                      'Sangat Kurang': 'bg-red-100 text-red-800 border-red-200'
                    };
                    
                    const reqRooms = getRequiredRooms(String(school.jenjang).toUpperCase());

                    return (
                      <div key={i} className="bg-white p-6 rounded-[2rem] border border-gray-200 shadow-sm flex flex-col gap-4 hover:shadow-lg transition-all">
                        <div className="flex items-center justify-between border-b pb-4">
                          <div className="flex items-center gap-4">
                            <div className="bg-gray-100 text-gray-500 font-mono text-sm px-4 py-2 rounded-xl font-bold border border-gray-200">
                              {school.npsn}
                            </div>
                            <div className="flex flex-col">
                              <span className="font-black text-gray-900 uppercase text-lg leading-tight">{school.nama_sekolah}</span>
                              <span className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">
                                {school.jenjang}
                              </span>
                            </div>
                          </div>
                          <div className={`px-5 py-2.5 rounded-xl border ${statusColors[school.auditCategory]} font-black uppercase text-xs tracking-wider shadow-sm`}>
                            {school.auditCategory}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                          {reqRooms.map((roomKey, idx) => {
                            const label = ROOM_LABELS[roomKey] || roomKey;
                            return (
                              <div key={idx} className="bg-gray-50 border border-gray-100 rounded-xl p-3 flex flex-col gap-2">
                                <span className="text-[10px] font-black text-gray-700 uppercase tracking-wider">{label}</span>
                                <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase">
                                  {CONDITIONS.map(cond => {
                                    const val = parseInt(school[`${roomKey}_${cond.key}`]) || 0;
                                    return (
                                      <span key={cond.key} className={`${cond.color} bg-white px-2 py-1 rounded shadow-sm border border-gray-100`}>
                                        {cond.label}: <span className="font-black text-xs">{val}</span>
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}