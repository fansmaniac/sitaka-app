import React, { useState, useMemo } from 'react';
import { ArrowLeft, Users, MousePointer2, GraduationCap, Award, Calendar, Briefcase } from 'lucide-react';
import RincianKualifikasi from './RincianKualifikasi';
import RincianSertifikasi from './RincianSertifikasi'; // Tembahan Import Rincian Sertifikasi

// --- UTILITY AMAN BACA KOLOM ---
const getVal = (obj, keyName) => {
  if (!obj) return '';
  const key = Object.keys(obj).find(k => k.trim().toLowerCase() === keyName.toLowerCase());
  return key ? obj[key] : '';
};

// --- KOMPONEN DONUT ---
const DonutChart = ({ segments, total, onSegmentClick }) => {
  let cumulativePercent = 0;
  const getCoordinatesForPercent = (percent) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  return (
    <div className="relative w-40 h-40 shrink-0">
      <svg viewBox="-1 -1 2 2" className="transform -rotate-90 w-full h-full">
        {segments.map((s, i) => {
          if (s.value === 0) return null;
          const [startX, startY] = getCoordinatesForPercent(cumulativePercent);
          cumulativePercent += s.value / (total || 1);
          const [endX, endY] = getCoordinatesForPercent(cumulativePercent);
          const largeArcFlag = s.value / total > 0.5 ? 1 : 0;
          const pathData = `M ${startX} ${startY} A 1 1 0 ${largeArcFlag} 1 ${endX} ${endY} L 0 0`;
          return (
            <path 
              key={i} d={pathData} fill={s.color} 
              className="cursor-pointer hover:opacity-80 transition-all"
              onClick={(e) => { if(onSegmentClick) { e.stopPropagation(); onSegmentClick(s.name); }}}
            />
          );
        })}
        <circle r="0.75" fill="white" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
        <span className="text-2xl font-black text-gray-800 leading-none">{total.toLocaleString('id-ID')}</span>
        <span className="text-sm font-black text-gray-400 uppercase tracking-widest mt-1">Total</span>
      </div>
    </div>
  );
};

