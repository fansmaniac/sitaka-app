import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, ChevronLeft, ChevronRight, School, MapPin, CheckCircle, HelpCircle } from 'lucide-react';

// --- UTILITY BACA KOLOM ---
const getVal = (obj, keyName) => {
  if (!obj) return '';
  const key = Object.keys(obj).find(k => k.trim().toLowerCase() === keyName.toLowerCase());
  return key ? obj[key] : '';
};

// --- LOGIKA BACA AKREDITASI ---
const parseAkreditasi = (val) => {
  if (!val) return 'TIDAK_TERAKREDITASI';
  const cleanVal = String(val).trim().toUpperCase();
  
  if (cleanVal === 'A') return 'A';
  if (cleanVal === 'B') return 'B';
  if (cleanVal === 'C') return 'C';
  
  if (cleanVal.includes('TIDAK') || cleanVal === 'TT' || cleanVal === '-') return 'TIDAK_TERAKREDITASI';
  if (cleanVal.includes('TERAKREDITASI')) return 'TERAKREDITASI';
  
  return 'TIDAK_TERAKREDITASI';
};

const AKREDITASI_WEIGHT = {
  'A': 1,
  'B': 2,
  'C': 3,
  'TERAKREDITASI': 4,
  'TIDAK_TERAKREDITASI': 5
};

