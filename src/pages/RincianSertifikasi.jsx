import React, { useState, useMemo } from 'react';
import { 
  ArrowLeft, ChevronLeft, ChevronRight, FileSpreadsheet, 
  MapPin, Filter, Download, Award, Eye, School
} from 'lucide-react';
import ExcelJS from 'exceljs';
import RincianSertifikasiModal from './RincianSertifikasiModal'; 

// Utility akses properti object yang aman
const getVal = (obj, keyName) => {
  if (!obj) return '';
  const key = Object.keys(obj).find(k => k.trim().toLowerCase() === keyName.toLowerCase());
  return key ? obj[key] : '';
};

// Fungsi Penentu Urutan Wilayah Sesuai Pakem Sidebar
const getKabupatenRank = (kabName) => {
  const name = String(kabName).toUpperCase();
  if (name.includes("BENGKAYANG")) return 1;
  if (name.includes("KAPUAS HULU")) return 2;
  if (name.includes("KAYONG UTARA")) return 3;
  if (name.includes("KETAPANG")) return 4;
  if (name.includes("KUBU RAYA")) return 5;
  if (name.includes("LANDAK")) return 6;
  if (name.includes("MELAWI")) return 7;
  if (name.includes("MEMPAWAH")) return 8;
  if (name.includes("SAMBAS")) return 9;
  if (name.includes("SANGGAU")) return 10;
  if (name.includes("SEKADAU")) return 11;
  if (name.includes("SINTANG")) return 12;
  if (name.includes("PONTIANAK")) return 13;
  if (name.includes("SINGKAWANG")) return 14;
  return 99;
};

// Daftar Jenjang untuk Filter
const FILTER_JENJANG = ['TK', 'SD', 'SMP', 'SMA', 'SMK', 'SLB', 'PKBM', 'TPA', 'SPS', 'SKB', 'KB'];

