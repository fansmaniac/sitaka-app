import React, { useState, useMemo } from 'react';
import { 
  ArrowLeft, FileSpreadsheet, Filter, Download, 
  School, CheckCircle, Eye 
} from 'lucide-react';
import ExcelJS from 'exceljs';
import DetailSekolahModal from './DetailSekolahModal'; // Nanti kita buat file modalnya

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
  
  return 'TIDAK_TERAKREDITASI'; // Jika blank atau format aneh lainnya
};

const JENJANG_LIST = ['TK', 'SD', 'SMP', 'SMA', 'SMK', 'SLB', 'PKBM', 'TPA', 'SPS', 'SKB', 'KB'];

export default function DetailSekolah({ data, onBack, title, selectedYear }) {
  const [selectedStatus, setSelectedStatus] = useState('SEMUA'); 
  
  // STATE MODAL
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedJenjangModal, setSelectedJenjangModal] = useState('');

  // MESIN PENGHITUNG AGREGASI PER JENJANG
  const aggregatedData = useMemo(() => {
    // 1. Filter Status Sekolah
    const filteredData = data.filter(item => {
      const statusSekolahDb = String(getVal(item, 'status_sekolah') || '').trim().toUpperCase();
      if (selectedStatus !== 'SEMUA') {
          if (selectedStatus === 'NEGERI' && statusSekolahDb !== 'NEGERI') return false;
          if (selectedStatus === 'SWASTA' && statusSekolahDb !== 'SWASTA') return false;
      }
      return true;
    });

    // 2. Siapkan wadah (Map) per Jenjang
    const mapAgg = new Map();
    JENJANG_LIST.forEach(j => {
      mapAgg.set(j, { jenjang: j, A: 0, B: 0, C: 0, TERAKREDITASI: 0, TIDAK_TERAKREDITASI: 0, total: 0 });
    });

    // 3. Mulai menghitung
    filteredData.forEach(sekolah => {
       const jenjangRaw = String(getVal(sekolah, 'bentuk_pendidikan') || getVal(sekolah, 'jenjang') || '').trim().toUpperCase();
       
       // Pastikan jenjang ada di list kita
       if (mapAgg.has(jenjangRaw)) {
           const row = mapAgg.get(jenjangRaw);
           const akr = parseAkreditasi(getVal(sekolah, 'akreditasi'));
           
           if (akr === 'A') row.A++;
           else if (akr === 'B') row.B++;
           else if (akr === 'C') row.C++;
           else if (akr === 'TERAKREDITASI') row.TERAKREDITASI++;
           else row.TIDAK_TERAKREDITASI++;
           
           row.total++;
       }
    });

    // Ubah jadi Array, lalu hilangkan jenjang yang nilainya 0 (biar UI lebih bersih)
    return Array.from(mapAgg.values()).filter(row => row.total > 0);

  }, [data, selectedStatus]);

  // KALKULASI GRAND TOTAL
  const grandTotals = useMemo(() => {
    return aggregatedData.reduce((acc, curr) => {
      acc.A += curr.A;
      acc.B += curr.B;
      acc.C += curr.C;
      acc.TERAKREDITASI += curr.TERAKREDITASI;
      acc.TIDAK_TERAKREDITASI += curr.TIDAK_TERAKREDITASI;
      acc.total += curr.total;
      return acc;
    }, { A: 0, B: 0, C: 0, TERAKREDITASI: 0, TIDAK_TERAKREDITASI: 0, total: 0 });
  }, [aggregatedData]);

  // FUNGSI UNDUH EXCEL
  const downloadExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Rekap Akreditasi');

    // Header Lapis 1 & 2
    worksheet.mergeCells('A1:A2'); worksheet.getCell('A1').value = 'Jenjang';
    worksheet.mergeCells('B1:F1'); worksheet.getCell('B1').value = 'Akreditasi';
    worksheet.mergeCells('G1:G2'); worksheet.getCell('G1').value = 'Jumlah Unit';

    worksheet.getCell('B2').value = 'A';
    worksheet.getCell('C2').value = 'B';
    worksheet.getCell('D2').value = 'C';
    worksheet.getCell('E2').value = 'Terakreditasi';
    worksheet.getCell('F2').value = 'Tidak Terakreditasi';

    // Set Lebar Kolom
    worksheet.getColumn('A').width = 20;
    worksheet.getColumn('B').width = 10;
    worksheet.getColumn('C').width = 10;
    worksheet.getColumn('D').width = 10;
    worksheet.getColumn('E').width = 18;
    worksheet.getColumn('F').width = 20;
    worksheet.getColumn('G').width = 15;

    // Styling Header
    ['A1', 'B1', 'G1', 'B2', 'C2', 'D2', 'E2', 'F2'].forEach(cell => {
       worksheet.getCell(cell).font = { bold: true, color: { argb: 'FFFFFFFF' } };
       worksheet.getCell(cell).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0284C7' } };
       worksheet.getCell(cell).alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Masukkan Data
    aggregatedData.forEach(item => {
      worksheet.addRow([
        item.jenjang, item.A, item.B, item.C, item.TERAKREDITASI, item.TIDAK_TERAKREDITASI, item.total
      ]);
    });

    // Masukkan Grand Total
    const totalRow = worksheet.addRow([
      'TOTAL KESELURUHAN', grandTotals.A, grandTotals.B, grandTotals.C, grandTotals.TERAKREDITASI, grandTotals.TIDAK_TERAKREDITASI, grandTotals.total
    ]);

    totalRow.font = { bold: true, color: { argb: 'FF075985' } };
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0F2FE' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Rekap_Akreditasi_Sekolah_${new Date().getTime()}.xlsx`;
    link.click();
  };

  const handleLihatRincian = (jenjang) => {
    setSelectedJenjangModal(jenjang);
    setModalOpen(true);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-[2rem] shadow-xl overflow-hidden animate-in slide-in-from-right duration-500 relative">
      
      {/* HEADER & FILTER AREA */}
      <div className="bg-sky-600 p-6 text-white flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 bg-white/20 rounded-xl hover:bg-white/30 transition-all">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h3 className="text-xl font-black uppercase tracking-tight">Rekap Akreditasi Satuan Pendidikan</h3>
              <p className="text-xs opacity-90 font-bold uppercase tracking-widest mt-1">
                 {title} • {selectedYear}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <button 
              onClick={downloadExcel}
              className="flex items-center gap-2 bg-sky-800 hover:bg-sky-900 text-white px-6 py-3 rounded-2xl font-black uppercase text-xs shadow-lg transition-all active:scale-95 border-b-4 border-sky-950"
            >
              <Download size={16} /> Unduh Tabel
            </button>
          </div>
        </div>

        {/* BARIS FILTER */}
        <div className="flex flex-wrap gap-3 items-center">
          
          <div className="flex items-center gap-2 bg-black/20 p-2 rounded-xl border border-white/10 flex-1 min-w-[200px] max-w-sm">
            <School size={16} className="text-sky-200 ml-1" />
            <select 
              value={selectedStatus} 
              onChange={(e) => setSelectedStatus(e.target.value)} 
              className="bg-transparent text-xs font-black uppercase outline-none cursor-pointer w-full text-white"
            >
              <option value="SEMUA" className="text-gray-800">Semua Status Sekolah</option>
              <option value="NEGERI" className="text-gray-800">Negeri</option>
              <option value="SWASTA" className="text-gray-800">Swasta</option>
            </select>
          </div>

        </div>
      </div>

      {/* TABLE BODY */}
      <div className="flex-1 overflow-auto p-6 bg-gray-50/50 relative">
        <table className="w-full text-center border-separate border-spacing-y-2">
          
          <thead className="sticky top-0 bg-gray-100 z-20 rounded-xl shadow-sm">
            {/* Header Lapis 1 */}
            <tr className="text-[10px] font-black uppercase text-gray-500">
              <th rowSpan={2} className="px-4 py-3 text-left rounded-l-xl align-middle border-b border-gray-200">Jenjang</th>
              <th colSpan={5} className="px-4 py-2 border-b border-gray-200">Status Akreditasi</th>
              <th rowSpan={2} className="px-4 py-3 text-sky-700 align-middle border-b border-gray-200">Jumlah Unit</th>
              <th rowSpan={2} className="px-4 py-3 rounded-r-xl align-middle border-b border-gray-200">Aksi</th>
            </tr>
            {/* Header Lapis 2 */}
            <tr className="text-[10px] font-black uppercase text-gray-500">
              <th className="px-2 py-2 text-sky-700 border-b border-gray-200">A</th>
              <th className="px-2 py-2 text-indigo-700 border-b border-gray-200">B</th>
              <th className="px-2 py-2 text-orange-600 border-b border-gray-200">C</th>
              <th className="px-2 py-2 text-emerald-600 border-b border-gray-200">Terakreditasi</th>
              <th className="px-2 py-2 text-red-500 border-b border-gray-200">Tidak Terakreditasi</th>
            </tr>
          </thead>
          
          <tbody>
            {aggregatedData.map((row, idx) => (
              <tr key={idx} className="bg-white shadow-sm hover:shadow-md hover:scale-[1.01] transition-all group cursor-default">
                <td className="px-4 py-4 rounded-l-2xl font-black text-gray-800 uppercase text-left border-y border-l border-gray-100 whitespace-nowrap">
                  {row.jenjang}
                </td>
                <td className="px-2 py-4 font-black text-sky-700 text-base border-y border-gray-100 bg-sky-50/30">{row.A.toLocaleString()}</td>
                <td className="px-2 py-4 font-black text-indigo-700 text-base border-y border-gray-100 bg-indigo-50/30">{row.B.toLocaleString()}</td>
                <td className="px-2 py-4 font-black text-orange-600 text-base border-y border-gray-100 bg-orange-50/30">{row.C.toLocaleString()}</td>
                <td className="px-2 py-4 font-bold text-emerald-600 border-y border-gray-100">{row.TERAKREDITASI.toLocaleString()}</td>
                <td className="px-2 py-4 font-bold text-red-500 border-y border-gray-100">{row.TIDAK_TERAKREDITASI.toLocaleString()}</td>
                
                {/* KOLOM JUMLAH PER BARIS */}
                <td className="px-4 py-4 font-black text-sky-800 text-lg border-y border-gray-100 bg-sky-100/50">
                  {row.total.toLocaleString()}
                </td>

                <td className="px-4 py-4 rounded-r-2xl border-y border-r border-gray-100">
                   <button 
                      onClick={() => handleLihatRincian(row.jenjang)}
                      className="flex items-center justify-center gap-2 bg-sky-50 text-sky-700 px-4 py-2 rounded-xl text-[10px] font-black uppercase hover:bg-sky-600 hover:text-white transition-colors mx-auto"
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
              <tr className="bg-sky-50 text-center font-black uppercase text-sm border-t-2 border-sky-200">
                <td className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-sky-200 text-sky-900">
                  TOTAL KESELURUHAN
                </td>
                <td className="px-2 py-4 text-sky-800 border-y border-sky-200">{grandTotals.A.toLocaleString()}</td>
                <td className="px-2 py-4 text-indigo-800 border-y border-sky-200">{grandTotals.B.toLocaleString()}</td>
                <td className="px-2 py-4 text-orange-800 border-y border-sky-200">{grandTotals.C.toLocaleString()}</td>
                <td className="px-2 py-4 text-emerald-800 border-y border-sky-200">{grandTotals.TERAKREDITASI.toLocaleString()}</td>
                <td className="px-2 py-4 text-red-700 border-y border-sky-200">{grandTotals.TIDAK_TERAKREDITASI.toLocaleString()}</td>
                <td className="px-4 py-4 text-sky-900 border-y border-sky-200 text-lg bg-sky-200/60">{grandTotals.total.toLocaleString()}</td>
                <td className="px-4 py-4 rounded-r-2xl border-y border-r border-sky-200"></td>
              </tr>
            </tfoot>
          )}
        </table>

        {aggregatedData.length === 0 && (
          <div className="py-20 flex flex-col items-center opacity-30 text-sky-900">
            <FileSpreadsheet size={64} className="mb-4" />
            <p className="font-black uppercase tracking-widest text-xl">Data Tidak Ditemukan</p>
            <p className="text-sm font-bold mt-2">Ubah kombinasi filter di atas</p>
          </div>
        )}
      </div>

      {/* MODAL RINCIAN INDIVIDU */}
      <DetailSekolahModal 
        isOpen={modalOpen} 
        onClose={() => setModalOpen(false)} 
        data={data} 
        jenjang={selectedJenjangModal} 
        wilayah={title} // Title dari prop adalah nama wilayah (PROVINSI/KABUPATEN)
        statusFilter={selectedStatus}
      />

    </div>
  );
}