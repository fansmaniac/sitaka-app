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
  AlertTriangle,
  Info
} from 'lucide-react';
import { db } from '../../firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';
import ExcelJS from 'exceljs';

export default function DapodikDemografiAkses({ selectedYear }) {
  const [activeTab, setActiveTab] = useState('aksesibilitas');
  const [activeJenjang, setActiveJenjang] = useState('Semua Jenjang');
  const [selectedWilayah, setSelectedWilayah] = useState('Semua');
  
  const [dataAkses, setDataAkses] = useState([]);
  const [dataPip, setDataPip] = useState([]); 
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');

  const JENJANG_TABS = ['Semua Jenjang', 'PAUD', 'SD', 'SMP', 'SMA', 'SMK', 'SLB (Inklusif)', 'NON FORMAL'];

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

  // --- MENGAMBIL DATA AGREGASI CHUNKS DARI FIREBASE SECARA PARALEL ---
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const prefixAkses = `akses_${selectedYear}_chunk_`;
        const prefixPip = `pip_${selectedYear}_chunk_`;

        const qAkses = query(
          collection(db, 'akses_pd_agregasi'), 
          where("__name__", ">=", prefixAkses),
          where("__name__", "<=", prefixAkses + '\uf8ff')
        );

        const qPip = query(
          collection(db, 'akses_pd_agregasi'), 
          where("__name__", ">=", prefixPip),
          where("__name__", "<=", prefixPip + '\uf8ff')
        );

        const [snapAkses, snapPip] = await Promise.all([getDocs(qAkses), getDocs(qPip)]);
        
        let combinedAkses = [];
        let combinedPip = [];
        let latestDate = null;

        snapAkses.forEach(doc => {
           const docData = doc.data();
           if (docData.data_agregasi && Array.isArray(docData.data_agregasi)) {
              combinedAkses = combinedAkses.concat(docData.data_agregasi);
           }
           if (docData.last_updated) {
              const currentDocDate = new Date(docData.last_updated);
              if (!latestDate || currentDocDate > latestDate) latestDate = currentDocDate;
           }
        });

        snapPip.forEach(doc => {
           const docData = doc.data();
           if (docData.data_agregasi && Array.isArray(docData.data_agregasi)) {
              combinedPip = combinedPip.concat(docData.data_agregasi);
           }
           if (docData.last_updated) {
              const currentDocDate = new Date(docData.last_updated);
              if (!latestDate || currentDocDate > latestDate) latestDate = currentDocDate;
           }
        });

        setDataAkses(combinedAkses);
        setDataPip(combinedPip);
        
        if (latestDate) {
          const monthNames = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Ags", "Sep", "Okt", "Nov", "Des"];
          setLastUpdated(`${String(latestDate.getDate()).padStart(2, '0')} ${monthNames[latestDate.getMonth()]} ${latestDate.getFullYear()} Pukul ${String(latestDate.getHours()).padStart(2, '0')}:${String(latestDate.getMinutes()).padStart(2, '0')}`);
        } else {
          setLastUpdated('Tidak Diketahui');
        }
      } catch (error) {
        console.error("Gagal mengambil data akses PD & PIP:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [selectedYear]);

  // ==========================================================================
  // LOGIKA AGREGASI TABEL AKSESIBILITAS
  // ==========================================================================
  const aggregatedAksesData = useMemo(() => {
    if (!dataAkses || dataAkses.length === 0) return [];
    const mapModa = new Map();

    dataAkses.forEach(item => {
      if (activeJenjang !== 'Semua Jenjang' && item.jenjang !== activeJenjang) return;
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
           total_siswa: 0
        });
      }

      const row = mapModa.get(modaTitle);
      
      const v_jk1_wk30 = (item.jarak_kurang_1_waktu_kurang_30 || 0);
      const v_jk1_wl30 = (item.jarak_kurang_1_waktu_lebih_30 || 0);
      const v_j12_wk30 = (item.jarak_1_2_waktu_kurang_30 || 0);
      const v_j12_wl30 = (item.jarak_1_2_waktu_lebih_30 || 0);
      const v_jl2_wk30 = (item.jarak_lebih_2_waktu_kurang_30 || 0);
      const v_jl2_wl30 = (item.jarak_lebih_2_waktu_lebih_30 || 0);

      row.j_kurang_1_w_kurang_30 += v_jk1_wk30;
      row.j_kurang_1_w_lebih_30 += v_jk1_wl30;
      row.j_1_2_w_kurang_30 += v_j12_wk30;
      row.j_1_2_w_lebih_30 += v_j12_wl30;
      row.j_lebih_2_w_kurang_30 += v_jl2_wk30;
      row.j_lebih_2_w_lebih_30 += v_jl2_wl30;

      row.total_siswa += (v_jk1_wk30 + v_jk1_wl30 + v_j12_wk30 + v_j12_wl30 + v_jl2_wk30 + v_jl2_wl30);
    });

    return Array.from(mapModa.values()).sort((a, b) => a.moda.localeCompare(b.moda));
  }, [dataAkses, activeJenjang, selectedWilayah]);

  const grandTotalsAkses = useMemo(() => {
    return aggregatedAksesData.reduce((acc, curr) => {
      acc.j_kurang_1_w_kurang_30 += curr.j_kurang_1_w_kurang_30;
      acc.j_kurang_1_w_lebih_30 += curr.j_kurang_1_w_lebih_30;
      acc.j_1_2_w_kurang_30 += curr.j_1_2_w_kurang_30;
      acc.j_1_2_w_lebih_30 += curr.j_1_2_w_lebih_30;
      acc.j_lebih_2_w_kurang_30 += curr.j_lebih_2_w_kurang_30;
      acc.j_lebih_2_w_lebih_30 += curr.j_lebih_2_w_lebih_30;
      acc.total_siswa += curr.total_siswa;
      return acc;
    }, {
      j_kurang_1_w_kurang_30: 0, j_kurang_1_w_lebih_30: 0,
      j_1_2_w_kurang_30: 0, j_1_2_w_lebih_30: 0,
      j_lebih_2_w_kurang_30: 0, j_lebih_2_w_lebih_30: 0,
      total_siswa: 0
    });
  }, [aggregatedAksesData]);

  // ==========================================================================
  // LOGIKA AGREGASI TABEL PIP
  // ==========================================================================
  const aggregatedPipData = useMemo(() => {
    if (!dataPip || dataPip.length === 0) return [];
    const mapKecamatan = new Map();

    dataPip.forEach(item => {
      if (activeJenjang !== 'Semua Jenjang' && item.jenjang !== activeJenjang) return;
      
      if (selectedWilayah !== 'Semua') {
         const kabDb = cleanKabupatenName(item.kabupaten);
         if (kabDb !== selectedWilayah) return;
      }

      const kecRaw = String(item.kecamatan).trim().toUpperCase();
      const kecTitle = kecRaw || 'TIDAK DIKETAHUI';

      if (!mapKecamatan.has(kecTitle)) {
        mapKecamatan.set(kecTitle, {
           kecamatan: kecTitle,
           total_siswa: 0,
           layak_pip: 0,
           layak_dan_menerima_kip: 0,
           tidak_layak: 0
        });
      }

      const row = mapKecamatan.get(kecTitle);
      row.total_siswa += (item.total_siswa || item.pd_total || 0);
      row.layak_pip += (item.layak_pip || 0);
      row.layak_dan_menerima_kip += (item.layak_dan_menerima_kip || 0);
      row.tidak_layak += (item.tidak_layak || 0); // Penambahan Data Tidak Layak PIP
    });

    return Array.from(mapKecamatan.values()).map(r => ({
      ...r,
      selisih: r.layak_pip - r.layak_dan_menerima_kip
    })).sort((a, b) => a.kecamatan.localeCompare(b.kecamatan));
  }, [dataPip, activeJenjang, selectedWilayah]);

  const grandTotalsPip = useMemo(() => {
    return aggregatedPipData.reduce((acc, curr) => {
      acc.total_siswa += curr.total_siswa;
      acc.layak_pip += curr.layak_pip;
      acc.layak_dan_menerima_kip += curr.layak_dan_menerima_kip;
      acc.tidak_layak += curr.tidak_layak;
      acc.selisih += curr.selisih;
      return acc;
    }, {
      total_siswa: 0, layak_pip: 0, layak_dan_menerima_kip: 0, tidak_layak: 0, selisih: 0
    });
  }, [aggregatedPipData]);

  // ==========================================================================
  // FUNGSI UNDUH EXCEL AKSESIBILITAS
  // ==========================================================================
  const downloadExcelAkses = async () => {
    const workbook = new ExcelJS.Workbook();
    const safeWilayah = selectedWilayah === 'Semua' ? 'Provinsi' : selectedWilayah.replace(/Kabupaten |Kota /gi, '');
    const safeJenjang = activeJenjang.replace(/\//g,'-').replace(/\s+/g, '_');
    const worksheet = workbook.addWorksheet(`Akses ${safeJenjang}`);

    worksheet.columns = [
      { key: 'no', width: 5 }, { key: 'moda', width: 30 },
      { key: 'jk1_wk30', width: 12 }, { key: 'jk1_wl30', width: 12 },
      { key: 'j12_wk30', width: 12 }, { key: 'j12_wl30', width: 12 },
      { key: 'jl2_wk30', width: 12 }, { key: 'jl2_wl30', width: 12 },
      { key: 'total_siswa', width: 18 } 
    ];

    worksheet.mergeCells('A1:A3'); worksheet.mergeCells('B1:B3');
    worksheet.mergeCells('C1:H1'); worksheet.mergeCells('C2:D2');
    worksheet.mergeCells('E2:F2'); worksheet.mergeCells('G2:H2');
    worksheet.mergeCells('I1:I3'); 

    worksheet.getCell('A1').value = 'No';
    worksheet.getCell('B1').value = 'Moda Transportasi';
    worksheet.getCell('C1').value = 'Jarak Tempuh';
    worksheet.getCell('C2').value = '< 1 Kilometer';
    worksheet.getCell('E2').value = '1 - 2 Kilometer';
    worksheet.getCell('G2').value = '> 2 Kilometer';
    worksheet.getCell('I1').value = 'Total Siswa';

    worksheet.getCell('C3').value = '< 30 Menit'; worksheet.getCell('D3').value = '> 30 Menit';
    worksheet.getCell('E3').value = '< 30 Menit'; worksheet.getCell('F3').value = '> 30 Menit';
    worksheet.getCell('G3').value = '< 30 Menit'; worksheet.getCell('H3').value = '> 30 Menit';

    for (let i = 1; i <= 3; i++) {
        worksheet.getRow(i).eachCell(cell => { cell.alignment = { horizontal: 'center', vertical: 'middle' }; cell.font = { bold: true }; });
    }
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }; 
    worksheet.getCell('C2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } }; 
    worksheet.getCell('E2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }; 
    worksheet.getCell('G2').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE4E6' } }; 

    aggregatedAksesData.forEach((row, idx) => {
       worksheet.addRow({
          no: idx + 1, moda: row.moda,
          jk1_wk30: row.j_kurang_1_w_kurang_30, jk1_wl30: row.j_kurang_1_w_lebih_30,
          j12_wk30: row.j_1_2_w_kurang_30, j12_wl30: row.j_1_2_w_lebih_30,
          jl2_wk30: row.j_lebih_2_w_kurang_30, jl2_wl30: row.j_lebih_2_w_lebih_30,
          total_siswa: row.total_siswa
       });
    });

    const totalRow = worksheet.addRow({
       no: '', moda: 'TOTAL KESELURUHAN',
       jk1_wk30: grandTotalsAkses.j_kurang_1_w_kurang_30, jk1_wl30: grandTotalsAkses.j_kurang_1_w_lebih_30,
       j12_wk30: grandTotalsAkses.j_1_2_w_kurang_30, j12_wl30: grandTotalsAkses.j_1_2_w_lebih_30,
       jl2_wk30: grandTotalsAkses.j_lebih_2_w_kurang_30, jl2_wl30: grandTotalsAkses.j_lebih_2_w_lebih_30,
       total_siswa: grandTotalsAkses.total_siswa
    });
    totalRow.font = { bold: true };
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Rekap_Aksesibilitas_${safeJenjang}_${safeWilayah}_${selectedYear}.xlsx`;
    link.click();
  };

  // ==========================================================================
  // FUNGSI UNDUH EXCEL PIP
  // ==========================================================================
  const downloadExcelPip = async () => {
    const workbook = new ExcelJS.Workbook();
    const safeWilayah = selectedWilayah === 'Semua' ? 'Provinsi' : selectedWilayah.replace(/Kabupaten |Kota /gi, '');
    const safeJenjang = activeJenjang.replace(/\//g,'-').replace(/\s+/g, '_');
    const worksheet = workbook.addWorksheet(`PIP ${safeJenjang}`);

    worksheet.columns = [
      { header: 'No', key: 'no', width: 5 },
      { header: 'Kecamatan', key: 'kecamatan', width: 30 },
      { header: 'Siswa Tidak Layak PIP & Tidak Menerima KIP', key: 'tidak_layak', width: 40 },
      { header: 'LAYAK PIP (Rentan)', key: 'layak_pip', width: 25 },
      { header: 'Layak dan menerima KIP', key: 'menerima_kip', width: 30 },
      { header: 'Selisih Layak PIP & Layak dan Menerima KIP', key: 'selisih', width: 45 },
      { header: 'Total Siswa', key: 'total_siswa', width: 20 },
    ];

    worksheet.getRow(1).eachCell(cell => { 
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }; 
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }; 
    });
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }; 

    aggregatedPipData.forEach((row, idx) => {
       worksheet.addRow({
          no: idx + 1,
          kecamatan: row.kecamatan,
          tidak_layak: row.tidak_layak,
          layak_pip: row.layak_pip,
          menerima_kip: row.layak_dan_menerima_kip,
          selisih: row.selisih,
          total_siswa: row.total_siswa
       });
    });

    const totalRow = worksheet.addRow({
       no: '', 
       kecamatan: 'TOTAL KESELURUHAN',
       tidak_layak: grandTotalsPip.tidak_layak,
       layak_pip: grandTotalsPip.layak_pip,
       menerima_kip: grandTotalsPip.layak_dan_menerima_kip,
       selisih: grandTotalsPip.selisih,
       total_siswa: grandTotalsPip.total_siswa
    });
    totalRow.font = { bold: true };
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Rekap_Kelayakan_PIP_${safeJenjang}_${safeWilayah}_${selectedYear}.xlsx`;
    link.click();
  };

  // ==========================================================================
  // RENDER: TAB AKSESIBILITAS
  // ==========================================================================
  const renderTabAksesibilitas = () => {
    return (
      <div className="flex flex-col h-full animate-in fade-in duration-300">
        
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

            <button onClick={downloadExcelAkses} className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs md:text-sm font-black uppercase rounded-xl transition-all shadow-md active:scale-95 border border-emerald-400">
              <FileSpreadsheet size={16} />
              <span className="hidden sm:inline">Unduh Excel</span>
            </button>
          </div>
        </div>

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

        <div className="flex-1 overflow-hidden bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col">
          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-center border-collapse">
              <thead className="sticky top-0 z-10 shadow-sm">
                <tr className="text-[10px] uppercase tracking-widest text-gray-700 font-black bg-gray-50">
                  <th rowSpan="3" className="p-3 w-12 border-b border-r border-gray-200 align-middle bg-gray-50">No</th>
                  <th rowSpan="3" className="p-3 border-b border-r border-gray-200 align-middle bg-gray-50 text-left min-w-[200px]">Moda Transportasi</th>
                  <th colSpan="6" className="p-2 border-b border-r border-gray-200 align-middle bg-blue-50 text-blue-800">Jarak Tempuh</th>
                  <th rowSpan="3" className="p-3 border-b border-gray-200 align-middle bg-blue-100/50 text-blue-900">Total Siswa</th>
                </tr>
                <tr className="text-[10px] uppercase tracking-widest font-black">
                  <th colSpan="2" className="p-2 border-b border-r border-gray-200 align-middle bg-emerald-50 text-emerald-800">&lt; 1 Kilometer</th>
                  <th colSpan="2" className="p-2 border-b border-r border-gray-200 align-middle bg-amber-50 text-amber-800">1 - 2 Kilometer</th>
                  <th colSpan="2" className="p-2 border-b border-r border-gray-200 align-middle bg-rose-50 text-rose-800">&gt; 2 Kilometer</th>
                </tr>
                <tr className="text-[9px] uppercase tracking-wider font-bold text-gray-600">
                  <th className="p-2 border-b border-r border-gray-200 bg-white">&lt; 30 Menit</th>
                  <th className="p-2 border-b border-r border-gray-200 bg-white">&gt; 30 Menit</th>
                  <th className="p-2 border-b border-r border-gray-200 bg-white">&lt; 30 Menit</th>
                  <th className="p-2 border-b border-r border-gray-200 bg-white">&gt; 30 Menit</th>
                  <th className="p-2 border-b border-r border-gray-200 bg-white">&lt; 30 Menit</th>
                  <th className="p-2 border-b border-r border-gray-200 bg-white">&gt; 30 Menit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {loading ? (
                   <tr>
                     <td colSpan="9" className="py-24 text-center">
                       <div className="flex flex-col items-center justify-center text-blue-600">
                         <Loader2 size={48} className="mb-4 animate-spin" />
                         <p className="font-bold italic text-base">Menarik data agregasi dari server...</p>
                       </div>
                     </td>
                   </tr>
                ) : aggregatedAksesData.length === 0 ? (
                   <tr>
                     <td colSpan="9" className="py-24 text-center">
                       <div className="flex flex-col items-center justify-center text-gray-400">
                         <Search size={48} className="mb-4 opacity-50" />
                         <p className="font-bold italic text-base">Belum ada data untuk jenjang ini.</p>
                         <p className="text-xs mt-1">Pastikan Anda telah melakukan sinkronisasi Mesin Kalkulasi.</p>
                       </div>
                     </td>
                   </tr>
                ) : (
                  <>
                    {aggregatedAksesData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/50 transition-colors group text-gray-700">
                        <td className="p-3 text-center font-bold border-r border-gray-100">{idx + 1}</td>
                        <td className="p-3 font-black uppercase text-left border-r border-gray-100">{row.moda}</td>
                        <td className="p-3 text-center border-r border-gray-100 font-medium">{row.j_kurang_1_w_kurang_30.toLocaleString()}</td>
                        <td className="p-3 text-center border-r border-gray-100 bg-gray-50/50 font-medium">{row.j_kurang_1_w_lebih_30.toLocaleString()}</td>
                        <td className="p-3 text-center border-r border-gray-100 font-medium">{row.j_1_2_w_kurang_30.toLocaleString()}</td>
                        <td className="p-3 text-center border-r border-gray-100 bg-gray-50/50 font-medium">{row.j_1_2_w_lebih_30.toLocaleString()}</td>
                        <td className="p-3 text-center border-r border-gray-100 font-medium">{row.j_lebih_2_w_kurang_30.toLocaleString()}</td>
                        <td className="p-3 text-center border-r border-gray-100 font-medium bg-gray-50/50">{row.j_lebih_2_w_lebih_30.toLocaleString()}</td>
                        <td className="p-3 text-center font-bold bg-blue-50/30 text-blue-900">{row.total_siswa.toLocaleString()}</td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
              
              {!loading && aggregatedAksesData.length > 0 && (
                <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                  <tr className="bg-gray-100 text-center font-black uppercase text-xs border-t-2 border-gray-300">
                    <td colSpan="2" className="p-4 text-left border-r border-gray-300 text-gray-900">TOTAL KESELURUHAN</td>
                    <td className="p-4 text-gray-800 border-r border-gray-300">{grandTotalsAkses.j_kurang_1_w_kurang_30.toLocaleString()}</td>
                    <td className="p-4 text-gray-800 border-r border-gray-300 bg-gray-200/50">{grandTotalsAkses.j_kurang_1_w_lebih_30.toLocaleString()}</td>
                    <td className="p-4 text-gray-800 border-r border-gray-300">{grandTotalsAkses.j_1_2_w_kurang_30.toLocaleString()}</td>
                    <td className="p-4 text-gray-800 border-r border-gray-300 bg-gray-200/50">{grandTotalsAkses.j_1_2_w_lebih_30.toLocaleString()}</td>
                    <td className="p-4 text-gray-800 border-r border-gray-300">{grandTotalsAkses.j_lebih_2_w_kurang_30.toLocaleString()}</td>
                    <td className="p-4 text-gray-800 border-r border-gray-300 bg-gray-200/50">{grandTotalsAkses.j_lebih_2_w_lebih_30.toLocaleString()}</td>
                    <td className="p-4 text-blue-900 bg-blue-200/40">{grandTotalsAkses.total_siswa.toLocaleString()}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {aggregatedAksesData.length > 0 && (
            <div className="m-4 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 shadow-sm">
              <Info className="text-amber-600 shrink-0 mt-0.5" size={20} />
              <div className="text-amber-800 text-xs leading-relaxed">
                <strong className="font-black uppercase tracking-wider block mb-1">Catatan Validasi Data Dapodik</strong>
                Moda transportasi yang tampil adalah murni berdasarkan inputan operator sekolah di aplikasi <b>DAPODIK</b>. Jika terdapat anomali data (seperti Kereta Api, Andong/Sado, dll yang tidak lazim beroperasi di wilayah Kalimantan Barat), Dinas Pendidikan terkait diharapkan melakukan verifikasi dan himbauan perbaikan data kepada satuan pendidikan yang bersangkutan.
              </div>
            </div>
          )}
          
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
  // RENDER: TAB KELAYAKAN PIP
  // ==========================================================================
  const renderTabPIP = () => {
    return (
      <div className="flex flex-col h-full animate-in fade-in duration-300">
        
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
          <div>
            <h2 className="text-xl md:text-2xl font-black text-gray-800 uppercase tracking-tight">
              Data Kelayakan Program Indonesia Pintar (PIP)
            </h2>
            <p className="text-xs md:text-sm text-gray-500 font-bold uppercase tracking-widest mt-1">
              Tahun Data: <span className="text-blue-600">{selectedYear}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
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

            <button onClick={downloadExcelPip} className="flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs md:text-sm font-black uppercase rounded-xl transition-all shadow-md active:scale-95 border border-emerald-400">
              <FileSpreadsheet size={16} />
              <span className="hidden sm:inline">Unduh Excel</span>
            </button>
          </div>
        </div>

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

        <div className="flex-1 overflow-hidden bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col">
          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-center border-collapse">
              <thead className="sticky top-0 z-10 shadow-sm">
                <tr className="text-[10px] uppercase tracking-widest text-gray-700 font-black bg-gray-50">
                  <th className="p-4 w-12 border-b border-r border-gray-200 align-middle">No</th>
                  <th className="p-4 border-b border-r border-gray-200 align-middle text-left min-w-[200px]">Kecamatan</th>
                  <th className="p-4 border-b border-r border-gray-200 align-middle text-gray-600">Tidak Layak PIP & Tidak Menerima KIP</th>
                  <th className="p-4 border-b border-r border-gray-200 align-middle text-blue-600">LAYAK PIP (Rentan)</th>
                  <th className="p-4 border-b border-r border-gray-200 align-middle text-emerald-600">Layak dan menerima KIP</th>
                  <th className="p-4 border-b border-r border-gray-200 align-middle text-rose-600">Selisih Layak PIP & Layak dan Menerima KIP</th>
                  <th className="p-4 border-b border-gray-200 align-middle bg-blue-50/50 text-blue-900">Total Siswa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {loading ? (
                   <tr>
                     <td colSpan="7" className="py-24 text-center">
                       <div className="flex flex-col items-center justify-center text-blue-600">
                         <Loader2 size={48} className="mb-4 animate-spin" />
                         <p className="font-bold italic text-base">Menarik data agregasi dari server...</p>
                       </div>
                     </td>
                   </tr>
                ) : aggregatedPipData.length === 0 ? (
                   <tr>
                     <td colSpan="7" className="py-24 text-center">
                       <div className="flex flex-col items-center justify-center text-gray-400">
                         <Search size={48} className="mb-4 opacity-50" />
                         <p className="font-bold italic text-base">Belum ada data untuk jenjang ini.</p>
                         <p className="text-xs mt-1">Pastikan Anda telah melakukan sinkronisasi Mesin Kalkulasi.</p>
                       </div>
                     </td>
                   </tr>
                ) : (
                  <>
                    {aggregatedPipData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-blue-50/50 transition-colors group text-gray-700">
                        <td className="p-3 text-center font-bold border-r border-gray-100">{idx + 1}</td>
                        <td className="p-3 font-black uppercase text-left border-r border-gray-100">{row.kecamatan}</td>
                        <td className="p-3 text-center border-r border-gray-100 font-bold text-gray-500">{row.tidak_layak.toLocaleString()}</td>
                        <td className="p-3 text-center border-r border-gray-100 font-bold text-blue-700">{row.layak_pip.toLocaleString()}</td>
                        <td className="p-3 text-center border-r border-gray-100 font-bold text-emerald-700">{row.layak_dan_menerima_kip.toLocaleString()}</td>
                        <td className="p-3 text-center font-black border-r border-gray-100 text-rose-600 bg-rose-50/30">{row.selisih.toLocaleString()}</td>
                        <td className="p-3 text-center font-bold bg-blue-50/30 text-blue-900">{row.total_siswa.toLocaleString()}</td>
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
              
              {!loading && aggregatedPipData.length > 0 && (
                <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)]">
                  <tr className="bg-gray-100 text-center font-black uppercase text-xs border-t-2 border-gray-300">
                    <td colSpan="2" className="p-4 text-left border-r border-gray-300 text-gray-900">TOTAL KESELURUHAN</td>
                    <td className="p-4 text-gray-600 border-r border-gray-300">{grandTotalsPip.tidak_layak.toLocaleString()}</td>
                    <td className="p-4 text-blue-800 border-r border-gray-300">{grandTotalsPip.layak_pip.toLocaleString()}</td>
                    <td className="p-4 text-emerald-800 border-r border-gray-300">{grandTotalsPip.layak_dan_menerima_kip.toLocaleString()}</td>
                    <td className="p-4 text-rose-800 border-r border-gray-300 bg-rose-100/50">{grandTotalsPip.selisih.toLocaleString()}</td>
                    <td className="p-4 text-blue-900 bg-blue-200/40">{grandTotalsPip.total_siswa.toLocaleString()}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

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
  // MAIN RENDER
  // ==========================================================================
  return (
    <div className="h-full flex flex-col p-4 md:p-8 bg-gray-50/30">
      
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

      <div className="flex-1 min-h-0">
        {activeTab === 'aksesibilitas' ? renderTabAksesibilitas() : renderTabPIP()}
      </div>
      
    </div>
  );
}