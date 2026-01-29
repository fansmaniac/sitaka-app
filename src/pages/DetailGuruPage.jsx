import React, { useState, useMemo } from 'react';
import { ArrowLeft, Users, MousePointer2 } from 'lucide-react';
import RincianKualifikasi from './RincianKualifikasi';

// --- KOMPONEN MULTI-DONUT (OPTIMIZED) ---
const MultiDonut = ({ segments, total, onSegmentClick }) => {
  let cumulativePercent = 0;
  const getCoordinatesForPercent = (percent) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  return (
    <div className="flex flex-col items-center gap-6 w-full">
      <div className="relative w-48 h-48">
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
                onClick={(e) => { e.stopPropagation(); onSegmentClick(s.name); }}
              />
            );
          })}
          <circle r="0.7" fill="white" />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-2xl font-black text-gray-800">{total.toLocaleString('id-ID')}</span>
          <span className="text-[10px] font-bold text-gray-400 uppercase">Guru</span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 w-full px-4">
        {segments.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }}></div>
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-gray-400 uppercase leading-none">{s.name}</span>
              <span className="text-xs font-bold text-gray-700">{s.value.toLocaleString('id-ID')}</span>
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

  // Menghitung statistik untuk diagram
  const stats = useMemo(() => {
    const res = {
      kualifikasi: { s1Atas: 0, s1Bawah: 0 },
      sertifikasi: { sudah: 0, belum: 0 },
      pegawai: { pns: 0, pppk: 0, gty: 0, honorS: 0, honorD: 0 },
      pensiun: { u56: 0, u57: 0, u58: 0, u59: 0, u60: 0 }
    };

    data.forEach(ptk => {
      // Logic Kualifikasi sesuai standar Excel Sobat
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

      if (ptk['Tanggal Birth'] || ptk['Tanggal Lahir']) {
        const tgl = ptk['Tanggal Birth'] || ptk['Tanggal Lahir'];
        const birthYear = new Date(tgl).getFullYear();
        if (!isNaN(birthYear)) {
          const age = parseInt(selectedYear) - birthYear;
          if (age >= 56 && age <= 60) res.pensiun[`u${age}`]++;
        }
      }
    });
    return res;
  }, [data, selectedYear]);

  // Data yang dikirim ke Tabel
  const dataUntukTabel = useMemo(() => {
    if (activeKualifikasi === 'SEMUA') return data;
    return data.filter(d => {
      const qual = String(d['Kualifikasi'] || '').toUpperCase();
      if (activeKualifikasi === '> S1') return qual.includes('> S1');
      if (activeKualifikasi === '< S1') return !qual.includes('> S1');
      return true;
    });
  }, [data, activeKualifikasi]);

  if (selectedSubView === 'table') {
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
    <div className="flex flex-col h-full animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="flex items-center justify-between mb-8 bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-3 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-100 transition-all">
            <ArrowLeft size={24} />
          </button>
          <div className="text-left">
            <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tighter leading-none">Rincian Guru</h2>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em] mt-1">{title} • {selectedYear}</p>
          </div>
        </div>
        <div className="bg-blue-600 px-6 py-3 rounded-2xl text-white shadow-lg flex items-center gap-3">
          <Users size={20} />
          <span className="text-xl font-black">{data.length.toLocaleString('id-ID')}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-10 text-center">
        {/* CARD KUALIFIKASI: KLIK PADDING UNTUK SEMUA, KLIK DIAGRAM UNTUK FILTER */}
        <div 
          onClick={() => { setActiveKualifikasi('SEMUA'); setSelectedSubView('table'); }}
          className="group bg-white p-8 rounded-[3.5rem] shadow-xl border-4 border-transparent hover:border-blue-500 transition-all cursor-pointer active:scale-95 flex flex-col items-center relative"
        >
          <div className="absolute top-6 right-8 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2 text-blue-600 font-black text-[10px] uppercase">
            <MousePointer2 size={14} /> Klik rincian
          </div>
          <h4 className="text-sm font-black text-gray-800 uppercase tracking-widest mb-8">Kualifikasi Guru</h4>
          <MultiDonut 
            total={data.length} 
            onSegmentClick={(label) => { setActiveKualifikasi(label); setSelectedSubView('table'); }}
            segments={[
              { name: '> S1', value: stats.kualifikasi.s1Atas, color: '#2563eb' },
              { name: '< S1', value: stats.kualifikasi.s1Bawah, color: '#001b5e' }
            ]} 
          />
        </div>

        {/* Card Lainnya */}
        <div className="bg-white p-8 rounded-[3.5rem] shadow-xl border border-gray-100 flex flex-col items-center">
          <h4 className="text-sm font-black text-gray-800 uppercase tracking-widest mb-8">Status Sertifikasi</h4>
          <MultiDonut total={data.length} segments={[
            { name: 'Sudah Sergur', value: stats.sertifikasi.sudah, color: '#0ea5e9' },
            { name: 'Belum Sergur', value: stats.sertifikasi.belum, color: '#001b5e' }
          ]} />
        </div>
      </div>
    </div>
  );
}