import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom'; // IMPORT PORTAL DARI REACT DOM
import { X, Search, ChevronLeft, ChevronRight, GraduationCap, School, MapPin, BookOpen } from 'lucide-react';

// --- UTILITY BACA KOLOM ---
const getVal = (obj, keyName) => {
  if (!obj) return '';
  const key = Object.keys(obj).find(k => k.trim().toLowerCase() === keyName.toLowerCase());
  return key ? obj[key] : '';
};

// --- NORMALISASI KUALIFIKASI ---
const getKualifikasi = (ptk) => {
  const qual = String(getVal(ptk, 'pendidikan') || getVal(ptk, 'riwayat_pendidikan_formal_gelar_akademik') || '').toUpperCase().trim();
  if (qual === 'S3' || qual === 'S.3') return 'S3';
  if (qual === 'S2' || qual === 'S.2') return 'S2';
  if (qual === 'S1' || qual === 'S.1' || qual === 'D4' || qual === 'D.IV') return 'S1';
  if (qual.includes('SMA') || qual.includes('SMK') || qual.includes('SLTA') || qual.includes('D1') || qual.includes('D2') || qual.includes('D3')) return 'SMA / Sederajat';
  return 'Tidak Diketahui';
};

const KUALIFIKASI_WEIGHT = {
  'S3': 1,
  'S2': 2,
  'S1': 3,
  'SMA / Sederajat': 4,
  'Tidak Diketahui': 5
};

const JENJANG_LIST = ['TK', 'SD', 'SMP', 'SMA', 'SMK', 'SLB', 'PKBM', 'TPA', 'SPS', 'SKB', 'KB'];

