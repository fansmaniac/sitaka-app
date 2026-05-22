import React, { useState, useRef, useEffect } from 'react';
import { 
  UploadCloud, ArrowLeft, School, Users, UserCheck, Loader2, 
  FileText, Layers, CheckCircle, Download, Trash2, Building2 
} from 'lucide-react';
import { db } from '../firebase/config';
import { collection, doc, query, where, getDocs, limit, setDoc, writeBatch } from 'firebase/firestore';
import { readExcel } from '../utils/excelHelper';
import ExcelJS from 'exceljs';

export default function AdminDatabaseMaster({ onBack }) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); 
  const [progressLabel, setProgressLabel] = useState('Sedang Memproses...');
  const [activeTarget, setActiveTarget] = useState(null);
  const [dbStatus, setDbStatus] = useState({}); 

  // --- CEK STATUS MASTER DATA ---
  const checkDatabaseStatus = async () => {
    const categories = [
      { id: 'dapodik_sekolah' }, { id: 'dapodik_ptk' }, 
      { id: 'dapodik_kepsek' }, { id: 'rapor_pendidikan' }, 
      { id: 'data_ats' }, { id: 'data_sarpras' },
      { id: 'data_rombel' } // <-- DITAMBAHKAN KATEGORI DATABASE ROMBEL BARU
    ];
    const years = ['2024', '2025', '2026'];
    let newStatus = {};
    for (const cat of categories) {
      for (const year of years) {
        const q = query(collection(db, `${cat.id}_chunks`), where("tahun_data", "==", year), limit(1));
        const snapshot = await getDocs(q);
        newStatus[`${cat.id}_${year}`] = !snapshot.empty;
      }
    }
    setDbStatus(newStatus);
  };

  useEffect(() => { 
     checkDatabaseStatus(); 
  }, []);

  const fileInputRef = useRef(null);

  // --- PENGHAPUSAN MENGGUNAKAN BATCH COMMIT ---
  const handleDeleteData = async (target) => {
    const confirmDelete = window.confirm(`PERINGATAN KERAS!\n\nYakin Menghapus Database ${target.label} Tahun ${target.year}?\nData yang dihapus tidak bisa dikembalikan.`);
    if (!confirmDelete) return;

    setUploading(true);
    setProgressLabel(`Menghapus Data ${target.year}...`);
    setUploadProgress(0);
    
    try {
      const collectionName = `${target.collection}_chunks`;
      const q = query(collection(db, collectionName), where("tahun_data", "==", target.year));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        alert("Data memang sudah kosong, Sob.");
        setUploading(false);
        return;
      }

      const allDocs = snapshot.docs;
      const totalDocs = allDocs.length;
      let delBatch = writeBatch(db);
      let delCount = 0;
      
      for (let i = 0; i < totalDocs; i++) {
        delBatch.delete(allDocs[i].ref);
        delCount++;
        // Commit penghapusan per 100 dokumen agar payload tidak bengkak
        if (delCount === 100 || i === totalDocs - 1) {
          await delBatch.commit();
          delBatch = writeBatch(db);
          delCount = 0;
          await new Promise(r => setTimeout(r, 100)); 
        }
        setUploadProgress(Math.round(((i + 1) / totalDocs) * 100));
      }

      alert(`BERHASIL! Data ${target.label} Tahun ${target.year} telah dibersihkan.`);
      checkDatabaseStatus();
    } catch (error) {
      alert("Gagal menghapus data. Periksa koneksi internet Anda.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // --- MESIN UPLOAD MICRO-BATCHING DENGAN REGEX HEADER STANDARDIZER SANGAT KETAT ---
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !activeTarget) return;

    // LOGIKA PERINGATAN TIMPA DATA (OVERWRITE)
    const statusKey = `${activeTarget.collection}_${activeTarget.year}`;
    if (dbStatus[statusKey]) {
      const confirmOverwrite = window.confirm(
        `PERHATIAN!\n\nData ${activeTarget.label} untuk tahun ${activeTarget.year} sudah ada.\nApakah Anda yakin ingin MENGHAPUS data lama dan MENIMPANYA dengan data baru ini?`
      );
      if (!confirmOverwrite) {
        e.target.value = null; // Reset input file
        return;
      }
    }

    setUploading(true);
    setProgressLabel(`Mengunggah Data ${activeTarget.year}...`);
    setUploadProgress(0);

    try {
      let jsonData = await readExcel(file);
      
      if (activeTarget.collection === 'dapodik_ptk') {
         const mapUnique = new Map();
         jsonData.forEach(item => {
            const keys = Object.keys(item);
            const statusTugasKey = keys.find(k => k.trim().toLowerCase() === 'status_tugas' || k.trim().toLowerCase() === 'ptk_induk');
            const jenisPtkKey = keys.find(k => k.trim().toLowerCase() === 'jenis_ptk'); 
            const nikKey = keys.find(k => k.trim().toLowerCase() === 'nik');
            
            const isGuru = jenisPtkKey ? /guru/i.test(String(item[jenisPtkKey])) : false;
            const isInduk = statusTugasKey ? (String(item[statusTugasKey]).trim().toUpperCase() === 'INDUK' || String(item[statusTugasKey]).trim() === '1') : false;
            
            if (!isGuru || !isInduk) return; 

            const nik = nikKey ? String(item[nikKey]).replace(/\D/g, '') : '';
            const docId = nik ? nik : Math.random().toString(); 
            
            if (!mapUnique.has(docId)) {
                const filteredItem = {};
                const allowedKeys = [
                  'nik', 'nama', 'gender', 'tanggal_lahir', 'status_tugas', 'npsn', 'kecamatan', 
                  'kabupaten', 'jenis_ptk', 'pendidikan', 'bidang_studi_sertifikasi', 
                  'status_kepegawaian', 'bentuk_pendidikan', 'status_sekolah'
                ];
                keys.forEach(k => {
                   // PERBAIKAN REGEX: Cegah multiple underscore
                   const normalizedK = k.trim().toLowerCase().replace(/[\s/]+/g, '_').replace(/_+/g, '_');
                   if (allowedKeys.includes(normalizedK)) {
                      filteredItem[normalizedK] = item[k];
                   }
                });
                mapUnique.set(docId, filteredItem);
            }
         });
         jsonData = Array.from(mapUnique.values());
      }

      // STANDARDISASI ATRIBUT UNTUK SEKOLAH, SARPRAS, DAN ROMBEL (TANPA MEMBUANG DATA DUPLIKAT/KOSONG)
      if (activeTarget.collection === 'dapodik_sekolah' || activeTarget.collection === 'data_sarpras' || activeTarget.collection === 'data_rombel') {
         const formattedData = [];
         jsonData.forEach(item => {
            const keys = Object.keys(item);
            const statusKey = keys.find(k => {
               const cleanH = k.trim().toLowerCase().replace(/[\s/]+/g, '_').replace(/_+/g, '_');
               return cleanH === 'status_sekolah' || cleanH === 'status';
            });
            
            const cleanItem = { ...item };
            // Paksa pemetaan kunci status_sekolah agar bersih dari spasi
            if (statusKey) {
               cleanItem['status_sekolah'] = String(item[statusKey]).trim();
            }
            // Simpan semua data, jangan dibuang meskipun NPSN kembar atau kosong
            formattedData.push(cleanItem);
         });
         jsonData = formattedData; // Tancap gas, simpan semuanya!
      }
      
      const totalRowsInExcel = jsonData.length;
      const collectionName = `${activeTarget.collection}_chunks`; 
      const cleanTahun = String(activeTarget.year);
      
      // PEMBERSIHAN OTOMATIS SISA DOKUMEN LAMA
      setProgressLabel(`Membersihkan Sisa Dokumen Lama...`);
      const q = query(collection(db, collectionName), where("tahun_data", "==", cleanTahun));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const allDocs = snapshot.docs;
        let delBatch = writeBatch(db);
        let delCount = 0;
        for (let i = 0; i < allDocs.length; i++) {
          delBatch.delete(allDocs[i].ref);
          delCount++;
          if (delCount === 100 || i === allDocs.length - 1) {
            await delBatch.commit();
            delBatch = writeBatch(db);
            delCount = 0;
            await new Promise(r => setTimeout(r, 100));
          }
        }
      }

      const currentTime = new Date().toISOString();

      if (totalRowsInExcel === 0) {
        const docRef = doc(collection(db, collectionName));
        await setDoc(docRef, { 
          tahun_data: cleanTahun, data: [], last_updated: currentTime, is_empty: true
        });
        setUploadProgress(100);
        alert(`UPLOAD SELESAI, TAPI DATA KOSONG.`);
      } else {
        setProgressLabel(`Menyimpan ${totalRowsInExcel.toLocaleString('id-ID')} Baris Data...`);
        
        const CHUNK_SIZE = 100; 
        const totalChunks = Math.ceil(totalRowsInExcel / CHUNK_SIZE);
        let batch = writeBatch(db);
        let batchCount = 0;

        for (let i = 0; i < totalChunks; i++) {
          const chunkData = jsonData.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).map(item => {
            const sanitizedItem = {};
            for (const key in item) {
               let val = item[key];
               // PERBAIKAN REGEX SUPER KETAT:
               // 1. Ubah spasi/slash jadi underscore
               // 2. Hilangkan tanda kurung
               // 3. JIKA ADA UNDERSCORE GANDA/LEBIH, JADIKAN SATU UNDERSCORE SAJA (.replace(/_+/g, '_'))
               const cleanKey = key.trim().toLowerCase()
                                 .replace(/[\s/]+/g, '_')
                                 .replace(/[()]/g, '')
                                 .replace(/_+/g, '_'); 
               
               if (val !== undefined && val !== null) {
                  if (val instanceof Date) {
                     sanitizedItem[cleanKey] = val.toISOString().split('T')[0];
                  } else {
                     sanitizedItem[cleanKey] = String(val);
                  }
               } else {
                  sanitizedItem[cleanKey] = '';
               }
            }
            if (sanitizedItem.nik) sanitizedItem.nik = String(sanitizedItem.nik).replace(/\D/g, '');
            if (sanitizedItem.npsn) sanitizedItem.npsn = String(sanitizedItem.npsn).trim();
            if (sanitizedItem.nisn) sanitizedItem.nisn = String(sanitizedItem.nisn).trim();
            return sanitizedItem;
          });

          const docRef = doc(collection(db, collectionName));
          batch.set(docRef, { 
            tahun_data: cleanTahun, data: chunkData, last_updated: currentTime 
          });
          batchCount++;

          if (batchCount === 5 || i === totalChunks - 1) {
            await batch.commit();
            batch = writeBatch(db);
            batchCount = 0;
            await new Promise(r => setTimeout(r, 150)); 
          }
          
          setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
        }

        alert(`SINKRONISASI BERHASIL!\n\nTotal ${totalRowsInExcel.toLocaleString('id-ID')} baris data telah diunggah dengan aman.`);
      }
      
      checkDatabaseStatus();
    } catch (error) {
      console.error("Upload error:", error);
      alert("Error saat memproses. Muatan terlalu besar, format salah, atau koneksi terputus.");
    } finally {
      setUploading(false);
      e.target.value = null; 
    }
  };

  const triggerUpload = (target) => {
    setActiveTarget(target);
    setTimeout(() => {
      fileInputRef.current.click();
    }, 0);
  };

  // =====================================================================
  // FUNGSI UNDUH FORMAT EXCEL (MENDUKUNG UPDATE UMUR PD BARU)
  // =====================================================================
  const handleDownloadFormatSekolah = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Satuan Pendidikan');
    
    const columns = [
      'npsn', 'nama_satuan_pendidikan', 'status_sekolah', 'bentuk_pendidikan', 'alamat', 
      'desa', 'kecamatan', 'kabupaten', 'lintang', 'bujur', 'npwp', 'nama_kepala_sekolah', 
      'nomor_hp_kepsek', 'tmt_akreditasi', 'akreditasi', 'nama_operator', 'nomor_hp_operator', 
      'rombel_t1', 'rombel_t2', 'rombel_t3', 'rombel_t4', 'rombel_t5', 'rombel_t6', 
      'rombel_t7', 'rombel_t8', 'rombel_t9', 'rombel_t10', 'rombel_t11', 'rombel_t12', 
      'rombel_t13', 'rombel_tka', 'rombel_tkb', 'rombel_pkta', 'rombel_pktb', 'rombel_pktc', 
      'tka_l', 'tka_p', 'tkb_l', 'tkb_p', 't1_l', 't1_p', 't2_l', 't2_p', 't3_l', 't3_p', 
      't4_l', 't4_p', 't5_l', 't5_p', 't6_l', 't6_p', 't7_l', 't7_p', 't8_l', 't8_p', 
      't9_l', 't9_p', 't10_l', 't10_p', 't11_l', 't11_p', 't12_l', 't12_p', 't13_l', 't13_p', 
      'paket_a_l', 'paket_a_p', 'paket_b_l', 'paket_b_p', 'paket_c_l', 'paket_c_p',
      'l_Islam', 'p_Islam', 'l_Kristen', 'p_Kristen', 'l_Katholik', 'p_Katholik', 
      'l_Hindu', 'p_Hindu', 'l_Budha', 'p_Budha', 'l_Konghucu', 'p_Konghucu', 
      'l_Kepercayaan', 'p_Kepercayaan', 'l_agama_lainnya', 'p_agama_lainnya', 
      'tendik', 'pd_l', 'pd_p', 'pd_total',
      'u0_l', 'u0_p', 'u1_l', 'u1_p', 'u2_l', 'u2_p', 'u3_l', 'u3_p', 'u4_l', 'u4_p',
      'u5_l', 'u5_p', 'u6_l', 'u6_p', 'u7_l', 'u7_p', 'u8_l', 'u8_p', 'u9_l', 'u9_p',
      'u10_l', 'u10_p', 'u11_l', 'u11_p', 'u12_l', 'u12_p', 'u13_l', 'u13_p', 'u14_l', 'u14_p',
      'u15_l', 'u15_p', 'u16_l', 'u16_p', 'u17_l', 'u17_p', 'u18_l', 'u18_p', 'u19_l', 'u19_p',
      'u20_l', 'u20_p', 'u21+_l', 'u21+_p'
    ];

    worksheet.columns = columns.map(col => ({ header: col, key: col, width: 15 }));
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Format_Upload_Sekolah_BesertaUsiaPD.xlsx`;
    link.click();
  };

  const handleDownloadFormatPtk = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Data PTK');
    
    const columns = [
      'nik', 'nama', 'gender', 'tanggal_lahir', 'status_tugas', 'npsn', 'kecamatan', 
      'kabupaten', 'jenis_ptk', 'pendidikan', 'bidang_studi_sertifikasi', 
      'status_kepegawaian', 'bentuk_pendidikan', 'status_sekolah'
    ];

    worksheet.columns = columns.map(col => ({ header: col, key: col, width: 18 }));
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } }; 
    
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Format_Upload_PTK.xlsx`;
    link.click();
  };

  const handleDownloadFormatSarpras = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Data Sarpras');
    
    const columns = [
      'npsn', 'nama_sekolah', 'status_sekolah', 'jenjang', 'kecamatan', 'kabupaten',
      'ruang_kelas_baik', 'ruang_kelas_rusak_ringan', 'ruang_kelas_rusak_sedang', 'ruang_kelas_rusak_berat', 'ruang_kelas_tidak_bisa_dipakai',
      'ruang_perpustakaan_baik', 'ruang_perpustakaan_rusak_ringan', 'ruang_perpustakaan_rusak_sedang', 'ruang_perpustakaan_rusak_berat', 'ruang_perpustakaan_tidak_bisa_dipakai',
      'ruang_lab_komputer_baik', 'ruang_lab_komputer_rusak_ringan', 'ruang_lab_komputer_rusak_sedang', 'ruang_lab_komputer_rusak_berat', 'ruang_lab_komputer_tidak_bisa_dipakai',
      'ruang_lab_bahasa_baik', 'ruang_lab_bahasa_rusak_ringan', 'ruang_lab_bahasa_rusak_sedang', 'ruang_lab_bahasa_rusak_berat', 'ruang_lab_bahasa_tidak_bisa_dipakai',
      'ruang_lab_ipa_baik', 'ruang_lab_ipa_rusak_ringan', 'ruang_lab_ipa_rusak_sedang', 'ruang_lab_ipa_rusak_berat', 'ruang_lab_ipa_tidak_bisa_dipakai',
      'ruang_lab_fisika_baik', 'ruang_lab_fisika_rusak_ringan', 'ruang_lab_fisika_rusak_sedang', 'ruang_lab_fisika_rusak_berat', 'ruang_lab_fisika_tidak_bisa_dipakai',
      'ruang_lab_biologi_baik', 'ruang_lab_biologi_rusak_ringan', 'ruang_lab_biologi_rusak_sedang', 'ruang_lab_biologi_rusak_berat', 'ruang_lab_biologi_tidak_bisa_dipakai',
      'ruang_ruang_kepsek_baik', 'ruang_ruang_kepsek_rusak_ringan', 'ruang_ruang_kepsek_rusak_sedang', 'ruang_ruang_kepsek_rusak_berat', 'ruang_ruang_kepsek_tidak_bisa_dipakai',
      'ruang_ruang_guru_baik', 'ruang_ruang_guru_rusak_ringan', 'ruang_ruang_guru_rusak_sedang', 'ruang_ruang_guru_rusak_berat', 'ruang_ruang_guru_tidak_bisa_dipakai',
      'ruang_ruang_tu_baik', 'ruang_ruang_tu_rusak_ringan', 'ruang_ruang_tu_rusak_sedang', 'ruang_ruang_tu_rusak_berat', 'ruang_ruang_tu_tidak_bisa_dipakai',
      'ruang_wc_guru_laki_laki_baik', 'ruang_wc_guru_laki_laki_rusak_ringan', 'ruang_wc_guru_laki_laki_rusak_sedang', 'ruang_wc_guru_laki_laki_rusak_berat', 'ruang_wc_guru_laki_laki_tidak_bisa_dipakai',
      'ruang_wc_guru_perempuan_baik', 'ruang_wc_guru_perempuan_rusak_ringan', 'ruang_wc_guru_perempuan_rusak_sedang', 'ruang_wc_guru_perempuan_rusak_berat', 'ruang_wc_guru_perempuan_tidak_bisa_dipakai',
      'ruang_wc_siswa_laki_laki_baik', 'ruang_wc_siswa_laki_laki_rusak_ringan', 'ruang_wc_siswa_laki_laki_rusak_sedang', 'ruang_wc_siswa_laki_laki_rusak_berat', 'ruang_wc_siswa_laki_laki_tidak_bisa_dipakai',
      'ruang_wc_siswa_perempuan_baik', 'ruang_wc_siswa_perempuan_rusak_ringan', 'ruang_wc_siswa_perempuan_rusak_sedang', 'ruang_wc_siswa_perempuan_rusak_berat', 'ruang_wc_siswa_perempuan_tidak_bisa_dipakai',
      'meja_siswa_baik', 'meja_siswa_rusak_ringan', 'meja_siswa_rusak_sedang', 'meja_siswa_rusak_berat', 'meja_siswa_tidak_bisa_dipakai',
      'kursi_siswa_baik', 'kursi_siswa_rusak_ringan', 'kursi_siswa_rusak_sedang', 'kursi_siswa_rusak_berat', 'kursi_siswa_tidak_bisa_dipakai',
      'papan_tulis_baik', 'papan_tulis_rusak_ringan', 'papan_tulis_rusak_sedang', 'papan_tulis_rusak_berat', 'papan_tulis_tidak_bisa_dipakai',
      'komputer_baik', 'komputer_rusak_ringan', 'komputer_rusak_sedang', 'komputer_rusak_berat', 'komputer_tidak_bisa_dipakai'
    ];

    worksheet.columns = columns.map(col => ({ header: col, key: col, width: 25 }));
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9333EA' } }; 
    
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Format_Upload_Sarpras.xlsx`;
    link.click();
  };

  const handleDownloadFormatATS = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Data ATS');
    
    const columns = [
      'NISN', 'NIK', 'Nama Siswa', 'Jenis Kelamin', 'Usia (Tahun)', 
      'Tingkat Pendidikan', 'NPSN', 'Nama Satuan Pendidikan', 'Status Siswa', 
      'Kelurahan / Desa', 'Kecamatan', 'Kab/Kota', 'Bentuk Pendidikan', 
      'Status Sekolah', 'Residu'
    ];

    worksheet.columns = columns.map(col => ({ header: col, key: col, width: 20 }));
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEA580C' } }; 
    
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Format_Upload_ATS.xlsx`;
    link.click();
  };

  // FORMAT UNDUHAN KHUSUS DATABASE ROMBEL
  const handleDownloadFormatRombel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Data Rombel');
    
    // UPDATE: Penambahan kolom "Status Sekolah" sesuai request
    const columns = [
      'Nama Satuan Pendidikan', 'NPSN', 'Bentuk Pendidikan', 'Status Sekolah', 
      'Kecamatan', 'Kabupaten/Kota', 'Jumlah Rombel', 'Ruang Kelas Baik', 
      'Ruang Kelas Rusak Ringan', 'Ruang Kelas Rusak Sedang', 'Ruang Kelas Rusak Berat', 
      'Ruang Kelas Rusak Total', 'Jumlah Ruang Kelas'
    ];

    worksheet.columns = columns.map(col => ({ header: col, key: col, width: 22 }));
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    // Warna Rose (Merah Muda Merona)
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE11D48' } }; 
    
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Format_Upload_Rombel.xlsx`;
    link.click();
  };

  const YearUploadGroup = ({ label, collection, icon: Icon, colorClass, formatHandler }) => (
    <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-gray-100 flex flex-col gap-6 relative">
      {formatHandler && (
        <button 
          onClick={formatHandler} 
          className={`absolute top-8 right-8 text-[10px] flex items-center gap-1 bg-gray-100 text-gray-700 px-3 py-1.5 rounded-full font-bold hover:bg-gray-200 transition-colors shadow-sm`}
        >
          <Download size={12} /> Unduh Format
        </button>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`${colorClass} text-white p-4 rounded-2xl shadow-lg`}><Icon size={32} /></div>
          <h4 className="text-2xl font-black text-gray-800 uppercase tracking-tight">{label}</h4>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 mt-2">
        {['2024', '2025', '2026'].map((year) => {
          const hasData = dbStatus[`${collection}_${year}`];
          return (
            <div key={year} className="flex flex-col gap-2">
              <button 
                onClick={() => triggerUpload({ label, collection, year })}
                className={`w-full py-4 rounded-2xl font-black text-xl transition-all active:scale-95 border-2 flex flex-col items-center gap-1
                  ${hasData ? `${colorClass} text-white border-transparent shadow-lg` : 'bg-gray-50 text-gray-300 border-gray-100 hover:border-blue-300'}`}
              >
                <div className="flex items-center gap-2">{hasData ? <CheckCircle size={18} /> : <UploadCloud size={18} />}{year}</div>
                <span className="text-[9px] uppercase opacity-70">{hasData ? 'Data Terisi' : 'Kosong'}</span>
              </button>
              {hasData && (
                <button 
                  onClick={() => handleDeleteData({ label, collection, year })}
                  className="flex items-center justify-center gap-1 text-red-500 font-black uppercase text-[9px] hover:text-red-700 transition-colors py-1"
                >
                  <Trash2 size={12} /> Hapus Data
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <>
      {uploading && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center backdrop-blur-md">
          <div className="bg-white p-12 rounded-[3rem] shadow-2xl flex flex-col items-center gap-6 animate-in zoom-in duration-300 w-full max-w-md text-center">
            <Loader2 className="animate-spin text-blue-600" size={64} />
            <div className="w-full">
              <p className="font-black text-xl uppercase tracking-widest text-gray-800 mb-4">{progressLabel}</p>
              <div className="w-full bg-gray-100 h-6 rounded-full overflow-hidden border-2 border-gray-100 shadow-inner">
                <div className="bg-blue-600 h-full transition-all duration-500" style={{ width: `${uploadProgress}%` }}></div>
              </div>
              <p className="text-blue-600 font-black text-4xl mt-4">{uploadProgress}%</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col items-center w-full max-w-6xl animate-in slide-in-from-top-4 duration-500">
        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".xlsx, .xls, .csv" />
        
        <div className="w-full flex justify-start mb-8">
          <button onClick={onBack} className="flex items-center gap-2 text-blue-700 font-black uppercase hover:bg-blue-100 px-6 py-3 rounded-2xl transition-all active:scale-90">
            <ArrowLeft size={24} /> Kembali
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full pb-20">
          <YearUploadGroup label="Satuan Pendidikan" collection="dapodik_sekolah" icon={School} colorClass="bg-blue-600" formatHandler={handleDownloadFormatSekolah} />
          <YearUploadGroup label="Database PTK" collection="dapodik_ptk" icon={Users} colorClass="bg-blue-500" formatHandler={handleDownloadFormatPtk} />
          <YearUploadGroup label="Database Kepsek" collection="dapodik_kepsek" icon={UserCheck} colorClass="bg-blue-400" />
          <YearUploadGroup label="Rapor Pendidikan" collection="rapor_pendidikan" icon={FileText} colorClass="bg-emerald-600" />
          <YearUploadGroup label="Database ATS" collection="data_ats" icon={Layers} colorClass="bg-orange-600" formatHandler={handleDownloadFormatATS} />
          <YearUploadGroup label="Data Sarpras" collection="data_sarpras" icon={Building2} colorClass="bg-purple-600" formatHandler={handleDownloadFormatSarpras} />
          {/* TAMBAHAN KOTAK UPLOAD DATABASE ROMBEL DI SINI */}
          <YearUploadGroup label="Database Rombel" collection="data_rombel" icon={School} colorClass="bg-rose-600" formatHandler={handleDownloadFormatRombel} />
        </div>
      </div>
    </>
  );
}