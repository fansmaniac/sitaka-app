import React, { useState, useEffect } from 'react';
import { Activity, ArrowLeft, Loader2 } from 'lucide-react';
import { db } from '../firebase/config';
import { collection, doc, query, where, getDocs, setDoc } from 'firebase/firestore';

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

// =====================================================================
// PEMISAHAN JENJANG GLOBAL PADA MESIN UTAMA ADMIN
// =====================================================================
const JENJANG_GROUPS = {
  'PAUD': ['TK', 'KB', 'SPS', 'TPA', 'PAUD'],
  'SD': ['SD', 'SPK SD'],
  'SMP': ['SMP', 'SPK SMP'],
  'SMA': ['SMA', 'SPK SMA'],
  'SMK': ['SMK'],
  'SLB (Inklusif)': ['SLB'],
  'NON FORMAL': ['PKBM', 'SKB']
};
const JENJANG_KEYS = ['PAUD', 'SD', 'SMP', 'SMA', 'SMK', 'SLB (Inklusif)', 'NON FORMAL'];

const identifyJenjangGroup = (jenjangDb) => {
  const j = String(jenjangDb).trim().toUpperCase();
  for (const group of JENJANG_KEYS) {
    if (JENJANG_GROUPS[group].includes(j)) return group;
  }
  return null;
};

// =====================================================================
// PEMISAHAN JENJANG KHUSUS UNTUK ROMBEL VS KELAS (HANYA TK)
// =====================================================================
const JENJANG_GROUPS_RK = {
  'TK': ['TK'], // KB, SPS, TPA DIHAPUS KHUSUS UNTUK KALKULASI INI
  'SD': ['SD', 'SPK SD'],
  'SMP': ['SMP', 'SPK SMP'],
  'SMA': ['SMA', 'SPK SMA'],
  'SMK': ['SMK'],
  'SLB (Inklusif)': ['SLB'],
  'NON FORMAL': ['PKBM', 'SKB']
};
const JENJANG_KEYS_RK = ['TK', 'SD', 'SMP', 'SMA', 'SMK', 'SLB (Inklusif)', 'NON FORMAL'];

const identifyJenjangGroupRK = (jenjangDb) => {
  const j = String(jenjangDb).trim().toUpperCase();
  for (const group of JENJANG_KEYS_RK) {
    if (JENJANG_GROUPS_RK[group].includes(j)) return group;
  }
  return null;
};

