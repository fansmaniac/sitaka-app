import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Download, Building2, MapPin, Search, X, ChevronLeft, ChevronRight, School
} from 'lucide-react';
import ExcelJS from 'exceljs';

// =====================================================================
// UTILITY FUNCTIONS
// =====================================================================
const getVal = (obj, keyName) => {
  if (!obj) return '';
  const key = Object.keys(obj).find(k => k.trim().toLowerCase() === keyName.toLowerCase());
  return key ? obj[key] : '';
};

const KABUPATEN_LIST = [
  "BENGKAYANG", "KAPUAS HULU", "KAYONG UTARA", "KETAPANG", 
  "KUBU RAYA", "LANDAK", "MELAWI", "MEMPAWAH", "PONTIANAK", 
  "SAMBAS", "SANGGAU", "SEKADAU", "SINGKAWANG", "SINTANG"
];

const cleanKabupatenName = (rawName) => {
  if (!rawName) return "TIDAK DIKETAHUI";
  let name = String(rawName).toUpperCase().replace(/^(KAB\.|KABUPATEN|KOTA)\s+/i, '').trim();
  const found = KABUPATEN_LIST.find(kab => name.includes(kab));
  if (found) return found;
  return name; 
};

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

// PEMISAHAN JENJANG STRUKTUR COMPACT
const JENJANG_GROUPS = {
  'PAUD': ['KB', 'TK', 'SPS', 'TPA', 'PAUD'],
  'SD': ['SD', 'SPK SD'],
  'SMP': ['SMP', 'SPK SMP'],
  'SMA': ['SMA', 'SPK SMA'],
  'SMK': ['SMK'],
  'SLB': ['SLB', 'SDLB', 'SMPLB', 'SMALB'],
  'NON FORMAL': ['PKBM', 'SKB']
};

const identifyJenjangGroup = (jenjangDb) => {
  const j = String(jenjangDb).trim().toUpperCase();
  for (const [key, arr] of Object.entries(JENJANG_GROUPS)) {
    if (arr.includes(j)) return key;
  }
  return null;
};

// Fungsi Hitung Ruangan Layak Pakai
const sumUsableRooms = (item, prefix) => {
  const baik = parseInt(getVal(item, `${prefix}_baik`)) || 0;
  const rr = parseInt(getVal(item, `${prefix}_rusak_ringan`)) || 0;
  const rs = parseInt(getVal(item, `${prefix}_rusak_sedang`)) || 0;
  const rb = parseInt(getVal(item, `${prefix}_rusak_berat`)) || 0;
  return baik + rr + rs + rb; 
};

