import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, ChevronLeft, ChevronRight, Briefcase, School, MapPin, BookOpen } from 'lucide-react';

// --- UTILITY BACA KOLOM ---
const getVal = (obj, keyName) => {
  if (!obj) return '';
  const key = Object.keys(obj).find(k => k.trim().toLowerCase() === keyName.toLowerCase());
  return key ? obj[key] : '';
};

// --- NORMALISASI STATUS KEPEGAWAIAN UNTUK TABEL & FILTER ---
const getStatusKepegawaian = (ptk) => {
  const sp = String(getVal(ptk, 'status_kepegawaian') || '').toUpperCase();
  if (sp.includes('PNS')) return 'PNS';
  if (sp.includes('PPPK')) return 'PPPK';
  if (sp.includes('GTY') || sp.includes('PTY') || sp.includes('YAYASAN')) return 'GTY/PTY';
  if (sp.includes('SEKOLAH') || sp.includes('HONORER SEKOLAH')) return 'Honor Sekolah';
  if (sp.includes('DAERAH') || sp.includes('HONORER DAERAH') || sp.includes('KAB') || sp.includes('PROV')) return 'Honor Daerah';
  return 'Lainnya';
};

// Pengurutan prioritas: PNS -> PPPK -> GTY -> Honor Daerah -> Honor Sekolah -> Lainnya
const KEPEGAWAIAN_WEIGHT = {
  'PNS': 1,
  'PPPK': 2,
  'GTY/PTY': 3,
  'Honor Daerah': 4,
  'Honor Sekolah': 5,
  'Lainnya': 6
};

// =====================================================================
// MAPPING STRUKTUR KATEGORI BARU (SINKRON 100% DENGAN DAPODIK GURU)
// =====================================================================
const KATEGORI_MAPPING = {
  'PAUD': ['TK', 'KB', 'TPA', 'SPS'],
  'PENDIDIKAN DASAR': ['SD', 'SPK SD', 'SMP', 'SPK SMP'],
  'PENDIDIKAN MENENGAH': ['SMA', 'SPK SMA', 'SMK'],
  'PENDIDIKAN INKLUSIF': ['SLB', 'SDLB', 'SMPLB', 'SMALB'],
  'PENDIDIKAN NON FORMAL': ['PKBM', 'SKB']
};

const SEMUA_SUBTABS_MAPPING = {
  'PAUD': ['TK', 'KB', 'TPA', 'SPS'],
  'SD': ['SD', 'SPK SD'],
  'SMP': ['SMP', 'SPK SMP'],
  'SMA': ['SMA', 'SPK SMA'],
  'SMK': ['SMK'],
  'SLB (Inklusif)': ['SLB', 'SDLB', 'SMPLB', 'SMALB'],
  'NON FORMAL': ['PKBM', 'SKB']
};

const isJenjangValid = (jenjangDb, targetJenjang) => {
  if (targetJenjang === 'SEMUA' || targetJenjang === 'SEMUA JENJANG') return true;
  
  if (KATEGORI_MAPPING[targetJenjang]) {
      return KATEGORI_MAPPING[targetJenjang].includes(jenjangDb);
  }
  
  if (SEMUA_SUBTABS_MAPPING[targetJenjang]) {
      return SEMUA_SUBTABS_MAPPING[targetJenjang].includes(jenjangDb);
  }
  
  return jenjangDb === targetJenjang;
};

// Daftar Jenjang untuk Dropdown Filter Modal (Sinkron dengan Mapping)
const FILTER_JENJANG = [
  'PAUD', 'SD', 'SMP', 'SMA', 'SMK', 'SLB (Inklusif)', 'NON FORMAL'
];

