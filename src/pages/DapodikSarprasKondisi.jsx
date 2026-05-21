import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, AlertCircle, HardHat, FileSpreadsheet, Building2, MapPin } from 'lucide-react';
import { db } from '../firebase/config';
import { collection, getDocs, query, where } from 'firebase/firestore';
import ExcelJS from 'exceljs';

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

export default function DapodikSarprasKondisi({ selectedYear = '2026' }) {
  const [rawSekolah, setRawSekolah] = useState([]);
  const [rawSarpras, setRawSarpras] = useState([]);
  const [loading, setLoading] = useState(true);

  // State untuk Filter Komponen
  const [filterWilayah, setFilterWilayah] = useState('SEMUA');
  const [filterStatus, setFilterStatus] = useState('SEMUA');

  // Helper pencarian value key (SANGAT ROBUST: Mengatasi string, spasi, & case-insensitive)
  const getVal = (obj, keyName) => {
    if (!obj) return 0;
    const searchKey = String(keyName).toLowerCase().trim();
    const key = Object.keys(obj).find(k => String(k).toLowerCase().trim() === searchKey);
    
    if (!key) return 0;
    
    const val = obj[key];
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      // Hilangkan semua karakter selain angka, lalu ubah ke Integer
      const parsed = parseInt(val.replace(/[^0-9]/g, ''), 10);
      return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
  };

  // Identifikasi Jenjang Sempurna (Termasuk SLB & Non Formal agar data tidak loss)
  const getJenjang = (item) => {
    const j = String(item.bentuk_pendidikan || item.jenjang || '').toUpperCase().trim();
    if (['TK', 'KB', 'TPA', 'SPS', 'PAUD'].includes(j)) return 'PAUD';
    if (['SD', 'SPK SD'].includes(j)) return 'SD';
    if (['SMP', 'SPK SMP'].includes(j)) return 'SMP';
    if (['SMA', 'SPK SMA'].includes(j)) return 'SMA';
    if (['SMK'].includes(j)) return 'SMK';
    if (['SLB', 'SDLB', 'SMPLB', 'SMALB'].includes(j)) return 'SLB';
    if (['PKBM', 'SKB'].includes(j)) return 'NON FORMAL';
    
    // Fallback jika format stringnya menyatu (misal "SEKOLAH DASAR (SD)")
    if (j.includes('TK') || j.includes('KB') || j.includes('PAUD')) return 'PAUD';
    if (j.includes('SD') && !j.includes('SLB')) return 'SD';
    if (j.includes('SMP') && !j.includes('SLB')) return 'SMP';
    if (j.includes('SMA') && !j.includes('SLB')) return 'SMA';
    if (j.includes('SMK')) return 'SMK';
    
    return 'LAINNYA'; // Agar sisa 10.295 sekolah yang formatnya aneh tetap terhitung
  };

  // 1. Ambil Data Mentah dari Firebase (Hanya Sekali di Awal)
  useEffect(() => {
    const fetchRawData = async () => {
      setLoading(true);
      try {
        const sekolahRef = collection(db, 'dapodik_sekolah_chunks');
        const sarprasRef = query(collection(db, 'data_sarpras_chunks'), where("tahun_data", "==", selectedYear));
        
        const [sekolahSnap, sarprasSnap] = await Promise.all([
          getDocs(sekolahRef),
          getDocs(sarprasRef)
        ]);

        const sekolahList = [];
        sekolahSnap.forEach(doc => {
          const chunk = doc.data().data || [];
          sekolahList.push(...chunk);
        });

        const sarprasList = [];
        sarprasSnap.forEach(doc => {
          const chunk = doc.data().data || [];
          sarprasList.push(...chunk);
        });

        setRawSekolah(sekolahList);
        setRawSarpras(sarprasList);
      } catch (error) {
        console.error("Gagal menarik data Kondisi Sarpras:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchRawData();
  }, [selectedYear]);

  // 2. Engine Komputasi & Filter Dinamis via useMemo (TERPISAH TOTAL)
  const dataAggregated = useMemo(() => {
    // Siapkan wadah agregasi utama
    const agg = {
      'PAUD': { jenjang: 'PAUD (TK, KB, SPS, TPA)', sekolah_count: 0, rombel: 0, baik: 0, rr: 0, rs: 0, rb: 0 },
      'SD': { jenjang: 'SD', sekolah_count: 0, rombel: 0, baik: 0, rr: 0, rs: 0, rb: 0 },
      'SMP': { jenjang: 'SMP', sekolah_count: 0, rombel: 0, baik: 0, rr: 0, rs: 0, rb: 0 },
      'SMA': { jenjang: 'SMA', sekolah_count: 0, rombel: 0, baik: 0, rr: 0, rs: 0, rb: 0 },
      'SMK': { jenjang: 'SMK', sekolah_count: 0, rombel: 0, baik: 0, rr: 0, rs: 0, rb: 0 },
      'SLB': { jenjang: 'SLB', sekolah_count: 0, rombel: 0, baik: 0, rr: 0, rs: 0, rb: 0 },
      'NON FORMAL': { jenjang: 'Non Formal (PKBM, SKB)', sekolah_count: 0, rombel: 0, baik: 0, rr: 0, rs: 0, rb: 0 },
      'LAINNYA': { jenjang: 'Jenjang Lainnya', sekolah_count: 0, rombel: 0, baik: 0, rr: 0, rs: 0, rb: 0 }
    };

    // =========================================================================
    // LOOPING PERTAMA: Murni Dapodik Sekolah (Jumlah Sekolah & Jumlah Rombel)
    // =========================================================================
    rawSekolah.forEach(sekolah => {
      const jenjang = getJenjang(sekolah);
      if (!agg[jenjang]) return;

      // Filter Wilayah
      const kabSekolah = cleanKabupatenName(sekolah.kabupaten || sekolah['Kabupaten/Kota']);
      if (filterWilayah !== 'SEMUA' && kabSekolah !== filterWilayah) return;

      // Filter Status (Negeri/Swasta)
      const statusSekolah = String(sekolah.status_sekolah || '').toUpperCase().trim();
      if (filterStatus !== 'SEMUA' && statusSekolah !== filterStatus) return;

      let totalRombel = 0;

      // --- KODE BARU: Perhitungan Rombel Menggunakan Regex Ketat & Dinamis ---
      Object.keys(sekolah).forEach(k => {
          const keyStr = k.trim().toLowerCase();
          // Regex ini otomatis mencakup TKA, TKB, Kelas 1-13, dan Paket A/B/C 
          // tanpa perlu di-hardcode per jenjang.
          if (/^rombel_(tka|tkb|t?\d{1,2}|paket_[abc])$/.test(keyStr)) {
              totalRombel += parseInt(sekolah[k]) || 0;
          }
      });

      // Safeguard: Jika totalnya masih 0, ambil dari field 'rombel' umum (mencegah rombel kosong)
      if (totalRombel === 0) {
        totalRombel = getVal(sekolah, 'rombel') || getVal(sekolah, 'rombongan_belajar');
      }

      agg[jenjang].sekolah_count += 1;
      agg[jenjang].rombel += totalRombel;
    });

    // =========================================================================
    // LOOPING KEDUA: Murni Data Sarpras (Kondisi Ruang Kelas)
    // =========================================================================
    rawSarpras.forEach(sarpras => {
      const jenjang = getJenjang(sarpras);
      if (!agg[jenjang]) return;

      // Filter Wilayah
      const kabSarpras = cleanKabupatenName(sarpras.kabupaten || sarpras['Kabupaten/Kota']);
      if (filterWilayah !== 'SEMUA' && kabSarpras !== filterWilayah) return;

      // Filter Status
      const statusSarpras = String(sarpras.status_sekolah || '').toUpperCase().trim();
      if (filterStatus !== 'SEMUA' && statusSarpras !== filterStatus) return;

      // Tambahkan kondisi ruang kelas ke jenjang yang sesuai
      agg[jenjang].baik += getVal(sarpras, 'ruang_kelas_baik');
      agg[jenjang].rr += getVal(sarpras, 'ruang_kelas_rusak_ringan');
      agg[jenjang].rs += getVal(sarpras, 'ruang_kelas_rusak_sedang');
      agg[jenjang].rb += getVal(sarpras, 'ruang_kelas_rusak_berat');
    });

    // Filter out 'LAINNYA' jika sekolah count-nya 0 agar tabel tidak kotor
    let finalData = Object.values(agg);
    if (agg['LAINNYA'].sekolah_count === 0) {
      finalData = finalData.filter(d => d.jenjang !== 'Jenjang Lainnya');
    }

    return finalData;
  }, [rawSekolah, rawSarpras, filterWilayah, filterStatus]);

  // 3. Fungsi Ekspor Data ke Excel (.xlsx) dengan Merge Cells
  const downloadExcelKondisi = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Kondisi Sarpras Ruang Kelas');

    worksheet.columns = [
      { header: 'Jenjang', key: 'jenjang', width: 25 },
      { header: 'Jumlah Sekolah', key: 'sekolah_count', width: 15 },
      { header: 'Jumlah Rombel', key: 'rombel', width: 15 },
      { header: 'Kondisi Ruang Kelas', key: 'kondisi', width: 20 },
      { header: 'Jumlah Ruang Kelas', key: 'jumlah_kelas', width: 20 },
      { header: 'Sub Jumlah', key: 'sub_jumlah', width: 15 },
      { header: 'Selisih (Layak - Rombel)', key: 'selisih', width: 25 }
    ];

    let currentRow = 2;

    dataAggregated.forEach((row) => {
      // Lewati baris jika tidak ada sekolah sama sekali (menjaga Excel rapi)
      if (row.sekolah_count === 0 && row.baik === 0 && row.rs === 0) return;

      const layak = row.baik + row.rr;
      const tidakLayak = row.rs + row.rb;
      const selisih = layak - row.rombel;

      worksheet.addRows([
        { jenjang: row.jenjang, sekolah_count: row.sekolah_count, rombel: row.rombel, kondisi: 'Baik', jumlah_kelas: row.baik, sub_jumlah: layak, selisih: selisih },
        { jenjang: row.jenjang, sekolah_count: row.sekolah_count, rombel: row.rombel, kondisi: 'Rusak Ringan', jumlah_kelas: row.rr, sub_jumlah: layak, selisih: selisih },
        { jenjang: row.jenjang, sekolah_count: row.sekolah_count, rombel: row.rombel, kondisi: 'Rusak Sedang', jumlah_kelas: row.rs, sub_jumlah: tidakLayak, selisih: selisih },
        { jenjang: row.jenjang, sekolah_count: row.sekolah_count, rombel: row.rombel, kondisi: 'Rusak Berat', jumlah_kelas: row.rb, sub_jumlah: tidakLayak, selisih: selisih }
      ]);

      // Gabungkan (Merge) Cell vertikal agar persis tampilan tabel komponen
      worksheet.mergeCells(`A${currentRow}:A${currentRow + 3}`); // Jenjang
      worksheet.mergeCells(`B${currentRow}:B${currentRow + 3}`); // Jumlah Sekolah
      worksheet.mergeCells(`C${currentRow}:C${currentRow + 3}`); // Jumlah Rombel
      worksheet.mergeCells(`F${currentRow}:F${currentRow + 1}`); // Sub Jumlah (Layak)
      worksheet.mergeCells(`F${currentRow + 2}:F${currentRow + 3}`); // Sub Jumlah (Tidak Layak)
      worksheet.mergeCells(`G${currentRow}:G${currentRow + 3}`); // Selisih

      // Beri alignment center untuk cell yang dimerge
      ['A', 'B', 'C', 'F', 'G'].forEach(col => {
        worksheet.getCell(`${col}${currentRow}`).alignment = { vertical: 'middle', horizontal: 'center' };
      });

      currentRow += 4;
    });

    // Desain Header Tabel Excel
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD97706' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Analisis_Kondisi_Sarpras_Kelas_${filterWilayah}_${filterStatus}_${selectedYear}.xlsx`;
    link.click();
  };

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-3xl border border-gray-100 shadow-sm p-8 min-h-[400px]">
        <Loader2 className="animate-spin text-cyan-600 mb-4" size={48} />
        <p className="font-bold text-gray-500 uppercase tracking-widest text-sm">Menghitung Agregasi Rombel & Sarpras...</p>
      </div>
    );
  }

  // Hitung Total Validasi (Agar kamu bisa melihat angkanya sesuai dengan database)
  const totalSekolahDashboard = dataAggregated.reduce((acc, curr) => acc + curr.sekolah_count, 0);

  return (
    <div className="bg-white rounded-3xl shadow-sm border border-gray-100 flex-1 flex flex-col overflow-hidden relative animate-in fade-in duration-300">
      
      {/* HEADER UTAMA + KONTROL FILTER & UNDUH DI POJOK KANAN */}
      <div className="p-5 border-b border-gray-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-gray-50/50">
        <div className="flex items-center gap-3">
          <div className="bg-amber-100 p-2 rounded-lg text-amber-600">
            <HardHat size={20} />
          </div>
          <div>
            <h3 className="font-black text-gray-800 uppercase tracking-tight text-sm">Kalkulasi Ketersediaan Ruang Kelas</h3>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              Total Validasi: {totalSekolahDashboard.toLocaleString()} Sekolah
            </p>
          </div>
        </div>

        {/* ELEMEN DI POJOK KANAN JUDUL */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          
          {/* Dropdown Filter Wilayah (Identifikasi Kabupaten / Kota) */}
          <div className="flex items-center bg-white border border-gray-200 rounded-xl px-2.5 py-1.5 shadow-sm text-xs font-bold text-gray-700">
            <MapPin size={14} className="text-gray-400 mr-1.5 shrink-0" />
            <select
              value={filterWilayah}
              onChange={(e) => setFilterWilayah(e.target.value)}
              className="bg-transparent outline-none cursor-pointer pr-4 font-black uppercase"
            >
              <option value="SEMUA">Semua Wilayah</option>
              {KABUPATEN_LIST.map((kab) => (
                <option key={kab} value={kab}>
                  {kab === "PONTIANAK" || kab === "SINGKAWANG" ? `KOTA ${kab}` : `KAB. ${kab}`}
                </option>
              ))}
            </select>
          </div>

          {/* Dropdown Filter Status Sekolah */}
          <div className="flex items-center bg-white border border-gray-200 rounded-xl px-2.5 py-1.5 shadow-sm text-xs font-bold text-gray-700">
            <Building2 size={14} className="text-gray-400 mr-1.5 shrink-0" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-transparent outline-none cursor-pointer pr-4 font-black uppercase"
            >
              <option value="SEMUA">Semua Status</option>
              <option value="NEGERI">Negeri</option>
              <option value="SWASTA">Swasta</option>
            </select>
          </div>

          {/* Tombol Unduh Format Excel */}
          <button
            onClick={downloadExcelKondisi}
            className="flex items-center gap-1.5 bg-amber-50 text-amber-700 hover:bg-amber-600 hover:text-white px-4 py-2 rounded-xl font-black uppercase text-[10px] md:text-xs shadow-sm border border-amber-200 transition-all active:scale-95"
          >
            <FileSpreadsheet size={14} /> Unduh Excel (.XLSX)
          </button>
        </div>
      </div>

      {/* AREA PRESENTASI DATA TABEL MERGE */}
      <div className="flex-1 overflow-auto p-4 custom-scrollbar">
        <table className="w-full text-center border-collapse border border-gray-200">
          <thead className="bg-gray-100 sticky top-0 z-10 shadow-sm">
            <tr className="text-[10px] md:text-xs font-black uppercase text-gray-600">
              <th className="border border-gray-200 p-3 w-[15%]">Jenjang</th>
              <th className="border border-gray-200 p-3 w-[10%]">Jumlah Sekolah</th>
              <th className="border border-gray-200 p-3 w-[15%]">Jumlah Rombel</th>
              <th className="border border-gray-200 p-3 w-[15%]">Kondisi Ruang Kelas</th>
              <th className="border border-gray-200 p-3 w-[15%]">Jumlah Ruang Kelas</th>
              <th className="border border-gray-200 p-3 w-[10%]">Sub Jumlah</th>
              <th className="border border-gray-200 p-3 w-[20%]">Selisih<br/><span className="text-[9px] text-gray-400">(Layak - Rombel)</span></th>
            </tr>
          </thead>
          <tbody className="text-xs md:text-sm text-gray-700">
            {dataAggregated.map((row, idx) => {
              // Jika data di jenjang tertentu sama sekali tidak ada, lewati render barisnya
              if (row.sekolah_count === 0 && row.baik === 0 && row.rs === 0) return null;

              const layakPakai = row.baik + row.rr;
              const tidakLayak = row.rs + row.rb;
              const selisih = layakPakai - row.rombel;
              const selisihStatus = selisih < 0 ? 'text-red-600 bg-red-50' : 'text-emerald-600 bg-emerald-50';
              const bgRow = idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30';

              return (
                <React.Fragment key={idx}>
                  {/* BARIS 1: BAIK */}
                  <tr className={`${bgRow} hover:bg-cyan-50/30 transition-colors`}>
                    <td className="border border-gray-200 p-3 font-black uppercase text-cyan-800" rowSpan={4}>{row.jenjang}</td>
                    <td className="border border-gray-200 p-3 font-bold text-lg text-gray-600" rowSpan={4}>{row.sekolah_count.toLocaleString()}</td>
                    <td className="border border-gray-200 p-3 font-bold text-lg text-gray-800" rowSpan={4}>{row.rombel.toLocaleString()}</td>
                    
                    <td className="border border-gray-200 p-2 text-left pl-4 font-semibold text-emerald-600">Baik</td>
                    <td className="border border-gray-200 p-2 font-bold text-gray-600">{row.baik.toLocaleString()}</td>
                    
                    <td className="border border-gray-200 p-2 font-bold text-blue-700 bg-blue-50/30" rowSpan={2}>
                      <div className="flex flex-col items-center">
                        <span className="text-lg">{layakPakai.toLocaleString()}</span>
                        <span className="text-[9px] uppercase text-blue-400 font-black tracking-wider">Layak Pakai</span>
                      </div>
                    </td>
                    
                    <td className={`border border-gray-200 p-3 font-black text-xl ${selisihStatus}`} rowSpan={4}>
                      <div className="flex flex-col items-center justify-center gap-1">
                        {selisih.toLocaleString()}
                        {selisih < 0 ? (
                          <span className="text-[10px] bg-red-100 text-red-600 px-2.5 py-1 rounded-full uppercase tracking-wider font-black shadow-sm">
                            Kekurangan Kelas
                          </span>
                        ) : (
                          <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full uppercase tracking-wider font-black shadow-sm">
                            Kelas Memadai
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* BARIS 2: RUSAK RINGAN */}
                  <tr className={`${bgRow} hover:bg-cyan-50/30 transition-colors`}>
                    <td className="border border-gray-200 p-2 text-left pl-4 font-semibold text-lime-600">Rusak Ringan</td>
                    <td className="border border-gray-200 p-2 font-bold text-gray-600">{row.rr.toLocaleString()}</td>
                  </tr>

                  {/* BARIS 3: RUSAK SEDANG */}
                  <tr className={`${bgRow} hover:bg-cyan-50/30 transition-colors`}>
                    <td className="border border-gray-200 p-2 text-left pl-4 font-semibold text-amber-600">Rusak Sedang</td>
                    <td className="border border-gray-200 p-2 font-bold text-gray-600">{row.rs.toLocaleString()}</td>
                    
                    <td className="border border-gray-200 p-2 font-bold text-red-700 bg-red-50/30" rowSpan={2}>
                      <div className="flex flex-col items-center">
                        <span className="text-lg">{tidakLayak.toLocaleString()}</span>
                        <span className="text-[9px] uppercase text-red-400 font-black tracking-wider">Tidak Layak</span>
                      </div>
                    </td>
                  </tr>

                  {/* BARIS 4: RUSAK BERAT */}
                  <tr className={`${bgRow} hover:bg-cyan-50/30 transition-colors`}>
                    <td className="border border-gray-200 p-2 text-left pl-4 font-semibold text-rose-600">Rusak Berat</td>
                    <td className="border border-gray-200 p-2 font-bold text-gray-600">{row.rb.toLocaleString()}</td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}