export default function DetailSekolahModal({ isOpen, onClose, data, jenjang, wilayah, statusFilter }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAkreditasi, setFilterAkreditasi] = useState('SEMUA');
  
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterAkreditasi, jenjang]);

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const processedData = useMemo(() => {
    if (!data) return [];

    let result = data.filter(sekolah => {
      // 1. Filter Jenjang (Dari props yang diklik di tabel utama)
      const jenjangDb = String(getVal(sekolah, 'bentuk_pendidikan') || getVal(sekolah, 'jenjang') || '').trim().toUpperCase();
      if (jenjangDb !== jenjang.toUpperCase()) return false;

      // 2. Filter Status Sekolah (Dari dropdown di halaman induk)
      const statusSekolahDb = String(getVal(sekolah, 'status_sekolah') || '').trim().toUpperCase();
      if (statusFilter !== 'SEMUA') {
          if (statusFilter === 'NEGERI' && statusSekolahDb !== 'NEGERI') return false;
          if (statusFilter === 'SWASTA' && statusSekolahDb !== 'SWASTA') return false;
      }

      // 3. Filter Search Nama Sekolah / NPSN
      if (searchTerm) {
        const nama = String(getVal(sekolah, 'nama_satuan_pendidikan') || getVal(sekolah, 'nama_sekolah') || '').toLowerCase();
        const npsn = String(getVal(sekolah, 'npsn') || '').toLowerCase();
        if (!nama.includes(searchTerm.toLowerCase()) && !npsn.includes(searchTerm.toLowerCase())) return false;
      }

      // 4. Filter Akreditasi (Dari dropdown dalam modal)
      const akrSekolah = parseAkreditasi(getVal(sekolah, 'akreditasi'));
      if (filterAkreditasi !== 'SEMUA' && akrSekolah !== filterAkreditasi) return false;

      return true;
    });

    // Urutkan berdasarkan Akreditasi terbaik, lalu Nama Sekolah
    result.sort((a, b) => {
      const akrA = parseAkreditasi(getVal(a, 'akreditasi'));
      const akrB = parseAkreditasi(getVal(b, 'akreditasi'));
      
      if (AKREDITASI_WEIGHT[akrA] !== AKREDITASI_WEIGHT[akrB]) {
          return AKREDITASI_WEIGHT[akrA] - AKREDITASI_WEIGHT[akrB];
      }

      const namaA = String(getVal(a, 'nama_satuan_pendidikan') || getVal(a, 'nama_sekolah') || '').toUpperCase();
      const namaB = String(getVal(b, 'nama_satuan_pendidikan') || getVal(b, 'nama_sekolah') || '').toUpperCase();
      return namaA.localeCompare(namaB);
    });

    return result;
  }, [data, jenjang, searchTerm, filterAkreditasi, statusFilter]);

  const totalPages = Math.ceil(processedData.length / rowsPerPage) || 1;
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentRows = processedData.slice(startIndex, startIndex + rowsPerPage);

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div 
        className="bg-white w-full max-w-6xl h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300"
        onClick={(e) => e.stopPropagation()} 
      >
        
        {/* HEADER (SKY BLUE THEME) */}
        <div className="bg-sky-600 px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 text-white">
            <div className="bg-white/20 p-2 rounded-xl"><School size={24} /></div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tighter leading-none">Daftar Sekolah {jenjang}</h2>
              <p className="text-sky-100 text-sm font-bold uppercase tracking-widest mt-1">{wilayah} {statusFilter !== 'SEMUA' ? `• ${statusFilter}` : ''}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-white/10 hover:bg-red-500 text-white rounded-xl transition-colors">
            <X size={24} />
          </button>
        </div>

        {/* FILTERS */}
        <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex flex-wrap gap-4 items-center shrink-0">
          
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Cari Nama Sekolah atau NPSN..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-200 transition-all font-bold text-gray-700 placeholder:font-normal"
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

          <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
            <CheckCircle size={16} className="text-gray-400 mr-2" />
            <select 
              value={filterAkreditasi} 
              onChange={(e) => setFilterAkreditasi(e.target.value)} 
              className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer"
            >
              <option value="SEMUA">Semua Akreditasi</option>
              <option value="A">Akreditasi A</option>
              <option value="B">Akreditasi B</option>
              <option value="C">Akreditasi C</option>
              <option value="TERAKREDITASI">Terakreditasi</option>
              <option value="TIDAK_TERAKREDITASI">Tidak Terakreditasi</option>
            </select>
          </div>

        </div>

        {/* TABLE */}
        <div className="flex-1 overflow-auto bg-white p-4">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-white z-10 shadow-sm">
              <tr className="text-xs font-black uppercase text-gray-400 bg-gray-50 border-b-2 border-gray-200">
                <th className="px-4 py-3 text-center rounded-tl-xl w-16">No</th>
                <th className="px-4 py-3">Nama Satuan Pendidikan</th>
                <th className="px-4 py-3 text-center">NPSN</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 rounded-tr-xl text-center">Akreditasi</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.map((row, idx) => {
                const akr = parseAkreditasi(getVal(row, 'akreditasi'));
                const nama = String(getVal(row, 'nama_satuan_pendidikan') || getVal(row, 'nama_sekolah') || '-').toUpperCase();
                const npsn = String(getVal(row, 'npsn') || '-');
                const statusSekolah = String(getVal(row, 'status_sekolah') || '-').toUpperCase();
                const kec = String(getVal(row, 'kecamatan') || '-').toUpperCase();
                
                // Warna Badge Akreditasi
                let badgeColor = 'bg-gray-100 text-gray-600';
                if (akr === 'A') badgeColor = 'bg-sky-100 text-sky-800 border border-sky-300';
                else if (akr === 'B') badgeColor = 'bg-indigo-100 text-indigo-800 border border-indigo-300';
                else if (akr === 'C') badgeColor = 'bg-orange-100 text-orange-800 border border-orange-300';
                else if (akr === 'TERAKREDITASI') badgeColor = 'bg-emerald-100 text-emerald-800 border border-emerald-300';
                else if (akr === 'TIDAK_TERAKREDITASI') badgeColor = 'bg-red-50 text-red-600 border border-red-200';

                // Warna Status (Negeri/Swasta)
                const statusColor = statusSekolah === 'NEGERI' ? 'text-blue-600' : 'text-purple-600';

                return (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-sky-50/50 transition-colors">
                    <td className="px-4 py-4 text-center font-bold text-gray-400 text-xs">
                      {startIndex + idx + 1}
                    </td>
                    <td className="px-4 py-4 font-black text-gray-800 text-sm">
                      {nama}
                      <div className="text-[10px] text-gray-500 mt-1 font-bold flex items-center gap-1">
                         <MapPin size={10} className="text-sky-500" /> KECAMATAN {kec}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center font-black text-gray-600 text-xs tracking-widest">
                      {npsn}
                    </td>
                    <td className={`px-4 py-4 text-center font-black text-[10px] ${statusColor}`}>
                      {statusSekolah}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`px-3 py-1.5 rounded-lg text-[10px] font-black tracking-widest uppercase ${badgeColor}`}>
                        {akr === 'TIDAK_TERAKREDITASI' ? 'TDK TERAKREDITASI' : akr}
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

        {/* FOOTER */}
        <div className="bg-gray-50 p-4 border-t border-gray-200 flex items-center justify-between shrink-0 rounded-b-3xl">
          <p className="text-xs font-bold text-gray-500">
            Menampilkan <span className="text-gray-800">{processedData.length === 0 ? 0 : startIndex + 1}</span> - <span className="text-gray-800">{Math.min(startIndex + rowsPerPage, processedData.length)}</span> dari <span className="text-sky-700 font-black">{processedData.length}</span> sekolah
          </p>
          
          <div className="flex items-center gap-2">
            <button 
              disabled={currentPage === 1}
              onClick={() => goToPage(currentPage - 1)}
              className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-sky-50 disabled:opacity-50 transition-all"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-black text-gray-600 px-2">
              Hal {currentPage} / {totalPages}
            </span>
            <button 
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => goToPage(currentPage + 1)}
              className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-sky-50 disabled:opacity-50 transition-all"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}