export default function RincianStatusKepegawaianModal({ isOpen, onClose, data, wilayah }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPegawai, setFilterPegawai] = useState('SEMUA');
  const [filterStatusSekolah, setFilterStatusSekolah] = useState('SEMUA');
  const [filterJenjang, setFilterJenjang] = useState('SEMUA');
  
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterPegawai, filterStatusSekolah, filterJenjang]);

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

      // 1. Filter Wilayah 
      const kabPtk = String(getVal(ptk, 'kabupaten') || getVal(ptk, 'Kabupaten/Kota') || '').trim().toUpperCase();
      if (kabPtk !== wilayah.toUpperCase()) return false;

      // 2. Filter Search Nama
      if (searchTerm) {
        const nama = String(getVal(ptk, 'nama') || getVal(ptk, 'Nama PTK') || '').toLowerCase();
        if (!nama.includes(searchTerm.toLowerCase())) return false;
      }

      // 3. Filter Status Kepegawaian Khusus (PNS, PPPK, dll)
      const jenisPegawai = getStatusKepegawaian(ptk);
      if (filterPegawai !== 'SEMUA' && jenisPegawai !== filterPegawai) return false;

      // 4. Filter Status Sekolah (Baca langsung dari kolom database)
      const statusSekolahDb = String(getVal(ptk, 'status_sekolah') || '').trim().toUpperCase();
      if (filterStatusSekolah !== 'SEMUA' && statusSekolahDb !== filterStatusSekolah) return false;

      // 5. Filter Jenjang menggunakan Logika Mapping Sinkron
      const jenjang = String(getVal(ptk, 'bentuk_pendidikan') || getVal(ptk, 'jenjang') || '').trim().toUpperCase();
      if (!isJenjangValid(jenjang, filterJenjang)) return false;

      return true;
    });

    // Urutkan berdasarkan hierarki kepegawaian lalu nama
    result.sort((a, b) => {
      const weightA = KEPEGAWAIAN_WEIGHT[getStatusKepegawaian(a)] || 99;
      const weightB = KEPEGAWAIAN_WEIGHT[getStatusKepegawaian(b)] || 99;
      if (weightA !== weightB) return weightA - weightB;

      const namaA = String(getVal(a, 'nama') || getVal(a, 'Nama PTK') || '').toUpperCase();
      const namaB = String(getVal(b, 'nama') || getVal(b, 'Nama PTK') || '').toUpperCase();
      return namaA.localeCompare(namaB);
    });

    return result;
  }, [data, wilayah, searchTerm, filterPegawai, filterStatusSekolah, filterJenjang]);

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
        
        {/* HEADER (PURPLE THEME) */}
        <div className="bg-purple-700 px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 text-white">
            <div className="bg-white/20 p-2 rounded-xl"><MapPin size={24} /></div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tighter leading-none">Rincian Guru Wilayah</h2>
              <p className="text-purple-200 text-sm font-bold uppercase tracking-widest mt-1">{wilayah}</p>
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
              placeholder="Cari Nama Guru..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all font-bold text-gray-700 placeholder:font-normal"
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
            <Briefcase size={16} className="text-gray-400 mr-2" />
            <select 
              value={filterPegawai} 
              onChange={(e) => setFilterPegawai(e.target.value)} 
              className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer"
            >
              <option value="SEMUA">Semua Status Pegawai</option>
              <option value="PNS">PNS</option>
              <option value="PPPK">PPPK</option>
              <option value="GTY/PTY">GTY/PTY</option>
              <option value="Honor Daerah">Honor Daerah</option>
              <option value="Honor Sekolah">Honor Sekolah</option>
              <option value="Lainnya">Lainnya</option>
            </select>
          </div>

          <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
            <School size={16} className="text-gray-400 mr-2" />
            <select 
              value={filterStatusSekolah} 
              onChange={(e) => setFilterStatusSekolah(e.target.value)} 
              className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer"
            >
              <option value="SEMUA">Semua Status</option>
              <option value="NEGERI">Negeri</option>
              <option value="SWASTA">Swasta</option>
            </select>
          </div>

          <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
            <BookOpen size={16} className="text-gray-400 mr-2" />
            <select 
              value={filterJenjang} 
              onChange={(e) => setFilterJenjang(e.target.value)} 
              className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer"
            >
              <option value="SEMUA">Semua Jenjang</option>
              {FILTER_JENJANG.map(j => <option key={j} value={j}>{j}</option>)}
            </select>
          </div>
        </div>

        {/* TABLE */}
        <div className="flex-1 overflow-auto bg-white p-4">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-white z-10 shadow-sm">
              <tr className="text-xs font-black uppercase text-gray-400 bg-gray-50 border-b-2 border-gray-200">
                <th className="px-4 py-3 text-center rounded-tl-xl w-16">No</th>
                <th className="px-4 py-3">Nama</th>
                <th className="px-4 py-3 text-center">Jenjang</th>
                <th className="px-4 py-3 rounded-tr-xl text-center">Status Kepegawaian</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.map((row, idx) => {
                const statusPegawai = getStatusKepegawaian(row);
                const jenjang = String(getVal(row, 'bentuk_pendidikan') || getVal(row, 'jenjang') || '-').toUpperCase();
                
                // Warna Badge Status Pegawai (Tema Ungu/Purple)
                let badgeColor = 'bg-gray-100 text-gray-600';
                if (statusPegawai === 'PNS') badgeColor = 'bg-purple-900 text-white';
                if (statusPegawai === 'PPPK') badgeColor = 'bg-purple-600 text-white';
                if (statusPegawai === 'GTY/PTY') badgeColor = 'bg-purple-200 text-purple-900';
                if (statusPegawai === 'Honor Daerah') badgeColor = 'bg-indigo-100 text-indigo-800';
                if (statusPegawai === 'Honor Sekolah') badgeColor = 'bg-slate-200 text-slate-800';

                return (
                  <tr key={idx} className="border-b border-gray-100 hover:bg-purple-50/50 transition-colors">
                    <td className="px-4 py-4 text-center font-bold text-gray-400 text-xs">
                      {startIndex + idx + 1}
                    </td>
                    <td className="px-4 py-4 font-black text-gray-800 text-sm uppercase">
                      {getVal(row, 'nama') || getVal(row, 'Nama PTK') || '-'}
                      <div className="text-[10px] text-gray-500 mt-1 font-bold">
                         {getVal(row, 'tempat_tugas') || '-'}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center font-black text-purple-700 text-xs uppercase">
                      {jenjang}
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`px-3 py-1.5 rounded-lg text-xs font-black ${badgeColor}`}>
                        {statusPegawai}
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
            Menampilkan <span className="text-gray-800">{processedData.length === 0 ? 0 : startIndex + 1}</span> - <span className="text-gray-800">{Math.min(startIndex + rowsPerPage, processedData.length)}</span> dari <span className="text-purple-700 font-black">{processedData.length}</span> guru
          </p>
          
          <div className="flex items-center gap-2">
            <button 
              disabled={currentPage === 1}
              onClick={() => goToPage(currentPage - 1)}
              className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-purple-50 hover:text-purple-700 disabled:opacity-50 transition-all"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs font-black text-gray-600 px-2">
              Hal {currentPage} / {totalPages}
            </span>
            <button 
              disabled={currentPage === totalPages || totalPages === 0}
              onClick={() => goToPage(currentPage + 1)}
              className="p-2 rounded-xl bg-white border border-gray-200 hover:bg-purple-50 hover:text-purple-700 disabled:opacity-50 transition-all"
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