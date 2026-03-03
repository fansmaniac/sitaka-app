import React, { useState, useRef, useEffect } from 'react';
import { 
  Database, UploadCloud, Settings, ArrowLeft, User, Lock, 
  Eye, EyeOff, Save, School, Users, UserCheck, Loader2, 
  FileText, Layers, CheckCircle, Download, Trash2, Building2 
} from 'lucide-react';
import { db } from '../firebase/config';
import { collection, writeBatch, doc, query, where, getDocs, limit, setDoc } from 'firebase/firestore';
import { readExcel } from '../utils/excelHelper';
import ExcelJS from 'exceljs';

export default function AdminDashboard({ Header }) {
  const [adminView, setAdminView] = useState('main'); 
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); 
  const [activeTarget, setActiveTarget] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [dbStatus, setDbStatus] = useState({}); 
  const [formData, setFormData] = useState({ username: 'admin', password: '', confirmPassword: '' });

  const fileInputRef = useRef(null);

  // --- 1. LOGIKA STATUS DATABASE (MENYALA BILA ADA DATA _chunks) ---
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

  useEffect(() => { if (adminView === 'input') checkDatabaseStatus(); }, [adminView]);

  // --- 2. LOGIKA HAPUS DATA PER TAHUN (VERSI CHUNKS) ---
  const handleDeleteData = async (target) => {
    const confirmDelete = window.confirm(`PERINGATAN KERAS!\n\nYakin Menghapus Database ${target.label} Tahun ${target.year}?\nData yang dihapus tidak bisa dikembalikan.`);
    if (!confirmDelete) return;

    setUploading(true);
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
      const chunkSize = 500;
      for (let i = 0; i < totalDocs; i += chunkSize) {
        const batch = writeBatch(db);
        const chunk = allDocs.slice(i, i + chunkSize);
        chunk.forEach((docSnap) => batch.delete(docSnap.ref));
        await batch.commit();
        setUploadProgress(Math.round(((i + chunk.length) / totalDocs) * 100));
      }

      alert(`BERHASIL! Data ${target.label} Tahun ${target.year} telah dibersihkan.`);
      checkDatabaseStatus();
    } catch (error) {
      alert("Gagal menghapus data.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // --- 3. LOGIKA SMART SYNC & UPLOAD (SUPER CHUNKING ANTI-CRASH) ---
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      const jsonData = await readExcel(file);
      const totalRowsInExcel = jsonData.length;
      
      const collectionName = `${activeTarget.collection}_chunks`; 
      const cleanTahun = String(activeTarget.year);
      
      // 1. WIPE DATA LAMA TAHUN INI AGAR BERSIH SEBELUM DITIMPA
      const q = query(collection(db, collectionName), where("tahun_data", "==", cleanTahun));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const deleteBatch = writeBatch(db);
        snapshot.docs.forEach((docSnap) => deleteBatch.delete(docSnap.ref));
        await deleteBatch.commit();
      }

      // 2. CHUNKING PROCESS (Batas Firestore adalah 1MB. Pakai 150 agar data besar pun aman)
      const CHUNK_SIZE = 150; 
      const totalChunks = Math.ceil(totalRowsInExcel / CHUNK_SIZE);

      for (let i = 0; i < totalChunks; i++) {
        const chunkData = jsonData.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).map(item => {
          
          // Sanitasi Data: Firebase tidak bisa menyimpan 'undefined' atau Objek Tanggal yang mentah
          const sanitizedItem = {};
          for (const key in item) {
             let val = item[key];
             if (val === undefined) {
                 sanitizedItem[key] = '';
             } else if (val instanceof Date) {
                 sanitizedItem[key] = val.toISOString().split('T')[0];
             } else {
                 sanitizedItem[key] = val;
             }
          }

          // Pencarian NIK dan NPSN secara case-insensitive
          const keys = Object.keys(sanitizedItem);
          const nikKey = keys.find(k => k.toLowerCase() === 'nik');
          // Update: Di file PTK baru, kolom NPSN bernama 'npsn_sekolah'. Kita harus menangkap 'npsn' maupun 'npsn_sekolah'
          const npsnKey = keys.find(k => k.toLowerCase() === 'npsn' || k.toLowerCase() === 'npsn_sekolah');
          
          return {
             ...sanitizedItem,
             NIK: nikKey ? String(sanitizedItem[nikKey]).replace(/\D/g, '') : '',
             npsn: npsnKey ? String(sanitizedItem[npsnKey]).trim() : ''
          };
        });

        const docRef = doc(collection(db, collectionName));
        await setDoc(docRef, {
          tahun_data: cleanTahun,
          data: chunkData
        });

        setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
      }

      alert(
        `SINKRONISASI BERHASIL!\n\n` +
        `Total ${totalRowsInExcel.toLocaleString('id-ID')} baris data telah di-compress menjadi ${totalChunks} dokumen yang super ringan.`
      );

      checkDatabaseStatus();
    } catch (error) {
      console.error("Upload error:", error);
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

  // --- 4. DOWNLOAD FORMAT ---
  const downloadFormat = async (category) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Format Import');
    
    const headers = {
      'dapodik_sekolah': [
        'npsn', 'nama_satuan_pendidikan', 'status_sekolah', 'bentuk_pendidikan', 'alamat', 'desa', 'kecamatan', 'kabupaten', 
        'lintang', 'bujur', 'npwp', 'nama_kepala_sekolah', 'nomor_hp_kepsek', 'tmt_akreditasi', 'akreditasi', 
        'nama_operator', 'nomor_hp_operator', 'rombel_t1', 'rombel_ t2', 'rombel_ t3', 'rombel_ t4', 'rombel_ t5', 
        'rombel_ t6', 'rombel_ t7', 'rombel_ t8', 'rombel_ t9', 'rombel_ t10', 'rombel_ t11', 'rombel_ t12', 
        'rombel_ t13', 'rombel_ tka', 'rombel_ tkb', 'rombel_ pkta', 'rombel_ pktb', 'rombel_ pktc', 'tka_l', 
        'tka_p', 'tkb_l', 'tkb_p', 't1_l', 't1_p', 't2_l', 't2_p', 't3_l', 't3_p', 't4_l', 't4_p', 't5_l', 
        't5_p', 't6_l', 't6_p', 't7_l', 't7_p', 't8_l', 't8_p', 't9_l', 't9_p', 't10_l', 't10_p', 't11_l', 
        't11_p', 't12_l', 't12_p', 't13_l', 't13_p', 'paket_a_l', 'paket_a_p', 'paket_b_l', 'paket_b_p', 
        'paket_c_l', 'paket_c_p', 'l_Islam', 'p_Islam', 'l_Kristen', 'p_Kristen', 'l_Katholik', 'p_Katholik', 
        'l_Hindu', 'p_Hindu', 'l_Budha', 'p_Budha', 'l_Konghucu', 'p_Konghucu', 'l_Kepercayaan', 'p_Kepercayaan', 
        'l_agama_lainnya', 'p_agama_lainnya', 'tendik', 'pd_l', 'pd_p', 'pd_total'
      ],
      // FORMAT PTK RINGKAS (32 KOLOM) SESUAI PERMINTAAN TERBARU
      'dapodik_ptk': [
        'nik', 'nama', 'nip', 'jenis_kelamin', 'tempat_lahir', 'tanggal_lahir', 'nuptk', 
        'status_kepegawaian', 'jenis_ptk', 'agama', 'alamat_jalan', 'desa_kelurahan', 'kecamatan', 
        'kabupaten', 'kode_pos', 'no_telepon_rumah', 'email', 'pangkat_golongan', 
        'riwayat_sertifikasi_bidang_studi', 'riwayat_sertifikasi_jenis_sertifikasi', 
        'riwayat_pendidikan_formal_bidang_studi', 'riwayat_pendidikan_formal_jenjang_pendidikan', 
        'riwayat_pendidikan_formal_gelar_akademik', 'riwayat_pendidikan_formal_satuan_pendidikan_formal', 
        'riwayat_pendidikan_formal_fakultas', 'jabatan_ptk', 'nama_tempat_tugas', 'npsn_sekolah', 
        'bentuk_pendidikan', 'jenjang', 'ptk_induk', 'status_keaktifan'
      ],
      'dapodik_kepsek': ['NIK', 'NPSN', 'Nama Kepala Sekolah', 'Bentuk Pendidikan', 'Kabupaten/Kota', 'Status Sekolah'],
      'rapor_pendidikan': ['NPSN', 'Kabupaten/Kota', 'Bentuk Pendidikan', 'Indeks Literasi', 'Indeks Numerasi'],
      'data_ats': ['Kabupaten/Kota', 'Jenjang', 'Jumlah ATS'],
      'data_sarpras': ['npsn', 'nama_sekolah', 'jenjang', 'kecamatan', 'kabupaten', 'ruang_kelas_baik', 'ruang_kelas_rusak_ringan', 'ruang_kelas_rusak_sedang', 'ruang_kelas_rusak_berat', 'ruang_kelas_tidak_bisa_dipakai']
    };

    sheet.addRow(headers[category]);
    sheet.getRow(1).font = { bold: true };
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Format_${category}.xlsx`;
    link.click();
  };

  const YearUploadGroup = ({ label, collection, icon: Icon, colorClass }) => (
    <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-gray-100 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`${colorClass} text-white p-4 rounded-2xl shadow-lg`}><Icon size={32} /></div>
          <h4 className="text-2xl font-black text-gray-800 uppercase tracking-tight">{label}</h4>
        </div>
        <button onClick={() => downloadFormat(collection)} className="flex items-center gap-2 text-blue-600 font-black uppercase text-[10px] bg-blue-50 px-4 py-2 rounded-xl hover:bg-blue-100 transition-all">
          <Download size={14} /> Format
        </button>
      </div>
      <div className="grid grid-cols-3 gap-4">
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
              <p className="font-black text-2xl uppercase tracking-widest text-gray-800 mb-4">Sedang Memproses...</p>
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
                <h3 className="text-4xl font-black text-gray-800 uppercase tracking-tighter">Input Data</h3>
              </button>
              <button onClick={() => setAdminView('settings')} className="group bg-white p-16 rounded-[4rem] shadow-2xl border-4 border-transparent hover:border-gray-500 transition-all flex flex-col items-center gap-6 active:scale-95">
                <div className="bg-gray-700 text-white p-8 rounded-[2.5rem] shadow-lg"><Settings size={64} /></div>
                <h3 className="text-4xl font-black text-gray-800 uppercase tracking-tighter">Pengaturan</h3>
              </button>
            </div>
          </div>
        )}

        {adminView === 'input' && (
          <div className="flex flex-col items-center w-full max-w-6xl animate-in slide-in-from-top-4 duration-500">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".xlsx, .xls, .csv" />
            
            <div className="w-full flex justify-start mb-8">
              <button onClick={() => setAdminView('main')} className="flex items-center gap-2 text-blue-700 font-black uppercase hover:bg-blue-100 px-6 py-3 rounded-2xl transition-all active:scale-90">
                <ArrowLeft size={24} /> Kembali ke Menu Utama
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full pb-20">
              <YearUploadGroup label="Satuan Pendidikan" collection="dapodik_sekolah" icon={School} colorClass="bg-blue-600" />
              <YearUploadGroup label="Database PTK" collection="dapodik_ptk" icon={Users} colorClass="bg-blue-500" />
              <YearUploadGroup label="Database Kepsek" collection="dapodik_kepsek" icon={UserCheck} colorClass="bg-blue-400" />
              <YearUploadGroup label="Rapor Pendidikan" collection="rapor_pendidikan" icon={FileText} colorClass="bg-emerald-600" />
              <YearUploadGroup label="Database ATS" collection="data_ats" icon={Layers} colorClass="bg-orange-600" />
              <YearUploadGroup label="Data Sarpras" collection="data_sarpras" icon={Building2} colorClass="bg-purple-600" />
            </div>
          </div>
        )}

        {adminView === 'settings' && (
          <div className="flex flex-col items-center w-full max-w-2xl animate-in slide-in-from-top-4 duration-500">
            <div className="w-full flex justify-start mb-8">
              <button onClick={() => setAdminView('main')} className="flex items-center gap-2 text-gray-700 font-black uppercase hover:bg-gray-200 px-6 py-3 rounded-2xl transition-all active:scale-90">
                <ArrowLeft size={24} /> Kembali ke Menu Utama
              </button>
            </div>
            <div className="bg-white w-full p-12 rounded-[3.5rem] shadow-2xl border border-gray-100">
              <div className="flex flex-col gap-8">
                <div className="space-y-3 text-left">
                  <label className="text-xs font-black text-gray-400 uppercase ml-4 tracking-widest flex items-center gap-2"><User size={14}/> Username</label>
                  <input type="text" value={formData.username} onChange={(e) => setFormData({...formData, username: e.target.value})} className="w-full px-8 py-5 rounded-2xl border-4 border-gray-100 focus:border-blue-500 focus:outline-none bg-gray-50 text-xl font-bold" />
                </div>
                <div className="space-y-3 text-left">
                  <label className="text-xs font-black text-gray-400 uppercase ml-4 tracking-widest flex items-center gap-2"><Lock size={14}/> Password Baru</label>
                  <div className="relative">
                    <input type={showPassword ? "text" : "password"} className="w-full px-8 py-5 rounded-2xl border-4 border-gray-100 focus:border-blue-500 focus:outline-none bg-gray-50 text-xl font-bold" placeholder="••••••" />
                    <button onClick={() => setShowPassword(!showPassword)} className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600">{showPassword ? <EyeOff size={24} /> : <Eye size={24} />}</button>
                  </div>
                </div>
                <button className="w-full bg-blue-700 text-white py-6 rounded-2xl font-black text-2xl shadow-xl hover:bg-blue-800 active:scale-95 transition-all mt-4 uppercase flex items-center justify-center gap-3"><Save /> Simpan Perubahan</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}