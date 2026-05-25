import React, { useState, useEffect } from 'react';
import { Activity, ArrowLeft, Loader2 } from 'lucide-react';
import { db } from '../../firebase/config';
import { collection, doc, query, where, getDocs, setDoc, writeBatch } from 'firebase/firestore';

// =====================================================================
// UTILITY & REFERENSI
// =====================================================================

// Fungsi ekstraktor data SUPER KEBAL (mengabaikan spasi dan underscore)
const getVal = (obj, keyName) => {
  if (!obj) return '';
  const target = keyName.toLowerCase().replace(/[\s_]/g, '');
  const key = Object.keys(obj).find(k => String(k).trim().toLowerCase().replace(/[\s_]/g, '') === target);
  return key ? obj[key] : '';
};

// Fungsi ekstraktor angka (Anti-NaN)
const getNum = (obj, keyName) => {
  const val = getVal(obj, keyName);
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
      const parsed = parseInt(val.replace(/[^0-9]/g, ''), 10);
      return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
};

// PEMBERSIH NPSN ULTIMATE (Membunuh desimal .0 dari Excel dan karakter gaib)
const cleanNpsn = (str) => {
  let s = String(str || '').trim();
  if (s.endsWith('.0')) {
     s = s.slice(0, -2); // Hapus ".0" di belakang jika terbaca sebagai float
  }
  return s.replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
};

// Deteksi String "YA" yang Super Kebal
const checkYa = (val) => {
  if (!val) return false;
  const cleanStr = String(val).replace(/[^a-zA-Z]/g, '').toUpperCase();
  return cleanStr === 'YA' || cleanStr === 'Y';
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
// PEMISAHAN JENJANG GLOBAL + FALLBACK ANTI GAGAL
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
  
  if (j.includes('TK') || j.includes('KB') || j.includes('PAUD') || j.includes('SPS') || j.includes('TPA')) return 'PAUD';
  if (j.includes('SD') && !j.includes('SLB')) return 'SD';
  if (j.includes('SMP') && !j.includes('SLB')) return 'SMP';
  if (j.includes('SMA') && !j.includes('SLB')) return 'SMA';
  if (j.includes('SMK')) return 'SMK';
  if (j.includes('SLB') || j.includes('SDLB') || j.includes('SMPLB') || j.includes('SMALB')) return 'SLB (Inklusif)';
  if (j.includes('PKBM') || j.includes('SKB')) return 'NON FORMAL';

  return null;
};

