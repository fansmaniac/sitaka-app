import React, { useState, useRef, useEffect } from 'react';
import { 
  Database, UploadCloud, Settings, ArrowLeft, User, Lock, 
  Eye, EyeOff, Save, School, Users, UserCheck, Loader2, 
  FileText, Layers, CheckCircle, Download, Trash2, Building2, Calculator, Activity
} from 'lucide-react';
import { db } from '../firebase/config';
import { collection, doc, query, where, getDocs, limit, setDoc, deleteDoc } from 'firebase/firestore';
import { readExcel } from '../utils/excelHelper';
import ExcelJS from 'exceljs';

// =====================================================================
// UTILITY & REFERENSI
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

const JENJANG_GROUPS = {
  'PAUD': ['TK', 'KB', 'SPS', 'TPA', 'PAUD'],
  'SD': ['SD', 'SPK SD'],
  'SMP': ['SMP', 'SPK SMP'],
  'SMA/SMK': ['SMA', 'SPK SMA', 'SMK'],
  'SLB (Inklusif)': ['SLB'],
  'NON FORMAL': ['PKBM', 'SKB']
};
const JENJANG_KEYS = ['PAUD', 'SD', 'SMP', 'SMA/SMK', 'SLB (Inklusif)', 'NON FORMAL'];

const identifyJenjangGroup = (jenjangDb) => {
  const j = String(jenjangDb).trim().toUpperCase();
  for (const group of JENJANG_KEYS) {
    if (JENJANG_GROUPS[group].includes(j)) return group;
  }
  return null;
};

