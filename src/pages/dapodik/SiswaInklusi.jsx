import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { 
  Download, School, MapPin, Search, AlertTriangle, 
  Loader2, Users, Percent, ShieldCheck 
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { db } from '../../firebase/config';
import { doc, getDoc } from 'firebase/firestore';

// ===================================================================== //
// MASTER DATA DAFTAR WILAYAH (STANDARD SITAKA 2026)                     //
// ===================================================================== //
const KABUPATEN_LIST = [
  "KAB. SAMBAS", "KAB. MEMPAWAH", "KAB. SANGGAU", "KAB. KETAPANG", 
  "KAB. SINTANG", "KAB. KAPUAS HULU", "KAB. BENGKAYANG", "KAB. LANDAK", 
  "KAB. SEKADAU", "KAB. MELAWI", "KAB. KAYONG UTARA", "KAB. KUBU RAYA", 
  "KOTA PONTIANAK", "KOTA SINGKAWANG"
];

// ===================================================================== //
// MAPPING JENJANG PENDIDIKAN SESUAI PERMINTAAN                          //
// ===================================================================== //
const JENJANG_GROUPS = {
  'PAUD': ['TK', 'KB', 'SPS', 'TPA'],
  'SD': ['SD', 'SPK SD'],
  'SMP': ['SMP', 'SPK SMP'],
  'SMA': ['SMA', 'SPK SMA'],
  'SMK': ['SMK']
};

export default function SiswaInklusi() {
  const [searchParams, setSearchParams] = useSearchParams();
  
  // --- STATE MANAGEMENT ---
  const [selectedYear, setSelectedYear] = useState(searchParams.get('tahun') || '2026');
  const [filterWilayah, setFilterWilayah] = useState(searchParams.get('wilayah') || 'SEMUA');
  const [activeTab, setActiveTab] = useState(searchParams.get('jenjang') || 'SEMUA');
  const [filterStatus, setFilterStatus] = useState('SEMUA'); // SEMUA, NEGERI, SWASTA
  const [searchTerm, setSearchTerm] = useState('');
  
  const [rawAgregasi, setRawAgregasi] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // ===================================================================== //
  // STANDARISASI STRING KABUPATEN AGAR SINKRON DENGAN DROPDOWN            //
  // ===================================================================== //
  const cleanKabupatenName = (name) => {
    if (!name) return '';
    let str = String(name).trim().toUpperCase();
    
    // Bersihkan semua variasi prefix yang mungkin terbawa
    str = str.replace(/^(KAB\.|KABUPATEN|KOTA)\s+/i, '').trim();
    
    // Kembalikan prefix baku yang persis sesuai dengan KABUPATEN_LIST
    if (str === 'PONTIANAK' || str === 'SINGKAWANG') {
      return `KOTA ${str}`;
    } else {
      return `KAB. ${str}`;
    }
  };

  // Sync URL Search Params
  useEffect(() => {
    setSearchParams({
      tahun: selectedYear,
      wilayah: filterWilayah,
      jenjang: activeTab
    });
  }, [selectedYear, filterWilayah, activeTab]);

  // ===================================================================== //
  // FETCH DATA PRE-CALCULATED DARI FIRESTORE                              //
  // ===================================================================== //
  useEffect(() => {
    const fetchInklusiData = async () => {
      setLoading(true);
      setError(null);
      try {
        const docRef = doc(db, 'dapodik_agregasi', `inklusi_pd_${selectedYear}`);
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists() && docSnap.data().data) {
          setRawAgregasi(docSnap.data().data);
        } else {
          setRawAgregasi([]);
        }
      } catch (err) {
        console.error("Gagal mengambil data agregasi inklusi:", err);
        setError("Koneksi terputus atau data agregasi belum digenerate admin.");
      } finally {
        setLoading(false);
      }
    };

    fetchInklusiData();
  }, [selectedYear]);

  // ===================================================================== //
  // CLIENT-SIDE FILTER & AGREGASI ENGINE (DYNAMIC DRILL-DOWN)             //
  // ===================================================================== //
  const processedData = useMemo(() => {
    if (!rawAgregasi || rawAgregasi.length === 0) return [];

    const dataMap = new Map();
    const isSemuaProvinsi = filterWilayah === 'SEMUA';

    rawAgregasi.forEach(item => {
      const itemKab = cleanKabupatenName(item.kabupaten);
      const itemKec = String(item.kecamatan || 'TIDAK DIKETAHUI').trim().toUpperCase();
      const itemBentuk = String(item.bentuk_pendidikan || '').trim().toUpperCase();
      const itemStatus = String(item.status_sekolah || '').trim().toUpperCase();

      // 1. Filter Wilayah (Kabupaten)
      if (!isSemuaProvinsi && itemKab !== filterWilayah) return;

      // 2. Filter Jenjang Pendidikan Berdasarkan Tab aktif
      if (activeTab !== 'SEMUA') {
        const allowedBentuk = JENJANG_GROUPS[activeTab] || [];
        if (!allowedBentuk.includes(itemBentuk)) return;
      }

      // 3. Filter Status Sekolah (Negeri / Swasta)
      if (filterStatus !== 'SEMUA' && itemStatus !== filterStatus) return;

      // PENENTUAN LEVEL AGREGASI BERDASARKAN FILTER WILAYAH
      // Jika "SEMUA", kita kumpulkan per Kabupaten. Jika tidak, kumpulkan per Kecamatan.
      const groupKey = isSemuaProvinsi ? itemKab : itemKec;

      if (!dataMap.has(groupKey)) {
        dataMap.set(groupKey, {
          group_name: groupKey, // Properti universal untuk render tabel
          total_sekolah: 0,
          sekolah_inklusi: 0,
          siswa_inklusi: 0
        });
      }

      const row = dataMap.get(groupKey);
      row.total_sekolah += parseInt(item.total_sekolah || 0);
      row.sekolah_inklusi += parseInt(item.sekolah_inklusi || 0);
      row.siswa_inklusi += parseInt(item.siswa_inklusi || 0);
    });

    return Array.from(dataMap.values())
      .map(item => {
        const persentase = item.total_sekolah > 0 
          ? (item.sekolah_inklusi / item.total_sekolah) * 100 
          : 0;
        return { ...item, persentase_inklusi: persentase };
      })
      .filter(item => {
        if (!searchTerm) return true;
        return item.group_name.toLowerCase().includes(searchTerm.toLowerCase());
      })
      .sort((a, b) => a.group_name.localeCompare(b.group_name));
  }, [rawAgregasi, filterWilayah, activeTab, filterStatus, searchTerm]);

  // ===================================================================== //
  // HITUNG GRAND TOTAL BARIS PALING BAWAH                                 //
  // ===================================================================== //
  const grandTotal = useMemo(() => {
    return processedData.reduce((acc, curr) => {
      acc.total_sekolah += curr.total_sekolah;
      acc.sekolah_inklusi += curr.sekolah_inklusi;
      acc.siswa_inklusi += curr.siswa_inklusi;
      return acc;
    }, { total_sekolah: 0, sekolah_inklusi: 0, siswa_inklusi: 0 });
  }, [processedData]);

  const grandPersentase = useMemo(() => {
    return grandTotal.total_sekolah > 0 
      ? (grandTotal.sekolah_inklusi / grandTotal.total_sekolah) * 100 
      : 0;
  }, [grandTotal]);

  // ===================================================================== //
  // EXPORT DATA KE EXCEL MENGGUNAKAN EXCELJS                              //
  // ===================================================================== //
  const exportToExcel = async () => {
    if (processedData.length === 0) {
      alert("Tidak ada data untuk diexport, Sob.");
      return;
    }

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Data Siswa Inklusi');
    const isSemuaProvinsi = filterWilayah === 'SEMUA';

    // Setup Kolom Header Fleksibel
    worksheet.columns = [
      { header: 'NO', key: 'no', width: 6 },
      isSemuaProvinsi 
        ? { header: 'KABUPATEN / KOTA', key: 'group_name', width: 30 }
        : { header: 'KECAMATAN', key: 'group_name', width: 30 },
      { header: 'JUMLAH SELURUH SEKOLAH', key: 'total_sekolah', width: 25 },
      { header: 'JUMLAH SEKOLAH MENERIMA INKLUSI', key: 'sekolah_inklusi', width: 35 },
      { header: '% SEKOLAH MENERIMA INKLUSI', key: 'persentase_inklusi', width: 30 },
      { header: 'JUMLAH SISWA INKLUSI', key: 'siswa_inklusi', width: 25 },
    ];

    // Styling Header Row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, name: 'Arial', size: 11 };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } }; // Teal 600 Accent
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    headerRow.height = 30;

    // Inject Baris Data
    processedData.forEach((row, index) => {
      const addedRow = worksheet.addRow({
        no: index + 1,
        group_name: row.group_name,
        total_sekolah: row.total_sekolah,
        sekolah_inklusi: row.sekolah_inklusi,
        persentase_inklusi: parseFloat(row.persentase_inklusi.toFixed(2)),
        siswa_inklusi: row.siswa_inklusi
      });

      addedRow.getCell('persentase_inklusi').numFmt = '0.00"%"';
      addedRow.alignment = { vertical: 'middle' };
      addedRow.getCell('no').alignment = { horizontal: 'center' };
    });

    // Inject Baris Grand Total Bawah
    const totalRow = worksheet.addRow({
      no: '',
      group_name: 'GRAND TOTAL',
      total_sekolah: grandTotal.total_sekolah,
      sekolah_inklusi: grandTotal.sekolah_inklusi,
      persentase_inklusi: parseFloat(grandPersentase.toFixed(2)),
      siswa_inklusi: grandTotal.siswa_inklusi
    });
    
    totalRow.font = { bold: true, name: 'Arial' };
    totalRow.getCell('persentase_inklusi').numFmt = '0.00"%"';
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0FDFA' } }; // Teal 50 BG

    worksheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
        };
      });
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `SITAKA_Siswa_Inklusi_Jenjang_${activeTab}_Tahun_${selectedYear}.xlsx`;
    link.click();
  };

  const isSemuaProvinsi = filterWilayah === 'SEMUA';

  return (
    <div className="w-full flex flex-col p-6 md:p-10 min-h-screen bg-gray-50 text-gray-800 animate-in fade-in duration-300">
      
      {/* HEADER UTAMA DASHBOARD */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="bg-teal-600 text-white p-2.5 rounded-xl shadow-md shadow-teal-600/20">
              <Users size={24} />
            </div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-gray-900">Analisis Siswa Inklusi</h1>
          </div>
          <p className="text-sm text-gray-500 font-medium">Dashboard Pemantauan Sekolah Penyelenggara & Jumlah Siswa Berkebutuhan Khusus</p>
        </div>

        {/* CONTROLLER UTAMA TAHUN DAN DOWNLOAD */}
        <div className="flex items-center gap-3">
          <select 
            value={selectedYear} 
            onChange={(e) => setSelectedYear(e.target.value)}
            className="bg-white border border-gray-200 text-sm font-black text-gray-700 px-5 py-3 rounded-2xl shadow-sm outline-none focus:ring-2 focus:ring-teal-500 transition-all cursor-pointer"
          >
            <option value="2024">Tahun Data 2024</option>
            <option value="2025">Tahun Data 2025</option>
            <option value="2026">Tahun Data 2026</option>
          </select>

          <button 
            onClick={exportToExcel}
            className="flex items-center gap-2 bg-teal-600 text-white px-5 py-3 rounded-2xl font-black text-sm uppercase hover:bg-teal-700 transition-all active:scale-95 shadow-md shadow-teal-600/10"
          >
            <Download size={16} /> Export Excel
          </button>
        </div>
      </div>

      {/* BANNER NOTIFIKASI JIKA DATA AGREGASI KOSONG */}
      {!loading && rawAgregasi.length === 0 && !error && (
        <div className="mb-8 bg-amber-50 border-2 border-amber-200 p-5 rounded-3xl flex items-center gap-4 text-amber-800 animate-pulse">
          <AlertTriangle size={32} className="shrink-0 text-amber-600" />
          <div>
            <h4 className="font-black uppercase text-sm tracking-wider">Perhatian, Sob!</h4>
            <p className="text-xs font-semibold opacity-90 mt-0.5">Data agregasi inklusi untuk tahun berjalan ({selectedYear}) masih kosong. Silahkan lakukan kalkulasi ulang terlebih dahulu di halaman Mesin Kalkulasi Admin.</p>
          </div>
        </div>
      )}

      {/* SECTION CARD UNTUK FILTER BAR UTAMA */}
      <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-xl shadow-gray-100/40 mb-8 flex flex-col gap-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* FILTER 1: WILAYAH / KABUPATEN */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider flex items-center gap-1">
              <MapPin size={10} /> Wilayah Administrasi
            </label>
            <select 
              value={filterWilayah} 
              onChange={(e) => setFilterWilayah(e.target.value)}
              className="bg-gray-50 border border-gray-100 text-xs font-black text-gray-700 p-4 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-teal-500 transition-all cursor-pointer uppercase"
            >
              <option value="SEMUA">🌐 SELURUH PROVINSI</option>
              {KABUPATEN_LIST.map((kab) => (
                <option key={kab} value={kab}>📌 {kab}</option>
              ))}
            </select>
          </div>

          {/* FILTER 2: STATUS SEKOLAH */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider flex items-center gap-1">
              <ShieldCheck size={10} /> Status Satuan Pendidikan
            </label>
            <select 
              value={filterStatus} 
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-gray-50 border border-gray-100 text-xs font-black text-gray-700 p-4 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-teal-500 transition-all cursor-pointer uppercase"
            >
              <option value="SEMUA">🏛️ NEGERI & SWASTA</option>
              <option value="NEGERI">🏛️ KHUSUS NEGERI</option>
              <option value="SWASTA">🪶 KHUSUS SWASTA</option>
            </select>
          </div>

          {/* FILTER 3: LIVE SEARCH DINAMIS */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-black uppercase text-gray-400 tracking-wider flex items-center gap-1">
              <Search size={10} /> {isSemuaProvinsi ? 'Cari Kabupaten' : 'Cari Kecamatan'}
            </label>
            <div className="relative w-full">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text"
                placeholder={isSemuaProvinsi ? "Ketik nama kabupaten..." : "Ketik nama kecamatan..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-gray-50 border border-gray-100 text-xs font-bold text-gray-700 pl-11 pr-4 p-4 rounded-xl outline-none focus:bg-white focus:ring-2 focus:ring-teal-500 transition-all uppercase placeholder:normal-case"
              />
            </div>
          </div>
        </div>

        {/* SUB-TABS PILIHAN JENJANG PENDIDIKAN */}
        <div className="border-t border-gray-100 pt-4 overflow-x-auto flex items-center gap-2 scrollbar-none">
          {['SEMUA', 'PAUD', 'SD', 'SMP', 'SMA', 'SMK'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all whitespace-nowrap
                ${activeTab === tab 
                  ? 'bg-teal-600 text-white shadow-md shadow-teal-600/10 scale-[1.02]' 
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`}
            >
              {tab === 'SEMUA' ? 'Semua Jenjang' : `JENJANG ${tab}`}
            </button>
          ))}
        </div>
      </div>

      {/* DATA RENDERING TABLE (VIEW UTAMA) */}
      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl shadow-gray-100/30 flex-1 flex flex-col overflow-hidden">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="animate-spin text-teal-600" size={48} />
            <p className="font-black uppercase text-xs tracking-widest text-gray-400">Menyusun Data Inklusi...</p>
          </div>
        ) : error ? (
          <div className="p-20 text-center flex flex-col items-center justify-center gap-3 text-red-500">
            <AlertTriangle size={48} />
            <p className="font-black uppercase text-sm">{error}</p>
          </div>
        ) : processedData.length === 0 ? (
          <div className="p-20 text-center flex flex-col items-center justify-center gap-3 text-gray-400">
            <School size={48} className="opacity-40" />
            <p className="font-black uppercase text-xs tracking-widest">Tidak Ada Baris Data Yang Sesuai Filter.</p>
          </div>
        ) : (
          <div className="w-full overflow-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-teal-600/5 text-teal-900 border-b border-gray-100">
                  <th className="py-5 px-6 font-black uppercase text-[11px] tracking-wider text-center w-16">No</th>
                  <th className="py-5 px-6 font-black uppercase text-[11px] tracking-wider">
                    {isSemuaProvinsi ? 'Kabupaten / Kota' : 'Kecamatan'}
                  </th>
                  <th className="py-5 px-6 font-black uppercase text-[11px] tracking-wider text-center">Jumlah Seluruh Sekolah</th>
                  <th className="py-5 px-6 font-black uppercase text-[11px] tracking-wider text-center">Sekolah Menerima Inklusi</th>
                  <th className="py-5 px-6 font-black uppercase text-[11px] tracking-wider text-center">% Kesiapan Inklusi</th>
                  <th className="py-5 px-6 font-black uppercase text-[11px] tracking-wider text-center">Jumlah Siswa Inklusi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs font-bold text-gray-600">
                {processedData.map((row, index) => (
                  <tr key={row.group_name + index} className="hover:bg-gray-50/80 transition-colors">
                    <td className="py-4 px-6 text-center text-gray-400 font-bold">{index + 1}</td>
                    <td className="py-4 px-6 uppercase tracking-wide text-gray-900 font-black">
                      {row.group_name}
                    </td>
                    <td className="py-4 px-6 text-center text-base text-gray-900 font-mono font-bold">
                      {row.total_sekolah.toLocaleString('id-ID')}
                    </td>
                    <td className="py-4 px-6 text-center text-base text-teal-700 font-mono font-bold bg-teal-50/20">
                      {row.sekolah_inklusi.toLocaleString('id-ID')}
                    </td>
                    <td className="py-4 px-6 text-center font-mono">
                      <span className={`px-3 py-1.5 rounded-full text-xs font-black flex items-center justify-center gap-1 mx-auto w-24
                        ${row.persentase_inklusi > 50 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                        <Percent size={12} /> {row.persentase_inklusi.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-4 px-6 text-center text-base text-purple-700 font-mono font-black bg-purple-50/20">
                      {row.siswa_inklusi.toLocaleString('id-ID')}
                    </td>
                  </tr>
                ))}

                {/* GRAND TOTAL ROW BARIS PALING BAWAH */}
                <tr className="bg-teal-50/40 text-gray-900 font-black text-sm border-t-2 border-teal-600/20">
                  <td className="py-5 px-6"></td>
                  <td className="py-5 px-6 uppercase tracking-wider text-teal-900">
                    Grand Total
                  </td>
                  <td className="py-5 px-6 text-center font-mono text-lg">
                    {grandTotal.total_sekolah.toLocaleString('id-ID')}
                  </td>
                  <td className="py-5 px-6 text-center font-mono text-lg text-teal-700 bg-teal-50/30">
                    {grandTotal.sekolah_inklusi.toLocaleString('id-ID')}
                  </td>
                  <td className="py-5 px-6 text-center font-mono">
                    <span className="px-4 py-2 rounded-xl bg-teal-600 text-white font-black text-xs inline-flex items-center gap-1 shadow-sm">
                      <Percent size={12} /> {grandPersentase.toFixed(2)}%
                    </span>
                  </td>
                  <td className="py-5 px-6 text-center font-mono text-xl text-purple-800 bg-purple-50/30">
                    {grandTotal.siswa_inklusi.toLocaleString('id-ID')}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}