// =====================================================================
// PEMISAHAN JENJANG KHUSUS UNTUK ROMBEL VS KELAS (HANYA TK)
// =====================================================================
const JENJANG_GROUPS_RK = {
  'TK': ['TK'], 
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

  if (j.includes('TK')) return 'TK';
  if (j.includes('SD') && !j.includes('SLB')) return 'SD';
  if (j.includes('SMP') && !j.includes('SLB')) return 'SMP';
  if (j.includes('SMA') && !j.includes('SLB')) return 'SMA';
  if (j.includes('SMK')) return 'SMK';
  if (j.includes('SLB') || j.includes('SDLB') || j.includes('SMPLB') || j.includes('SMALB')) return 'SLB (Inklusif)';
  if (j.includes('PKBM') || j.includes('SKB')) return 'NON FORMAL';

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
    
    for (const year of years) {
      for (const type of calcTypes) {
        const docSnap = await getDocs(query(collection(db, 'dapodik_agregasi'), where("__name__", "==", `${type}_${year}`)));
        if (!docSnap.empty) {
           const data = docSnap.docs[0].data();
           if (data.last_updated) {
              const d = new Date(data.last_updated);
              newStatus[`${type}_${year}`] = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
           } else {
              newStatus[`${type}_${year}`] = 'Selesai';
           }
        }
      }

      const rombelSnap = await getDocs(query(collection(db, 'rombel_agregasi'), where("__name__", "==", `sekolah_lebih_shift_${year}`)));
      if (!rombelSnap.empty) {
          const data = rombelSnap.docs[0].data();
          if (data.last_updated) {
             const d = new Date(data.last_updated);
             newStatus[`sekolah_lebih_shift_${year}`] = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          } else {
             newStatus[`sekolah_lebih_shift_${year}`] = 'Selesai';
          }
      }

      const aksesSnap = await getDocs(query(collection(db, 'akses_pd_agregasi'), where("__name__", "==", `jarak_waktu_${year}`)));
      if (!aksesSnap.empty) {
          const data = aksesSnap.docs[0].data();
          if (data.last_updated) {
             const d = new Date(data.last_updated);
             newStatus[`akses_pd_${year}`] = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
          } else {
             newStatus[`akses_pd_${year}`] = 'Selesai';
          }
      }
    }

    const trendSnap = await getDocs(query(collection(db, 'dapodik_agregasi'), where("__name__", "==", `trend_data_nasional`)));
    if (!trendSnap.empty) {
        const data = trendSnap.docs[0].data();
        if (data.last_updated) {
           const d = new Date(data.last_updated);
           newStatus[`trend_data_nasional`] = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        } else {
           newStatus[`trend_data_nasional`] = 'Selesai';
        }
    }

    setCalcStatus(newStatus);
  };

  useEffect(() => { 
     checkCalcStatus(); 
  }, []);

  // =====================================================================
  // MESIN BARU: TREND DATA NASIONAL (MULTI-TAHUN)
  // =====================================================================
  const handleCalculateTrendNasional = async () => {
    setUploading(true);
    setProgressLabel(`Mengekstrak Data Trend (2024-2026)...`);
    setUploadProgress(10);

    try {
      const yearsToProcess = ['2024', '2025', '2026'];
      const mapAgregasi = new Map();

      for (let i = 0; i < yearsToProcess.length; i++) {
        const year = yearsToProcess[i];
        
        setProgressLabel(`Memproses Data Tahun ${year}...`);
        
        const qSekolah = query(collection(db, 'dapodik_sekolah_chunks'), where("tahun_data", "==", year));
        const snapSekolah = await getDocs(qSekolah);
        
        let allSekolahData = [];
        // ANTI-MEMORY LEAK: Hindari .concat()
        snapSekolah.forEach(doc => { 
            const arr = doc.data().data;
            if (Array.isArray(arr)) {
                for (let j = 0; j < arr.length; j++) allSekolahData.push(arr[j]);
            }
        });

        allSekolahData.forEach(item => {
          const rawBentuk = String(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang')).trim().toUpperCase();
          
          let bentuk = rawBentuk;
          if (rawBentuk === 'TK' || rawBentuk === 'KB' || rawBentuk === 'SPS' || rawBentuk === 'TPA' ||
              rawBentuk === 'SD' || rawBentuk === 'SPK SD' || rawBentuk === 'SMP' || rawBentuk === 'SPK SMP' || 
              rawBentuk === 'SMA' || rawBentuk === 'SPK SMA' || rawBentuk === 'SMK' || 
              rawBentuk === 'PKBM' || rawBentuk === 'SKB') {
              bentuk = rawBentuk;
          } else if (rawBentuk.includes('SLB') || rawBentuk.includes('LB')) {
              bentuk = 'SLB';
          } else if (rawBentuk === 'KOBER') {
              bentuk = 'KB';
          }

          const kabDb = cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'));
          const keyKec = String(getVal(item, 'kecamatan') || 'TIDAK DIKETAHUI').trim().toUpperCase();
          const isNegeri = String(getVal(item, 'status_sekolah')).toUpperCase() === 'NEGERI';
          const status = isNegeri ? 'Negeri' : 'Swasta';

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

          const mapKey = `${year}_${kabDb}_${keyKec}_${bentuk}_${status}`;
          if (!mapAgregasi.has(mapKey)) {
              mapAgregasi.set(mapKey, {
                  tahun_data: year,
                  kabupaten: kabDb,
                  kecamatan: keyKec,
                  bentuk_pendidikan: bentuk,
                  status_sekolah: status,
                  jumlah_sekolah: 0,
                  jumlah_siswa: 0
              });
          }

          const node = mapAgregasi.get(mapKey);
          node.jumlah_sekolah += 1;
          node.jumlah_siswa += pd;
        });

        setUploadProgress(10 + Math.floor(((i + 1) / yearsToProcess.length) * 80));
      }

      setProgressLabel(`Menyimpan Agregasi Lintas Tahun...`);
      const finalDataToSave = Array.from(mapAgregasi.values());

      const docRef = doc(db, 'dapodik_agregasi', 'trend_data_nasional');
      await setDoc(docRef, {
        data: finalDataToSave, 
        last_updated: new Date().toISOString()
      });

      setUploadProgress(100);
      alert(`KALKULASI SUKSES!\n\nAnalisis Trend Data Siswa & Sekolah (2024, 2025, 2026) berhasil diproses.`);
      checkCalcStatus();

    } catch (error) {
      console.error(error);
      alert("Terjadi kesalahan saat melakukan kalkulasi Trend Data.");
    } finally {
      setUploading(false);
    }
  };

  // =====================================================================
  // 9. MESIN BARU: AKSESIBILITAS & KELAYAKAN PIP PD ---> [UPDATE DATE & LOGIKA]
  // CHUNK BY CHUNK PROCESSING MEMORY SAFE
  // =====================================================================
  const handleCalculateAksesDanPIP = async (year) => {
    setUploading(true);
    setProgressLabel(`Menyiapkan Mesin Kalkulasi PD ${year}...`);
    setUploadProgress(5);

    try {
      const qAkses = query(collection(db, 'data_akses_pd_chunks'), where("tahun_data", "==", year));
      const snapAkses = await getDocs(qAkses);

      if (snapAkses.empty) {
        alert("Database Akses PD Kosong! Pastikan data akses PD sudah diunggah untuk tahun ini.");
        setUploading(false); return;
      }

      // --- AUTO-CLEAR STALE CHUNKS DENGAN BATCH SAFE-LIMIT ---
      setProgressLabel(`Membersihkan Hasil Agregasi Lama Tahun ${year}...`);
      const pfxAkses = `akses_${year}_chunk_`;
      const pfxPip = `pip_${year}_chunk_`;
      
      const snapOld = await getDocs(collection(db, 'akses_pd_agregasi'));
      const docsToDelete = [];
      snapOld.forEach(doc => {
         if (doc.id.startsWith(pfxAkses) || doc.id.startsWith(pfxPip) || doc.id === `jarak_waktu_${year}`) {
            docsToDelete.push(doc.ref);
         }
      });

      if (docsToDelete.length > 0) {
          let delBatch = writeBatch(db);
          let delCount = 0;
          for (let i = 0; i < docsToDelete.length; i++) {
              delBatch.delete(docsToDelete[i]);
              delCount++;
              // Batas Firestore WriteBatch adalah 500
              if (delCount === 100 || i === docsToDelete.length - 1) {
                  await delBatch.commit();
                  delBatch = writeBatch(db);
                  delCount = 0;
                  await new Promise(r => setTimeout(r, 50)); 
              }
          }
      }

      setUploadProgress(20);

      // --- SETUP MAP PENAMPUNG ---
      const mapAkses = new Map();
      const getAksesNode = (kab, kec, jenjang, moda) => {
          if (!mapAkses.has(kab)) mapAkses.set(kab, new Map());
          const kabNode = mapAkses.get(kab);
          if (!kabNode.has(kec)) kabNode.set(kec, new Map());
          const kecNode = kabNode.get(kec);
          if (!kecNode.has(jenjang)) kecNode.set(jenjang, new Map());
          const jenjangNode = kecNode.get(jenjang);

          if (!jenjangNode.has(moda)) {
              jenjangNode.set(moda, {
                  jarak_kurang_1_waktu_kurang_30: 0,
                  jarak_kurang_1_waktu_lebih_30: 0,
                  jarak_1_2_waktu_kurang_30: 0,
                  jarak_1_2_waktu_lebih_30: 0,
                  jarak_lebih_2_waktu_kurang_30: 0,
                  jarak_lebih_2_waktu_lebih_30: 0,
              });
          }
          return jenjangNode.get(moda);
      };

      const mapPIP = new Map();
      const getPipNode = (kab, kec, jenjang) => {
          const key = `${kab}_${kec}_${jenjang}`;
          if (!mapPIP.has(key)) {
              mapPIP.set(key, {
                  kabupaten: kab,
                  kecamatan: kec,
                  jenjang: jenjang,
                  total_siswa: 0,
                  layak_pip: 0,
                  layak_dan_menerima_kip: 0,
                  tidak_layak: 0
              });
          }
          return mapPIP.get(key);
      };

      // --- PROSES CHUNKS MENTAH SATU-PERSATU (MENCEGAH RAM JEBOL) ---
      let processedChunksCount = 0;
      const totalDocs = snapAkses.docs.length;

      for (const chunkDoc of snapAkses.docs) {
          const arrData = chunkDoc.data().data;
          if (Array.isArray(arrData)) {
              arrData.forEach(item => {
                  const nisnVal = getVal(item, 'nisn');
                  const nisnStr = String(nisnVal).trim();
                  if (!nisnVal || nisnStr === '' || nisnStr === '0' || nisnStr.toLowerCase() === 'null' || nisnStr.toLowerCase() === 'undefined') {
                      return; 
                  }

                  const bentuk = String(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang')).trim().toUpperCase();
                  const group = identifyJenjangGroup(bentuk);
                  if (!group) return; 

                  const kabDb = cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'));
                  const keyKec = String(getVal(item, 'kecamatan') || 'TIDAK DIKETAHUI').trim().toUpperCase();
                  
                  // A. KALKULASI KELAYAKAN PIP
                  const pipNode = getPipNode(kabDb, keyKec, group);
                  pipNode.total_siswa++;

                  const layak = checkYa(getVal(item, 'layak_pip') || getVal(item, 'layak_PIP'));
                  const menerimaKip = checkYa(getVal(item, 'penerima_kip') || getVal(item, 'penerima_KIP'));

                  if (layak) {
                      pipNode.layak_pip++;
                      if (menerimaKip) {
                          pipNode.layak_dan_menerima_kip++;
                      }
                  } else {
                      pipNode.tidak_layak++;
                  }

                  // B. KALKULASI AKSESIBILITAS (JARAK & WAKTU)
                  let modaRaw = String(getVal(item, 'alat_transportasi')).trim().toUpperCase();
                  if (!modaRaw || modaRaw === 'UNDEFINED' || modaRaw === 'NULL') modaRaw = 'TIDAK DIKETAHUI';
                  
                  const jarak = getNum(item, 'jarak_rumah_ke_sekolah');
                  const waktu = getNum(item, 'menit_tempuh_ke_sekolah');

                  const aksesNode = getAksesNode(kabDb, keyKec, group, modaRaw);

                  if (jarak < 1) { 
                      if (waktu < 30) { aksesNode.jarak_kurang_1_waktu_kurang_30++; }
                      else { aksesNode.jarak_kurang_1_waktu_lebih_30++; }
                  } 
                  else if (jarak >= 1 && jarak <= 2) { 
                      if (waktu < 30) { aksesNode.jarak_1_2_waktu_kurang_30++; }
                      else { aksesNode.jarak_1_2_waktu_lebih_30++; }
                  } 
                  else { 
                      if (waktu < 30) { aksesNode.jarak_lebih_2_waktu_kurang_30++; }
                      else { aksesNode.jarak_lebih_2_waktu_lebih_30++; }
                  }
              });
          }
          
          processedChunksCount++;
          setProgressLabel(`Mengagregasi Chunks ${processedChunksCount} / ${totalDocs}...`);
          setUploadProgress(20 + Math.floor((processedChunksCount / totalDocs) * 50));
          // Jeda agar UI browser tidak Freeze
          await new Promise(r => setTimeout(r, 10)); 
      }

      setUploadProgress(75);
      setProgressLabel(`Menyiapkan Data Simpanan...`);

      // Mengubah Map Akses menjadi Array Flat
      const finalAksesToSave = [];
      mapAkses.forEach((kecMap, kabKey) => {
          kecMap.forEach((jenjangMap, kecKey) => {
              jenjangMap.forEach((modaMap, jenjangKey) => {
                  modaMap.forEach((stats, modaKey) => {
                      finalAksesToSave.push({
                          kabupaten: kabKey,
                          kecamatan: kecKey,
                          jenjang: jenjangKey,
                          moda_transportasi: modaKey,
                          ...stats
                      });
                  });
              });
          });
      });

      // Mengubah Map PIP menjadi Array Flat (+ Kalkulasi Selisih)
      const finalPipToSave = Array.from(mapPIP.values()).map(item => ({
          ...item,
          selisih: item.layak_pip - item.layak_dan_menerima_kip
      }));

      setUploadProgress(85);

      // --- CHUNKING SYSTEM (Pemecah Dokumen Firestore max 1MB) ---
      const CHUNK_SIZE = 2000;
      const aksesChunks = [];
      const pipChunks = [];

      for(let i=0; i < finalAksesToSave.length; i+=CHUNK_SIZE) {
          aksesChunks.push(finalAksesToSave.slice(i, i + CHUNK_SIZE));
      }
      for(let i=0; i < finalPipToSave.length; i+=CHUNK_SIZE) {
          pipChunks.push(finalPipToSave.slice(i, i + CHUNK_SIZE));
      }

      // WAKTU UPDATE SEKARANG DIINJEKSI KE SELURUH CHUNKS SECARA KONSISTEN
      const currentTime = new Date().toISOString(); 

      // Simpan Chunks Aksesibilitas
      for(let i=0; i < aksesChunks.length; i++) {
          await setDoc(doc(db, 'akses_pd_agregasi', `akses_${year}_chunk_${i}`), {
              tahun_data: year,
              tipe: 'akses',
              chunk_index: i,
              data_agregasi: aksesChunks[i],
              last_updated: currentTime
          });
      }

      // Simpan Chunks PIP
      for(let i=0; i < pipChunks.length; i++) {
          await setDoc(doc(db, 'akses_pd_agregasi', `pip_${year}_chunk_${i}`), {
              tahun_data: year,
              tipe: 'pip',
              chunk_index: i,
              data_agregasi: pipChunks[i],
              last_updated: currentTime
          });
      }

      setUploadProgress(95);

      // --- MASTER DOCUMENT (Untuk Checking Status Panel) ---
      const docRef = doc(db, 'akses_pd_agregasi', `jarak_waktu_${year}`);
      await setDoc(docRef, {
        tahun_data: year, 
        is_chunked: true,
        total_akses_chunks: aksesChunks.length,
        total_pip_chunks: pipChunks.length,
        last_updated: currentTime
      });

      setUploadProgress(100);
      alert(`KALKULASI SUKSES!\n\nAnalisis Aksesibilitas dan Kelayakan PIP tahun ${year} berhasil diproses.`);
      checkCalcStatus();
    } catch (error) {
      console.error(error);
      alert("Terjadi kesalahan saat melakukan kalkulasi Aksesibilitas & PIP.");
    } finally {
      setUploading(false);
    }
  };

  // =====================================================================
  // 8. MESIN BARU: SEKOLAH LEBIH SHIFT (JOIN NPSN)
  // =====================================================================
  const handleCalculateSekolahLebihShift = async (year) => {
    setUploading(true);
    setProgressLabel(`Menghitung Sekolah Lebih Shift ${year}...`);
    setUploadProgress(10);

    try {
      const qSekolah = query(collection(db, 'dapodik_sekolah_chunks'), where("tahun_data", "==", year));
      const qSarpras = query(collection(db, 'data_sarpras_chunks'), where("tahun_data", "==", year));

      const [snapSekolah, snapSarpras] = await Promise.all([getDocs(qSekolah), getDocs(qSarpras)]);

      if (snapSekolah.empty || snapSarpras.empty) {
        alert("Data Sekolah atau Data Sarpras Kosong! Pastikan kedua data sudah diunggah untuk tahun ini.");
        setUploading(false); return;
      }

      let allSekolahData = [];
      // ANTI-MEMORY LEAK: Hindari .concat()
      snapSekolah.forEach(doc => { 
          const arr = doc.data().data;
          if (Array.isArray(arr)) { for (let j = 0; j < arr.length; j++) allSekolahData.push(arr[j]); }
      });
      
      let allSarprasData = [];
      // ANTI-MEMORY LEAK: Hindari .concat()
      snapSarpras.forEach(doc => { 
          const arr = doc.data().data;
          if (Array.isArray(arr)) { for (let j = 0; j < arr.length; j++) allSarprasData.push(arr[j]); }
      });

      setUploadProgress(40);

      // 1. Buat Peta (Map) Ruang Kelas dari Sarpras by NPSN
      const sarprasMap = new Map();
      allSarprasData.forEach(s => {
        const npsn = cleanNpsn(getVal(s, 'npsn'));
        if (npsn) {
          const kBaik = getNum(s, 'ruang_kelas_baik');
          const kRusakRingan = getNum(s, 'ruang_kelas_rusak_ringan');
          const kRusakSedang = getNum(s, 'ruang_kelas_rusak_sedang');
          const kRusakBerat = getNum(s, 'ruang_kelas_rusak_berat');
          const kTidakBisaDipakai = getNum(s, 'ruang_kelas_tidak_bisa_dipakai');
          
          const totalKelas = kBaik + kRusakRingan + kRusakSedang + kRusakBerat + kTidakBisaDipakai;
          sarprasMap.set(npsn, totalKelas);
        }
      });

      // 2. Siapkan Wadah Agregasi
      const tab1Data = JENJANG_KEYS_RK.map(k => ({ jenjang: k, sekolah_count: 0, kelas_total: 0, rombel_total: 0, double_shift_count: 0 }));
      const mapWilayah = new Map();

      const initWilayah = (kabDb, keyKec) => {
          const uniqueId = `${kabDb}_${keyKec}`;
          if (!mapWilayah.has(uniqueId)) {
              const init = { wilayah: kabDb, kecamatan: keyKec };
              JENJANG_KEYS_RK.forEach(k => { 
                 init[`${k}_sekolah`] = 0; 
                 init[`${k}_kelas`] = 0; 
                 init[`${k}_rombel`] = 0; 
                 init[`${k}_double_shift`] = 0;
              });
              mapWilayah.set(uniqueId, init);
          }
          return mapWilayah.get(uniqueId);
      };

      setUploadProgress(60);

      // 3. Olah Data Sekolah dan Bandingkan dengan Map Sarpras
      allSekolahData.forEach(item => {
        const bentuk = String(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang')).trim().toUpperCase();
        const group = identifyJenjangGroupRK(bentuk);
        if (!group) return;

        const npsn = cleanNpsn(getVal(item, 'npsn'));
        const kelasTotal = sarprasMap.get(npsn) || 0; 

        let rombelTotal = 0;
        Object.keys(item).forEach(k => {
            const keyStr = k.trim().toLowerCase();
            if (/^rombel_(tka|tkb|t?\d{1,2}|paket_[abc])$/.test(keyStr)) {
                rombelTotal += parseInt(item[k]) || 0;
            }
        });

        // Safeguard (Jika nol, coba narik dari field default Rombel)
        if (rombelTotal === 0) {
            rombelTotal = getNum(item, 'rombel') || getNum(item, 'rombongan_belajar');
        }

        // Penentuan Sekolah Lebih Shift
        const isDoubleShift = rombelTotal > kelasTotal;

        // Agregasi Tab 1 (Per Jenjang)
        const rowTab1 = tab1Data.find(r => r.jenjang === group);
        if (rowTab1) {
           rowTab1.sekolah_count++;
           rowTab1.kelas_total += kelasTotal;
           rowTab1.rombel_total += rombelTotal;
           if (isDoubleShift) rowTab1.double_shift_count++;
        }

        // Agregasi Tab 2 (Per Wilayah)
        const kabDb = cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'));
        const keyKec = String(getVal(item, 'kecamatan') || 'TIDAK DIKETAHUI').trim().toUpperCase();
        const rowTab2 = initWilayah(kabDb, keyKec);

        rowTab2[`${group}_sekolah`]++;
        rowTab2[`${group}_kelas`] += kelasTotal;
        rowTab2[`${group}_rombel`] += rombelTotal;
        if (isDoubleShift) rowTab2[`${group}_double_shift`]++;
      });

      setUploadProgress(80);

      const tab2DataRaw = Array.from(mapWilayah.values());

      // 4. Simpan ke Collection 'rombel_agregasi'
      const docRef = doc(db, 'rombel_agregasi', `sekolah_lebih_shift_${year}`);
      await setDoc(docRef, {
        tahun_data: year,
        tabel1: tab1Data, 
        tabel2: tab2DataRaw, 
        last_updated: new Date().toISOString()
      });

      setUploadProgress(100);
      alert(`KALKULASI SUKSES!\n\nAnalisis Sekolah Lebih Shift tahun ${year} berhasil diproses dan disimpan ke 'rombel_agregasi'.`);
      checkCalcStatus();
    } catch (error) {
      console.error(error);
      alert("Terjadi kesalahan saat melakukan kalkulasi Sekolah Lebih Shift.");
    } finally {
      setUploading(false);
    }
  };

  // =====================================================================
  // 1. SEKOLAH VS PD (PD / SEKOLAH)
  // =====================================================================
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
      // ANTI-MEMORY LEAK: Hindari .concat()
      snapshot.forEach(doc => {
        const arr = doc.data().data;
        if (Array.isArray(arr)) { for (let j = 0; j < arr.length; j++) allSekolahData.push(arr[j]); }
      });

      setUploadProgress(50);

      const tab1Data = JENJANG_KEYS.map(k => ({ jenjang: k, sek_n: 0, pd_n: 0, sek_s: 0, pd_s: 0 }));
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

  // =====================================================================
  // 2. SEKOLAH VS GURU (GURU / SEKOLAH) ---> SOLUSI DIRECT PROPERTY ACCESS
  // =====================================================================
  const handleCalculateRasioSekolahGuru = async (year) => {
    setUploading(true);
    setProgressLabel(`Menghitung Rasio Sekolah VS Guru ${year}...`);
    setUploadProgress(10);

    try {
      const qSek = query(collection(db, 'dapodik_sekolah_chunks'), where("tahun_data", "==", year));
      const snapSek = await getDocs(qSek);
      
      const qPtk = query(collection(db, 'dapodik_ptk_chunks')); 
      const snapPtk = await getDocs(qPtk);

      if (snapSek.empty || snapPtk.empty) {
        alert("Data Sekolah atau Guru Kosong! Pastikan kedua data sudah diunggah untuk tahun ini.");
        setUploading(false); return;
      }

      let allSekolahData = [];
      // ANTI-MEMORY LEAK: Hindari .concat()
      snapSek.forEach(doc => { 
          const arr = doc.data().data;
          if (Array.isArray(arr)) { for (let j = 0; j < arr.length; j++) allSekolahData.push(arr[j]); }
      });
      
      let allPtkData = [];
      // ANTI-MEMORY LEAK: Hindari .concat()
      snapPtk.forEach(doc => { 
        const d = doc.data();
        if(d.data && (String(d.tahun_data) === String(year) || !d.tahun_data)) {
           const arr = d.data;
           if (Array.isArray(arr)) { for (let j = 0; j < arr.length; j++) allPtkData.push(arr[j]); }
        }
      });

      setUploadProgress(40); 

      const mapSekolah = new Map();
      allSekolahData.forEach(s => {
         const npsnRaw = cleanNpsn(getVal(s, 'npsn'));
         if(npsnRaw) mapSekolah.set(npsnRaw, { ...s, guru_aktual: 0 });
      });

      // PENCARIAN SUPER LANGSUNG (TIDAK PAKAI GETVAL)
      allPtkData.forEach(p => {
         const jenisPtk = String(p.jenis_ptk || p['Jenis PTK'] || p.jenisptk || '').toUpperCase();
         const isGuru = jenisPtk.includes('GURU');
         
         const statusTugas = String(p.status_tugas || p.ptk_induk || p.statustugas || '').trim().toUpperCase();
         const isInduk = statusTugas === 'INDUK' || statusTugas === '1' || statusTugas === 'YA' || statusTugas === 'Y' || statusTugas.includes('INDUK');
         
         if(isGuru && isInduk) {
            const npsnPtk = cleanNpsn(p.npsn || p.NPSN || '');
            if(mapSekolah.has(npsnPtk)) {
               mapSekolah.get(npsnPtk).guru_aktual++;
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

  // =====================================================================
  // 3. ROMBEL VS GURU (GURU / ROMBEL) ---> SOLUSI DIRECT PROPERTY ACCESS
  // =====================================================================
  const handleCalculateRasioRombelGuru = async (year) => {
    setUploading(true);
    setProgressLabel(`Menghitung Rasio Rombel VS Guru ${year}...`);
    setUploadProgress(10);

    try {
      const qSek = query(collection(db, 'dapodik_sekolah_chunks'), where("tahun_data", "==", year));
      const snapSek = await getDocs(qSek);
      
      const qPtk = query(collection(db, 'dapodik_ptk_chunks')); 
      const snapPtk = await getDocs(qPtk);

      if (snapSek.empty || snapPtk.empty) {
        alert("Data Sekolah atau Guru Kosong! Pastikan kedua data sudah diunggah untuk tahun ini.");
        setUploading(false); return;
      }

      let allSekolahData = [];
      // ANTI-MEMORY LEAK: Hindari .concat()
      snapSek.forEach(doc => { 
          const arr = doc.data().data;
          if (Array.isArray(arr)) { for (let j = 0; j < arr.length; j++) allSekolahData.push(arr[j]); }
      });
      let allPtkData = [];
      // ANTI-MEMORY LEAK: Hindari .concat()
      snapPtk.forEach(doc => { 
        const d = doc.data();
        if(d.data && (String(d.tahun_data) === String(year) || !d.tahun_data)) { 
            const arr = d.data;
            if (Array.isArray(arr)) { for (let j = 0; j < arr.length; j++) allPtkData.push(arr[j]); }
        }
      });

      setUploadProgress(40);

      const mapSekolah = new Map();
      allSekolahData.forEach(s => {
         const npsnRaw = cleanNpsn(getVal(s, 'npsn'));
         if(npsnRaw) {
             let rombelTotal = 0;
             Object.keys(s).forEach(k => {
                 const keyStr = k.trim().toLowerCase();
                 if (/^rombel_(tka|tkb|t?\d{1,2}|paket_[abc])$/.test(keyStr)) {
                     rombelTotal += parseInt(s[k]) || 0;
                 }
             });
             mapSekolah.set(npsnRaw, { ...s, rombel_total: rombelTotal, guru_aktual: 0 });
         }
      });

      // PENCARIAN SUPER LANGSUNG (TIDAK PAKAI GETVAL)
      allPtkData.forEach(p => {
         const jenisPtk = String(p.jenis_ptk || p['Jenis PTK'] || p.jenisptk || '').toUpperCase();
         const isGuru = jenisPtk.includes('GURU');
         
         const statusTugas = String(p.status_tugas || p.ptk_induk || p.statustugas || '').trim().toUpperCase();
         const isInduk = statusTugas === 'INDUK' || statusTugas === '1' || statusTugas === 'YA' || statusTugas === 'Y' || statusTugas.includes('INDUK');
         
         if(isGuru && isInduk) {
            const npsnPtk = cleanNpsn(p.npsn || p.NPSN || '');
            if(mapSekolah.has(npsnPtk)) {
               mapSekolah.get(npsnPtk).guru_aktual++;
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

  // =====================================================================
  // 4. SEKOLAH VS ROMBEL (ROMBEL / SEKOLAH)
  // =====================================================================
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
      // ANTI-MEMORY LEAK: Hindari .concat()
      snapSek.forEach(doc => { 
          const arr = doc.data().data;
          if (Array.isArray(arr)) { for (let j = 0; j < arr.length; j++) allSekolahData.push(arr[j]); }
      });

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

  // =====================================================================
  // 5. ROMBEL VS PD (PD / ROMBEL)
  // =====================================================================
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
      // ANTI-MEMORY LEAK: Hindari .concat()
      snapSek.forEach(doc => { 
          const arr = doc.data().data;
          if (Array.isArray(arr)) { for (let j = 0; j < arr.length; j++) allSekolahData.push(arr[j]); }
      });

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


  // =====================================================================
  // 6. ROMBEL VS RUANG KELAS (KELAS / ROMBEL) ---> SOLUSI FINAL ANTI OVERWRITE
  // =====================================================================
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
      // ANTI-MEMORY LEAK: Hindari .concat()
      snapSek.forEach(doc => { 
          const arr = doc.data().data;
          if (Array.isArray(arr)) { for (let j = 0; j < arr.length; j++) allSekolahData.push(arr[j]); }
      });
      
      let allSarprasData = [];
      // ANTI-MEMORY LEAK: Hindari .concat()
      snapSarpras.forEach(doc => { 
          const arr = doc.data().data;
          if (Array.isArray(arr)) { for (let j = 0; j < arr.length; j++) allSarprasData.push(arr[j]); }
      });

      setUploadProgress(40);

      // KITA CERAIKAN PENGGUNAAN MAP NPSN, MURNI MENGGUNAKAN GROUPING WILAYAH
      const tab1Data = JENJANG_KEYS_RK.map(k => ({ jenjang: k, sek_n: 0, rombel_n: 0, kelas_n: 0, sek_s: 0, rombel_s: 0, kelas_s: 0 }));
      const mapWilayah = new Map();

      // Helper untuk Inisialisasi Wilayah
      const initWilayah = (kabDb, keyKec) => {
          const uniqueId = `${kabDb}_${keyKec}`;
          if (!mapWilayah.has(uniqueId)) {
              const init = { wilayah: kabDb, kecamatan: keyKec };
              JENJANG_KEYS_RK.forEach(k => { 
                 init[`${k}_sek`] = 0; init[`${k}_rombel`] = 0; init[`${k}_kelas`] = 0;
                 init[`${k}_sek_n`] = 0; init[`${k}_rombel_n`] = 0; init[`${k}_kelas_n`] = 0;
                 init[`${k}_sek_s`] = 0; init[`${k}_rombel_s`] = 0; init[`${k}_kelas_s`] = 0;
              });
              mapWilayah.set(uniqueId, init);
          }
          return mapWilayah.get(uniqueId);
      };

      // --- LOOPING 1: MENGHITUNG ROMBEL DARI DATA SEKOLAH ---
      allSekolahData.forEach(item => {
        const bentuk = String(getVal(item, 'bentuk_pendidikan') || getVal(item, 'jenjang')).trim().toUpperCase();
        const group = identifyJenjangGroupRK(bentuk);
        if (!group) return; 

        const isNegeri = String(getVal(item, 'status_sekolah')).toUpperCase() === 'NEGERI';
        
        let rombelTotal = 0;
        Object.keys(item).forEach(k => {
            const keyStr = k.trim().toLowerCase();
            if (/^rombel_(tka|tkb|t?\d{1,2}|paket_[abc])$/.test(keyStr)) {
                rombelTotal += parseInt(item[k]) || 0;
            }
        });

        // Safeguard (Jika nol, coba narik dari field default Rombel)
        if (rombelTotal === 0) {
            rombelTotal = getNum(item, 'rombel') || getNum(item, 'rombongan_belajar');
        }

        const kabDb = cleanKabupatenName(getVal(item, 'kabupaten') || getVal(item, 'Kabupaten/Kota'));
        const keyKec = String(getVal(item, 'kecamatan') || 'TIDAK DIKETAHUI').trim().toUpperCase();

        const rowTab1 = tab1Data.find(r => r.jenjang === group);
        if (rowTab1) {
           if (isNegeri) { rowTab1.sek_n++; rowTab1.rombel_n += rombelTotal; } 
           else { rowTab1.sek_s++; rowTab1.rombel_s += rombelTotal; }
        }

        const rowTab2 = initWilayah(kabDb, keyKec);
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

      setUploadProgress(60);

      // --- LOOPING 2: MENGHITUNG KELAS DARI DATA SARPRAS (TANPA NPSN) ---
      allSarprasData.forEach(s => {
        const bentuk = String(getVal(s, 'bentuk_pendidikan') || getVal(s, 'jenjang')).trim().toUpperCase();
        const group = identifyJenjangGroupRK(bentuk);
        if (!group) return;

        const isNegeri = String(getVal(s, 'status_sekolah')).toUpperCase() === 'NEGERI';
        const kabDb = cleanKabupatenName(getVal(s, 'kabupaten') || getVal(s, 'Kabupaten/Kota'));
        const keyKec = String(getVal(s, 'kecamatan') || 'TIDAK DIKETAHUI').trim().toUpperCase();
        
        const kelasBaik = getNum(s, 'ruang_kelas_baik');
        const kelasRusakRingan = getNum(s, 'ruang_kelas_rusak_ringan');
        const kelasRusakSedang = getNum(s, 'ruang_kelas_rusak_sedang');
        const kelasRusakBerat = getNum(s, 'ruang_kelas_rusak_berat');
        
        // Akumulasikan semua tipe kelas (Layak maupun Tidak Layak)
        const ruangKelasTotal = kelasBaik + kelasRusakRingan + kelasRusakSedang + kelasRusakBerat;

        const rowTab1 = tab1Data.find(r => r.jenjang === group);
        if (rowTab1) {
           if (isNegeri) { rowTab1.kelas_n += ruangKelasTotal; } 
           else { rowTab1.kelas_s += ruangKelasTotal; }
        }

        const rowTab2 = initWilayah(kabDb, keyKec);
        rowTab2[`${group}_kelas`] += ruangKelasTotal;
        
        if (isNegeri) {
           rowTab2[`${group}_kelas_n`] += ruangKelasTotal;
        } else {
           rowTab2[`${group}_kelas_s`] += ruangKelasTotal;
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
      alert(`KALKULASI SUKSES!\n\nHasil rasio Rombel VS Ruang Kelas tahun ${year} berhasil dihitung.`);
      checkCalcStatus();
    } catch (error) {
      console.error(error);
      alert("Terjadi kesalahan saat melakukan kalkulasi rasio Rombel VS Kelas.");
    } finally {
      setUploading(false);
    }
  };

  // =====================================================================
  // 7. GURU VS PD (PD / GURU) ---> SOLUSI DIRECT PROPERTY ACCESS
  // =====================================================================
  const handleCalculateRasioGuruPD = async (year) => {
    setUploading(true);
    setProgressLabel(`Menghitung Rasio Guru VS Peserta Didik ${year}...`);
    setUploadProgress(10);

    try {
      const qSek = query(collection(db, 'dapodik_sekolah_chunks'), where("tahun_data", "==", year));
      const snapSek = await getDocs(qSek);
      
      const qPtk = query(collection(db, 'dapodik_ptk_chunks')); 
      const snapPtk = await getDocs(qPtk);

      if (snapSek.empty || snapPtk.empty) {
        alert("Data Sekolah atau Guru Kosong! Pastikan kedua data sudah diunggah untuk tahun ini.");
        setUploading(false); return;
      }

      let allSekolahData = [];
      // ANTI-MEMORY LEAK: Hindari .concat()
      snapSek.forEach(doc => { 
          const arr = doc.data().data;
          if (Array.isArray(arr)) { for (let j = 0; j < arr.length; j++) allSekolahData.push(arr[j]); }
      });
      let allPtkData = [];
      // ANTI-MEMORY LEAK: Hindari .concat()
      snapPtk.forEach(doc => { 
        const d = doc.data();
        if(d.data && (String(d.tahun_data) === String(year) || !d.tahun_data)) { 
            const arr = d.data;
            if (Array.isArray(arr)) { for (let j = 0; j < arr.length; j++) allPtkData.push(arr[j]); }
        }
      });

      setUploadProgress(40);

      const mapSekolah = new Map();
      allSekolahData.forEach(s => {
         const npsnRaw = cleanNpsn(getVal(s, 'npsn'));
         if(npsnRaw) {
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
             mapSekolah.set(npsnRaw, { ...s, pd_total: pd, guru_aktual: 0 });
         }
      });

      // PENCARIAN SUPER LANGSUNG (TIDAK PAKAI GETVAL)
      allPtkData.forEach(p => {
         const jenisPtk = String(p.jenis_ptk || p['Jenis PTK'] || p.jenisptk || '').toUpperCase();
         const isGuru = jenisPtk.includes('GURU');
         
         const statusTugas = String(p.status_tugas || p.ptk_induk || p.statustugas || '').trim().toUpperCase();
         const isInduk = statusTugas === 'INDUK' || statusTugas === '1' || statusTugas === 'YA' || statusTugas === 'Y' || statusTugas.includes('INDUK');
         
         if(isGuru && isInduk) {
            const npsnPtk = cleanNpsn(p.npsn || p.NPSN || '');
            if(mapSekolah.has(npsnPtk)) {
               mapSekolah.get(npsnPtk).guru_aktual++;
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

             {/* MESIN BARU 3: TREND DATA (SISWA & SEKOLAH) */}
             <div className="bg-yellow-50 p-6 rounded-3xl border border-yellow-200 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
                <div>
                  <h4 className="text-xl font-black text-yellow-900 uppercase">Trend Data Siswa & Sekolah</h4>
                  <p className="text-sm font-medium text-yellow-700 mt-1">Mengagregasi data 3 tahun terakhir (2024, 2025, 2026) lintas wilayah secara instan.</p>
                </div>
                <div className="flex flex-col items-center gap-1">
                  <button onClick={() => handleCalculateTrendNasional()} className="bg-white border-2 border-yellow-300 text-yellow-700 hover:bg-yellow-600 hover:text-white font-black uppercase px-6 py-3 rounded-xl transition-all active:scale-95 shadow-sm whitespace-nowrap">
                    Hitung Trend (3 Tahun)
                  </button>
                  <span className="text-[9px] font-bold text-yellow-600/60">{calcStatus['trend_data_nasional'] || 'Belum'}</span>
                </div>
             </div>

             {/* MESIN BARU 2: AKSESIBILITAS & PIP PESERTA DIDIK */}
             <div className="bg-teal-50 p-6 rounded-3xl border border-teal-200 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm">
                <div>
                  <h4 className="text-xl font-black text-teal-900 uppercase">Aksesibilitas & Kelayakan PIP</h4>
                  <p className="text-sm font-medium text-teal-700 mt-1">Mengkalkulasi Jarak & Waktu Tempuh sekaligus Status Kelayakan KIP Peserta Didik per wilayah.</p>
                </div>
                <div className="flex gap-2">
                   {['2024', '2025', '2026'].map(year => (
                     <div key={year} className="flex flex-col items-center gap-1">
                       <button onClick={() => handleCalculateAksesDanPIP(year)} className="bg-white border-2 border-teal-300 text-teal-700 hover:bg-teal-600 hover:text-white font-black uppercase px-6 py-3 rounded-xl transition-all active:scale-95 shadow-sm">
                         Hitung {year}
                       </button>
                       <span className="text-[9px] font-bold text-teal-600/60">{calcStatus[`akses_pd_${year}`] || 'Belum'}</span>
                     </div>
                   ))}
                </div>
             </div>

             {/* MESIN BARU: SEKOLAH LEBIH SHIFT (JOIN NPSN) */}
             <div className="bg-red-50 p-6 rounded-3xl border border-red-200 flex flex-col md:flex-row items-center justify-between gap-6 shadow-sm mt-4">
                <div>
                  <h4 className="text-xl font-black text-red-900 uppercase">Sekolah Lebih Shift</h4>
                  <p className="text-sm font-medium text-gray-600 mt-1">Metodologi Baru: Agregasi per NPSN (Jumlah Rombel &gt; Ruang Kelas)</p>
                </div>
                <div className="flex gap-2">
                   {['2024', '2025', '2026'].map(year => (
                     <div key={year} className="flex flex-col items-center gap-1">
                       <button onClick={() => handleCalculateSekolahLebihShift(year)} className="bg-white border-2 border-red-300 text-red-600 hover:bg-red-600 hover:text-white font-black uppercase px-6 py-3 rounded-xl transition-all active:scale-95 shadow-sm">
                         Hitung {year}
                       </button>
                       <span className="text-[9px] font-bold text-gray-400">{calcStatus[`sekolah_lebih_shift_${year}`] || 'Belum'}</span>
                     </div>
                   ))}
                </div>
             </div>
             
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
                  <p className="text-sm font-medium text-gray-500 mt-1">Metode Super Cepat: Agregasi Guru Independen</p>
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
                  <p className="text-sm font-medium text-gray-500 mt-1">Metode Super Cepat: Agregasi Guru Independen</p>
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
                  <p className="text-sm font-medium text-gray-500 mt-1">Metode Super Cepat: Agregasi Guru Independen</p>
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