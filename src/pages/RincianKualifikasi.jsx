import React, { useState, useMemo } from 'react';
import { 
  ArrowLeft, ChevronLeft, ChevronRight, Search, 
  FileSpreadsheet, MapPin, Filter, Download 
} from 'lucide-react';
import ExcelJS from 'exceljs'; // Pastikan library ini terpasang

export default function RincianKualifikasi({ data, qualificationLabel, onBack, title }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedKab, setSelectedKab] = useState('SEMUA'); 
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);

  // 1. Dapatkan daftar unik Kabupaten
  const listKabupaten = useMemo(() => {
    const unik = [...new Set(data.map(item => String(item['Kabupaten/Kota'] || item['Kab/Kota'] || '').trim()))];
    return unik.filter(k => k !== '').sort();
  }, [data]);

  // 2. LOGIKA PROSES DATA (Search, Filter, Sort)
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

    return result.sort((a, b) => {
      const kabA = String(a['Kabupaten/Kota'] || a['Kab/Kota'] || '').toUpperCase();
      const kabB = String(b['Kabupaten/Kota'] || b['Kab/Kota'] || '').toUpperCase();
      return kabA.localeCompare(kabB);
    });
  }, [data, searchTerm, selectedKab]);

  // 3. FUNGSI UNDUH EXCEL (.xlsx)
  const downloadExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Data Audit Guru');

    // Definisi Header
    worksheet.columns = [
      { header: 'NIK', key: 'nik', width: 25 },
      { header: 'Nama PTK', key: 'nama', width: 35 },
      { header: 'Bentuk Pendidikan', key: 'jenjang', width: 20 },
      { header: 'Kabupaten/Kota', key: 'wilayah', width: 25 },
      { header: 'Status Sekolah', key: 'status', width: 15 },
      { header: 'Kualifikasi', key: 'kualifikasi', width: 20 },
    ];

    // Masukkan Data
    processedData.forEach(item => {
      worksheet.addRow({
        nik: item.NIK || '-',
        nama: item['Nama PTK'],
        jenjang: item['Bentuk Pendidikan'],
        wilayah: item['Kabupaten/Kota'] || item['Kab/Kota'],
        status: item['Status Sekolah'],
        kualifikasi: item['Kualifikasi']
      });
    });

    // Styling Header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' } // Warna Biru SITAKA
    };
    worksheet.getRow(1).font = { color: { argb: 'FFFFFFFF' }, bold: true };

    // Generate & Download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Audit_Guru_${qualificationLabel}_${selectedKab}_${new Date().getTime()}.xlsx`;
    link.click();
  };

  // 4. Logika Paginasi
  const totalPages = Math.ceil(processedData.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentRows = processedData.slice(startIndex, startIndex + rowsPerPage);

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-[2rem] shadow-xl overflow-hidden animate-in slide-in-from-right duration-500">
      {/* HEADER & FILTER AREA */}
      <div className="bg-blue-700 p-6 text-white flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 bg-white/20 rounded-xl hover:bg-white/30 transition-all">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h3 className="text-xl font-black uppercase tracking-tight">Rincian Data Kualifikasi Guru</h3>
              <p className="text-xs opacity-80 font-bold uppercase">
                Kualifikasi: {qualificationLabel === 'SEMUA' ? 'SEMUA JENJANG' : qualificationLabel} | {title}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* TOMBOL UNDUH DATA */}
            <button 
              onClick={downloadExcel}
              className="flex items-center gap-3 bg-emerald-600 hover:bg-emerald-700 text-white px-12 py-5 rounded-3xl font-black uppercase text-sm shadow-2xl transition-all active:scale-95 border-b-4 border-emerald-800"
            >
              <Download size={20} /> Unduh (.xlsx)
            </button>
            
            <div className="bg-white/10 px-4 py-2 rounded-2xl border border-white/20 flex flex-col items-end">
              <span className="text-2xl font-black">{processedData.length.toLocaleString('id-ID')}</span>
              <span className="text-[9px] uppercase font-black opacity-70">Data Lolos Filter</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-blue-300" size={18} />
            <input 
              type="text" 
              placeholder="Cari Nama / NIK..." 
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              className="w-full bg-white/10 border border-white/20 rounded-xl py-2.5 pl-12 pr-4 text-white placeholder:text-blue-300 outline-none font-bold"
            />
          </div>

          <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded-xl border border-white/10">
            <MapPin size={16} className="text-blue-300 ml-2" />
            <select 
              value={selectedKab} 
              onChange={(e) => { setSelectedKab(e.target.value); setCurrentPage(1); }} 
              className="bg-transparent text-xs font-black uppercase outline-none cursor-pointer pr-4"
            >
              <option value="SEMUA" className="text-gray-800">Semua Wilayah</option>
              {listKabupaten.map(kab => (
                <option key={kab} value={kab} className="text-gray-800">{kab}</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2 bg-black/20 p-1.5 rounded-xl border border-white/10">
            <Filter size={16} className="text-blue-300 ml-2" />
            {[10, 20, 50, 100].map(num => (
              <button 
                key={num} 
                onClick={() => { setRowsPerPage(num); setCurrentPage(1); }}
                className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all ${rowsPerPage === num ? 'bg-white text-blue-700 shadow-lg' : 'hover:bg-white/10'}`}
              >
                {num}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* TABLE BODY */}
      <div className="flex-1 overflow-auto p-4">
        <table className="w-full text-left border-separate border-spacing-y-2">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="text-[10px] font-black uppercase text-gray-400 text-center">
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
              <tr key={idx} className="bg-gray-50 hover:bg-blue-50 transition-colors text-center">
                <td className="px-6 py-4 rounded-l-2xl text-[9px] font-black uppercase text-blue-800">
                  {row['Kabupaten/Kota'] || row['Kab/Kota']}
                </td>
                <td className="px-6 py-4 font-mono text-xs text-gray-400">{row.NIK || '-'}</td>
                <td className="px-6 py-4 font-black text-gray-800 text-sm uppercase text-left">{row['Nama PTK']}</td>
                <td className="px-6 py-4 text-xs font-bold text-gray-500">{row['Bentuk Pendidikan']}</td>
                <td className="px-6 py-4">
                   <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${row['Status Sekolah'] === 'NEGERI' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}>
                    {row['Status Sekolah']}
                  </span>
                </td>
                <td className="px-6 py-4 rounded-r-2xl text-xs font-black text-blue-800 italic">{row['Kualifikasi']}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {processedData.length === 0 && (
          <div className="py-20 flex flex-col items-center opacity-20">
            <FileSpreadsheet size={64} />
            <p className="font-black uppercase tracking-widest mt-4 text-xl">Data Tidak Ditemukan</p>
          </div>
        )}
      </div>

      {/* FOOTER PAGINATION */}
      <div className="p-4 border-t bg-gray-50 flex items-center justify-between">
        <p className="text-[10px] font-black uppercase text-gray-400">
          Menampilkan {startIndex + 1} - {Math.min(startIndex + rowsPerPage, processedData.length)} dari {processedData.length} data
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