import React, { useState, useRef, useEffect } from 'react';
import { 
  Database, UploadCloud, Settings, ArrowLeft, User, Lock, 
  Eye, EyeOff, Save, School, Users, UserCheck, Loader2, 
  FileText, Layers, CheckCircle, Download, Trash2 
} from 'lucide-react';
import { db } from '../firebase/config';
import { collection, writeBatch, doc, query, where, getDocs, limit } from 'firebase/firestore';
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

  // --- 1. LOGIKA STATUS DATABASE ---
  const checkDatabaseStatus = async () => {
    const categories = [
      { id: 'dapodik_sekolah' }, { id: 'dapodik_ptk' }, 
      { id: 'dapodik_kepsek' }, { id: 'rapor_pendidikan' }, { id: 'data_ats' }
    ];
    const years = ['2024', '2025', '2026'];
    let newStatus = {};
    for (const cat of categories) {
      for (const year of years) {
        const q = query(collection(db, cat.id), where("tahun_data", "==", year), limit(1));
        const snapshot = await getDocs(q);
        newStatus[`${cat.id}_${year}`] = !snapshot.empty;
      }
    }
    setDbStatus(newStatus);
  };

  useEffect(() => { if (adminView === 'input') checkDatabaseStatus(); }, [adminView]);

  // --- 2. LOGIKA HAPUS DATA PER TAHUN (OPTIMIZED) ---
  const handleDeleteData = async (target) => {
    const confirmDelete = window.confirm(`PERINGATAN KERAS!\n\nYakin Menghapus Database ${target.label} Tahun ${target.year}?\nData yang dihapus tidak bisa dikembalikan.`);
    if (!confirmDelete) return;

    setUploading(true);
    setUploadProgress(0);
    console.log(`Memulai proses penghapusan data ${target.collection} tahun ${target.year}...`);

    try {
      const q = query(collection(db, target.collection), where("tahun_data", "==", target.year));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        alert("Data memang sudah kosong, Sob.");
        setUploading(false);
        return;
      }

      const allDocs = snapshot.docs;
      const totalDocs = allDocs.length;
      console.log(`Ditemukan ${totalDocs} dokumen. Memulai penghapusan massal...`);

      // Batas Firestore Batch adalah 500. Kita bagi per 500 data.
      const chunkSize = 500;
      for (let i = 0; i < totalDocs; i += chunkSize) {
        const batch = writeBatch(db);
        const chunk = allDocs.slice(i, i + chunkSize);

        chunk.forEach((docSnap) => {
          batch.delete(docSnap.ref);
        });

        await batch.commit();
        
        // Update Progress agar admin tidak bingung
        const progress = Math.round(((i + chunk.length) / totalDocs) * 100);
        setUploadProgress(progress);
        console.log(`Berhasil menghapus ${i + chunk.length} dari ${totalDocs} data...`);
      }

      alert(`BERHASIL! Total ${totalDocs} data ${target.label} Tahun ${target.year} telah dibersihkan.`);
      checkDatabaseStatus();
    } catch (error) {
      console.error("Delete error detail:", error);
      alert("Gagal menghapus data. Detail error ada di console browser.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  // --- 3. LOGIKA SMART SYNC & UPLOAD ---
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setUploadProgress(0);
    try {
      const jsonData = await readExcel(file);
      const collectionName = activeTarget.collection;
      const totalData = jsonData.length;
      
      const existingDocs = {};
      const q = query(collection(db, collectionName), where("tahun_data", "==", activeTarget.year));
      const querySnapshot = await getDocs(q);
      querySnapshot.forEach(doc => { existingDocs[doc.id] = doc.data(); });

      const toUpdate = [];
      jsonData.forEach((newData) => {
        const docId = newData.NPSN ? `${newData.NPSN}_${activeTarget.year}` : null;
        if (!docId) return;
        const oldData = existingDocs[docId];
        const isChanged = !oldData || Object.keys(newData).some(key => 
          String(newData[key] || '').trim() !== String(oldData[key] || '').trim()
        );
        if (isChanged) toUpdate.push({ id: docId, data: newData });
      });

      if (toUpdate.length === 0) {
        alert("Data sudah mutakhir!");
        setUploading(false);
        return;
      }

      const chunkSize = 500;
      for (let i = 0; i < toUpdate.length; i += chunkSize) {
        const batch = writeBatch(db);
        const chunk = toUpdate.slice(i, i + chunkSize);
        chunk.forEach((item) => {
          const docRef = doc(db, collectionName, item.id);
          batch.set(docRef, { ...item.data, tahun_data: activeTarget.year, updatedAt: new Date().toISOString() });
        });
        await batch.commit();
        setUploadProgress(Math.round(((i + chunk.length) / toUpdate.length) * 100));
      }
      alert("Sinkronisasi Berhasil!");
      checkDatabaseStatus();
    } catch (error) {
      alert("Error saat sinkronisasi.");
    } finally {
      setUploading(false);
      e.target.value = null; 
    }
  };

  const triggerUpload = (target) => {
    setActiveTarget(target);
    fileInputRef.current.click();
  };

    const downloadFormat = async (category) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Format Import');
    
    // Definisi Header sesuai permintaan baru Sobat
    const headers = {
      'dapodik_sekolah': ['NPSN', 'Nama Satuan Pendidikan', 'Bentuk Pendidikan', 'Status Sekolah', 'Kabupaten/Kota', 'PD_Total', 'Jumlah Rombel'],
      'dapodik_ptk': [
        'NPSN', 
        'Nama PTK', 
        'Jenis PTK', 
        'Bentuk Pendidikan', 
        'Kabupaten/Kota', 
        'Status Sekolah', 
        'Kualifikasi',        // Isian: < S1 atau > S1
        'Sertifikasi',        // Isian: Sudah Sertifikasi atau Belum Sertifikasi
        'Tanggal Lahir',      // Isian: YYYY-MM-DD
        'Status Kepegawaian'  // Isian: PNS, PPPK, GTY, Honor Sekolah, Honor Daerah
      ],
      'dapodik_kepsek': ['NPSN', 'Nama Kepala Sekolah', 'Bentuk Pendidikan', 'Kabupaten/Kota', 'Status Sekolah'],
      'rapor_pendidikan': ['NPSN', 'Kabupaten/Kota', 'Bentuk Pendidikan', 'Indeks Literasi', 'Indeks Numerasi'],
      'data_ats': ['Kabupaten/Kota', 'Jenjang', 'Jumlah ATS']
    };

    sheet.addRow(headers[category]);

    // Memberikan style tebal pada header agar rapi
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
                  ${hasData ? 'bg-blue-600 text-white border-blue-600 shadow-lg' : 'bg-gray-50 text-gray-300 border-gray-100 hover:border-blue-300'}`}
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

      {/* Kontainer Utama dengan Logika Penjajaran (Scrollable) */}
      <div className={`flex-1 flex flex-col items-center p-12 overflow-y-auto ${adminView === 'main' ? 'justify-center' : 'justify-start pt-10'}`}>
        
        {/* VIEW 1: MAIN MENU */}
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

        {/* VIEW 2: INPUT DATA */}
        {adminView === 'input' && (
          <div className="flex flex-col items-center w-full max-w-6xl animate-in slide-in-from-top-4 duration-500">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".xlsx, .xls" />
            
            {/* TOMBOL KEMBALI */}
            <div className="w-full flex justify-start mb-8">
              <button 
                onClick={() => setAdminView('main')} 
                className="flex items-center gap-2 text-blue-700 font-black uppercase hover:bg-blue-100 px-6 py-3 rounded-2xl transition-all active:scale-90"
              >
                <ArrowLeft size={24} /> Kembali ke Menu Utama
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full pb-20">
              <YearUploadGroup label="Satuan Pendidikan" collection="dapodik_sekolah" icon={School} colorClass="bg-blue-600" />
              <YearUploadGroup label="Database PTK" collection="dapodik_ptk" icon={Users} colorClass="bg-blue-500" />
              <YearUploadGroup label="Database Kepsek" collection="dapodik_kepsek" icon={UserCheck} colorClass="bg-blue-400" />
              <YearUploadGroup label="Rapor Pendidikan" collection="rapor_pendidikan" icon={FileText} colorClass="bg-emerald-600" />
              <YearUploadGroup label="Database ATS" collection="data_ats" icon={Layers} colorClass="bg-orange-600" />
            </div>
          </div>
        )}

        {/* VIEW 3: SETTINGS */}
        {adminView === 'settings' && (
          <div className="flex flex-col items-center w-full max-w-2xl animate-in slide-in-from-top-4 duration-500">
            {/* TOMBOL KEMBALI */}
            <div className="w-full flex justify-start mb-8">
              <button 
                onClick={() => setAdminView('main')} 
                className="flex items-center gap-2 text-gray-700 font-black uppercase hover:bg-gray-200 px-6 py-3 rounded-2xl transition-all active:scale-90"
              >
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