// =====================================================================
// KOMPONEN UTAMA
// =====================================================================
export default function AdminDashboard({ Header }) {
  const [adminView, setAdminView] = useState('main'); 
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); 
  const [progressLabel, setProgressLabel] = useState('Sedang Memproses...');
  const [activeTarget, setActiveTarget] = useState(null);
  const [dbStatus, setDbStatus] = useState({}); 
  const [calcStatus, setCalcStatus] = useState({});

  const fileInputRef = useRef(null);

  // --- CEK STATUS MASTER DATA ---
  const checkDatabaseStatus = async () => {
    const categories = [
      { id: 'dapodik_sekolah' }, { id: 'dapodik_ptk' }, 
      { id: 'dapodik_kepsek' }, { id: 'rapor_pendidikan' }, 
      { id: 'data_ats' }, { id: 'data_sarpras' } 
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

  // --- CEK STATUS MESIN KALKULASI ---
  const checkCalcStatus = async () => {
    const calcTypes = [
      'rasio_sekolah_pd', 'rasio_sekolah_guru', 'rasio_rombel_guru', 
      'rasio_sekolah_rombel', 'rasio_rombel_pd', 'rasio_rombel_kelas', 'rasio_guru_pd'
    ];
    const years = ['2024', '2025', '2026'];
    let newStatus = {};
    
    for (const type of calcTypes) {
      for (const year of years) {
        const docSnap = await getDocs(query(collection(db, 'dapodik_agregasi'), where("__name__", "==", `${type}_${year}`)));
        if (!docSnap.empty) {
           const data = docSnap.docs[0].data();
           if (data.last_updated) {
              const d = new Date(data.last_updated);
              newStatus[`${type}_${year}`] = `${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
           } else {
              newStatus[`${type}_${year}`] = 'Selesai';
           }
        }
      }
    }
    setCalcStatus(newStatus);
  };

  useEffect(() => { 
     if (adminView === 'input') checkDatabaseStatus(); 
     if (adminView === 'kalkulasi') checkCalcStatus(); 
  }, [adminView]);

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
      
      for (let i = 0; i < totalDocs; i++) {
        await deleteDoc(allDocs[i].ref);
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

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setProgressLabel(`Mengunggah Data ${activeTarget.year}...`);
    setUploadProgress(0);

    try {
      let jsonData = await readExcel(file);
      
      if (activeTarget.collection === 'dapodik_ptk') {
         const mapUnique = new Map();
         jsonData.forEach(item => {
            const keys = Object.keys(item);
            const statusTugasKey = keys.find(k => k.toLowerCase() === 'status_tugas' || k.toLowerCase() === 'ptk_induk');
            const jenisPtkKey = keys.find(k => k.toLowerCase() === 'jenis_ptk'); 
            const nikKey = keys.find(k => k.toLowerCase() === 'nik');
            
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
                   if (allowedKeys.includes(k.toLowerCase())) filteredItem[k] = item[k];
                });
                mapUnique.set(docId, filteredItem);
            }
         });
         jsonData = Array.from(mapUnique.values());

         if(jsonData.length === 0) {
            console.warn("Peringatan: File PTK terbaca, tapi tidak ada satupun data 'Guru' dengan status 'Induk' di dalamnya.");
         }
      }

      if (activeTarget.collection === 'dapodik_sekolah' || activeTarget.collection === 'data_sarpras') {
         const mapUniqueSekolah = new Map();
         jsonData.forEach(item => {
            const keys = Object.keys(item);
            const npsnKey = keys.find(k => k.toLowerCase() === 'npsn');
            const npsn = npsnKey ? String(item[npsnKey]).trim() : '';
            const docId = npsn ? npsn : Math.random().toString();
            if (!mapUniqueSekolah.has(docId)) mapUniqueSekolah.set(docId, item);
         });
         jsonData = Array.from(mapUniqueSekolah.values());
      }
      
      const totalRowsInExcel = jsonData.length;
      const collectionName = `${activeTarget.collection}_chunks`; 
      const cleanTahun = String(activeTarget.year);
      
      const q = query(collection(db, collectionName), where("tahun_data", "==", cleanTahun));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const allDocs = snapshot.docs;
        for (let i = 0; i < allDocs.length; i++) await deleteDoc(allDocs[i].ref);
      }

      // CATAT WAKTU UPLOAD SAAT INI UNTUK SEMUA JENIS UPLOAD
      const currentTime = new Date().toISOString();

      if (totalRowsInExcel === 0) {
        const docRef = doc(collection(db, collectionName));
        await setDoc(docRef, { 
          tahun_data: cleanTahun, 
          data: [], 
          last_updated: currentTime,
          is_empty: true
        });
        setUploadProgress(100);
        alert(`UPLOAD SELESAI, TAPI DATA KOSONG.\n\nSistem mencatat waktu upload, tapi tidak ada data valid yang bisa disimpan.`);
      } else {
        const CHUNK_SIZE = 150; 
        const totalChunks = Math.ceil(totalRowsInExcel / CHUNK_SIZE);

        for (let i = 0; i < totalChunks; i++) {
          const chunkData = jsonData.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).map(item => {
            const sanitizedItem = {};
            for (const key in item) {
               let val = item[key];
               if (val === undefined) sanitizedItem[key] = '';
               else if (val instanceof Date) sanitizedItem[key] = val.toISOString().split('T')[0];
               else sanitizedItem[key] = val;
            }
            const keys = Object.keys(sanitizedItem);
            const nikKey = keys.find(k => k.toLowerCase() === 'nik');
            const npsnKey = keys.find(k => k.toLowerCase() === 'npsn');
            let returnData = { ...sanitizedItem };
            
            if (nikKey) returnData[nikKey] = String(sanitizedItem[nikKey]).replace(/\D/g, '');
            if (npsnKey) returnData[npsnKey] = String(sanitizedItem[npsnKey]).trim();
            return returnData;
          });

          const docRef = doc(collection(db, collectionName));
          
          await setDoc(docRef, { 
            tahun_data: cleanTahun, 
            data: chunkData,
            last_updated: currentTime 
          });
          
          setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
        }

        alert(`SINKRONISASI BERHASIL!\n\nTotal ${totalRowsInExcel.toLocaleString('id-ID')} baris data unik telah di-compress menjadi ${totalChunks} dokumen.`);
      }
      
      checkDatabaseStatus();
    } catch (error) {
      alert("Error saat memproses. Pastikan format file sesuai.");
    } finally {
      setUploading(false);
      e.target.value = null; 
    }
  };

  const triggerUpload = (target) => {
    setActiveTarget(target);
    fileInputRef.current.click();
  };

  // =====================================================================
  // FUNGSI UNDUH FORMAT EXCEL 
  // =====================================================================
  
  const handleDownloadFormatSekolah = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Satuan Pendidikan');
    
    // UPDATE: Kolom disesuaikan SANGAT SPESIFIK dengan format Satuan Pendidikan
    const columns = [
      'npsn', 'nama_satuan_pendidikan', 'status_sekolah', 'bentuk_pendidikan', 'alamat', 
      'desa', 'kecamatan', 'kabupaten', 'lintang', 'bujur', 'npwp', 'nama_kepala_sekolah', 
      'nomor_hp_kepsek', 'tmt_akreditasi', 'akreditasi', 'nama_operator', 'nomor_hp_operator', 
      'rombel_t1', 'rombel_ t2', 'rombel_ t3', 'rombel_ t4', 'rombel_ t5', 'rombel_ t6', 
      'rombel_ t7', 'rombel_ t8', 'rombel_ t9', 'rombel_ t10', 'rombel_ t11', 'rombel_ t12', 
      'rombel_ t13', 'rombel_ tka', 'rombel_ tkb', 'rombel_ pkta', 'rombel_ pktb', 'rombel_ pktc', 
      'tka_l', 'tka_p', 'tkb_l', 'tkb_p', 't1_l', 't1_p', 't2_l', 't2_p', 't3_l', 't3_p', 
      't4_l', 't4_p', 't5_l', 't5_p', 't6_l', 't6_p', 't7_l', 't7_p', 't8_l', 't8_p', 
      't9_l', 't9_p', 't10_l', 't10_p', 't11_l', 't11_p', 't12_l', 't12_p', 't13_l', 't13_p', 
      'paket_a_l', 'paket_a_p', 'paket_b_l', 'paket_b_p', 'paket_c_l', 'paket_c_p',
      'l_Islam', 'p_Islam', 'l_Kristen', 'p_Kristen', 'l_Katholik', 'p_Katholik', 
      'l_Hindu', 'p_Hindu', 'l_Budha', 'p_Budha', 'l_Konghucu', 'p_Konghucu', 
      'l_Kepercayaan', 'p_Kepercayaan', 'l_agama_lainnya', 'p_agama_lainnya', 
      'tendik', 'pd_l', 'pd_p', 'pd_total'
    ];

    worksheet.columns = columns.map(col => ({ header: col, key: col, width: 15 }));
    
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }; // Blue

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Format_Upload_Sekolah.xlsx`;
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
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } }; // Light Blue
    
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
      'npsn', 'nama_sekolah', 'jenjang', 'kecamatan', 'kabupaten',
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
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9333EA' } }; // Purple
    
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Format_Upload_Sarpras.xlsx`;
    link.click();
  };

  // =====================================================================
  // MESIN PRE-CALCULATION RASIO
  // =====================================================================
  
  // 1. SEKOLAH VS PD (PD / SEKOLAH)
  const handleCalculateRasioSekolahPD = async (year) => {
    setUploading(true);
    setProgressLabel(`Menghitung Rasio Sekolah VS PD ${year}...`);
    setUploadProgress(10);

    try {
      const q = query(collection(db, 'dapodik_sekolah_chunks'), where("tahun_data", "==", year));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        alert("Data Sekolah Kosong! Silakan unggah data sekolah terlebih dahulu.");
        setUploading(false); return;
      }

      let allSekolahData = [];
      snapshot.forEach(doc => {
        if(doc.data().data) allSekolahData = allSekolahData.concat(doc.data().data);
      });

      setUploadProgress(50);

      const tab1Data = JENJANG_KEYS.map(k => ({ jenjang: k, sek_n: 0, pd_n: 0, sek_s: 0, pd_s: 0 }));
      const mapWilayah = new Map();

      allSekolahData.forEach(item => {
        const group = identifyJenjangGroup(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang'));
        if (!group) return;

        const isNegeri = String(getVal(item, 'status_sekolah')).toUpperCase() === 'NEGERI';
        
        let pd = parseInt(getVal(item, 'pd_total'));
        if (isNaN(pd)) {
          const totalLaki = 
            (parseInt(getVal(item, 'tka_l')) || 0) + (parseInt(getVal(item, 'tkb_l')) || 0) +
            (parseInt(getVal(item, 't1_l')) || 0) + (parseInt(getVal(item, 't2_l')) || 0) +
            (parseInt(getVal(item, 't3_l')) || 0) + (parseInt(getVal(item, 't4_l')) || 0) +
            (parseInt(getVal(item, 't5_l')) || 0) + (parseInt(getVal(item, 't6_l')) || 0) +
            (parseInt(getVal(item, 't7_l')) || 0) + (parseInt(getVal(item, 't8_l')) || 0) +
            (parseInt(getVal(item, 't9_l')) || 0) + (parseInt(getVal(item, 't10_l')) || 0) +
            (parseInt(getVal(item, 't11_l')) || 0) + (parseInt(getVal(item, 't12_l')) || 0) +
            (parseInt(getVal(item, 't13_l')) || 0) + (parseInt(getVal(item, 'paket_a_l')) || 0) +
            (parseInt(getVal(item, 'paket_b_l')) || 0) + (parseInt(getVal(item, 'paket_c_l')) || 0);
          
          const totalPerempuan = 
            (parseInt(getVal(item, 'tka_p')) || 0) + (parseInt(getVal(item, 'tkb_p')) || 0) +
            (parseInt(getVal(item, 't1_p')) || 0) + (parseInt(getVal(item, 't2_p')) || 0) +
            (parseInt(getVal(item, 't3_p')) || 0) + (parseInt(getVal(item, 't4_p')) || 0) +
            (parseInt(getVal(item, 't5_p')) || 0) + (parseInt(getVal(item, 't6_p')) || 0) +
            (parseInt(getVal(item, 't7_p')) || 0) + (parseInt(getVal(item, 't8_p')) || 0) +
            (parseInt(getVal(item, 't9_p')) || 0) + (parseInt(getVal(item, 't10_p')) || 0) +
            (parseInt(getVal(item, 't11_p')) || 0) + (parseInt(getVal(item, 't12_p')) || 0) +
            (parseInt(getVal(item, 't13_p')) || 0) + (parseInt(getVal(item, 'paket_a_p')) || 0) +
            (parseInt(getVal(item, 'paket_b_p')) || 0) + (parseInt(getVal(item, 'paket_c_p')) || 0);

          pd = totalLaki + totalPerempuan;
        }

        const rowTab1 = tab1Data.find(r => r.jenjang === group);
        if (isNegeri) { rowTab1.sek_n++; rowTab1.pd_n += pd; } 
        else { rowTab1.sek_s++; rowTab1.pd_s += pd; }

        const kabDb = cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'));
        const keyKec = String(getVal(item, 'kecamatan') || 'TIDAK DIKETAHUI').trim().toUpperCase();
        const uniqueId = `${kabDb}_${keyKec}`;

        if (!mapWilayah.has(uniqueId)) {
          const init = { wilayah: kabDb, kecamatan: keyKec };
          JENJANG_KEYS.forEach(k => { 
             init[`${k}_sek`] = 0; init[`${k}_pd`] = 0;
             init[`${k}_sek_n`] = 0; init[`${k}_pd_n`] = 0; 
             init[`${k}_sek_s`] = 0; init[`${k}_pd_s`] = 0; 
          });
          mapWilayah.set(uniqueId, init);
        }

        const rowTab2 = mapWilayah.get(uniqueId);
        rowTab2[`${group}_sek`]++;
        rowTab2[`${group}_pd`] += pd;
        
        if (isNegeri) {
           rowTab2[`${group}_sek_n`]++;
           rowTab2[`${group}_pd_n`] += pd;
        } else {
           rowTab2[`${group}_sek_s`]++;
           rowTab2[`${group}_pd_s`] += pd;
        }
      });

      setUploadProgress(80);
      const tab2DataRaw = Array.from(mapWilayah.values());

      const docRef = doc(db, 'dapodik_agregasi', `rasio_sekolah_pd_${year}`);
      await setDoc(docRef, {
        tahun_data: year, tabel1: tab1Data, tabel2: tab2DataRaw, last_updated: new Date().toISOString()
      });

      setUploadProgress(100);
      alert(`KALKULASI SUKSES!\n\nHasil rasio Sekolah VS Peserta Didik tahun ${year} berhasil disimpan.`);
      checkCalcStatus();
    } catch (error) {
      console.error(error);
      alert("Terjadi kesalahan saat melakukan kalkulasi rasio.");
    } finally {
      setUploading(false);
    }
  };

  // 2. SEKOLAH VS GURU (GURU / SEKOLAH)
  const handleCalculateRasioSekolahGuru = async (year) => {
    setUploading(true);
    setProgressLabel(`Menghitung Rasio Sekolah VS Guru ${year}...`);
    setUploadProgress(10);

    try {
      const qSek = query(collection(db, 'dapodik_sekolah_chunks'), where("tahun_data", "==", year));
      const snapSek = await getDocs(qSek);
      const qPtk = query(collection(db, 'dapodik_ptk_chunks'), where("tahun_data", "==", year));
      const snapPtk = await getDocs(qPtk);

      if (snapSek.empty || snapPtk.empty) {
        alert("Data Sekolah atau Guru Kosong! Pastikan kedua data sudah diunggah untuk tahun ini.");
        setUploading(false); return;
      }

      let allSekolahData = [];
      snapSek.forEach(doc => { if(doc.data().data) allSekolahData = allSekolahData.concat(doc.data().data); });
      let allPtkData = [];
      snapPtk.forEach(doc => { if(doc.data().data) allPtkData = allPtkData.concat(doc.data().data); });

      setUploadProgress(40); 

      const mapSekolah = new Map();
      allSekolahData.forEach(s => {
         const npsn = String(getVal(s, 'npsn')).trim();
         if(npsn) mapSekolah.set(npsn, { ...s, guru_aktual: 0 });
      });

      allPtkData.forEach(p => {
         const isGuru = String(getVal(p, 'jenis_ptk')).toUpperCase().includes('GURU');
         const isInduk = String(getVal(p, 'status_tugas') || getVal(p, 'ptk_induk')).trim().toUpperCase() === 'INDUK' || String(getVal(p, 'status_tugas')).trim() === '1';
         if(isGuru && isInduk) {
            const npsn = String(getVal(p, 'npsn')).trim();
            if(mapSekolah.has(npsn)) {
               mapSekolah.get(npsn).guru_aktual++;
            }
         }
      });

      setUploadProgress(60); 

      const tab1Data = JENJANG_KEYS.map(k => ({ jenjang: k, sek_n: 0, guru_n: 0, sek_s: 0, guru_s: 0 }));
      const mapWilayah = new Map();

      Array.from(mapSekolah.values()).forEach(item => {
        const bentuk = String(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang')).trim().toUpperCase();
        const group = identifyJenjangGroup(bentuk);
        if (!group) return;

        const isNegeri = String(getVal(item, 'status_sekolah')).toUpperCase() === 'NEGERI';
        const guruAktual = item.guru_aktual;

        const rowTab1 = tab1Data.find(r => r.jenjang === group);
        if (isNegeri) { rowTab1.sek_n++; rowTab1.guru_n += guruAktual; } 
        else { rowTab1.sek_s++; rowTab1.guru_s += guruAktual; }

        const kabDb = cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'));
        const keyKec = String(getVal(item, 'kecamatan') || 'TIDAK DIKETAHUI').trim().toUpperCase();
        const uniqueId = `${kabDb}_${keyKec}`;

        if (!mapWilayah.has(uniqueId)) {
          const init = { wilayah: kabDb, kecamatan: keyKec };
          JENJANG_KEYS.forEach(k => { 
             init[`${k}_sek`] = 0; 
             init[`${k}_guru`] = 0;
             init[`${k}_sek_n`] = 0; init[`${k}_guru_n`] = 0;
             init[`${k}_sek_s`] = 0; init[`${k}_guru_s`] = 0;
          });
          mapWilayah.set(uniqueId, init);
        }

        const rowTab2 = mapWilayah.get(uniqueId);
        
        rowTab2[`${group}_sek`]++;
        rowTab2[`${group}_guru`] += guruAktual;
        
        if (isNegeri) {
           rowTab2[`${group}_sek_n`]++;
           rowTab2[`${group}_guru_n`] += guruAktual;
        } else {
           rowTab2[`${group}_sek_s`]++;
           rowTab2[`${group}_guru_s`] += guruAktual;
        }
      });

      setUploadProgress(80); 

      const tab2DataRaw = Array.from(mapWilayah.values());

      const docRef = doc(db, 'dapodik_agregasi', `rasio_sekolah_guru_${year}`);
      await setDoc(docRef, {
        tahun_data: year, tabel1: tab1Data, tabel2: tab2DataRaw, last_updated: new Date().toISOString()
      });

      setUploadProgress(100);
      alert(`KALKULASI SUKSES!\n\nHasil rasio Sekolah VS Guru tahun ${year} berhasil dihitung dan disimpan.`);
      checkCalcStatus();
    } catch (error) {
      console.error(error);
      alert("Terjadi kesalahan saat melakukan kalkulasi rasio Guru.");
    } finally {
      setUploading(false);
    }
  };

  // 3. ROMBEL VS GURU (GURU / ROMBEL)
  const handleCalculateRasioRombelGuru = async (year) => {
    setUploading(true);
    setProgressLabel(`Menghitung Rasio Rombel VS Guru ${year}...`);
    setUploadProgress(10);

    try {
      const qSek = query(collection(db, 'dapodik_sekolah_chunks'), where("tahun_data", "==", year));
      const snapSek = await getDocs(qSek);
      const qPtk = query(collection(db, 'dapodik_ptk_chunks'), where("tahun_data", "==", year));
      const snapPtk = await getDocs(qPtk);

      if (snapSek.empty || snapPtk.empty) {
        alert("Data Sekolah atau Guru Kosong! Pastikan kedua data sudah diunggah untuk tahun ini.");
        setUploading(false); return;
      }

      let allSekolahData = [];
      snapSek.forEach(doc => { if(doc.data().data) allSekolahData = allSekolahData.concat(doc.data().data); });
      let allPtkData = [];
      snapPtk.forEach(doc => { if(doc.data().data) allPtkData = allPtkData.concat(doc.data().data); });

      setUploadProgress(40);

      const mapSekolah = new Map();
      allSekolahData.forEach(s => {
         const npsn = String(getVal(s, 'npsn')).trim();
         if(npsn) {
             let rombelTotal = 0;
             Object.keys(s).forEach(k => {
                 if(k.toLowerCase().includes('rombel_')) rombelTotal += parseInt(s[k]) || 0;
             });
             mapSekolah.set(npsn, { ...s, rombel_total: rombelTotal, guru_aktual: 0 });
         }
      });

      allPtkData.forEach(p => {
         const isGuru = String(getVal(p, 'jenis_ptk')).toUpperCase().includes('GURU');
         const isInduk = String(getVal(p, 'status_tugas') || getVal(p, 'ptk_induk')).trim().toUpperCase() === 'INDUK' || String(getVal(p, 'status_tugas')).trim() === '1';
         if(isGuru && isInduk) {
            const npsn = String(getVal(p, 'npsn')).trim();
            if(mapSekolah.has(npsn)) {
               mapSekolah.get(npsn).guru_aktual++;
            }
         }
      });

      setUploadProgress(60);

      const tab1Data = JENJANG_KEYS.map(k => ({ jenjang: k, rombel_n: 0, guru_n: 0, rombel_s: 0, guru_s: 0 }));
      const mapWilayah = new Map();

      Array.from(mapSekolah.values()).forEach(item => {
        const bentuk = String(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang')).trim().toUpperCase();
        const group = identifyJenjangGroup(bentuk);
        if (!group) return;

        const isNegeri = String(getVal(item, 'status_sekolah')).toUpperCase() === 'NEGERI';
        const rombelTotal = item.rombel_total;
        const guruAktual = item.guru_aktual;

        const rowTab1 = tab1Data.find(r => r.jenjang === group);
        if (isNegeri) { rowTab1.rombel_n += rombelTotal; rowTab1.guru_n += guruAktual; } 
        else { rowTab1.rombel_s += rombelTotal; rowTab1.guru_s += guruAktual; }

        const kabDb = cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'));
        const keyKec = String(getVal(item, 'kecamatan') || 'TIDAK DIKETAHUI').trim().toUpperCase();
        const uniqueId = `${kabDb}_${keyKec}`;

        if (!mapWilayah.has(uniqueId)) {
          const init = { wilayah: kabDb, kecamatan: keyKec };
          JENJANG_KEYS.forEach(k => { 
             init[`${k}_rombel`] = 0; init[`${k}_guru`] = 0;
             init[`${k}_rombel_n`] = 0; init[`${k}_guru_n`] = 0;
             init[`${k}_rombel_s`] = 0; init[`${k}_guru_s`] = 0;
          });
          mapWilayah.set(uniqueId, init);
        }

        const rowTab2 = mapWilayah.get(uniqueId);
        rowTab2[`${group}_rombel`] += rombelTotal;
        rowTab2[`${group}_guru`] += guruAktual;
        
        if (isNegeri) {
           rowTab2[`${group}_rombel_n`] += rombelTotal;
           rowTab2[`${group}_guru_n`] += guruAktual;
        } else {
           rowTab2[`${group}_rombel_s`] += rombelTotal;
           rowTab2[`${group}_guru_s`] += guruAktual;
        }
      });

      setUploadProgress(80); 

      const tab2DataRaw = Array.from(mapWilayah.values());

      const docRef = doc(db, 'dapodik_agregasi', `rasio_rombel_guru_${year}`);
      await setDoc(docRef, {
        tahun_data: year, tabel1: tab1Data, tabel2: tab2DataRaw, last_updated: new Date().toISOString()
      });

      setUploadProgress(100);
      alert(`KALKULASI SUKSES!\n\nHasil rasio Rombel VS Guru tahun ${year} berhasil dihitung dan disimpan.`);
      checkCalcStatus();
    } catch (error) {
      console.error(error);
      alert("Terjadi kesalahan saat melakukan kalkulasi rasio Rombel VS Guru.");
    } finally {
      setUploading(false);
    }
  };

  // 4. SEKOLAH VS ROMBEL (ROMBEL / SEKOLAH)
  const handleCalculateRasioSekolahRombel = async (year) => {
    setUploading(true);
    setProgressLabel(`Menghitung Rasio Sekolah VS Rombel ${year}...`);
    setUploadProgress(10);

    try {
      const qSek = query(collection(db, 'dapodik_sekolah_chunks'), where("tahun_data", "==", year));
      const snapSek = await getDocs(qSek);

      if (snapSek.empty) {
        alert("Data Sekolah Kosong! Silakan unggah data sekolah terlebih dahulu.");
        setUploading(false); return;
      }

      let allSekolahData = [];
      snapSek.forEach(doc => { if(doc.data().data) allSekolahData = allSekolahData.concat(doc.data().data); });

      setUploadProgress(50);

      const tab1Data = JENJANG_KEYS.map(k => ({ jenjang: k, sek_n: 0, rombel_n: 0, sek_s: 0, rombel_s: 0 }));
      const mapWilayah = new Map();

      allSekolahData.forEach(item => {
        const bentuk = String(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang')).trim().toUpperCase();
        const group = identifyJenjangGroup(bentuk);
        if (!group) return;

        const isNegeri = String(getVal(item, 'status_sekolah')).toUpperCase() === 'NEGERI';
        
        let rombelTotal = 0;
        Object.keys(item).forEach(k => {
            if(k.toLowerCase().includes('rombel_')) {
                rombelTotal += parseInt(item[k]) || 0;
            }
        });

        // Update Tab 1 Global
        const rowTab1 = tab1Data.find(r => r.jenjang === group);
        if (isNegeri) { rowTab1.sek_n++; rowTab1.rombel_n += rombelTotal; } 
        else { rowTab1.sek_s++; rowTab1.rombel_s += rombelTotal; }

        // Update Tab 2
        const kabDb = cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'));
        const keyKec = String(getVal(item, 'kecamatan') || 'TIDAK DIKETAHUI').trim().toUpperCase();
        const uniqueId = `${kabDb}_${keyKec}`;

        if (!mapWilayah.has(uniqueId)) {
          const init = { wilayah: kabDb, kecamatan: keyKec };
          JENJANG_KEYS.forEach(k => { 
             init[`${k}_sek`] = 0; init[`${k}_rombel`] = 0;
             init[`${k}_sek_n`] = 0; init[`${k}_rombel_n`] = 0;
             init[`${k}_sek_s`] = 0; init[`${k}_rombel_s`] = 0;
          });
          mapWilayah.set(uniqueId, init);
        }

        const rowTab2 = mapWilayah.get(uniqueId);
        rowTab2[`${group}_sek`]++;
        rowTab2[`${group}_rombel`] += rombelTotal;
        
        if (isNegeri) {
           rowTab2[`${group}_sek_n`]++;
           rowTab2[`${group}_rombel_n`] += rombelTotal;
        } else {
           rowTab2[`${group}_sek_s`]++;
           rowTab2[`${group}_rombel_s`] += rombelTotal;
        }
      });

      setUploadProgress(80); 

      const tab2DataRaw = Array.from(mapWilayah.values());

      const docRef = doc(db, 'dapodik_agregasi', `rasio_sekolah_rombel_${year}`);
      await setDoc(docRef, {
        tahun_data: year, tabel1: tab1Data, tabel2: tab2DataRaw, last_updated: new Date().toISOString()
      });

      setUploadProgress(100);
      alert(`KALKULASI SUKSES!\n\nHasil rasio Sekolah VS Rombel tahun ${year} berhasil dihitung dan disimpan.`);
      checkCalcStatus();
    } catch (error) {
      console.error(error);
      alert("Terjadi kesalahan saat melakukan kalkulasi rasio Sekolah VS Rombel.");
    } finally {
      setUploading(false);
    }
  };

  // 5. ROMBEL VS PD (PD / ROMBEL)
  const handleCalculateRasioRombelPD = async (year) => {
    setUploading(true);
    setProgressLabel(`Menghitung Rasio Rombel VS Peserta Didik ${year}...`);
    setUploadProgress(10);

    try {
      const qSek = query(collection(db, 'dapodik_sekolah_chunks'), where("tahun_data", "==", year));
      const snapSek = await getDocs(qSek);

      if (snapSek.empty) {
        alert("Data Sekolah Kosong! Silakan unggah data sekolah terlebih dahulu.");
        setUploading(false); return;
      }

      let allSekolahData = [];
      snapSek.forEach(doc => { if(doc.data().data) allSekolahData = allSekolahData.concat(doc.data().data); });

      setUploadProgress(40);

      const tab1Data = JENJANG_KEYS.map(k => ({ jenjang: k, rombel_n: 0, pd_n: 0, rombel_s: 0, pd_s: 0 }));
      const mapWilayah = new Map();

      allSekolahData.forEach(item => {
        const bentuk = String(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang')).trim().toUpperCase();
        const group = identifyJenjangGroup(bentuk);
        if (!group) return;

        const isNegeri = String(getVal(item, 'status_sekolah')).toUpperCase() === 'NEGERI';
        
        let pd = parseInt(getVal(item, 'pd_total'));
        if (isNaN(pd)) {
          const totalLaki = 
            (parseInt(getVal(item, 'tka_l')) || 0) + (parseInt(getVal(item, 'tkb_l')) || 0) +
            (parseInt(getVal(item, 't1_l')) || 0) + (parseInt(getVal(item, 't2_l')) || 0) +
            (parseInt(getVal(item, 't3_l')) || 0) + (parseInt(getVal(item, 't4_l')) || 0) +
            (parseInt(getVal(item, 't5_l')) || 0) + (parseInt(getVal(item, 't6_l')) || 0) +
            (parseInt(getVal(item, 't7_l')) || 0) + (parseInt(getVal(item, 't8_l')) || 0) +
            (parseInt(getVal(item, 't9_l')) || 0) + (parseInt(getVal(item, 't10_l')) || 0) +
            (parseInt(getVal(item, 't11_l')) || 0) + (parseInt(getVal(item, 't12_l')) || 0) +
            (parseInt(getVal(item, 't13_l')) || 0) + (parseInt(getVal(item, 'paket_a_l')) || 0) +
            (parseInt(getVal(item, 'paket_b_l')) || 0) + (parseInt(getVal(item, 'paket_c_l')) || 0);
          
          const totalPerempuan = 
            (parseInt(getVal(item, 'tka_p')) || 0) + (parseInt(getVal(item, 'tkb_p')) || 0) +
            (parseInt(getVal(item, 't1_p')) || 0) + (parseInt(getVal(item, 't2_p')) || 0) +
            (parseInt(getVal(item, 't3_p')) || 0) + (parseInt(getVal(item, 't4_p')) || 0) +
            (parseInt(getVal(item, 't5_p')) || 0) + (parseInt(getVal(item, 't6_p')) || 0) +
            (parseInt(getVal(item, 't7_p')) || 0) + (parseInt(getVal(item, 't8_p')) || 0) +
            (parseInt(getVal(item, 't9_p')) || 0) + (parseInt(getVal(item, 't10_p')) || 0) +
            (parseInt(getVal(item, 't11_p')) || 0) + (parseInt(getVal(item, 't12_p')) || 0) +
            (parseInt(getVal(item, 't13_p')) || 0) + (parseInt(getVal(item, 'paket_a_p')) || 0) +
            (parseInt(getVal(item, 'paket_b_p')) || 0) + (parseInt(getVal(item, 'paket_c_p')) || 0);

          pd = totalLaki + totalPerempuan;
        }

        let rombelTotal = 0;
        Object.keys(item).forEach(k => {
            if(k.toLowerCase().includes('rombel_')) {
                rombelTotal += parseInt(item[k]) || 0;
            }
        });

        const rowTab1 = tab1Data.find(r => r.jenjang === group);
        if (isNegeri) { rowTab1.rombel_n += rombelTotal; rowTab1.pd_n += pd; } 
        else { rowTab1.rombel_s += rombelTotal; rowTab1.pd_s += pd; }

        const kabDb = cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'));
        const keyKec = String(getVal(item, 'kecamatan') || 'TIDAK DIKETAHUI').trim().toUpperCase();
        const uniqueId = `${kabDb}_${keyKec}`;

        if (!mapWilayah.has(uniqueId)) {
          const init = { wilayah: kabDb, kecamatan: keyKec };
          JENJANG_KEYS.forEach(k => { 
             init[`${k}_rombel`] = 0; 
             init[`${k}_pd`] = 0;
             init[`${k}_rombel_n`] = 0; init[`${k}_pd_n`] = 0;
             init[`${k}_rombel_s`] = 0; init[`${k}_pd_s`] = 0;
          });
          mapWilayah.set(uniqueId, init);
        }

        const rowTab2 = mapWilayah.get(uniqueId);
        rowTab2[`${group}_rombel`] += rombelTotal;
        rowTab2[`${group}_pd`] += pd;
        
        if (isNegeri) {
           rowTab2[`${group}_rombel_n`] += rombelTotal;
           rowTab2[`${group}_pd_n`] += pd;
        } else {
           rowTab2[`${group}_rombel_s`] += rombelTotal;
           rowTab2[`${group}_pd_s`] += pd;
        }
      });

      setUploadProgress(80); 

      const tab2DataRaw = Array.from(mapWilayah.values());

      const docRef = doc(db, 'dapodik_agregasi', `rasio_rombel_pd_${year}`);
      await setDoc(docRef, {
        tahun_data: year,
        tabel1: tab1Data, 
        tabel2: tab2DataRaw, 
        last_updated: new Date().toISOString()
      });

      setUploadProgress(100);
      alert(`KALKULASI SUKSES!\n\nHasil rasio Rombel VS Peserta Didik tahun ${year} berhasil dihitung dan disimpan.`);
      checkCalcStatus();
    } catch (error) {
      console.error(error);
      alert("Terjadi kesalahan saat melakukan kalkulasi rasio Rombel VS PD.");
    } finally {
      setUploading(false);
    }
  };

  // 6. ROMBEL VS RUANG KELAS (KELAS / ROMBEL)
  const handleCalculateRasioRombelKelas = async (year) => {
    setUploading(true);
    setProgressLabel(`Menghitung Rasio Rombel VS Ruang Kelas ${year}...`);
    setUploadProgress(10);

    try {
      const qSek = query(collection(db, 'dapodik_sekolah_chunks'), where("tahun_data", "==", year));
      const snapSek = await getDocs(qSek);
      
      const qSarpras = query(collection(db, 'data_sarpras_chunks'), where("tahun_data", "==", year));
      const snapSarpras = await getDocs(qSarpras);

      if (snapSek.empty || snapSarpras.empty) {
        alert("Data Sekolah atau Data Sarpras Kosong! Pastikan kedua data sudah diunggah untuk tahun ini.");
        setUploading(false); return;
      }

      let allSekolahData = [];
      snapSek.forEach(doc => { if(doc.data().data) allSekolahData = allSekolahData.concat(doc.data().data); });
      
      let allSarprasData = [];
      snapSarpras.forEach(doc => { if(doc.data().data) allSarprasData = allSarprasData.concat(doc.data().data); });

      setUploadProgress(40);

      // Map Sarpras untuk mencari Ruang Kelas per NPSN.
      const mapSarpras = new Map();
      allSarprasData.forEach(s => {
         const npsn = String(getVal(s, 'npsn')).trim();
         if(npsn) {
             const kelasBaik = parseInt(getVal(s, 'ruang_kelas_baik')) || 0;
             const kelasRusakRingan = parseInt(getVal(s, 'ruang_kelas_rusak_ringan')) || 0;
             const kelasRusakSedang = parseInt(getVal(s, 'ruang_kelas_rusak_sedang')) || 0;
             const kelasRusakBerat = parseInt(getVal(s, 'ruang_kelas_rusak_berat')) || 0;
             
             const ruangKelasTotal = kelasBaik + kelasRusakRingan + kelasRusakSedang + kelasRusakBerat;
             mapSarpras.set(npsn, ruangKelasTotal);
         }
      });

      const tab1Data = JENJANG_KEYS.map(k => ({ jenjang: k, rombel_n: 0, kelas_n: 0, rombel_s: 0, kelas_s: 0 }));
      const mapWilayah = new Map();

      allSekolahData.forEach(item => {
        const bentuk = String(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang')).trim().toUpperCase();
        const group = identifyJenjangGroup(bentuk);
        if (!group) return;

        const isNegeri = String(getVal(item, 'status_sekolah')).toUpperCase() === 'NEGERI';
        const npsn = String(getVal(item, 'npsn')).trim();
        
        let rombelTotal = 0;
        Object.keys(item).forEach(k => {
            if(k.toLowerCase().includes('rombel_')) {
                rombelTotal += parseInt(item[k]) || 0;
            }
        });

        const kelasTotal = mapSarpras.get(npsn) || 0;

        const rowTab1 = tab1Data.find(r => r.jenjang === group);
        if (isNegeri) { rowTab1.rombel_n += rombelTotal; rowTab1.kelas_n += kelasTotal; } 
        else { rowTab1.rombel_s += rombelTotal; rowTab1.kelas_s += kelasTotal; }

        const kabDb = cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'));
        const keyKec = String(getVal(item, 'kecamatan') || 'TIDAK DIKETAHUI').trim().toUpperCase();
        const uniqueId = `${kabDb}_${keyKec}`;

        if (!mapWilayah.has(uniqueId)) {
          const init = { wilayah: kabDb, kecamatan: keyKec };
          JENJANG_KEYS.forEach(k => { 
             init[`${k}_rombel`] = 0; 
             init[`${k}_kelas`] = 0;
             init[`${k}_rombel_n`] = 0; init[`${k}_kelas_n`] = 0;
             init[`${k}_rombel_s`] = 0; init[`${k}_kelas_s`] = 0;
          });
          mapWilayah.set(uniqueId, init);
        }

        const rowTab2 = mapWilayah.get(uniqueId);
        rowTab2[`${group}_rombel`] += rombelTotal;
        rowTab2[`${group}_kelas`] += kelasTotal;
        
        if (isNegeri) {
           rowTab2[`${group}_rombel_n`] += rombelTotal;
           rowTab2[`${group}_kelas_n`] += kelasTotal;
        } else {
           rowTab2[`${group}_rombel_s`] += rombelTotal;
           rowTab2[`${group}_kelas_s`] += kelasTotal;
        }
      });

      setUploadProgress(80); 

      const tab2DataRaw = Array.from(mapWilayah.values());

      const docRef = doc(db, 'dapodik_agregasi', `rasio_rombel_kelas_${year}`);
      await setDoc(docRef, {
        tahun_data: year,
        tabel1: tab1Data, 
        tabel2: tab2DataRaw, 
        last_updated: new Date().toISOString()
      });

      setUploadProgress(100);
      alert(`KALKULASI SUKSES!\n\nHasil rasio Rombel VS Ruang Kelas tahun ${year} berhasil dihitung dan disimpan.`);
      checkCalcStatus();
    } catch (error) {
      console.error(error);
      alert("Terjadi kesalahan saat melakukan kalkulasi rasio Rombel VS Kelas.");
    } finally {
      setUploading(false);
    }
  };

  // 7. GURU VS PD (PD / GURU)
  const handleCalculateRasioGuruPD = async (year) => {
    setUploading(true);
    setProgressLabel(`Menghitung Rasio Guru VS Peserta Didik ${year}...`);
    setUploadProgress(10);

    try {
      const qSek = query(collection(db, 'dapodik_sekolah_chunks'), where("tahun_data", "==", year));
      const snapSek = await getDocs(qSek);
      const qPtk = query(collection(db, 'dapodik_ptk_chunks'), where("tahun_data", "==", year));
      const snapPtk = await getDocs(qPtk);

      if (snapSek.empty || snapPtk.empty) {
        alert("Data Sekolah atau Guru Kosong! Pastikan kedua data sudah diunggah untuk tahun ini.");
        setUploading(false); return;
      }

      let allSekolahData = [];
      snapSek.forEach(doc => { if(doc.data().data) allSekolahData = allSekolahData.concat(doc.data().data); });
      let allPtkData = [];
      snapPtk.forEach(doc => { if(doc.data().data) allPtkData = allPtkData.concat(doc.data().data); });

      setUploadProgress(40);

      const mapSekolah = new Map();
      allSekolahData.forEach(s => {
         const npsn = String(getVal(s, 'npsn')).trim();
         if(npsn) {
             let pd = parseInt(getVal(s, 'pd_total'));
             if (isNaN(pd)) {
               const totalLaki = (parseInt(getVal(s, 'tka_l')) || 0) + (parseInt(getVal(s, 'tkb_l')) || 0) +
                 (parseInt(getVal(s, 't1_l')) || 0) + (parseInt(getVal(s, 't2_l')) || 0) +
                 (parseInt(getVal(s, 't3_l')) || 0) + (parseInt(getVal(s, 't4_l')) || 0) +
                 (parseInt(getVal(s, 't5_l')) || 0) + (parseInt(getVal(s, 't6_l')) || 0) +
                 (parseInt(getVal(s, 't7_l')) || 0) + (parseInt(getVal(s, 't8_l')) || 0) +
                 (parseInt(getVal(s, 't9_l')) || 0) + (parseInt(getVal(s, 't10_l')) || 0) +
                 (parseInt(getVal(s, 't11_l')) || 0) + (parseInt(getVal(s, 't12_l')) || 0) +
                 (parseInt(getVal(s, 't13_l')) || 0) + (parseInt(getVal(s, 'paket_a_l')) || 0) +
                 (parseInt(getVal(s, 'paket_b_l')) || 0) + (parseInt(getVal(s, 'paket_c_l')) || 0);

               const totalPerempuan = (parseInt(getVal(s, 'tka_p')) || 0) + (parseInt(getVal(s, 'tkb_p')) || 0) +
                 (parseInt(getVal(s, 't1_p')) || 0) + (parseInt(getVal(s, 't2_p')) || 0) +
                 (parseInt(getVal(s, 't3_p')) || 0) + (parseInt(getVal(s, 't4_p')) || 0) +
                 (parseInt(getVal(s, 't5_p')) || 0) + (parseInt(getVal(s, 't6_p')) || 0) +
                 (parseInt(getVal(s, 't7_p')) || 0) + (parseInt(getVal(s, 't8_p')) || 0) +
                 (parseInt(getVal(s, 't9_p')) || 0) + (parseInt(getVal(s, 't10_p')) || 0) +
                 (parseInt(getVal(s, 't11_p')) || 0) + (parseInt(getVal(s, 't12_p')) || 0) +
                 (parseInt(getVal(s, 't13_p')) || 0) + (parseInt(getVal(s, 'paket_a_p')) || 0) +
                 (parseInt(getVal(s, 'paket_b_p')) || 0) + (parseInt(getVal(s, 'paket_c_p')) || 0);

               pd = totalLaki + totalPerempuan;
             }
             mapSekolah.set(npsn, { ...s, pd_total: pd, guru_aktual: 0 });
         }
      });

      allPtkData.forEach(p => {
         const isGuru = String(getVal(p, 'jenis_ptk')).toUpperCase().includes('GURU');
         const isInduk = String(getVal(p, 'status_tugas') || getVal(p, 'ptk_induk')).trim().toUpperCase() === 'INDUK' || String(getVal(p, 'status_tugas')).trim() === '1';
         if(isGuru && isInduk) {
            const npsn = String(getVal(p, 'npsn')).trim();
            if(mapSekolah.has(npsn)) {
               mapSekolah.get(npsn).guru_aktual++;
            }
         }
      });

      setUploadProgress(60);

      const tab1Data = JENJANG_KEYS.map(k => ({ jenjang: k, guru_n: 0, pd_n: 0, guru_s: 0, pd_s: 0 }));
      const mapWilayah = new Map();

      Array.from(mapSekolah.values()).forEach(item => {
        const bentuk = String(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang')).trim().toUpperCase();
        const group = identifyJenjangGroup(bentuk);
        if (!group) return;

        const isNegeri = String(getVal(item, 'status_sekolah')).toUpperCase() === 'NEGERI';
        const pdTotal = item.pd_total;
        const guruAktual = item.guru_aktual;

        const rowTab1 = tab1Data.find(r => r.jenjang === group);
        if (isNegeri) { rowTab1.guru_n += guruAktual; rowTab1.pd_n += pdTotal; } 
        else { rowTab1.guru_s += guruAktual; rowTab1.pd_s += pdTotal; }

        const kabDb = cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'));
        const keyKec = String(getVal(item, 'kecamatan') || 'TIDAK DIKETAHUI').trim().toUpperCase();
        const uniqueId = `${kabDb}_${keyKec}`;

        if (!mapWilayah.has(uniqueId)) {
          const init = { wilayah: kabDb, kecamatan: keyKec };
          JENJANG_KEYS.forEach(k => { 
             init[`${k}_guru`] = 0; init[`${k}_pd`] = 0;
             init[`${k}_guru_n`] = 0; init[`${k}_pd_n`] = 0;
             init[`${k}_guru_s`] = 0; init[`${k}_pd_s`] = 0;
          });
          mapWilayah.set(uniqueId, init);
        }

        const rowTab2 = mapWilayah.get(uniqueId);
        rowTab2[`${group}_guru`] += guruAktual;
        rowTab2[`${group}_pd`] += pdTotal;
        
        if (isNegeri) {
           rowTab2[`${group}_guru_n`] += guruAktual;
           rowTab2[`${group}_pd_n`] += pdTotal;
        } else {
           rowTab2[`${group}_guru_s`] += guruAktual;
           rowTab2[`${group}_pd_s`] += pdTotal;
        }
      });

      setUploadProgress(80); 

      const tab2DataRaw = Array.from(mapWilayah.values());

      const docRef = doc(db, 'dapodik_agregasi', `rasio_guru_pd_${year}`);
      await setDoc(docRef, {
        tahun_data: year, tabel1: tab1Data, tabel2: tab2DataRaw, last_updated: new Date().toISOString()
      });

      setUploadProgress(100);
      alert(`KALKULASI SUKSES!\n\nHasil rasio Guru VS Peserta Didik tahun ${year} berhasil dihitung dan disimpan.`);
      checkCalcStatus();
    } catch (error) {
      console.error(error);
      alert("Terjadi kesalahan saat melakukan kalkulasi rasio Guru VS PD.");
    } finally {
      setUploading(false);
    }
  };


  // --- KOMPONEN UI ---

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
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden text-center">
      <Header />
      
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

      <div className={`flex-1 flex flex-col items-center p-12 overflow-y-auto ${adminView === 'main' ? 'justify-center' : 'justify-start pt-10'}`}>
        
        {adminView === 'main' && (
          <div className="w-full flex flex-col items-center animate-in fade-in zoom-in duration-300">
            <div className="bg-blue-600 text-white w-20 h-20 rounded-3xl flex items-center justify-center mb-8 shadow-lg"><Database size={40} /></div>
            <h2 className="text-5xl font-black text-gray-800 mb-12 tracking-tighter uppercase">Sitaka Admin Center</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 w-full max-w-5xl">
              <button onClick={() => setAdminView('input')} className="group bg-white p-16 rounded-[4rem] shadow-2xl border-4 border-transparent hover:border-blue-500 transition-all flex flex-col items-center gap-6 active:scale-95">
                <div className="bg-blue-600 text-white p-8 rounded-[2.5rem] shadow-lg"><Database size={64} /></div>
                <h3 className="text-4xl font-black text-gray-800 uppercase tracking-tighter">Database Master</h3>
              </button>
              <button onClick={() => setAdminView('kalkulasi')} className="group bg-white p-16 rounded-[4rem] shadow-2xl border-4 border-transparent hover:border-orange-500 transition-all flex flex-col items-center gap-6 active:scale-95">
                <div className="bg-orange-500 text-white p-8 rounded-[2.5rem] shadow-lg"><Calculator size={64} /></div>
                <h3 className="text-4xl font-black text-gray-800 uppercase tracking-tighter">Mesin Kalkulasi</h3>
              </button>
            </div>
          </div>
        )}

        {adminView === 'input' && (
          <div className="flex flex-col items-center w-full max-w-6xl animate-in slide-in-from-top-4 duration-500">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".xlsx, .xls, .csv" />
            <div className="w-full flex justify-start mb-8">
              <button onClick={() => setAdminView('main')} className="flex items-center gap-2 text-blue-700 font-black uppercase hover:bg-blue-100 px-6 py-3 rounded-2xl transition-all active:scale-90">
                <ArrowLeft size={24} /> Kembali
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full pb-20">
              <YearUploadGroup label="Satuan Pendidikan" collection="dapodik_sekolah" icon={School} colorClass="bg-blue-600" formatHandler={handleDownloadFormatSekolah} />
              <YearUploadGroup label="Database PTK" collection="dapodik_ptk" icon={Users} colorClass="bg-blue-500" formatHandler={handleDownloadFormatPtk} />
              <YearUploadGroup label="Database Kepsek" collection="dapodik_kepsek" icon={UserCheck} colorClass="bg-blue-400" />
              <YearUploadGroup label="Rapor Pendidikan" collection="rapor_pendidikan" icon={FileText} colorClass="bg-emerald-600" />
              <YearUploadGroup label="Database ATS" collection="data_ats" icon={Layers} colorClass="bg-orange-600" />
              <YearUploadGroup label="Data Sarpras" collection="data_sarpras" icon={Building2} colorClass="bg-purple-600" formatHandler={handleDownloadFormatSarpras} />
            </div>
          </div>
        )}

        {adminView === 'kalkulasi' && (
          <div className="flex flex-col items-center w-full max-w-5xl animate-in slide-in-from-top-4 duration-500">
            <div className="w-full flex justify-start mb-8">
              <button onClick={() => setAdminView('main')} className="flex items-center gap-2 text-orange-700 font-black uppercase hover:bg-orange-100 px-6 py-3 rounded-2xl transition-all active:scale-90">
                <ArrowLeft size={24} /> Kembali
              </button>
            </div>

            <div className="bg-white p-10 rounded-[3rem] shadow-xl border border-gray-100 w-full text-left">
               <div className="flex items-center gap-4 mb-8">
                 <div className="bg-orange-100 text-orange-600 p-4 rounded-2xl"><Activity size={32}/></div>
                 <div>
                   <h2 className="text-3xl font-black text-gray-800 uppercase tracking-tighter">Mesin Pre-Kalkulasi Rasio</h2>
                   <p className="text-gray-500 font-bold uppercase tracking-widest text-xs mt-1">Jalankan wajib setelah upload / update database terbaru</p>
                 </div>
               </div>

               <div className="grid grid-cols-1 gap-6">
                 
                 {/* SEKOLAH VS PD */}
                 <div className="bg-gray-50 p-6 rounded-3xl border border-gray-200 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div>
                      <h4 className="text-xl font-black text-blue-900 uppercase">Sekolah VS Peserta Didik</h4>
                      <p className="text-sm font-medium text-gray-500 mt-1">Metodologi Baru: Pembagian Murni (Total PD / Total Sekolah)</p>
                    </div>
                    <div className="flex gap-2">
                       {['2024', '2025', '2026'].map(year => (
                         <div key={year} className="flex flex-col items-center gap-1">
                           <button onClick={() => handleCalculateRasioSekolahPD(year)} className="bg-white border-2 border-blue-200 text-blue-600 hover:bg-blue-600 hover:text-white font-black uppercase px-6 py-3 rounded-xl transition-all active:scale-95 shadow-sm">
                             Hitung {year}
                           </button>
                           <span className="text-[9px] font-bold text-gray-400">{calcStatus[`rasio_sekolah_pd_${year}`] || 'Belum'}</span>
                         </div>
                       ))}
                    </div>
                 </div>

                 {/* SEKOLAH VS GURU */}
                 <div className="bg-gray-50 p-6 rounded-3xl border border-gray-200 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div>
                      <h4 className="text-xl font-black text-emerald-900 uppercase">Sekolah VS Guru</h4>
                      <p className="text-sm font-medium text-gray-500 mt-1">Metodologi Baru: Pembagian Murni (Total Guru / Total Sekolah)</p>
                    </div>
                    <div className="flex gap-2">
                       {['2024', '2025', '2026'].map(year => (
                         <div key={year} className="flex flex-col items-center gap-1">
                           <button onClick={() => handleCalculateRasioSekolahGuru(year)} className="bg-white border-2 border-emerald-200 text-emerald-600 hover:bg-emerald-600 hover:text-white font-black uppercase px-6 py-3 rounded-xl transition-all active:scale-95 shadow-sm">
                             Hitung {year}
                           </button>
                           <span className="text-[9px] font-bold text-gray-400">{calcStatus[`rasio_sekolah_guru_${year}`] || 'Belum'}</span>
                         </div>
                       ))}
                    </div>
                 </div>

                 {/* ROMBEL VS GURU */}
                 <div className="bg-gray-50 p-6 rounded-3xl border border-gray-200 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div>
                      <h4 className="text-xl font-black text-purple-900 uppercase">Rombel VS Guru</h4>
                      <p className="text-sm font-medium text-gray-500 mt-1">Metodologi Baru: Pembagian Murni (Total Guru / Total Rombel)</p>
                    </div>
                    <div className="flex gap-2">
                       {['2024', '2025', '2026'].map(year => (
                         <div key={year} className="flex flex-col items-center gap-1">
                           <button onClick={() => handleCalculateRasioRombelGuru(year)} className="bg-white border-2 border-purple-200 text-purple-600 hover:bg-purple-600 hover:text-white font-black uppercase px-6 py-3 rounded-xl transition-all active:scale-95 shadow-sm">
                             Hitung {year}
                           </button>
                           <span className="text-[9px] font-bold text-gray-400">{calcStatus[`rasio_rombel_guru_${year}`] || 'Belum'}</span>
                         </div>
                       ))}
                    </div>
                 </div>

                 {/* SEKOLAH VS ROMBEL */}
                 <div className="bg-gray-50 p-6 rounded-3xl border border-gray-200 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div>
                      <h4 className="text-xl font-black text-rose-900 uppercase">Sekolah VS Rombel</h4>
                      <p className="text-sm font-medium text-gray-500 mt-1">Metodologi Baru: Pembagian Murni (Total Rombel / Total Sekolah)</p>
                    </div>
                    <div className="flex gap-2">
                       {['2024', '2025', '2026'].map(year => (
                         <div key={year} className="flex flex-col items-center gap-1">
                           <button onClick={() => handleCalculateRasioSekolahRombel(year)} className="bg-white border-2 border-rose-200 text-rose-600 hover:bg-rose-600 hover:text-white font-black uppercase px-6 py-3 rounded-xl transition-all active:scale-95 shadow-sm">
                             Hitung {year}
                           </button>
                           <span className="text-[9px] font-bold text-gray-400">{calcStatus[`rasio_sekolah_rombel_${year}`] || 'Belum'}</span>
                         </div>
                       ))}
                    </div>
                 </div>

                 {/* ROMBEL VS PD */}
                 <div className="bg-gray-50 p-6 rounded-3xl border border-gray-200 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div>
                      <h4 className="text-xl font-black text-orange-900 uppercase">Rombel VS Peserta Didik</h4>
                      <p className="text-sm font-medium text-gray-500 mt-1">Metodologi Baru: Pembagian Murni (Total PD / Total Rombel)</p>
                    </div>
                    <div className="flex gap-2">
                       {['2024', '2025', '2026'].map(year => (
                         <div key={year} className="flex flex-col items-center gap-1">
                           <button onClick={() => handleCalculateRasioRombelPD(year)} className="bg-white border-2 border-orange-200 text-orange-600 hover:bg-orange-600 hover:text-white font-black uppercase px-6 py-3 rounded-xl transition-all active:scale-95 shadow-sm">
                             Hitung {year}
                           </button>
                           <span className="text-[9px] font-bold text-gray-400">{calcStatus[`rasio_rombel_pd_${year}`] || 'Belum'}</span>
                         </div>
                       ))}
                    </div>
                 </div>

                 {/* ROMBEL VS RUANG KELAS */}
                 <div className="bg-gray-50 p-6 rounded-3xl border border-gray-200 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div>
                      <h4 className="text-xl font-black text-amber-900 uppercase">Rombel VS Ruang Kelas</h4>
                      <p className="text-sm font-medium text-gray-500 mt-1">Metodologi Baru: Pembagian Murni (Total Kelas / Total Rombel)</p>
                    </div>
                    <div className="flex gap-2">
                       {['2024', '2025', '2026'].map(year => (
                         <div key={year} className="flex flex-col items-center gap-1">
                           <button onClick={() => handleCalculateRasioRombelKelas(year)} className="bg-white border-2 border-amber-200 text-amber-600 hover:bg-amber-600 hover:text-white font-black uppercase px-6 py-3 rounded-xl transition-all active:scale-95 shadow-sm">
                             Hitung {year}
                           </button>
                           <span className="text-[9px] font-bold text-gray-400">{calcStatus[`rasio_rombel_kelas_${year}`] || 'Belum'}</span>
                         </div>
                       ))}
                    </div>
                 </div>

                 {/* GURU VS PD */}
                 <div className="bg-gray-50 p-6 rounded-3xl border border-gray-200 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div>
                      <h4 className="text-xl font-black text-indigo-900 uppercase">Guru VS Peserta Didik</h4>
                      <p className="text-sm font-medium text-gray-500 mt-1">Metodologi Baru: Pembagian Murni (Total PD / Total Guru)</p>
                    </div>
                    <div className="flex gap-2">
                       {['2024', '2025', '2026'].map(year => (
                         <div key={year} className="flex flex-col items-center gap-1">
                           <button onClick={() => handleCalculateRasioGuruPD(year)} className="bg-white border-2 border-indigo-200 text-indigo-600 hover:bg-indigo-600 hover:text-white font-black uppercase px-6 py-3 rounded-xl transition-all active:scale-95 shadow-sm">
                             Hitung {year}
                           </button>
                           <span className="text-[9px] font-bold text-gray-400">{calcStatus[`rasio_guru_pd_${year}`] || 'Belum'}</span>
                         </div>
                       ))}
                    </div>
                 </div>

               </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}