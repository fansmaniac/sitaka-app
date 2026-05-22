import React, { useState, useEffect, useMemo } from 'react';
import { 
  Map as MapIcon, 
  CreditCard, 
  Download, 
  MapPin, 
  FileSpreadsheet,
  Search,
  GraduationCap,
  Loader2,
  AlertTriangle // <-- Tambahan Ikon untuk Plang Pengumuman
} from 'lucide-react';
import { db } from '../../firebase/config';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import ExcelJS from 'exceljs';

export default function DapodikDemografiAkses({ selectedYear }) {
  const [activeTab, setActiveTab] = useState('aksesibilitas');
  const [activeJenjang, setActiveJenjang] = useState('SD');
  const [selectedWilayah, setSelectedWilayah] = useState('Semua');
  
  const [dataAkses, setDataAkses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');

  const JENJANG_TABS = ['PAUD', 'SD', 'SMP', 'SMA', 'SMK', 'SLB (Inklusif)', 'NON FORMAL'];

  const daftarWilayah = [
    "Semua", "Kabupaten Bengkayang", "Kabupaten Kapuas Hulu", "Kabupaten Kayong Utara",
    "Kabupaten Ketapang", "Kabupaten Kubu Raya", "Kabupaten Landak", "Kabupaten Melawi",
    "Kabupaten Mempawah", "Kabupaten Sambas", "Kabupaten Sanggau", "Kabupaten Sekadau",
    "Kabupaten Sintang", "Kota Pontianak", "Kota Singkawang"
  ];

  const cleanKabupatenName = (rawName) => {
    if (!rawName) return "Semua";
    let name = String(rawName).toUpperCase().replace(/^(KAB\.|KABUPATEN|KOTA)\s+/i, '').trim();
    const found = daftarWilayah.find(kab => kab.toUpperCase().includes(name));
    if (found) return found;
    return "Semua"; 
  };

  // --- MENGAMBIL DATA AGREGASI DARI FIREBASE ---
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const q = query(collection(db, 'akses_pd_agregasi'), where("__name__", "==", `jarak_waktu_${selectedYear}`), limit(1));
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
          const docData = snapshot.docs[0].data();
          setDataAkses(docData.data_agregasi || []);
          
          if (docData.last_updated) {
            const d = new Date(docData.last_updated);
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
            setLastUpdated(`${String(d.getDate()).padStart(2, '0')} ${monthNames[d.getMonth()]} ${d.getFullYear()} Pukul ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
          }
        } else {
          setDataAkses([]);
        }
      } catch (error) {
        console.error("Gagal mengambil data akses PD:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedYear]);

  // --- LOGIKA AGREGASI DATA TABEL ---
  const aggregatedData = useMemo(() => {
    if (!dataAkses || dataAkses.length === 0) return [];

    const mapModa = new Map();

    dataAkses.forEach(item => {
      // Filter Jenjang
      if (item.jenjang !== activeJenjang) return;

      // Filter Wilayah
      if (selectedWilayah !== 'Semua') {
         const kabDb = cleanKabupatenName(item.kabupaten);
         if (kabDb !== selectedWilayah) return;
      }

      const modaRaw = String(item.moda_transportasi).trim().toUpperCase();
      const modaTitle = modaRaw || 'TIDAK DIKETAHUI';

      if (!mapModa.has(modaTitle)) {
        mapModa.set(modaTitle, {
           moda: modaTitle,
           j_kurang_1_w_kurang_30: 0, j_kurang_1_w_lebih_30: 0,
           j_1_2_w_kurang_30: 0, j_1_2_w_lebih_30: 0,
           j_lebih_2_w_kurang_30: 0, j_lebih_2_w_lebih_30: 0,
        });
      }

      const row = mapModa.get(modaTitle);
      row.j_kurang_1_w_kurang_30 += (item.jarak_kurang_1_waktu_kurang_30 || 0);
      row.j_kurang_1_w_lebih_30 += (item.jarak_kurang_1_waktu_lebih_30 || 0);
      row.j_1_2_w_kurang_30 += (item.jarak_1_2_waktu_kurang_30 || 0);
      row.j_1_2_w_lebih_30 += (item.jarak_1_2_waktu_lebih_30 || 0);
      row.j_lebih_2_w_kurang_30 += (item.jarak_lebih_2_waktu_kurang_30 || 0);
      row.j_lebih_2_w_lebih_30 += (item.jarak_lebih_2_waktu_lebih_30 || 0);
    });

    return Array.from(mapModa.values()).sort((a, b) => a.moda.localeCompare(b.moda));
  }, [dataAkses, activeJenjang, selectedWilayah]);

  const grandTotals = useMemo(() => {
    return aggregatedData.reduce((acc, curr) => {
      acc.j_kurang_1_w_kurang_30 += curr.j_kurang_1_w_kurang_30;
      acc.j_kurang_1_w_lebih_30 += curr.j_kurang_1_w_lebih_30;
      acc.j_1_2_w_kurang_30 += curr.j_1_2_w_kurang_30;
      acc.j_1_2_w_lebih_30 += curr.j_1_2_w_lebih_30;
      acc.j_lebih_2_w_kurang_30 += curr.j_lebih_2_w_kurang_30;
      acc.j_lebih_2_w_lebih_30 += curr.j_lebih_2_w_lebih_30;
      return acc;
    }, {
      j_kurang_1_w_kurang_30: 0, j_kurang_1_w_lebih_30: 0,
      j_1_2_w_kurang_30: 0, j_1_2_w_lebih_30: 0,
      j_lebih_2_w_kurang_30: 0, j_lebih_2_w_lebih_30: 0
    });
  }, [aggregatedData]);

  // --- FUNGSI UNDUH EXCEL DENGAN NESTED HEADERS ---
  const downloadExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const safeWilayah = selectedWilayah === 'Semua' ? 'Provinsi' : selectedWilayah.replace(/Kabupaten |Kota /gi, '');
    const worksheet = workbook.addWorksheet(`Akses ${activeJenjang}`);

    // Set Lebar Kolom
    worksheet.columns = [
      { key: 'no', width: 5 },
      { key: 'moda', width: 30 },
      { key: 'jk1_wk30', width: 12 },
      { key: 'jk1_wl30', width: 12 },
      { key: 'j12_wk30', width: 12 },
      { key: 'j12_wl30', width: 12 },
      { key: 'jl2_wk30', width: 12 },
      { key: 'jl2_wl30', width: 12 },
    ];

    // Merge Cells Untuk Nested Headers
    worksheet.mergeCells('A1:A3');
    worksheet.mergeCells('B1:B3');
    worksheet.mergeCells('C1:H1');
    worksheet.mergeCells('C2:D2');
    worksheet.mergeCells('E2:F2');
    worksheet.mergeCells('G2:H2');

    // Set Text Headers
    worksheet.getCell('A1').value = 'No';
    worksheet.getCell('B1').value = 'Moda Transportasi';
    worksheet.getCell('C1').value = 'Jarak Tempuh';
    worksheet.getCell('C2').value = '< 1 Kilometer';
    worksheet.getCell('E2').value = '1 - 2 Kilometer';
    worksheet.getCell('G2').value = '> 2 Kilometer';

    worksheet.getCell('C3').value = '< 30 Menit'; worksheet.getCell('D3').value = '> 30 Menit';
    worksheet.getCell('E3').value = '< 30 Menit'; worksheet.getCell('F3').value = '> 30 Menit';
    worksheet.getCell('G3').value = '< 30 Menit'; worksheet.getCell('H3').value = '> 30 Menit';

    // Styling Headers
    for (let i = 1; i <= 3; i++) {
        worksheet.getRow(i).eachCell(cell => {
           cell.alignment = { horizontal: 'center', vertical: 'middle' };
           cell.font = { bold: true };
        });
    }
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }; // Blue 100
    worksheet.getCell('C2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }; // Emerald 100
    worksheet.getCell('E2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; // Amber 100
    worksheet.getCell('G2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4E6' } }; // Rose 100

    // Isi Data
    aggregatedData.forEach((row, idx) => {
       worksheet.addRow({
          no: idx + 1,
          moda: row.moda,
          jk1_wk30: row.j_kurang_1_w_kurang_30, jk1_wl30: row.j_kurang_1_w_lebih_30,
          j12_wk30: row.j_1_2_w_kurang_30, j12_wl30: row.j_1_2_w_lebih_30,
          jl2_wk30: row.j_lebih_2_w_kurang_30, jl2_wl30: row.j_lebih_2_w_lebih_30
       });
    });

    // Baris Total
    const totalRow = worksheet.addRow({
       no: '', moda: 'TOTAL KESELURUHAN',
       jk1_wk30: grandTotals.j_kurang_1_w_kurang_30, jk1_wl30: grandTotals.j_kurang_1_w_lebih_30,
       j12_wk30: grandTotals.j_1_2_w_kurang_30, j12_wl30: grandTotals.j_1_2_w_lebih_30,
       jl2_wk30: grandTotals.j_lebih_2_w_kurang_30, jl2_wl30: grandTotals.j_lebih_2_w_lebih_30
    });
    totalRow.font = { bold: true };
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Rekap_Aksesibilitas_${activeJenjang.replace(/\//g,'-')}_${safeWilayah}_${selectedYear}.xlsx`;
    link.click();
  };

  // ==========================================================================
  // RENDER: TAB AKSESIBILITAS
  // ==========================================================================
  const renderTabAksesibilitas = () => {
    return (
      <div className="flex flex-col h-full animate-in fade-in duration-300">
        
        {/* HEADER & TOOLBAR */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
          <div>
            <h2 className="text-xl md:text-2xl font-black text-gray-800 uppercase tracking-tight">
              Data Jarak & Waktu Tempuh Peserta Didik
            </h2>
            <p className="text-xs md:text-sm text-gray-500 font-bold uppercase tracking-widest mt-1">
              Tahun Data: <span className="text-blue-600">{selectedYear}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Filter Wilayah */}
            <div className="relative flex-1 md:w-64">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MapPin size={16} className="text-gray-400" />
              </div>
              <select
                value={selectedWilayah}
                onChange={(e) => setSelectedWilayah(e.target.value)}
                className="block w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none shadow-sm cursor-pointer transition-all"
              >
                {daftarWilayah.map(wilayah => (
                  <option key={wilayah} value={wilayah}>{wilayah}</option>
                ))}
              </select>
            </div>

            {/* Tombol Export */}
            <button onClick={downloadExcel} className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs md:text-sm font-black uppercase rounded-xl transition-all shadow-md active:scale-95 border border-emerald-400">
              <FileSpreadsheet size={16} />
              <span className="hidden sm:inline">Unduh Excel</span>
            </button>
          </div>
        </div>

        {/* SUB-TAB JENJANG */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4 custom-scrollbar">
          {JENJANG_TABS.map(jenjang => (
            <button
              key={jenjang}
              onClick={() => setActiveJenjang(jenjang)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-black text-[10px] md:text-xs uppercase tracking-wider transition-all whitespace-nowrap shadow-sm border ${
                activeJenjang === jenjang 
                  ? 'bg-blue-600 text-white border-blue-600 scale-[1.02]' 
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              <GraduationCap size={14} />
              {jenjang === 'PAUD' ? 'PAUD (Hanya TK)' : jenjang}
            </button>
          ))}
        </div>

        {/* TABEL DATA NESTED HEADERS */}
        <div className="flex-1 overflow-hidden bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col">
          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-center border-collapse">
              <thead className="sticky top-0 z-10 shadow-sm">
                
                {/* BARIS HEADER 1 */}
                <tr className="text-[10px] uppercase tracking-widest text-gray-700 font-black bg-gray-50">
                  <th rowSpan="3" className="p-3 w-12 border-b border-r border-gray-200 align-middle bg-gray-50">No</th>
                  <th rowSpan="3" className="p-3 border-b border-r border-gray-200 align-middle bg-gray-50 text-left min-w-[200px]">Moda Transportasi</th>
                  <th colSpan="6" className="p-2 border-b border-gray-200 align-middle bg-blue-50 text-blue-800">
                    Jarak Tempuh
                  </th>
                </tr>

                {/* BARIS HEADER 2 (Kategori Jarak) */}
                <tr className="text-[10px] uppercase tracking-widest font-black">
                  <th colSpan="2" className="p-2 border-b border-r border-gray-200 align-middle bg-emerald-50 text-emerald-800">
                    &lt; 1 Kilometer
                  </th>
                  <th colSpan="2" className="p-2 border-b border-r border-gray-200 align-middle bg-amber-50 text-amber-800">
                    1 - 2 Kilometer
                  </th>
                  <th colSpan="2" className="p-2 border-b border-gray-200 align-middle bg-rose-50 text-rose-800">
                    &gt; 2 Kilometer
                  </th>
                </tr>

                {/* BARIS HEADER 3 (Kategori Waktu) */}
                <tr className="text-[9px] uppercase tracking-wider font-bold text-gray-600">
                  {/* Under < 1 KM */}
                  <th className="p-2 border-b border-r border-gray-200 bg-white">&lt; 30 Menit</th>
                  <th className="p-2 border-b border-r border-gray-200 bg-white">&gt; 30 Menit</th>
                  {/* Under 1-2 KM */}
                  <th className="p-2 border-b border-r border-gray-200 bg-white">&lt; 30 Menit</th>
                  <th className="p-2 border-b border-r border-gray-200 bg-white">&gt; 30 Menit</th>
                  {/* Under > 2 KM */}
                  <th className="p-2 border-b border-r border-gray-200 bg-white">&lt; 30 Menit</th>
                  <th className="p-2 border-b border-gray-200 bg-white">&gt; 30 Menit</th>
                </tr>

              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                
                {loading ? (
                   <tr>
                     <td colSpan="8" className="py-24 text-center">
                       <div className="flex flex-col items-center justify-center text-blue-600">
                         <Loader2 size={48} className="mb-4 animate-spin" />
                         <p className="font-bold italic text-base">Menarik data agregasi dari server...</p>
                       </div>
                     </td>
                   </tr>
                ) : aggregatedData.length === 0 ? (
                   <tr>
                     <td colSpan="8" className="py-24 text-center">
                       <div className="flex flex-col items-center justify-center text-gray-400">
                         <Search size={48} className="mb-4 opacity-50" />
                         <p className="font-bold italic text-base">Belum ada data untuk jenjang ini.</p>
                         <p className="text-xs mt-1">Pastikan Anda telah melakukan sinkronisasi Mesin Kalkulasi.</p>
                       </div>
                     </td>
                   </tr>
                ) : (
                  <>
                    {aggregatedData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/50 transition-colors group text-gray-700">
                        <td className="p-3 text-center font-bold border-r border-gray-100">{idx + 1}</td>
                        <td className="p-3 font-black uppercase text-left border-r border-gray-100">{row.moda}</td>
                        
                        <td className="p-3 text-center border-r border-gray-100 font-medium">{row.j_kurang_1_w_kurang_30.toLocaleString()}</td>
                        <td className="p-3 text-center border-r border-gray-100 bg-gray-50/50 font-medium">{row.j_kurang_1_w_lebih_30.toLocaleString()}</td>
                        
                        <td className="p-3 text-center border-r border-gray-100 font-medium">{row.j_1_2_w_kurang_30.toLocaleString()}</td>
                        <td className="p-3 text-center border-r border-gray-100 bg-gray-50/50 font-medium">{row.j_1_2_w_lebih_30.toLocaleString()}</td>
                        
                        <td className="p-3 text-center border-r border-gray-100 font-medium">{row.j_lebih_2_w_kurang_30.toLocaleString()}</td>
                        <td className="p-3 text-center font-medium bg-gray-50/50">{row.j_lebih_2_w_lebih_30.toLocaleString()}</td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
              
              {!loading && aggregatedData.length > 0 && (
                <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                  <tr className="bg-gray-100 text-center font-black uppercase text-xs border-t-2 border-gray-300">
                    <td colSpan="2" className="p-4 text-left border-r border-gray-300 text-gray-900">
                      TOTAL KESELURUHAN
                    </td>
                    <td className="p-4 text-gray-800 border-r border-gray-300">{grandTotals.j_kurang_1_w_kurang_30.toLocaleString()}</td>
                    <td className="p-4 text-gray-800 border-r border-gray-300 bg-gray-200/50">{grandTotals.j_kurang_1_w_lebih_30.toLocaleString()}</td>
                    
                    <td className="p-4 text-gray-800 border-r border-gray-300">{grandTotals.j_1_2_w_kurang_30.toLocaleString()}</td>
                    <td className="p-4 text-gray-800 border-r border-gray-300 bg-gray-200/50">{grandTotals.j_1_2_w_lebih_30.toLocaleString()}</td>
                    
                    <td className="p-4 text-gray-800 border-r border-gray-300">{grandTotals.j_lebih_2_w_kurang_30.toLocaleString()}</td>
                    <td className="p-4 text-gray-800 bg-gray-200/50">{grandTotals.j_lebih_2_w_lebih_30.toLocaleString()}</td>
                  </tr>
                </tfoot>
              )}

            </table>
          </div>
          
          {/* INFO LAST UPDATED */}
          {lastUpdated && (
            <div className="p-3 bg-gray-50 border-t border-gray-200 text-right text-[10px] font-bold italic text-gray-400">
              *Tabel ini dirender otomatis dari Mesin Pre-Kalkulasi. Terakhir diperbarui: {lastUpdated}
            </div>
          )}

        </div>
      </div>
    );
  };

  // ==========================================================================
  // RENDER: TAB KELAYAKAN PIP (Draft kosong untuk nanti)
  // ==========================================================================
  const renderTabPIP = () => {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-400 animate-in fade-in zoom-in-95 duration-300">
        <CreditCard size={64} className="mb-4 opacity-30" />
        <p className="font-black uppercase tracking-widest text-lg">Konten Kelayakan PIP</p>
        <p className="font-bold italic mt-2 text-sm">Akan dibangun dan diintegrasikan di sini...</p>
      </div>
    );
  };

  // ==========================================================================
  // MAIN RENDER
  // ==========================================================================
  return (
    <div className="h-full flex flex-col p-4 md:p-8 bg-gray-50/30">
      
      {/* PLANG PENGUMUMAN BERKEDIP JIKA DATA MASIH KOSONG */}
      {!loading && (!dataAkses || dataAkses.length === 0) && (
        <div className="mb-6 bg-orange-50 border border-orange-300 p-4 rounded-2xl shadow-sm animate-pulse flex items-start gap-4">
           <div className="bg-orange-100 p-2 rounded-xl shrink-0">
             <AlertTriangle className="text-orange-600" size={24} />
           </div>
           <div>
             <h3 className="font-black text-orange-800 uppercase tracking-wider text-sm">Perhatian: Halaman dalam Pengembangan</h3>
             <p className="text-orange-700 text-xs font-bold mt-1 leading-relaxed">
               Database untuk tahun {selectedYear} saat ini belum diunggah atau sedang dalam proses sinkronisasi oleh Admin. Mohon ditunggu ya!
             </p>
           </div>
        </div>
      )}

      {/* KONTROL TAB */}
      <div className="flex flex-wrap items-center gap-2 mb-6 border-b border-gray-200 pb-4 shrink-0">
        <button
          onClick={() => setActiveTab('aksesibilitas')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-[10px] md:text-xs uppercase tracking-widest transition-all ${
            activeTab === 'aksesibilitas'
              ? 'bg-blue-600 text-white shadow-md scale-[1.02]'
              : 'bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-800 border border-gray-200'
          }`}
        >
          <MapIcon size={16} />
          Aksesibilitas
        </button>
        
        <button
          onClick={() => setActiveTab('pip')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-[10px] md:text-xs uppercase tracking-widest transition-all ${
            activeTab === 'pip'
              ? 'bg-blue-600 text-white shadow-md scale-[1.02]'
              : 'bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-800 border border-gray-200'
          }`}
        >
          <CreditCard size={16} />
          Kelayakan PIP
        </button>
      </div>

      {/* AREA KONTEN AKTIF */}
      <div className="flex-1 min-h-0">
        {activeTab === 'aksesibilitas' ? renderTabAksesibilitas() : renderTabPIP()}
      </div>
      
    </div>
  );
}