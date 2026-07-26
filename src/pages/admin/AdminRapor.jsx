import React, { useState, useRef, useEffect } from 'react';
import { 
  UploadCloud, ArrowLeft, Loader2, FileText, CheckCircle, 
  Download, Trash2, Map, MapPin, BarChart2
} from 'lucide-react';
import { db } from '../../firebase/config';
import { collection, doc, query, where, getDocs, limit, setDoc, writeBatch } from 'firebase/firestore';
import { readExcel } from '../../utils/excelHelper';
import ExcelJS from 'exceljs';

export default function AdminRapor({ onBack }) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0); 
  const [progressLabel, setProgressLabel] = useState('Sedang Memproses...');
  const [activeTarget, setActiveTarget] = useState(null);
  const [dbStatus, setDbStatus] = useState({}); 

  // --- CEK STATUS MASTER DATA ---
  const checkDatabaseStatus = async () => {
    const categories = [
      { id: 'spm_provinsi' }, 
      { id: 'spm_kabkota' }
    ];
    const years = ['2023', '2024', '2025']; // Menyesuaikan 3 tahun terakhir
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

  // --- MESIN UPLOAD MICRO-BATCHING ---
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !activeTarget) return;

    let isAppendMode = false;

    const statusKey = `${activeTarget.collection}_${activeTarget.year}`;
    if (dbStatus[statusKey]) {
      const askAppend = window.confirm(
        `Data ${activeTarget.label} untuk tahun ${activeTarget.year} sudah ada di database.\n\nApakah ini file lanjutan (Misal: Part 2)?\n\nKlik [OK] untuk MENYAMBUNG data.\nKlik [Cancel] untuk MENIMPA data lama.`
      );
      
      if (askAppend) {
        isAppendMode = true; 
      } else {
        const askOverwrite = window.confirm(
          `PERINGATAN KERAS!\n\nAnda akan MENGHAPUS seluruh data lama tahun ${activeTarget.year} dan menggantinya dengan file ini saja.\n\nApakah Anda yakin ingin MENIMPA data?`
        );
        if (!askOverwrite) {
          e.target.value = null;
          return;
        }
      }
    }

    setUploading(true);
    if (isAppendMode) {
        setProgressLabel(`Menyambung Data ${activeTarget.year} (Append Mode)...`);
    } else {
        setProgressLabel(`Mengunggah & Menimpa Data ${activeTarget.year}...`);
    }
    setUploadProgress(0);

    try {
      let rawData = await readExcel(file);
      
      const totalRowsInExcel = rawData.length;
      const collectionName = `${activeTarget.collection}_chunks`; 
      const cleanTahun = String(activeTarget.year);
      
      // PEMBERSIHAN OTOMATIS JIKA BUKAN MODE APPEND
      if (!isAppendMode) {
        setProgressLabel(`Membersihkan Sisa Dokumen Lama...`);
        const q = query(collection(db, collectionName), where("tahun_data", "==", cleanTahun));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          let delBatch = writeBatch(db);
          let delCount = 0;
          for (let i = 0; i < snapshot.docs.length; i++) {
            delBatch.delete(snapshot.docs[i].ref);
            delCount++;
            if (delCount === 100 || i === snapshot.docs.length - 1) {
              await delBatch.commit();
              delBatch = writeBatch(db);
              delCount = 0;
              await new Promise(r => setTimeout(r, 100));
            }
          }
        }
      } else {
        setProgressLabel(`Menyiapkan Mode Penyambungan Data...`);
      }

      // Format ISO Tanggal untuk update tracker
      const currentTime = new Date().toISOString();

      if (totalRowsInExcel === 0) {
        if (!isAppendMode) {
            const docRef = doc(collection(db, collectionName));
            await setDoc(docRef, { 
              tahun_data: cleanTahun, data: [], last_updated: currentTime, is_empty: true
            });
        }
        setUploadProgress(100);
        alert(`UPLOAD SELESAI, TAPI DATA KOSONG DI FILE INI.`);
      } else {
        setProgressLabel(`Menyimpan ${totalRowsInExcel.toLocaleString('id-ID')} Baris Data...`);
        
        // CHUNKING LOGIC: Simpan 100 baris ke dalam 1 dokumen Firebase
        const CHUNK_SIZE = 100; 
        const totalChunks = Math.ceil(totalRowsInExcel / CHUNK_SIZE);
        let batch = writeBatch(db);
        let batchCount = 0;

        for (let i = 0; i < totalChunks; i++) {
          const chunkData = rawData.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE).map(item => {
            const sanitizedItem = {};
            for (const key in item) {
               let val = item[key];
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
            return sanitizedItem;
          });

          // PENGAMANAN STRUKTUR CHUNK
          const docRef = doc(collection(db, collectionName));
          batch.set(docRef, { 
            tahun_data: cleanTahun, 
            data: chunkData, 
            last_updated: currentTime // Field penting agar bisa dibaca di IndeksSPM.jsx
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

        const modeText = isAppendMode ? "disambungkan" : "diunggah dan menimpa data lama";
        alert(`SINKRONISASI BERHASIL!\n\nTotal ${totalRowsInExcel.toLocaleString('id-ID')} baris data telah ${modeText} dengan aman.`);
      }
      
      checkDatabaseStatus();
    } catch (error) {
      console.error("Upload error:", error);
      alert("Error saat memproses file. Pastikan format tabel tidak korup atau file tidak terkunci.");
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
  // FUNGSI UNDUH FORMAT EXCEL
  // =====================================================================
  const handleDownloadFormatSPMProvinsi = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Indeks SPM Provinsi');
    
    // Field sesuai dengan screenshot (image_2e054e.png)
    const columns = [
      'jenjang', 'indeks_SPM', 'peningkatan_tertinggi', 'capaian_terbaik', 'capaian_terendah'
    ];

    worksheet.columns = columns.map(col => ({ header: col, key: col, width: 25 }));
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } }; // Emerald 600

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Format_Upload_SPM_Provinsi.xlsx`;
    link.click();
  };

  const handleDownloadFormatSPMKabKota = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Indeks SPM Kab-Kota');
    
    // Field disesuaikan untuk kabupaten kota (ditambah kolom kabupaten_kota)
    const columns = [
      'kabupaten_kota', 'jenjang', 'indeks_SPM', 'peningkatan_tertinggi', 'capaian_terbaik', 'capaian_terendah'
    ];

    worksheet.columns = columns.map(col => ({ header: col, key: col, width: 25 }));
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0D9488' } }; // Teal 600
    
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Format_Upload_SPM_KabKota.xlsx`;
    link.click();
  };

  // Komponen UI Kapsul Tahun Upload
  const YearUploadGroup = ({ label, collection, icon: Icon, colorClass, formatHandler }) => (
    <div className="bg-white p-8 rounded-[3rem] shadow-xl border border-gray-100 flex flex-col gap-6 relative">
      {formatHandler && (
        <button 
          onClick={formatHandler} 
          className="absolute top-8 right-8 text-[10px] flex items-center gap-1 bg-slate-100 text-slate-700 px-3 py-1.5 rounded-full font-bold hover:bg-slate-200 transition-colors shadow-sm"
        >
          <Download size={12} /> Unduh Format
        </button>
      )}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`${colorClass} text-white p-4 rounded-2xl shadow-lg`}><Icon size={32} /></div>
          <h4 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{label}</h4>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4 mt-2">
        {['2023', '2024', '2025'].map((year) => {
          const hasData = dbStatus[`${collection}_${year}`];
          return (
            <div key={year} className="flex flex-col gap-2">
              <button 
                onClick={() => triggerUpload({ label, collection, year })}
                className={`w-full py-4 rounded-2xl font-black text-xl transition-all active:scale-95 border-2 flex flex-col items-center gap-1
                  ${hasData ? `${colorClass} text-white border-transparent shadow-lg` : 'bg-slate-50 text-slate-300 border-slate-100 hover:border-emerald-300'}`}
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
      {/* OVERLAY LOADING */}
      {uploading && (
        <div className="fixed inset-0 bg-slate-900/60 z-[100] flex items-center justify-center backdrop-blur-md">
          <div className="bg-white p-12 rounded-[3rem] shadow-2xl flex flex-col items-center gap-6 animate-in zoom-in duration-300 w-full max-w-md text-center">
            <Loader2 className="animate-spin text-emerald-600" size={64} />
            <div className="w-full">
              <p className="font-black text-xl uppercase tracking-widest text-slate-800 mb-4">{progressLabel}</p>
              <div className="w-full bg-slate-100 h-6 rounded-full overflow-hidden border-2 border-slate-100 shadow-inner">
                <div className="bg-emerald-600 h-full transition-all duration-500" style={{ width: `${uploadProgress}%` }}></div>
              </div>
              <p className="text-emerald-600 font-black text-4xl mt-4">{uploadProgress}%</p>
            </div>
          </div>
        </div>
      )}

      {/* KONTEN UTAMA */}
      <div className="flex flex-col items-center w-full max-w-5xl mx-auto animate-in slide-in-from-top-4 duration-500 p-6 md:p-8">
        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".xlsx, .xls, .csv" />
        
        <div className="w-full flex justify-start mb-8">
          <button onClick={onBack} className="flex items-center gap-2 text-emerald-700 font-black uppercase hover:bg-emerald-100 px-6 py-3 rounded-2xl transition-all active:scale-90">
            <ArrowLeft size={24} /> Kembali
          </button>
        </div>
        
        <div className="w-full text-center mb-10">
          <h1 className="text-3xl md:text-4xl font-black text-slate-800 tracking-tighter uppercase flex items-center justify-center gap-3">
            <BarChart2 className="text-emerald-600" size={36} /> Manajemen Data SPM
          </h1>
          <p className="text-slate-500 font-medium mt-2">Upload dataset Rapor Pendidikan untuk pembaruan dashboard statistik.</p>
        </div>

        <div className="flex flex-col gap-8 w-full pb-20">
          {/* KONTAINER INDEKS SPM PROVINSI */}
          <YearUploadGroup 
            label="Indeks SPM Provinsi" 
            collection="spm_provinsi" 
            icon={Map} 
            colorClass="bg-emerald-600" 
            formatHandler={handleDownloadFormatSPMProvinsi} 
          />
          
          {/* KONTAINER INDEKS SPM KABUPATEN/KOTA */}
          <YearUploadGroup 
            label="Indeks SPM Kab/Kota" 
            collection="spm_kabkota" 
            icon={MapPin} 
            colorClass="bg-teal-600" 
            formatHandler={handleDownloadFormatSPMKabKota} 
          />
        </div>
      </div>
    </>
  );
}