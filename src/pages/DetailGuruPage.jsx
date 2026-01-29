import React, { useState, useMemo } from 'react';
import { ArrowLeft, Users, MousePointer2 } from 'lucide-react';
import RincianKualifikasi from './RincianKualifikasi';

// --- KOMPONEN MULTI-DONUT (KOMPAK UNTUK ONE-SCREEN LAYOUT) ---
const MultiDonut = ({ segments, total, onSegmentClick }) => {
  let cumulativePercent = 0;
  const getCoordinatesForPercent = (percent) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  return (
    <div className="flex flex-col items-center w-full gap-4">
      {/* Ukuran Donat dibuat sedang (w-44) agar sisa ruang untuk Legend cukup */}
      <div className="relative w-44 h-44 shrink-0">
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
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-black text-gray-800 leading-none">{total.toLocaleString('id-ID')}</span>
          <span className="text-[8px] font-black text-gray-400 uppercase mt-1">Total</span>
        </div>
      </div>
      
      {/* Legend Dibuat Sangat Kompak & Rapih */}
      <div className="w-full space-y-1.5 px-2 overflow-y-auto max-h-32">
        {segments.map((s, i) => (
          <div 
            key={i} 
            className="flex items-center justify-between bg-gray-50/80 p-2.5 rounded-xl border border-gray-100"
          >
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }}></div>
              <span className="text-[9px] font-black text-gray-500 uppercase tracking-tight">{s.name}</span>
            </div>
            <div className="text-sm font-black text-gray-800">
              {s.value.toLocaleString('id-ID')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function DetailGuruPage({ data, onBack, selectedYear, title }) {
  const [selectedSubView, setSelectedSubView] = useState('charts');
  const [activeKualifikasi, setActiveKualifikasi] = useState('SEMUA');

  const stats = useMemo(() => {
    const res = {
      kualifikasi: { s1Atas: 0, s1Bawah: 0 },
      sertifikasi: { sudah: 0, belum: 0 },
      pegawai: { pns: 0, pppk: 0, gty: 0, honorS: 0, honorD: 0 },
      pensiun: { u56: 0, u57: 0, u58: 0, u59: 0, u60: 0 }
    };

    data.forEach(ptk => {
      const qual = String(ptk['Kualifikasi'] || '').toUpperCase();
      if (qual.includes('> S1')) res.kualifikasi.s1Atas++;
      else res.kualifikasi.s1Bawah++;

      if (String(ptk['Sertifikasi'] || '').includes('Sudah')) res.sertifikasi.sudah++;
      else res.sertifikasi.belum++;

      const sp = String(ptk['Status Kepegawaian'] || '').toUpperCase();
      if (sp.includes('PNS')) res.pegawai.pns++;
      else if (sp.includes('PPPK')) res.pegawai.pppk++;
      else if (sp.includes('GTY')) res.pegawai.gty++;
      else if (sp.includes('SEKOLAH')) res.pegawai.honorS++;
      else if (sp.includes('DAERAH')) res.pegawai.honorD++;

      if (ptk['Tanggal Lahir']) {
        const birthYear = new Date(ptk['Tanggal Lahir']).getFullYear();
        if (!isNaN(birthYear)) {
          const age = parseInt(selectedYear) - birthYear;
          if (age >= 56 && age <= 60) res.pensiun[`u${age}`]++;
        }
      }
    });
    return res;
  }, [data, selectedYear]);

  if (selectedSubView === 'table') {
    const dataUntukTabel = activeKualifikasi === 'SEMUA' ? data : data.filter(d => {
        const qual = String(d['Kualifikasi'] || '').toUpperCase();
        return activeKualifikasi === '> S1' ? qual.includes('> S1') : !qual.includes('> S1');
    });
    return (
      <RincianKualifikasi 
        data={dataUntukTabel}
        qualificationLabel={activeKualifikasi}
        onBack={() => { setSelectedSubView('charts'); setActiveKualifikasi('SEMUA'); }}
        title={`${title} ${selectedYear}`}
      />
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden p-2">
      {/* HEADER: Dibuat Lebih Tipis agar tidak makan ruang */}
      <div className="flex items-center justify-between mb-4 bg-white px-6 py-3 rounded-[2rem] shadow-sm border border-gray-100 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 transition-all active:scale-90">
            <ArrowLeft size={20} />
          </button>
          <div className="text-left">
            <h2 className="text-lg font-black text-gray-800 uppercase tracking-tighter leading-none">Rincian Guru</h2>
            <p className="text-[9px] font-bold text-gray-400 uppercase mt-0.5">{title}</p>
          </div>
        </div>
        <div className="bg-blue-600 px-4 py-1.5 rounded-xl text-white shadow-md flex items-center gap-2">
          <Users size={16} />
          <span className="text-sm font-black">{data.length.toLocaleString('id-ID')}</span>
        </div>
      </div>

      {/* GRID 2x2: Ini inti dari tampilan One-Screen */}
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-4 min-h-0 pb-2">
        
        {/* CARD KUALIFIKASI */}
        <div 
          onClick={() => { setActiveKualifikasi('SEMUA'); setSelectedSubView('table'); }}
          className="bg-white p-5 rounded-[2.5rem] shadow-lg border-2 border-transparent hover:border-blue-500 transition-all cursor-pointer flex flex-col items-center justify-between relative overflow-hidden"
        >
          <h4 className="text-[10px] font-black text-blue-900 uppercase tracking-widest shrink-0">Kualifikasi Akademik</h4>
          <MultiDonut total={data.length} onSegmentClick={(label) => { setActiveKualifikasi(label); setSelectedSubView('table'); }}
            segments={[{ name: '> S1', value: stats.kualifikasi.s1Atas, color: '#2563eb' }, { name: '< S1', value: stats.kualifikasi.s1Bawah, color: '#001b5e' }]} 
          />
        </div>

        {/* CARD SERTIFIKASI */}
        <div className="bg-white p-5 rounded-[2.5rem] shadow-lg border border-gray-100 flex flex-col items-center justify-between">
          <h4 className="text-[10px] font-black text-gray-800 uppercase tracking-widest shrink-0">Status Sertifikasi</h4>
          <MultiDonut total={data.length} segments={[{ name: 'Sudah Sergur', value: stats.sertifikasi.sudah, color: '#0ea5e9' }, { name: 'Belum Sergur', value: stats.sertifikasi.belum, color: '#001b5e' }]} />
        </div>

        {/* CARD USIA PENSIUN */}
        <div className="bg-white p-5 rounded-[2.5rem] shadow-lg border border-gray-100 flex flex-col items-center justify-between">
          <h4 className="text-[10px] font-black text-gray-800 uppercase tracking-widest shrink-0">Proyeksi Pensiun</h4>
          <MultiDonut total={Object.values(stats.pensiun).reduce((a, b) => a + b, 0)} segments={[
            { name: 'u56', value: stats.pensiun.u56, color: '#3b82f6' }, { name: 'u57', value: stats.pensiun.u57, color: '#1d4ed8' },
            { name: 'u58', value: stats.pensiun.u58, color: '#f97316' }, { name: 'u59', value: stats.pensiun.u59, color: '#7e22ce' },
            { name: 'u60', value: stats.pensiun.u60, color: '#ec4899' }
          ]} />
        </div>

        {/* CARD STATUS PEGAWAI */}
        <div className="bg-white p-5 rounded-[2.5rem] shadow-lg border border-gray-100 flex flex-col items-center justify-between">
          <h4 className="text-[10px] font-black text-gray-800 uppercase tracking-widest shrink-0">Status Kepegawaian</h4>
          <MultiDonut total={data.length} segments={[
            { name: 'PNS', value: stats.pegawai.pns, color: '#3b82f6' }, { name: 'PPPK', value: stats.pegawai.pppk, color: '#f97316' },
            { name: 'GTY', value: stats.pegawai.gty, color: '#7e22ce' }, { name: 'Hnr Sekolah', value: stats.pegawai.honorS, color: '#001b5e' },
            { name: 'Hnr Daerah', value: stats.pegawai.honorD, color: '#0ea5e9' }
          ]} />
        </div>

      </div>
    </div>
  );
}