export default function RincianSertifikasi({ data, certificationLabel, onBack, title }) {
  const [selectedKab, setSelectedKab] = useState('SEMUA'); 
  const [selectedJenjang, setSelectedJenjang] = useState('SEMUA'); 
  const [selectedStatus, setSelectedStatus] = useState('SEMUA'); 
  const [rowsPerPage, setRowsPerPage] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);

  // STATE UNTUK MODAL RINCIAN INDIVIDU
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedWilayahModal, setSelectedWilayahModal] = useState('');

  // 1. Ekstrak daftar unik Kabupaten dari data & Urutkan secara Custom
  const listKabupaten = useMemo(() => {
    const unik = [...new Set(data.map(item => String(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota') || '').trim()))];
    return unik.filter(k => k !== '').sort((a, b) => getKabupatenRank(a) - getKabupatenRank(b));
  }, [data]);

  // 2. MESIN PENGHITUNG AGREGASI PER KABUPATEN
  const aggregatedData = useMemo(() => {
    const filteredData = data.filter(item => {
      // WAJIB: Hanya hitung yang berstatus INDUK (Mencegah Data Ganda)
      const statusTugas = String(getVal(item, 'status_tugas') || getVal(item, 'ptk_induk') || '').trim().toUpperCase();
      if (statusTugas !== 'INDUK' && statusTugas !== '1') return false;

      // Filter Wilayah
      const kab = String(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota') || '').trim().toUpperCase();
      if (selectedKab !== 'SEMUA' && kab !== selectedKab.toUpperCase()) return false;

      // Filter Jenjang
      const jenjangDb = String(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang') || '').trim().toUpperCase();
      if (selectedJenjang !== 'SEMUA' && jenjangDb !== selectedJenjang.toUpperCase()) return false;

      // Filter Status Sekolah (BACA LANGSUNG DARI KOLOM DATABASE)
      const statusSekolahDb = String(getVal(item, 'status_sekolah') || '').trim().toUpperCase();
      if (selectedStatus !== 'SEMUA' && statusSekolahDb !== selectedStatus) return false;

      return true;
    });

    const mapAgg = new Map();
    
    filteredData.forEach(ptk => {
       const kab = String(getVal(ptk, 'kabupaten') || getVal(ptk, 'Kabupaten/Kota') || 'TIDAK DIKETAHUI').trim().toUpperCase();
       
       if (!mapAgg.has(kab)) {
           mapAgg.set(kab, {
               wilayah: kab,
               sudah: 0, 
               belum: 0, 
               total: 0
           });
       }

       const row = mapAgg.get(kab);
       
       // Logika Sertifikasi
       const cert = String(getVal(ptk, 'bidang_studi_sertifikasi') || '').trim();
       if (cert !== '' && cert !== '-' && cert.toLowerCase() !== 'null' && cert.toLowerCase() !== 'undefined') {
         row.sudah++;
       } else {
         row.belum++;
       }
       row.total++;
    });

    // Ubah ke Array dan urutkan sesuai pakem wilayah
    return Array.from(mapAgg.values()).sort((a, b) => getKabupatenRank(a.wilayah) - getKabupatenRank(b.wilayah));

  }, [data, selectedKab, selectedJenjang, selectedStatus]);

  // 3. KALKULASI GRAND TOTAL (TOTAL KESELURUHAN KOLOM BAWAH)
  const grandTotals = useMemo(() => {
    return aggregatedData.reduce((acc, curr) => {
      acc.sudah += curr.sudah;
      acc.belum += curr.belum;
      acc.total += curr.total;
      return acc;
    }, { sudah: 0, belum: 0, total: 0 });
  }, [aggregatedData]);

  // 4. FUNGSI UNDUH EXCEL (.xlsx) TERMASUK BARIS TOTAL
  const downloadExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Rekap Sertifikasi');

    // Header Excel (Tanpa kolom Aksi)
    worksheet.columns = [
      { header: 'Wilayah (Kabupaten/Kota)', key: 'wilayah', width: 30 },
      { header: 'Sudah Sertifikasi', key: 'sudah', width: 25 },
      { header: 'Belum Sertifikasi', key: 'belum', width: 25 },
      { header: 'Jumlah', key: 'total', width: 15 },
    ];

    // Data Baris per Wilayah
    aggregatedData.forEach(item => {
      worksheet.addRow({
        wilayah: item.wilayah,
        sudah: item.sudah,
        belum: item.belum,
        total: item.total
      });
    });

    // Data Baris Grand Total
    const totalRow = worksheet.addRow({
      wilayah: 'TOTAL KESELURUHAN',
      sudah: grandTotals.sudah,
      belum: grandTotals.belum,
      total: grandTotals.total
    });

    // Styling Header
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } }; 
    
    // Styling Baris Total
    totalRow.font = { bold: true, color: { argb: 'FF064E3B' } };
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Rekap_Sertifikasi_Guru_${new Date().getTime()}.xlsx`;
    link.click();
  };

  // 5. LOGIKA PAGINASI
  const totalPages = Math.ceil(aggregatedData.length / rowsPerPage) || 1;
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentRows = aggregatedData.slice(startIndex, startIndex + rowsPerPage);

  const goToPage = (page) => {
    if (page >= 1 && page <= totalPages) setCurrentPage(page);
  };

  // Fungsi Action saat klik Rincian
  const handleLihatRincian = (wilayah) => {
    setSelectedWilayahModal(wilayah);
    setModalOpen(true);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-[2rem] shadow-xl overflow-hidden animate-in slide-in-from-right duration-500 relative">
      
      {/* HEADER & FILTER AREA */}
      <div className="bg-emerald-600 p-6 text-white flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 bg-white/20 rounded-xl hover:bg-white/30 transition-all">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h3 className="text-xl font-black uppercase tracking-tight">Rekap Sertifikasi Guru Per Wilayah</h3>
              <p className="text-xs opacity-90 font-bold uppercase tracking-widest mt-1">
                 {title}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={downloadExcel}
              className="flex items-center gap-2 bg-emerald-800 hover:bg-emerald-900 text-white px-6 py-3 rounded-2xl font-black uppercase text-xs shadow-lg transition-all active:scale-95 border-b-4 border-emerald-950"
            >
              <Download size={16} /> Unduh Tabel
            </button>
          </div>
        </div>

        {/* BARIS FILTER */}
        <div className="flex flex-wrap gap-3 items-center">
          
          {/* Filter Kabupaten */}
          <div className="flex items-center gap-2 bg-black/20 p-2 rounded-xl border border-white/10 flex-1 min-w-[200px]">
            <MapPin size={16} className="text-emerald-100 ml-1" />
            <select 
              value={selectedKab} 
              onChange={(e) => { setSelectedKab(e.target.value); setCurrentPage(1); }} 
              className="bg-transparent text-xs font-black uppercase outline-none cursor-pointer w-full text-white"
            >
              <option value="SEMUA" className="text-gray-800">Semua Wilayah</option>
              {listKabupaten.map(kab => (
                <option key={kab} value={kab} className="text-gray-800">{kab}</option>
              ))}
            </select>
          </div>

          {/* Filter Jenjang */}
          <div className="flex items-center gap-2 bg-black/20 p-2 rounded-xl border border-white/10 flex-1 min-w-[150px]">
            <Award size={16} className="text-emerald-100 ml-1" />
            <select 
              value={selectedJenjang} 
              onChange={(e) => { setSelectedJenjang(e.target.value); setCurrentPage(1); }} 
              className="bg-transparent text-xs font-black uppercase outline-none cursor-pointer w-full text-white"
            >
              <option value="SEMUA" className="text-gray-800">Semua Jenjang</option>
              {FILTER_JENJANG.map(j => (
                <option key={j} value={j} className="text-gray-800">{j}</option>
              ))}
            </select>
          </div>

          {/* Filter Status Sekolah */}
          <div className="flex items-center gap-2 bg-black/20 p-2 rounded-xl border border-white/10 flex-1 min-w-[150px]">
            <School size={16} className="text-emerald-100 ml-1" />
            <select 
              value={selectedStatus} 
              onChange={(e) => { setSelectedStatus(e.target.value); setCurrentPage(1); }} 
              className="bg-transparent text-xs font-black uppercase outline-none cursor-pointer w-full text-white"
            >
              <option value="SEMUA" className="text-gray-800">Semua Status</option>
              <option value="NEGERI" className="text-gray-800">Negeri</option>
              <option value="SWASTA" className="text-gray-800">Swasta</option>
            </select>
          </div>

          {/* Pengaturan Baris */}
          <div className="flex items-center gap-1 bg-black/20 p-1.5 rounded-xl border border-white/10 shrink-0">
            <Filter size={16} className="text-emerald-100 ml-2 mr-1" />
            {[10, 20, 50].map(num => (
              <button 
                key={num} 
                onClick={() => { setRowsPerPage(num); setCurrentPage(1); }}
                className={`px-3 py-1 rounded-lg text-[10px] font-black transition-all ${rowsPerPage === num ? 'bg-white text-emerald-700 shadow-md' : 'hover:bg-white/10 text-white'}`}
              >
                {num}
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* TABLE BODY */}
      <div className="flex-1 overflow-auto p-6 bg-gray-50/50 relative">
        <table className="w-full text-left border-separate border-spacing-y-2">
          
          {/* THEAD */}
          <thead className="sticky top-0 bg-gray-100 z-20 rounded-xl shadow-sm">
            <tr className="text-[10px] font-black uppercase text-gray-500 text-center">
              <th className="px-6 py-3 text-left rounded-l-xl">Wilayah</th>
              <th className="px-4 py-3">Sudah Sertifikasi</th>
              <th className="px-4 py-3">Belum Sertifikasi</th>
              <th className="px-4 py-3 text-emerald-600">Jumlah</th>
              <th className="px-6 py-3 rounded-r-xl">Aksi</th>
            </tr>
          </thead>
          
          {/* TBODY */}
          <tbody>
            {currentRows.map((row, idx) => (
              <tr key={idx} className="bg-white shadow-sm hover:shadow-md hover:scale-[1.01] transition-all text-center group cursor-default">
                <td className="px-6 py-4 rounded-l-2xl font-black text-gray-800 uppercase text-left border-y border-l border-gray-100">
                  {row.wilayah}
                </td>
                <td className="px-4 py-4 font-black text-emerald-600 text-base border-y border-gray-100">{row.sudah.toLocaleString()}</td>
                <td className="px-4 py-4 font-bold text-red-500 border-y border-gray-100">{row.belum.toLocaleString()}</td>
                
                {/* KOLOM JUMLAH PER BARIS */}
                <td className="px-4 py-4 font-black text-emerald-700 text-lg border-y border-gray-100 bg-emerald-50/30">
                  {row.total.toLocaleString()}
                </td>

                <td className="px-6 py-4 rounded-r-2xl border-y border-r border-gray-100">
                   <button 
                      onClick={() => handleLihatRincian(row.wilayah)}
                      className="flex items-center justify-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-600 hover:text-white transition-colors mx-auto"
                   >
                     <Eye size={14} /> Rincian
                   </button>
                </td>
              </tr>
            ))}
          </tbody>

          {/* TFOOT: BARIS TOTAL KESELURUHAN (STICKY BOTTOM) */}
          {aggregatedData.length > 0 && (
            <tfoot className="sticky bottom-0 z-20 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
              <tr className="bg-emerald-50 text-center font-black uppercase text-sm border-t-2 border-emerald-200">
                <td className="px-6 py-4 text-left rounded-l-2xl border-y border-l border-emerald-200 text-emerald-900">
                  TOTAL KESELURUHAN
                </td>
                <td className="px-4 py-4 text-emerald-700 border-y border-emerald-200">{grandTotals.sudah.toLocaleString()}</td>
                <td className="px-4 py-4 text-red-600 border-y border-emerald-200">{grandTotals.belum.toLocaleString()}</td>
                <td className="px-4 py-4 text-emerald-800 border-y border-emerald-200 text-lg bg-emerald-100/50">{grandTotals.total.toLocaleString()}</td>
                <td className="px-6 py-4 rounded-r-2xl border-y border-r border-emerald-200"></td>
              </tr>
            </tfoot>
          )}
        </table>

        {aggregatedData.length === 0 && (
          <div className="py-20 flex flex-col items-center opacity-30">
            <FileSpreadsheet size={64} className="mb-4" />
            <p className="font-black uppercase tracking-widest text-xl">Data Tidak Ditemukan</p>
            <p className="text-sm font-bold mt-2">Ubah kombinasi filter di atas</p>
          </div>
        )}
      </div>

      {/* FOOTER PAGINATION */}
      <div className="p-4 border-t bg-white flex items-center justify-between shadow-[0_-4px_10px_rgba(0,0,0,0.02)] z-30 relative">
        <p className="text-[10px] font-black uppercase text-gray-400">
          Menampilkan Wilayah {startIndex + 1} - {Math.min(startIndex + rowsPerPage, aggregatedData.length)} dari {aggregatedData.length}
        </p>
        
        <div className="flex items-center gap-2">
          <button 
            disabled={currentPage === 1}
            onClick={() => goToPage(currentPage - 1)}
            className="p-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-600 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-30 transition-all"
          >
            <ChevronLeft size={20} />
          </button>
          
          <div className="flex gap-1">
            {[...Array(totalPages)].map((_, i) => i + 1)
              .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
              .map((p, i, arr) => (
                <React.Fragment key={p}>
                  {i > 0 && arr[i-1] !== p-1 && <span className="px-2 opacity-30 flex items-end pb-1">...</span>}
                  <button 
                    onClick={() => goToPage(p)}
                    className={`w-8 h-8 rounded-lg text-xs font-black transition-all ${currentPage === p ? 'bg-emerald-600 text-white shadow-md' : 'bg-white border hover:bg-gray-50 text-gray-600'}`}
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
            className="p-2 rounded-xl bg-gray-50 border border-gray-200 text-gray-600 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-30 transition-all"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* MODAL RINCIAN INDIVIDU */}
      <RincianSertifikasiModal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)} 
        data={data} 
        wilayah={selectedWilayahModal} 
      />

    </div>
  );
}