// =====================================================================
// MAIN COMPONENT: RINCIAN SARPRAS
// =====================================================================
export default function RincianSarpras({ 
  isOpen, 
  onClose, 
  data = [], 
  initialWilayah = 'SEMUA', 
  activeJenjang = 'SEMUA', 
  filterStatusParent = 'SEMUA',
  displayLastUpdated 
}) {
  const [activeModalTab, setActiveModalTab] = useState('KECAMATAN'); // 'KECAMATAN' | 'SEKOLAH'
  
  const [searchTerm, setSearchTerm] = useState('');
  const [filterWilayah, setFilterWilayah] = useState('SEMUA'); 
  const [filterWilayahSekolah, setFilterWilayahSekolah] = useState('SEMUA'); 
  const [filterStatus, setFilterStatus] = useState('SEMUA'); 
  const [activeJenjangTab, setActiveJenjangTab] = useState('SEMUA'); 

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 15;

  const isModeSemua = initialWilayah === 'SEMUA';

  // Sinkronisasi awal saat modal dibuka
  useEffect(() => {
    if (isOpen) {
      setActiveModalTab('KECAMATAN');
      setSearchTerm('');
      setFilterWilayah('SEMUA');
      setFilterWilayahSekolah('SEMUA');
      setFilterStatus(filterStatusParent);
      setActiveJenjangTab(activeJenjang);
      setCurrentPage(1);
    }
  }, [isOpen, initialWilayah, activeJenjang, filterStatusParent]);

  // Reset pagination saat filter berubah
  useEffect(() => { 
    setCurrentPage(1); 
  }, [searchTerm, filterWilayah, filterWilayahSekolah, filterStatus, activeJenjangTab, activeModalTab]);

  // Ekstrak baris data item murni dari dokumen chunks
  const allItems = useMemo(() => {
    if (!data || !isOpen) return [];
    let items = [];
    data.forEach(chunk => {
       if (chunk && Array.isArray(chunk.data)) {
          items = items.concat(chunk.data);
       }
    });
    return items;
  }, [data, isOpen]);

  // Ekstrak Daftar Wilayah untuk Dropdown Filter
  const listWilayahFilter = useMemo(() => {
    const validData = allItems.filter(item => {
      if (isModeSemua) return true;
      return cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota')) === initialWilayah;
    });

    const list = validData.map(item => {
      return isModeSemua 
        ? cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'))
        : String(getVal(item, 'kecamatan') || 'TIDAK DIKETAHUI').trim().toUpperCase();
    });

    return [...new Set(list)].sort();
  }, [allItems, isModeSemua, initialWilayah]);

  // =====================================================================
  // AGREGASI DATA TAB "PER KECAMATAN"
  // =====================================================================
  const dataKecamatan = useMemo(() => {
    if (!allItems.length) return [];
    
    const baseData = allItems.filter(item => {
      const kabDb = cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'));
      if (!isModeSemua && kabDb !== initialWilayah) return false;

      const group = identifyJenjangGroup(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang'));
      if (activeJenjang !== 'SEMUA' && group !== activeJenjang) return false;
      if (activeJenjang === 'SEMUA' && group === null) return false;

      if (filterStatus !== 'SEMUA') {
        const statusDb = String(getVal(item, 'status_sekolah') || '').toUpperCase();
        if (statusDb !== filterStatus) return false;
      }
      return true;
    });

    const mapAgg = new Map();

    baseData.forEach(item => {
      let keyId = isModeSemua 
          ? cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota')) 
          : String(getVal(item, 'kecamatan') || 'TIDAK DIKETAHUI').trim().toUpperCase();

      if (filterWilayah !== 'SEMUA' && keyId !== filterWilayah) return;

      if (!mapAgg.has(keyId)) {
        mapAgg.set(keyId, { 
          namaWilayah: keyId, 
          kelas: 0, perpus: 0, lab_komputer: 0, lab_bahasa: 0,
          lab_ipa: 0, lab_fisika: 0, lab_biologi: 0, kepsek: 0,
          guru: 0, wc_siswa: 0, wc_guru: 0 
        });
      }

      const row = mapAgg.get(keyId);
      
      row.kelas += sumUsableRooms(item, 'ruang_kelas');
      row.perpus += sumUsableRooms(item, 'ruang_perpustakaan');
      row.lab_komputer += sumUsableRooms(item, 'ruang_lab_komputer');
      row.lab_bahasa += sumUsableRooms(item, 'ruang_lab_bahasa');
      row.lab_ipa += sumUsableRooms(item, 'ruang_lab_ipa');
      row.lab_fisika += sumUsableRooms(item, 'ruang_lab_fisika');
      row.lab_biologi += sumUsableRooms(item, 'ruang_lab_biologi');
      row.kepsek += sumUsableRooms(item, 'ruang_ruang_kepsek');
      row.guru += sumUsableRooms(item, 'ruang_ruang_guru');
      
      row.wc_siswa += sumUsableRooms(item, 'ruang_wc_siswa_laki_laki') + sumUsableRooms(item, 'ruang_wc_siswa_perempuan');
      row.wc_guru += sumUsableRooms(item, 'ruang_wc_guru_laki_laki') + sumUsableRooms(item, 'ruang_wc_guru_perempuan');
    });

    let resultArray = Array.from(mapAgg.values());

    if (searchTerm) {
      resultArray = resultArray.filter(r => r.namaWilayah.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    return isModeSemua 
      ? resultArray.sort((a, b) => getKabupatenRank(a.namaWilayah) - getKabupatenRank(b.namaWilayah)) 
      : resultArray.sort((a, b) => a.namaWilayah.localeCompare(b.namaWilayah));
  }, [allItems, isModeSemua, initialWilayah, filterWilayah, filterStatus, searchTerm, activeJenjang]);

  const totalsKecamatan = useMemo(() => {
    return dataKecamatan.reduce((acc, curr) => {
      acc.kelas += curr.kelas; acc.perpus += curr.perpus;
      acc.lab_komputer += curr.lab_komputer; acc.lab_bahasa += curr.lab_bahasa;
      acc.lab_ipa += curr.lab_ipa; acc.lab_fisika += curr.lab_fisika; acc.lab_biologi += curr.lab_biologi;
      acc.kepsek += curr.kepsek; acc.guru += curr.guru;
      acc.wc_siswa += curr.wc_siswa; acc.wc_guru += curr.wc_guru;
      return acc;
    }, { 
      kelas: 0, perpus: 0, lab_komputer: 0, lab_bahasa: 0, lab_ipa: 0, 
      lab_fisika: 0, lab_biologi: 0, kepsek: 0, guru: 0, wc_siswa: 0, wc_guru: 0 
    });
  }, [dataKecamatan]);

  // =====================================================================
  // AGREGASI DATA TAB "PER SEKOLAH"
  // =====================================================================
  const dataSekolah = useMemo(() => {
    if (!allItems.length) return [];
    
    let validData = allItems.filter(item => {
      const kabDb = cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'));
      if (!isModeSemua && kabDb !== initialWilayah) return false;

      if (filterStatus !== 'SEMUA') {
        const statusDb = String(getVal(item, 'status_sekolah') || '').toUpperCase();
        if (statusDb !== filterStatus) return false;
      }

      const group = identifyJenjangGroup(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang'));
      if (activeJenjangTab !== 'SEMUA' && group !== activeJenjangTab) return false;
      if (activeJenjangTab === 'SEMUA' && group === null) return false;

      if (filterWilayahSekolah !== 'SEMUA') {
        let keyId = isModeSemua ? kabDb : String(getVal(item, 'kecamatan') || 'TIDAK DIKETAHUI').trim().toUpperCase();
        if (keyId !== filterWilayahSekolah) return false;
      }

      if (searchTerm) {
        const nama = String(getVal(item, 'nama_sekolah') || '').toLowerCase();
        const npsn = String(getVal(item, 'npsn') || '').toLowerCase();
        const q = searchTerm.toLowerCase();
        if (!nama.includes(q) && !npsn.includes(q)) return false;
      }

      return true;
    });

    return validData.map(item => ({
      npsn: getVal(item, 'npsn') || '-',
      nama_sekolah: getVal(item, 'nama_sekolah') || '-',
      kecamatan: String(getVal(item, 'kecamatan') || 'TIDAK DIKETAHUI').trim().toUpperCase(),
      jenjang: String(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang')).trim().toUpperCase(),
      status: String(getVal(item, 'status_sekolah') || '').toUpperCase(),
      kelas: sumUsableRooms(item, 'ruang_kelas'),
      perpus: sumUsableRooms(item, 'ruang_perpustakaan'),
      lab_komputer: sumUsableRooms(item, 'ruang_lab_komputer'),
      lab_bahasa: sumUsableRooms(item, 'ruang_lab_bahasa'),
      lab_ipa: sumUsableRooms(item, 'ruang_lab_ipa'),
      lab_fisika: sumUsableRooms(item, 'ruang_lab_fisika'),
      lab_biologi: sumUsableRooms(item, 'ruang_lab_biologi'),
      kepsek: sumUsableRooms(item, 'ruang_ruang_kepsek'),
      guru: sumUsableRooms(item, 'ruang_ruang_guru'),
      wc_siswa: sumUsableRooms(item, 'ruang_wc_siswa_laki_laki') + sumUsableRooms(item, 'ruang_wc_siswa_perempuan'),
      wc_guru: sumUsableRooms(item, 'ruang_wc_guru_laki_laki') + sumUsableRooms(item, 'ruang_wc_guru_perempuan')
    })).sort((a, b) => a.nama_sekolah.localeCompare(b.nama_sekolah));

  }, [allItems, isModeSemua, initialWilayah, filterStatus, activeJenjangTab, filterWilayahSekolah, searchTerm]);

  const totalsSekolah = useMemo(() => {
    return dataSekolah.reduce((acc, curr) => {
      acc.kelas += curr.kelas; acc.perpus += curr.perpus;
      acc.lab_komputer += curr.lab_komputer; acc.lab_bahasa += curr.lab_bahasa;
      acc.lab_ipa += curr.lab_ipa; acc.lab_fisika += curr.lab_fisika; acc.lab_biologi += curr.lab_biologi;
      acc.kepsek += curr.kepsek; acc.guru += curr.guru;
      acc.wc_siswa += curr.wc_siswa; acc.wc_guru += curr.wc_guru;
      return acc;
    }, { 
      kelas: 0, perpus: 0, lab_komputer: 0, lab_bahasa: 0, lab_ipa: 0, 
      lab_fisika: 0, lab_biologi: 0, kepsek: 0, guru: 0, wc_siswa: 0, wc_guru: 0 
    });
  }, [dataSekolah]);

  // =====================================================================
  // EXPORT EXCEL
  // =====================================================================
  const downloadExcelRincian = async () => {
    const workbook = new ExcelJS.Workbook();
    const safeJenjang = activeJenjangTab.replace(/\//g, '_');

    if (activeModalTab === 'KECAMATAN') {
      const sheetName = isModeSemua ? 'Rekap Provinsi' : `Rekap ${initialWilayah}`;
      const worksheet = workbook.addWorksheet(sheetName);

      worksheet.columns = [
        { header: isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan', key: 'namaWilayah', width: 30 },
        { header: 'Ruang Kelas', key: 'kelas', width: 15 },
        { header: 'Perpustakaan', key: 'perpus', width: 15 },
        { header: 'Lab Komputer', key: 'lab_komputer', width: 15 },
        { header: 'Lab Bahasa', key: 'lab_bahasa', width: 15 },
        { header: 'Lab IPA', key: 'lab_ipa', width: 15 },
        { header: 'Lab Fisika', key: 'lab_fisika', width: 15 },
        { header: 'Lab Biologi', key: 'lab_biologi', width: 15 },
        { header: 'Ruang Kepsek', key: 'kepsek', width: 15 },
        { header: 'Ruang Guru', key: 'guru', width: 15 },
        { header: 'WC Siswa', key: 'wc_siswa', width: 15 },
        { header: 'WC Guru', key: 'wc_guru', width: 15 }
      ];

      dataKecamatan.forEach(item => worksheet.addRow(item));
      const totalRow = worksheet.addRow({ namaWilayah: 'TOTAL KESELURUHAN', ...totalsKecamatan });

      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7490' } }; // Cyan 700
      totalRow.font = { bold: true, color: { argb: 'FF155E75' } }; 
      totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCFFAFE' } };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
      link.download = `Rincian_Sarpras_Kecamatan_${initialWilayah}_${safeJenjang}.xlsx`;
      link.click();
    } else {
      const worksheet = workbook.addWorksheet('Daftar Sekolah');

      worksheet.columns = [
        { header: 'NPSN', key: 'npsn', width: 15 },
        { header: 'Nama Sekolah', key: 'nama_sekolah', width: 45 },
        { header: 'Kecamatan', key: 'kecamatan', width: 25 },
        { header: 'Jenjang', key: 'jenjang', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'R. Kelas', key: 'kelas', width: 12 },
        { header: 'Perpustakaan', key: 'perpus', width: 15 },
        { header: 'Lab Komp', key: 'lab_komputer', width: 12 },
        { header: 'Lab Bhs', key: 'lab_bahasa', width: 12 },
        { header: 'Lab IPA', key: 'lab_ipa', width: 12 },
        { header: 'Lab Fisika', key: 'lab_fisika', width: 12 },
        { header: 'Lab Biologi', key: 'lab_biologi', width: 12 },
        { header: 'R. Kepsek', key: 'kepsek', width: 12 },
        { header: 'R. Guru', key: 'guru', width: 12 },
        { header: 'WC Siswa', key: 'wc_siswa', width: 12 },
        { header: 'WC Guru', key: 'wc_guru', width: 12 }
      ];

      dataSekolah.forEach(item => worksheet.addRow(item));
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E7490' } };

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob);
      link.download = `Daftar_Sekolah_Sarpras_${initialWilayah}_${safeJenjang}.xlsx`;
      link.click();
    }
  };

  // Pagination
  const activeData = activeModalTab === 'KECAMATAN' ? dataKecamatan : dataSekolah;
  const totalPages = Math.ceil(activeData.length / rowsPerPage) || 1;
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentRows = activeData.slice(startIndex, startIndex + rowsPerPage);
  
  const goToPage = (page) => { if (page >= 1 && page <= totalPages) setCurrentPage(page); };

  if (!isOpen) return null;

  const SUB_TABS_SEKOLAH = ['SEMUA', 'PAUD', 'SD', 'SMP', 'SMA', 'SMK', 'SLB', 'NON FORMAL'];

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className="bg-white w-full max-w-7xl h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300" onClick={e => e.stopPropagation()}>
        
        {/* HEADER MODAL */}
        <div className="bg-cyan-700 px-6 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 text-white">
            <div className="bg-white/20 p-2 rounded-xl"><Building2 size={24} /></div>
            <div>
              <h2 className="text-xl font-black uppercase tracking-tighter leading-none">Rincian Infrastruktur & Sarpras</h2>
              <p className="text-cyan-200 text-sm font-bold uppercase tracking-widest mt-1 flex gap-2">
                <span>{isModeSemua ? 'Provinsi Kalimantan Barat' : `Kabupaten ${initialWilayah}`}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={downloadExcelRincian} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl font-black text-xs uppercase shadow-md transition-all active:scale-95 border border-emerald-400">
              <Download size={14} /> Unduh Excel
            </button>
            <button onClick={onClose} className="p-2 bg-cyan-900 hover:bg-red-500 text-white rounded-xl transition-colors">
              <X size={24} />
            </button>
          </div>
        </div>

        {/* TAB NAVIGATION DALAM MODAL */}
        <div className="bg-cyan-50 px-6 pt-3 flex gap-2 border-b border-cyan-100 shrink-0">
          <button 
            onClick={() => setActiveModalTab('KECAMATAN')}
            className={`px-6 py-2.5 rounded-t-xl font-black uppercase text-xs transition-all border-b-4 ${activeModalTab === 'KECAMATAN' ? 'bg-white text-cyan-800 border-cyan-800 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]' : 'bg-transparent text-cyan-600 border-transparent hover:text-cyan-800 hover:bg-cyan-100/50'}`}
          >
            <div className="flex items-center gap-2"><MapPin size={16}/> Per Kecamatan</div>
          </button>
          <button 
            onClick={() => setActiveModalTab('SEKOLAH')}
            className={`px-6 py-2.5 rounded-t-xl font-black uppercase text-xs transition-all border-b-4 ${activeModalTab === 'SEKOLAH' ? 'bg-white text-cyan-800 border-cyan-800 shadow-[0_-4px_10px_rgba(0,0,0,0.05)]' : 'bg-transparent text-cyan-600 border-transparent hover:text-cyan-800 hover:bg-cyan-100/50'}`}
          >
            <div className="flex items-center gap-2"><School size={16}/> Per Sekolah</div>
          </button>
        </div>

        {/* TAB JENJANG KHUSUS PER SEKOLAH */}
        {activeModalTab === 'SEKOLAH' && (
          <div className="bg-white px-6 pt-4 pb-0 flex gap-2 overflow-x-auto scrollbar-hide shrink-0 z-10 relative">
            {SUB_TABS_SEKOLAH.map(j => (
              <button 
                key={j} onClick={() => setActiveJenjangTab(j)}
                className={`px-5 py-2 rounded-xl font-black uppercase text-[10px] md:text-xs transition-all whitespace-nowrap border ${activeJenjangTab === j ? 'bg-cyan-700 text-white border-cyan-700 shadow-md' : 'bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100'}`}
              >
                {j === 'SEMUA' ? 'Semua Jenjang' : j}
              </button>
            ))}
          </div>
        )}

        {/* FILTER BAR */}
        <div className={`bg-white px-6 py-4 border-b border-gray-200 flex flex-wrap gap-4 items-center shrink-0 shadow-sm z-10 ${activeModalTab === 'SEKOLAH' ? 'border-t-0 pt-3' : ''}`}>
          <div className="relative flex-1 min-w-[250px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder={activeModalTab === 'KECAMATAN' ? `Cari ${isModeSemua ? 'Kabupaten' : 'Kecamatan'}...` : "Cari Nama Sekolah atau NPSN..."} 
              value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-200 font-bold text-gray-700"
            />
          </div>

          <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
            <MapPin size={16} className="text-gray-400 mr-2 shrink-0" />
            <select 
              value={activeModalTab === 'KECAMATAN' ? filterWilayah : filterWilayahSekolah} 
              onChange={(e) => activeModalTab === 'KECAMATAN' ? setFilterWilayah(e.target.value) : setFilterWilayahSekolah(e.target.value)} 
              className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer max-w-[200px]"
            >
              <option value="SEMUA">{isModeSemua ? 'SEMUA KABUPATEN' : 'SEMUA KECAMATAN'}</option>
              {listWilayahFilter.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
          </div>

          <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-1.5 shadow-sm">
            <Building2 size={16} className="text-gray-400 mr-2 shrink-0" />
            <select 
              name="modalSecuredStatus" id="modalSecuredStatus" autoComplete="off"
              value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} 
              className="bg-transparent text-xs font-black uppercase text-gray-700 outline-none cursor-pointer pr-1"
            >
              <option value="SEMUA">Semua Status</option>
              <option value="NEGERI">Negeri</option>
              <option value="SWASTA">Swasta</option>
            </select>
          </div>
        </div>

        {/* TABLE AREA */}
        <div className="flex-1 overflow-auto bg-gray-50/50 p-4 custom-scrollbar">
          
          {/* TABEL KECAMATAN */}
          {activeModalTab === 'KECAMATAN' && (
            <table className="w-full text-center border-separate border-spacing-y-2">
              <thead className="sticky top-0 bg-white z-10 shadow-sm rounded-xl">
                <tr className="text-[10px] font-black uppercase text-gray-500 whitespace-nowrap">
                  <th className="px-4 py-3 text-center rounded-l-xl w-16">No</th>
                  <th className="px-4 py-3 text-left">{isModeSemua ? 'Kabupaten/Kota' : 'Kecamatan'}</th>
                  <th className="px-2 py-3 text-cyan-700">R. Kelas</th>
                  <th className="px-2 py-3 text-blue-600">Perpus</th>
                  <th className="px-2 py-3 text-indigo-600">Lab Komp</th>
                  <th className="px-2 py-3 text-violet-600">Lab Bhs</th>
                  <th className="px-2 py-3 text-fuchsia-600">Lab IPA</th>
                  <th className="px-2 py-3 text-pink-600">Lab Fis</th>
                  <th className="px-2 py-3 text-rose-600">Lab Bio</th>
                  <th className="px-2 py-3 text-orange-600">Kepsek</th>
                  <th className="px-2 py-3 text-amber-600">Guru</th>
                  <th className="px-2 py-3 text-emerald-600">WC Sis</th>
                  <th className="px-2 py-3 rounded-r-xl text-teal-600">WC Gur</th>
                </tr>
              </thead>
              <tbody>
                {currentRows.map((row, idx) => (
                  <tr key={idx} className="bg-white shadow-sm hover:shadow-md hover:scale-[1.01] transition-all group whitespace-nowrap text-xs">
                    <td className="px-4 py-3 text-center font-bold text-gray-400 rounded-l-2xl border-y border-l border-gray-100">{startIndex + idx + 1}</td>
                    <td className="px-4 py-3 font-black text-gray-800 uppercase text-left border-y border-gray-100">{row.namaWilayah}</td>
                    
                    <td className="px-2 py-3 font-bold text-cyan-700 border-y border-gray-100 bg-cyan-50/30">{row.kelas.toLocaleString()}</td>
                    <td className="px-2 py-3 font-bold text-blue-600 border-y border-gray-100 bg-blue-50/30">{row.perpus.toLocaleString()}</td>
                    <td className="px-2 py-3 font-bold text-indigo-600 border-y border-gray-100 bg-indigo-50/30">{row.lab_komputer.toLocaleString()}</td>
                    <td className="px-2 py-3 font-bold text-violet-600 border-y border-gray-100 bg-violet-50/30">{row.lab_bahasa.toLocaleString()}</td>
                    <td className="px-2 py-3 font-bold text-fuchsia-600 border-y border-gray-100 bg-fuchsia-50/30">{row.lab_ipa.toLocaleString()}</td>
                    <td className="px-2 py-3 font-bold text-pink-600 border-y border-gray-100 bg-pink-50/30">{row.lab_fisika.toLocaleString()}</td>
                    <td className="px-2 py-3 font-bold text-rose-600 border-y border-gray-100 bg-rose-50/30">{row.lab_biologi.toLocaleString()}</td>
                    <td className="px-2 py-3 font-bold text-orange-600 border-y border-gray-100 bg-orange-50/30">{row.kepsek.toLocaleString()}</td>
                    <td className="px-2 py-3 font-bold text-amber-600 border-y border-gray-100 bg-amber-50/30">{row.guru.toLocaleString()}</td>
                    <td className="px-2 py-3 font-bold text-emerald-600 border-y border-gray-100 bg-emerald-50/30">{row.wc_siswa.toLocaleString()}</td>
                    <td className="px-2 py-3 font-bold text-teal-600 border-y border-r border-gray-100 bg-teal-50/30 rounded-r-2xl">{row.wc_guru.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              
              {dataKecamatan.length > 0 && (
                <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)] text-xs">
                  <tr className="bg-cyan-50 text-center font-black uppercase border-t-2 border-cyan-100 whitespace-nowrap">
                    <td colSpan="2" className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-cyan-100 text-cyan-950">
                      TOTAL {isModeSemua ? 'KESELURUHAN' : 'KECAMATAN'}
                    </td>
                    <td className="px-2 py-4 text-cyan-800 border-y border-cyan-100">{totalsKecamatan.kelas.toLocaleString()}</td>
                    <td className="px-2 py-4 text-blue-800 border-y border-cyan-100">{totalsKecamatan.perpus.toLocaleString()}</td>
                    <td className="px-2 py-4 text-indigo-800 border-y border-cyan-100">{totalsKecamatan.lab_komputer.toLocaleString()}</td>
                    <td className="px-2 py-4 text-violet-800 border-y border-cyan-100">{totalsKecamatan.lab_bahasa.toLocaleString()}</td>
                    <td className="px-2 py-4 text-fuchsia-800 border-y border-cyan-100">{totalsKecamatan.lab_ipa.toLocaleString()}</td>
                    <td className="px-2 py-4 text-pink-800 border-y border-cyan-100">{totalsKecamatan.lab_fisika.toLocaleString()}</td>
                    <td className="px-2 py-4 text-rose-800 border-y border-cyan-100">{totalsKecamatan.lab_biologi.toLocaleString()}</td>
                    <td className="px-2 py-4 text-orange-800 border-y border-cyan-100">{totalsKecamatan.kepsek.toLocaleString()}</td>
                    <td className="px-2 py-4 text-amber-800 border-y border-cyan-100">{totalsKecamatan.guru.toLocaleString()}</td>
                    <td className="px-2 py-4 text-emerald-800 border-y border-cyan-100">{totalsKecamatan.wc_siswa.toLocaleString()}</td>
                    <td className="px-2 py-4 text-teal-800 border-y border-r border-cyan-100 rounded-r-2xl">{totalsKecamatan.wc_guru.toLocaleString()}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}

          {/* TABEL SEKOLAH */}
          {activeModalTab === 'SEKOLAH' && (
            <table className="w-full text-center border-separate border-spacing-y-2">
              <thead className="sticky top-0 bg-white z-10 shadow-sm rounded-xl">
                <tr className="text-[10px] font-black uppercase text-gray-500 whitespace-nowrap">
                  <th className="px-4 py-3 text-center rounded-l-xl w-16">No</th>
                  <th className="px-4 py-3 text-left w-24">NPSN</th>
                  <th className="px-4 py-3 text-left">Nama Sekolah</th>
                  <th className="px-2 py-3 text-left">Kecamatan</th>
                  <th className="px-2 py-3 text-cyan-800">Jenjang</th>
                  <th className="px-2 py-3 text-orange-600">Status</th>
                  <th className="px-2 py-3 text-cyan-700">R. Kls</th>
                  <th className="px-2 py-3 text-blue-600">Perpus</th>
                  <th className="px-2 py-3 text-indigo-600">L. Komp</th>
                  <th className="px-2 py-3 text-violet-600">L. Bhs</th>
                  <th className="px-2 py-3 text-fuchsia-600">L. IPA</th>
                  <th className="px-2 py-3 text-pink-600">L. Fis</th>
                  <th className="px-2 py-3 text-rose-600">L. Bio</th>
                  <th className="px-2 py-3 text-orange-600">Kepsek</th>
                  <th className="px-2 py-3 text-amber-600">Guru</th>
                  <th className="px-2 py-3 text-emerald-600">WC Sis</th>
                  <th className="px-2 py-3 rounded-r-xl text-teal-600">WC Gur</th>
                </tr>
              </thead>
              <tbody>
                {currentRows.map((row, idx) => (
                  <tr key={idx} className="bg-white shadow-sm hover:shadow-md hover:scale-[1.01] transition-all group whitespace-nowrap text-xs">
                    <td className="px-4 py-3 text-center font-bold text-gray-400 rounded-l-2xl border-y border-l border-gray-100">{startIndex + idx + 1}</td>
                    <td className="px-4 py-3 font-mono text-gray-500 text-left border-y border-gray-100">{row.npsn}</td>
                    <td className="px-4 py-3 font-black text-gray-800 uppercase text-left border-y border-gray-100">{row.nama_sekolah}</td>
                    
                    <td className="px-2 py-3 font-bold text-gray-600 text-left border-y border-gray-100 uppercase">{row.kecamatan}</td>
                    <td className="px-2 py-3 font-black text-cyan-800 border-y border-gray-100 uppercase">{row.jenjang}</td>
                    <td className="px-2 py-3 font-bold text-orange-600 border-y border-gray-100 uppercase">{row.status}</td>
                    
                    <td className="px-2 py-3 font-bold text-cyan-700 border-y border-gray-100 bg-cyan-50/20">{row.kelas.toLocaleString()}</td>
                    <td className="px-2 py-3 font-bold text-blue-600 border-y border-gray-100 bg-blue-50/20">{row.perpus.toLocaleString()}</td>
                    <td className="px-2 py-3 font-bold text-indigo-600 border-y border-gray-100 bg-indigo-50/20">{row.lab_komputer.toLocaleString()}</td>
                    <td className="px-2 py-3 font-bold text-violet-600 border-y border-gray-100 bg-violet-50/20">{row.lab_bahasa.toLocaleString()}</td>
                    <td className="px-2 py-3 font-bold text-fuchsia-600 border-y border-gray-100 bg-fuchsia-50/20">{row.lab_ipa.toLocaleString()}</td>
                    <td className="px-2 py-3 font-bold text-pink-600 border-y border-gray-100 bg-pink-50/20">{row.lab_fisika.toLocaleString()}</td>
                    <td className="px-2 py-3 font-bold text-rose-600 border-y border-gray-100 bg-rose-50/20">{row.lab_biologi.toLocaleString()}</td>
                    <td className="px-2 py-3 font-bold text-orange-600 border-y border-gray-100 bg-orange-50/20">{row.kepsek.toLocaleString()}</td>
                    <td className="px-2 py-3 font-bold text-amber-600 border-y border-gray-100 bg-amber-50/20">{row.guru.toLocaleString()}</td>
                    <td className="px-2 py-3 font-bold text-emerald-600 border-y border-gray-100 bg-emerald-50/20">{row.wc_siswa.toLocaleString()}</td>
                    <td className="px-2 py-3 font-bold text-teal-600 border-y border-r border-gray-100 bg-teal-50/20 rounded-r-2xl">{row.wc_guru.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              
              {dataSekolah.length > 0 && (
                <tfoot className="sticky bottom-0 z-10 shadow-[0_-4px_10px_rgba(0,0,0,0.04)] text-xs">
                  <tr className="bg-cyan-50 text-center font-black uppercase border-t-2 border-cyan-100 whitespace-nowrap">
                    <td colSpan="6" className="px-4 py-4 text-left rounded-l-2xl border-y border-l border-cyan-100 text-cyan-950">
                      TOTAL DARI {dataSekolah.length} SEKOLAH
                    </td>
                    <td className="px-2 py-4 text-cyan-800 border-y border-cyan-100">{totalsSekolah.kelas.toLocaleString()}</td>
                    <td className="px-2 py-4 text-blue-800 border-y border-cyan-100">{totalsSekolah.perpus.toLocaleString()}</td>
                    <td className="px-2 py-4 text-indigo-800 border-y border-cyan-100">{totalsSekolah.lab_komputer.toLocaleString()}</td>
                    <td className="px-2 py-4 text-violet-800 border-y border-cyan-100">{totalsSekolah.lab_bahasa.toLocaleString()}</td>
                    <td className="px-2 py-4 text-fuchsia-800 border-y border-cyan-100">{totalsSekolah.lab_ipa.toLocaleString()}</td>
                    <td className="px-2 py-4 text-pink-800 border-y border-cyan-100">{totalsSekolah.lab_fisika.toLocaleString()}</td>
                    <td className="px-2 py-4 text-rose-800 border-y border-cyan-100">{totalsSekolah.lab_biologi.toLocaleString()}</td>
                    <td className="px-2 py-4 text-orange-800 border-y border-cyan-100">{totalsSekolah.kepsek.toLocaleString()}</td>
                    <td className="px-2 py-4 text-amber-800 border-y border-cyan-100">{totalsSekolah.guru.toLocaleString()}</td>
                    <td className="px-2 py-4 text-emerald-800 border-y border-cyan-100">{totalsSekolah.wc_siswa.toLocaleString()}</td>
                    <td className="px-2 py-4 text-teal-800 border-y border-r border-cyan-100 rounded-r-2xl">{totalsSekolah.wc_guru.toLocaleString()}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}
          
          {activeData.length === 0 && (
             <div className="py-20 flex flex-col items-center opacity-30 text-gray-500">
               <Search size={64} className="mb-4" />
               <p className="font-black uppercase tracking-widest text-xl">Tidak Ada Data</p>
             </div>
          )}
        </div>

        {/* FOOTER & PAGINATION */}
        <div className="bg-white p-4 border-t border-gray-200 flex items-center justify-between shrink-0 rounded-b-3xl">
          <div className="flex flex-col">
            <p className="text-xs font-bold text-gray-500">
              Menampilkan <span className="text-gray-800">{activeData.length === 0 ? 0 : startIndex + 1}</span> - <span className="text-gray-800">{Math.min(startIndex + rowsPerPage, activeData.length)}</span> dari <span className="text-cyan-800 font-black">{activeData.length}</span> baris
            </p>
            {displayLastUpdated && (
              <p className="text-[10px] font-bold italic text-gray-400 mt-1">
                Sumber : Data Kondisi Sarpras Update {displayLastUpdated}
              </p>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <button disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)} className="p-2 rounded-xl bg-gray-50 border border-gray-200 hover:bg-cyan-50 disabled:opacity-50 transition-colors"><ChevronLeft size={16} /></button>
            <span className="text-xs font-black text-gray-600 px-2">Hal {currentPage} / {totalPages}</span>
            <button disabled={currentPage === totalPages || totalPages === 0} onClick={() => goToPage(currentPage + 1)} className="p-2 rounded-xl bg-gray-50 border border-gray-200 hover:bg-cyan-50 disabled:opacity-50 transition-colors"><ChevronRight size={16} /></button>
          </div>
        </div>

      </div>
    </div>,
    document.body
  );
}