export default function RincianKualifikasiModal({ isOpen, onClose, data, wilayah }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterKualifikasi, setFilterKualifikasi] = useState('SEMUA');
  const [filterStatus, setFilterStatus] = useState('SEMUA');
  const [filterJenjang, setFilterJenjang] = useState('SEMUA');
  
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterKualifikasi, filterStatus, filterJenjang]);

  // Handle ESC key to close
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const processedData = useMemo(() => {
    if (!data) return [];

    let result = data.filter(ptk => {
      // 0. WAJIB: Hanya ambil data dengan status_tugas = INDUK (Cegah Data Ganda)
      const statusTugas = String(getVal(ptk, 'status_tugas') || getVal(ptk, 'ptk_induk') || '').trim().toUpperCase();
      if (statusTugas !== 'INDUK' && statusTugas !== '1') return false;

      // 1. Filter Wilayah (Pastikan hanya PTK di wilayah ini yang masuk)
      const kabPtk = String(getVal(ptk, 'kabupaten') || getVal(ptk, 'Kabupaten/Kota') || '').trim().toUpperCase();
      if (kabPtk !== wilayah.toUpperCase()) return false;

      // 2. Filter Search Nama
      if (searchTerm) {
        const nama = String(getVal(ptk, 'nama') || getVal(ptk, 'Nama PTK') || '').toLowerCase();
        if (!nama.includes(searchTerm.toLowerCase())) return false;
      }

      // 3. Filter Kualifikasi
      const kualPtk = getKualifikasi(ptk);
      if (filterKualifikasi !== 'SEMUA' && kualPtk !== filterKualifikasi) return false;

      // 4. Filter Status Sekolah (Baca langsung dari kolom database)
      const statusSekolahDb = String(getVal(ptk, 'status_sekolah') || '').trim().toUpperCase();
      if (filterStatus !== 'SEMUA' && statusSekolahDb !== filterStatus) return false;

      // 5. Filter Jenjang
      const jenjang = String(getVal(ptk, 'bentuk_pendidikan') || getVal(ptk, 'jenjang') || '').trim().toUpperCase();
      if (filterJenjang !== 'SEMUA' && jenjang !== filterJenjang) return false;

      return true;
    });

    // Urutkan berdasarkan Kualifikasi: S3 > S2 > S1 > SMA > Tidak Diketahui
    result.sort((a, b) => {
      const weightA = KUALIFIKASI_WEIGHT[getKualifikasi(a)] || 99;
      const weightB = KUALIFIKASI_WEIGHT[getKualifikasi(b)] || 99;
      return weightA - weightB;
    });

    return result;
  }, [data, wilayah, searchTerm, filterKualifikasi, filterStatus, filterJenjang]);

  // Paginate
  const totalPages = Math.ceil(processedData.length / rowsPerPage) || 1;
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentRows = processedData.slice(startIndex, startIndex + rowsPerPage);

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  if (!isOpen) return null;

  // ISI MODAL (KITA BUNGKUS DENGAN CREATE PORTAL AGAR TEMBUS LAYER)
  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      
      <div 
        className="bg-white w-full max-w-6xl h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()} // Prevent close when clicking inside modal
      >
        
        {/* MODAL HEADER (BLUE) */}
        <div className="bg-blue-700 px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 text-white">
            <div className="bg-white/20 p-2 rounded-xl"><MapPin size={24} /></div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tighter leading-none">Rincian Guru Wilayah</h2>
              <p className="text-blue-200 text-sm font-bold uppercase tracking-widest mt-1">{wilayah}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 hover:bg-red-500 text-white rounded-xl transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* TOOLBAR FILTERS */}
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex flex-wrap gap-4 items-center shrink-0">
          
          {/* SEARCH BAR (WITH CLEAR BUTTON) */}
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Cari Nama Guru..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all font-bold text-gray-700 placeholder:font-normal"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')} 
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors"
              >
                <X size={18} />
              </button>
            )}
          </div>

          {/* FILTER KUALIFIKASI */}
          <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
            <GraduationCap size={16} className="text-gray-400 mr-2" />
            <select 
              value={filterKualifikasi} 
              onChange={(e) => setFilterKualifikasi(e.target.value)} 
              className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer"
            >
              <option value="SEMUA">Semua Kualifikasi</option>
              <option value="S3">S3</option>
              <option value="S2">S2</option>
              <option value="S1">S1</option>
              <option value="SMA / Sederajat">SMA / Sederajat</option>
              <option value="Tidak Diketahui">Tidak Diketahui</option>
            </select>
          </div>

          {/* FILTER STATUS SEKOLAH */}
          <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
            <School size={16} className="text-gray-400 mr-2" />
            <select 
              value={filterStatus} 
              onChange={(e) => setFilterStatus(e.target.value)} 
              className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer"
            >
              <option value="SEMUA">Semua Status</option>
              <option value="NEGERI">Negeri</option>
              <option value="SWASTA">Swasta</option>
            </select>
          </div>

          {/* FILTER JENJANG */}
          <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
            <BookOpen size={16} className="text-gray-400 mr-2" />
            <select 
              value={filterJenjang} 
              onChange={(e) => setFilterJenjang(e.target.value)} 
              className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer"
            >
              <option value="SEMUA">Semua Jenjang</option>
              {JENJANG_LIST.map(j => <option key={j} value={j}>{j}</option>)}
            </select>
          </div>
        </div>

        {/* TABLE BODY */}
        <div className="flex-1 overflow-auto bg-white p-4">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-white z-10 shadow-sm">
              <tr className="text-xs font-black uppercase text-gray-400 bg-gray-50 border-b-2 border-gray-200">
                <th className="px-4 py-3 text-center rounded-tl-xl w-16">No</th>
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3 text-center">Jenjang</th>
                <th className="px-4 py-3 rounded-tr-xl text-center">Kualifikasi Pendidikan</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.map((row, idx) => {
                const qual = getKualifikasi(row);
                // Warna Badge Kualifikasi
                let badgeColor = 'bg-gray-100 text-gray-600';
                if (qual === 'S3') badgeColor = 'bg-blue-900 text-white';
                if (qual === 'S2') badgeColor = 'bg-blue-600 text-white';
                if (qual === 'S1') badgeColor = 'bg-blue-100 text-blue-800';
                if (qual === 'SMA / Sederajat') badgeColor = 'bg-orange-100 text-orange-800';

                return (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-blue-50/50 transition-colors">
                    <td className="px-4 py-4 text-center font-bold text-gray-400 text-xs">
                      {startIndex + idx + 1}
                    </td>
                    <td className="px-4 py-4 font-black text-gray-800 text-sm uppercase">
                      {getVal(row, 'nama') || getVal(row, 'Nama PTK') || '-'}
                      <div className="text-[10px] text-gray-500 mt-1 font-bold">
                         {getVal(row, 'tempat_tugas') || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center font-black text-blue-700 text-xs uppercase">
                      {getVal(row, 'bentuk_pendidikan') || getVal(row, 'jenjang') || '-'}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`px-3 py-1.5 rounded-lg text-xs font-black ${badgeColor}`}>
                        {qual}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {processedData.length === 0 && (
            <div className="py-20 flex flex-col items-center opacity-30 text-gray-500">
              <Search size={64} className="mb-4" />
              <p className="font-black uppercase tracking-widest text-xl">Tidak Ada Data</p>
              <p className="text-sm font-bold mt-2">Coba ubah kata kunci atau filter</p>
            </div>
          )}
        </div>

        {/* MODAL FOOTER - PAGINATION */}
        <div className="bg-gray-50 p-4 border-t border-gray-200 flex items-center justify-between shrink-0 rounded-b-3xl">
          <p className="text-xs font-bold text-gray-500">
            Menampilkan <span className="text-gray-800">{processedData.length === 0 ? 0 : startIndex + 1}</span> - <span className="text-gray-800">{Math.min(startIndex + rowsPerPage, processedData.length)}</span> dari <span className="text-blue-700 font-black">{processedData.length}</span> guru
          </p>
          
          <div className="flex items-center gap-2">
            <button 
              disabled={currentPage === 1}
              onClick={() => goToPage(currentPage - 1)}
              className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-blue-50 disabled:opacity-50 transition-all"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-black text-gray-600 px-2">
              Hal {currentPage} / {totalPages}
            </span>
            <button 
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => goToPage(currentPage + 1)}
              className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-blue-50 disabled:opacity-50 transition-all"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

      </div>
    </div>
  );

  // Kembalikan isi modal langsung ke DOM terluar (body) menggunakan Portal
  return createPortal(modalContent, document.body);
}