// --- KOMPONEN KARTU ---
const InfoCard = ({ title, icon: Icon, segments, total, onClick, onSegmentClick, colorClass }) => {
  const group1 = segments.slice(0, 3);
  const group2 = segments.slice(3);

  return (
    <div 
      onClick={onClick}
      className={`bg-white p-6 rounded-[3rem] shadow-xl border-2 border-transparent ${onClick ? 'hover:border-blue-500 cursor-pointer active:scale-[0.98]' : ''} transition-all flex flex-col gap-4 overflow-hidden relative group`}
    >
      <div className="flex items-center gap-3 shrink-0">
        <div className={`${colorClass} p-2 rounded-xl text-white shadow-md`}><Icon size={20} /></div>
        <h4 className="text-base font-black text-gray-800 uppercase tracking-tighter">{title}</h4>
        {onClick && <MousePointer2 size={16} className="ml-auto text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />}
      </div>

      <div className="flex items-center justify-start gap-8 flex-1 min-h-0">
        <DonutChart segments={segments} total={total} onSegmentClick={onSegmentClick} />

        <div className="flex flex-wrap gap-x-8 gap-y-2 flex-1 items-start">
          <div className="flex flex-col gap-2">
            {group1.map((s, i) => (
              <div key={i} className="flex items-center gap-2 whitespace-nowrap">
                <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }}></div>
                <div className="flex items-baseline gap-2">
                  <span className="text-[10px] sm:text-xs font-black text-gray-400 uppercase">{s.name}</span>
                  <span className="text-sm sm:text-base font-black text-gray-800">{s.value.toLocaleString('id-ID')}</span>
                </div>
              </div>
            ))}
          </div>

          {group2.length > 0 && (
            <div className="flex flex-col gap-2">
              {group2.map((s, i) => (
                <div key={i} className="flex items-center gap-2 whitespace-nowrap">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }}></div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[10px] sm:text-xs font-black text-gray-400 uppercase">{s.name}</span>
                    <span className="text-sm sm:text-base font-black text-gray-800">{s.value.toLocaleString('id-ID')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default function DetailGuruPage({ data, onBack, selectedYear, title }) {
  // State untuk mengontrol view ('charts', 'table_kualifikasi', 'table_sertifikasi')
  const [selectedSubView, setSelectedSubView] = useState('charts');
  
  // State untuk melacak kategori spesifik yang diklik
  const [activeKualifikasi, setActiveKualifikasi] = useState('SEMUA');
  const [activeSertifikasi, setActiveSertifikasi] = useState('SEMUA');

  // --- MEGA OPTIMASI: HITUNG STATISTIK TANPA MENYARING ULANG DATA ---
  const stats = useMemo(() => {
    const res = {
      kualifikasi: { s1: 0, s2: 0, s3: 0, smaSederajat: 0, tidakDiketahui: 0 },
      sertifikasi: { sudah: 0, belum: 0 },
      pegawai: { pns: 0, pppk: 0, gty: 0, honorS: 0, honorD: 0, lainnya: 0 },
      pensiun: { u56: 0, u57: 0, u58: 0, u59: 0, u60plus: 0 }
    };

    for (let i = 0; i < data.length; i++) {
      const ptk = data[i];

      // --- HITUNG STATISTIK ---
      
      // 1. Kualifikasi Pendidikan
      const qual = String(getVal(ptk, 'pendidikan') || '').toUpperCase().trim();
      if (qual === 'S1' || qual === 'S.1' || qual === 'D4' || qual === 'D.IV') {
        res.kualifikasi.s1++;
      } else if (qual === 'S2' || qual === 'S.2') {
        res.kualifikasi.s2++;
      } else if (qual === 'S3' || qual === 'S.3') {
        res.kualifikasi.s3++;
      } else if (qual.includes('SMA') || qual.includes('SMK') || qual.includes('SLTA') || qual.includes('D1') || qual.includes('D2') || qual.includes('D3')) {
        res.kualifikasi.smaSederajat++;
      } else {
        res.kualifikasi.tidakDiketahui++;
      }

      // 2. Sertifikasi Guru
      const cert = String(getVal(ptk, 'bidang_studi_sertifikasi') || '').trim();
      if (cert !== '' && cert !== '-' && cert.toLowerCase() !== 'null' && cert.toLowerCase() !== 'undefined') {
        res.sertifikasi.sudah++;
      } else {
        res.sertifikasi.belum++;
      }
      
      // 3. Status Kepegawaian
      const sp = String(getVal(ptk, 'status_kepegawaian') || '').toUpperCase();
      if (sp.includes('PNS')) {
          res.pegawai.pns++;
      } else if (sp.includes('PPPK')) {
          res.pegawai.pppk++;
      } else if (sp.includes('GTY') || sp.includes('PTY') || sp.includes('YAYASAN')) {
          res.pegawai.gty++;
      } else if (sp.includes('SEKOLAH') || sp.includes('HONORER SEKOLAH')) {
          res.pegawai.honorS++;
      } else if (sp.includes('DAERAH') || sp.includes('HONORER DAERAH') || sp.includes('KAB') || sp.includes('PROV')) {
          res.pegawai.honorD++;
      } else {
          res.pegawai.lainnya++;
      }

      // 4. Pensiun
      const tglLahir = getVal(ptk, 'tanggal_lahir');
      if (tglLahir) {
        const tglStr = String(tglLahir).trim();
        const yearMatch = tglStr.match(/(19|20)\d{2}/);
        
        if (yearMatch) {
          const birthYear = parseInt(yearMatch[0], 10);
          const age = parseInt(selectedYear) - birthYear;
          if (age === 56) res.pensiun.u56++;
          else if (age === 57) res.pensiun.u57++;
          else if (age === 58) res.pensiun.u58++;
          else if (age === 59) res.pensiun.u59++;
          else if (age >= 60) res.pensiun.u60plus++; 
        }
      }
    }
    
    return res;
  }, [data, selectedYear]);

  // Mode View Rincian Tabel Kualifikasi
  if (selectedSubView === 'table_kualifikasi') {
    const dataFiltered = activeKualifikasi === 'SEMUA' ? data : data.filter(d => {
        const q = String(getVal(d, 'pendidikan') || '').toUpperCase().trim();
        
        if (activeKualifikasi === 'S1') return (q === 'S1' || q === 'S.1' || q === 'D4' || q === 'D.IV');
        if (activeKualifikasi === 'S2') return (q === 'S2' || q === 'S.2');
        if (activeKualifikasi === 'S3') return (q === 'S3' || q === 'S.3');
        if (activeKualifikasi === 'SMA/Sederajat') return (q.includes('SMA') || q.includes('SMK') || q.includes('SLTA') || q.includes('D1') || q.includes('D2') || q.includes('D3'));
        
        // Tidak diketahui
        return !(q.includes('S1') || q.includes('S2') || q.includes('S3') || q.includes('D4') || q.includes('SMA') || q.includes('SMK') || q.includes('SLTA') || q.includes('D1') || q.includes('D2') || q.includes('D3'));
    });
    return <RincianKualifikasi data={dataFiltered} qualificationLabel={activeKualifikasi} onBack={() => { setSelectedSubView('charts'); setActiveKualifikasi('SEMUA'); }} title={`${title} ${selectedYear}`} />;
  }

  // Mode View Rincian Tabel Sertifikasi
  if (selectedSubView === 'table_sertifikasi') {
    const dataFiltered = activeSertifikasi === 'SEMUA' ? data : data.filter(d => {
        const cert = String(getVal(d, 'bidang_studi_sertifikasi') || '').trim();
        const isSudah = cert !== '' && cert !== '-' && cert.toLowerCase() !== 'null' && cert.toLowerCase() !== 'undefined';
        
        if (activeSertifikasi === 'Sudah Sertifikasi') return isSudah;
        if (activeSertifikasi === 'Belum Sertifikasi') return !isSudah;
        return true;
    });
    return <RincianSertifikasi data={dataFiltered} certificationLabel={activeSertifikasi} onBack={() => { setSelectedSubView('charts'); setActiveSertifikasi('SEMUA'); }} title={`${title} ${selectedYear}`} />;
  }


  return (
    <div className="h-full flex flex-col overflow-hidden p-4 bg-blue-50/30">
      {/* HEADER DASHBOARD DENGAN WARNA BIRU */}
      <div className="flex items-center justify-between mb-6 bg-gradient-to-r from-blue-700 to-blue-900 px-8 py-5 rounded-[2.5rem] shadow-xl shrink-0 border border-blue-500">
        <div className="flex items-center gap-4">
          <button 
            onClick={onBack} 
            className="p-3 bg-white/20 text-white rounded-2xl hover:bg-white/30 active:scale-90 transition-all backdrop-blur-sm"
          >
            <ArrowLeft size={24} />
          </button>
          <div className="text-left">
            <h2 className="text-2xl font-black text-white uppercase tracking-tighter leading-none drop-shadow-md">Statistik Rincian PTK</h2>
            <p className="text-xs font-bold text-blue-200 uppercase mt-1 tracking-widest">{title} • {selectedYear}</p>
          </div>
        </div>
        <div className="bg-white px-6 py-3 rounded-2xl text-blue-800 shadow-lg flex items-center gap-3">
          <Users size={20} className="text-blue-600"/>
          {/* Angka Total murni mengambil length dari property 'data' */}
          <span className="text-xl font-black">{data.length.toLocaleString('id-ID')}</span>
        </div>
      </div>

      {/* GRID 2x2 ONE-SCREEN */}
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-6 min-h-0 pb-4">
        
        <InfoCard 
          title="Kualifikasi Pendidikan" icon={GraduationCap} colorClass="bg-blue-600"
          total={data.length} onClick={() => { setActiveKualifikasi('SEMUA'); setSelectedSubView('table_kualifikasi'); }}
          onSegmentClick={(label) => { setActiveKualifikasi(label); setSelectedSubView('table_kualifikasi'); }}
          segments={[
            { name: 'S3', value: stats.kualifikasi.s3, color: '#1e3a8a' }, 
            { name: 'S2', value: stats.kualifikasi.s2, color: '#2563eb' },
            { name: 'S1', value: stats.kualifikasi.s1, color: '#3b82f6' },
            { name: 'SMA/Sederajat', value: stats.kualifikasi.smaSederajat, color: '#93c5fd' },
            { name: 'Tidak Diketahui', value: stats.kualifikasi.tidakDiketahui, color: '#cbd5e1' }
          ]}
        />

        <InfoCard 
          title="Sertifikasi Guru" icon={Award} colorClass="bg-emerald-600"
          total={data.length} onClick={() => { setActiveSertifikasi('SEMUA'); setSelectedSubView('table_sertifikasi'); }}
          onSegmentClick={(label) => { setActiveSertifikasi(label); setSelectedSubView('table_sertifikasi'); }}
          segments={[
            { name: 'Sudah Sertifikasi', value: stats.sertifikasi.sudah, color: '#10b981' }, 
            { name: 'Belum Sertifikasi', value: stats.sertifikasi.belum, color: '#064e3b' }
          ]}
        />

        <InfoCard 
          title="Proyeksi Pensiun" icon={Calendar} colorClass="bg-orange-600"
          total={Object.values(stats.pensiun).reduce((a, b) => a + b, 0)}
          segments={[
            { name: 'Usia 56', value: stats.pensiun.u56, color: '#fcd34d' }, 
            { name: 'Usia 57', value: stats.pensiun.u57, color: '#f59e0b' },
            { name: 'Usia 58', value: stats.pensiun.u58, color: '#ea580c' }, 
            { name: 'Usia 59', value: stats.pensiun.u59, color: '#c2410c' },
            { name: 'Usia ≥ 60', value: stats.pensiun.u60plus, color: '#7c2d12' }
          ]}
        />

        <InfoCard 
          title="Status Kepegawaian" icon={Briefcase} colorClass="bg-purple-600"
          total={data.length}
          segments={[
            { name: 'PNS', value: stats.pegawai.pns, color: '#9333ea' }, 
            { name: 'PPPK', value: stats.pegawai.pppk, color: '#7e22ce' },
            { name: 'GTY/PTY', value: stats.pegawai.gty, color: '#6b21a8' }, 
            { name: 'Honor Sekolah', value: stats.pegawai.honorS, color: '#581c87' },
            { name: 'Honor Daerah', value: stats.pegawai.honorD, color: '#3b0764' },
            { name: 'Lainnya', value: stats.pegawai.lainnya, color: '#e9d5ff' }
          ]}
        />

      </div>
    </div>
  );
}