// =====================================================================
// KOMPONEN UTAMA
// =====================================================================
export default function AdminMesinKalkulasi({ onBack }) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); 
  const [progressLabel, setProgressLabel] = useState('Sedang Memproses...');
  const [calcStatus, setCalcStatus] = useState({});

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
     checkCalcStatus(); 
  }, []);

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
        if (rowTab1) {
           if (isNegeri) { rowTab1.sek_n++; rowTab1.pd_n += pd; } 
           else { rowTab1.sek_s++; rowTab1.pd_s += pd; }
        }

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
        if (rowTab1) {
           if (isNegeri) { rowTab1.sek_n++; rowTab1.guru_n += guruAktual; } 
           else { rowTab1.sek_s++; rowTab1.guru_s += guruAktual; }
        }

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
                 const keyStr = k.trim().toLowerCase();
                 // PENYELESAIAN BUG: Menggunakan Regex ketat untuk menghindari rombel anomali
                 if (/^rombel_(tka|tkb|t?\d{1,2}|paket_[abc])$/.test(keyStr)) {
                     rombelTotal += parseInt(s[k]) || 0;
                 }
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
        if (rowTab1) {
           if (isNegeri) { rowTab1.rombel_n += rombelTotal; rowTab1.guru_n += guruAktual; } 
           else { rowTab1.rombel_s += rombelTotal; rowTab1.guru_s += guruAktual; }
        }

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
            const keyStr = k.trim().toLowerCase();
            if (/^rombel_(tka|tkb|t?\d{1,2}|paket_[abc])$/.test(keyStr)) {
                rombelTotal += parseInt(item[k]) || 0;
            }
        });

        const rowTab1 = tab1Data.find(r => r.jenjang === group);
        if (rowTab1) {
           if (isNegeri) { rowTab1.sek_n++; rowTab1.rombel_n += rombelTotal; } 
           else { rowTab1.sek_s++; rowTab1.rombel_s += rombelTotal; }
        }

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
            const keyStr = k.trim().toLowerCase();
            if (/^rombel_(tka|tkb|t?\d{1,2}|paket_[abc])$/.test(keyStr)) {
                rombelTotal += parseInt(item[k]) || 0;
            }
        });

        const rowTab1 = tab1Data.find(r => r.jenjang === group);
        if (rowTab1) {
           if (isNegeri) { rowTab1.rombel_n += rombelTotal; rowTab1.pd_n += pd; } 
           else { rowTab1.rombel_s += rombelTotal; rowTab1.pd_s += pd; }
        }

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

  // 6. ROMBEL VS RUANG KELAS (KELAS / ROMBEL) => MENGGUNAKAN JENJANG KHUSUS RK (HANYA TK)
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

      // MENGGUNAKAN JENJANG_KEYS_RK KHUSUS
      const tab1Data = JENJANG_KEYS_RK.map(k => ({ jenjang: k, sek_n: 0, rombel_n: 0, kelas_n: 0, sek_s: 0, rombel_s: 0, kelas_s: 0 }));
      const mapWilayah = new Map();

      allSekolahData.forEach(item => {
        const bentuk = String(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang')).trim().toUpperCase();
        
        // MENGGUNAKAN FUNGSI IDENTIFIER KHUSUS RK (Abaikan KB, SPS, TPA)
        const group = identifyJenjangGroupRK(bentuk);
        if (!group) return; // Skip jika bukan TK, SD, SMP, SMA, SMK, SLB, atau NON FORMAL

        const isNegeri = String(getVal(item, 'status_sekolah')).toUpperCase() === 'NEGERI';
        const npsn = String(getVal(item, 'npsn')).trim();
        
        let rombelTotal = 0;
        Object.keys(item).forEach(k => {
            const keyStr = k.trim().toLowerCase();
            if (/^rombel_(tka|tkb|t?\d{1,2}|paket_[abc])$/.test(keyStr)) {
                rombelTotal += parseInt(item[k]) || 0;
            }
        });

        const kelasTotal = mapSarpras.get(npsn) || 0;

        const rowTab1 = tab1Data.find(r => r.jenjang === group);
        if (rowTab1) {
           if (isNegeri) { rowTab1.sek_n++; rowTab1.rombel_n += rombelTotal; rowTab1.kelas_n += kelasTotal; } 
           else { rowTab1.sek_s++; rowTab1.rombel_s += rombelTotal; rowTab1.kelas_s += kelasTotal; }
        }

        const kabDb = cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'));
        const keyKec = String(getVal(item, 'kecamatan') || 'TIDAK DIKETAHUI').trim().toUpperCase();
        const uniqueId = `${kabDb}_${keyKec}`;

        if (!mapWilayah.has(uniqueId)) {
          const init = { wilayah: kabDb, kecamatan: keyKec };
          JENJANG_KEYS_RK.forEach(k => { 
             init[`${k}_sek`] = 0;
             init[`${k}_rombel`] = 0; 
             init[`${k}_kelas`] = 0;
             init[`${k}_sek_n`] = 0; 
             init[`${k}_rombel_n`] = 0; init[`${k}_kelas_n`] = 0;
             init[`${k}_sek_s`] = 0; 
             init[`${k}_rombel_s`] = 0; init[`${k}_kelas_s`] = 0;
          });
          mapWilayah.set(uniqueId, init);
        }

        const rowTab2 = mapWilayah.get(uniqueId);
        rowTab2[`${group}_sek`]++; 
        rowTab2[`${group}_rombel`] += rombelTotal;
        rowTab2[`${group}_kelas`] += kelasTotal;
        
        if (isNegeri) {
           rowTab2[`${group}_sek_n`]++; 
           rowTab2[`${group}_rombel_n`] += rombelTotal;
           rowTab2[`${group}_kelas_n`] += kelasTotal;
        } else {
           rowTab2[`${group}_sek_s`]++; 
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
        if (rowTab1) {
           if (isNegeri) { rowTab1.guru_n += guruAktual; rowTab1.pd_n += pdTotal; } 
           else { rowTab1.guru_s += guruAktual; rowTab1.pd_s += pdTotal; }
        }

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

      <div className="flex flex-col items-center w-full max-w-5xl animate-in slide-in-from-top-4 duration-500">
        <div className="w-full flex justify-start mb-8">
          <button onClick={onBack} className="flex items-center gap-2 text-orange-700 font-black uppercase hover:bg-orange-100 px-6 py-3 rounded-2xl transition-all active:scale-90">
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
    </>
  );
}