import React, { useState, useMemo } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Search, FileSpreadsheet } from 'lucide-react';

export default function RincianKualifikasi({ data, qualificationLabel, onBack, title }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);

  // 1. Filter Data berdasarkan Search (Nama atau NIK)
  const filteredData = useMemo(() => {
    return data.filter(item => 
      String(item['Nama PTK'] || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(item['NIK'] || '').includes(searchTerm)
    );
  }, [data, searchTerm]);

  // 2. Logika Paginasi
  const totalPages = Math.ceil(filteredData.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentRows = filteredData.slice(startIndex, startIndex + rowsPerPage);

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-[2rem] shadow-xl overflow-hidden animate-in fade-in duration-500">
      {/* HEADER TABEL */}
      <div className="bg-blue-700 p-6 text-white flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 bg-white/20 rounded-xl hover:bg-white/30 transition-all">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h3 className="text-xl font-black uppercase tracking-tight">Rincian Individu Guru</h3>
              <p className="text-xs opacity-80 font-bold uppercase">Kualifikasi: {qualificationLabel} | {title}</p>
            </div>
          </div>
          <div className="bg-white/10 px-4 py-2 rounded-2xl border border-white/20">
            <span className="text-2xl font-black">{filteredData.length.toLocaleString('id-ID')}</span>
            <span className="text-[10px] ml-2 uppercase opacity-70">Total Terdeteksi</span>
          </div>
        </div>

        {/* FILTER & SEARCH */}
        <div className="flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-300" size={18} />
            <input 
              type="text" 
              placeholder="Cari Nama atau NIK..." 
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full bg-white/10 border border-white/20 rounded-xl py-2 pl-12 pr-4 text-white placeholder:text-blue-300 focus:outline-none focus:bg-white/20 transition-all"
            />
          </div>
          
          <div className="flex items-center gap-2 bg-black/20 p-1 rounded-xl">
            <span className="text-[10px] font-black uppercase ml-2 text-blue-200">Tampilkan:</span>
            {[10, 20, 30, 40, 50].map(num => (
              <button 
                key={num} 
                onClick={() => { setRowsPerPage(num); setCurrentPage(1); }}
                className={`px-3 py-1 rounded-lg text-xs font-black transition-all ${rowsPerPage === num ? 'bg-white text-blue-700 shadow-lg' : 'hover:bg-white/10'}`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* BODY TABEL */}
      <div className="flex-1 overflow-auto p-4">
        <table className="w-full text-left border-separate border-spacing-y-2">
          <thead>
            <tr className="text-[10px] font-black uppercase text-gray-400 tracking-widest">
              <th className="px-6 py-2">NIK</th>
              <th className="px-6 py-2">Nama PTK</th>
              <th className="px-6 py-2">Jenjang</th>
              <th className="px-6 py-2">Kabupaten/Kota</th>
              <th className="px-6 py-2">Status</th>
              <th className="px-6 py-2">Kualifikasi</th>
            </tr>
          </thead>
          <tbody>
            {currentRows.map((row, idx) => (
              <tr key={idx} className="bg-gray-50 hover:bg-blue-50 transition-colors group">
                <td className="px-6 py-4 rounded-l-2xl font-mono text-xs text-blue-600 font-bold">{row.NIK || '-'}</td>
                <td className="px-6 py-4 font-black text-gray-800 text-sm uppercase">{row['Nama PTK']}</td>
                <td className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">{row['Bentuk Pendidikan']}</td>
                <td className="px-6 py-4 text-xs font-bold text-gray-500 uppercase">{row['Kabupaten/Kota'] || row['Kab/Kota']}</td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${row['Status Sekolah'] === 'NEGERI' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                    {row['Status Sekolah']}
                  </span>
                </td>
                <td className="px-6 py-4 rounded-r-2xl text-xs font-black text-blue-800">{row['Kualifikasi']}</td>
              </tr>
            ))}
          </tbody>
        </table>
        
        {filteredData.length === 0 && (
          <div className="py-20 flex flex-col items-center opacity-20">
            <FileSpreadsheet size={64} />
            <p className="font-black uppercase tracking-widest mt-4 text-xl">Data Tidak Ditemukan</p>
          </div>
        )}
      </div>

      {/* FOOTER PAGINASI */}
      <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
        <p className="text-[10px] font-black uppercase text-gray-400">
          Menampilkan {startIndex + 1} - {Math.min(startIndex + rowsPerPage, filteredData.length)} dari {filteredData.length} data
        </p>
        
        <div className="flex items-center gap-2">
          <button 
            disabled={currentPage === 1}
            onClick={() => goToPage(currentPage - 1)}
            className="p-2 rounded-xl bg-white border shadow-sm hover:bg-gray-100 disabled:opacity-30 transition-all"
          >
            <ChevronLeft size={20} />
          </button>
          
          <div className="flex gap-1">
            {/* Hanya tampilkan maksimal 5 tombol halaman */}
            {[...Array(totalPages)].map((_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .map((p, i, arr) => (
                <React.Fragment key={p}>
                  {i > 0 && arr[i-1] !== p-1 && <span className="px-2 opacity-30">...</span>}
                  <button 
                    onClick={() => goToPage(p)}
                    className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${currentPage === p ? 'bg-blue-700 text-white shadow-lg' : 'bg-white border hover:bg-gray-100'}`}
                  >
                    {p}
                  </button>
                </React.Fragment>
              ))
            }
          </div>

          <button 
            disabled={currentPage === totalPages}
            onClick={() => goToPage(currentPage + 1)}
            className="p-2 rounded-xl bg-white border shadow-sm hover:bg-gray-100 disabled:opacity-30 transition-all"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}