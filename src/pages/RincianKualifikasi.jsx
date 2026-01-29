import React, { useState, useMemo } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Search, FileSpreadsheet, MapPin, Filter } from 'lucide-react';

export default function RincianKualifikasi({ data, qualificationLabel, onBack, title }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedKab, setSelectedKab] = useState('SEMUA'); 
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);

  // Unik Kabupaten dengan Sanitasi
  const listKabupaten = useMemo(() => {
    const unik = [...new Set(data.map(item => String(item['Kabupaten/Kota'] || item['Kab/Kota'] || '').trim()))];
    return unik.filter(k => k !== '').sort();
  }, [data]);

  // Logika Filter & Sort (Audit Mode)
  const processedData = useMemo(() => {
    let result = [...data];

    if (searchTerm) {
      result = result.filter(item => 
        String(item['Nama PTK'] || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        String(item['NIK'] || '').includes(searchTerm)
      );
    }

    if (selectedKab !== 'SEMUA') {
      result = result.filter(item => 
        String(item['Kabupaten/Kota'] || item['Kab/Kota'] || '').trim().toUpperCase() === selectedKab.toUpperCase()
      );
    }

    // Urut otomatis berdasarkan Kabupaten (A-Z)
    return result.sort((a, b) => {
      const kabA = String(a['Kabupaten/Kota'] || a['Kab/Kota'] || '').toUpperCase();
      const kabB = String(b['Kabupaten/Kota'] || b['Kab/Kota'] || '').toUpperCase();
      return kabA.localeCompare(kabB);
    });
  }, [data, searchTerm, selectedKab]);

  const totalPages = Math.ceil(processedData.length / rowsPerPage);
  const currentRows = processedData.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  return (
    <div className="flex flex-col h-full bg-white rounded-[2rem] shadow-xl overflow-hidden animate-in slide-in-from-right duration-500">
      <div className="bg-blue-700 p-6 text-white flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 bg-white/20 rounded-xl hover:bg-white/30 transition-all"><ArrowLeft size={20} /></button>
            <div>
              <h3 className="text-xl font-black uppercase tracking-tight">Tabel Audit Guru</h3>
              <p className="text-xs opacity-80 font-bold uppercase">Kualifikasi: {qualificationLabel} | {title}</p>
            </div>
          </div>
          <div className="bg-white/10 px-4 py-2 rounded-2xl border border-white/20 flex flex-col items-end">
            <span className="text-2xl font-black">{processedData.length.toLocaleString('id-ID')}</span>
            <span className="text-[9px] uppercase font-black">Data Lolos Filter</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-300" size={18} />
            <input 
              type="text" placeholder="Cari Nama / NIK..." value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full bg-white/10 border border-white/20 rounded-xl py-2.5 pl-12 pr-4 text-white placeholder:text-blue-300 outline-none"
            />
          </div>
          <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded-xl border border-white/10">
            <MapPin size={16} className="text-blue-300 ml-2" />
            <select value={selectedKab} onChange={(e) => { setSelectedKab(e.target.value); setCurrentPage(1); }} className="bg-transparent text-xs font-black uppercase outline-none cursor-pointer pr-4">
              <option value="SEMUA" className="text-gray-800">Semua Wilayah</option>
              {listKabupaten.map(kab => <option key={kab} value={kab} className="text-gray-800">{kab}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <table className="w-full text-left border-separate border-spacing-y-2 text-center">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="text-[10px] font-black uppercase text-gray-400">
              <th className="px-6 py-2">Wilayah</th>
              <th className="px-6 py-2">NIK</th>
              <th className="px-6 py-2">Nama PTK</th>
              <th className="px-6 py-2">Jenjang</th>
              <th className="px-6 py-2">Status</th>
              <th className="px-6 py-2">Kualifikasi</th>
            </tr>
          </thead>
          <tbody>
            {currentRows.map((row, idx) => (
              <tr key={idx} className="bg-gray-50 hover:bg-blue-50 transition-colors">
                <td className="px-6 py-4 rounded-l-2xl text-[9px] font-black uppercase text-blue-800">{row['Kabupaten/Kota'] || row['Kab/Kota']}</td>
                <td className="px-6 py-4 font-mono text-xs text-gray-400">{row.NIK || '-'}</td>
                <td className="px-6 py-4 font-black text-gray-800 text-sm uppercase">{row['Nama PTK']}</td>
                <td className="px-6 py-4 text-xs font-bold text-gray-500">{row['Bentuk Pendidikan']}</td>
                <td className="px-6 py-4 text-[10px] font-black uppercase">{row['Status Sekolah']}</td>
                <td className="px-6 py-4 rounded-r-2xl text-xs font-black text-blue-800">{row['Kualifikasi']}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}