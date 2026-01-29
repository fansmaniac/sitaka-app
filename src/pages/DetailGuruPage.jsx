import React, { useState, useMemo } from 'react';
import { ArrowLeft, Users, MousePointer2, GraduationCap, Award, Calendar, Briefcase } from 'lucide-react';
import RincianKualifikasi from './RincianKualifikasi';

// --- KOMPONEN DONUT (HANYA LINGKARAN) ---
const DonutChart = ({ segments, total, onSegmentClick }) => {
  let cumulativePercent = 0;
  const getCoordinatesForPercent = (percent) => {
    const x = Math.cos(2 * Math.PI * percent);
    const y = Math.sin(2 * Math.PI * percent);
    return [x, y];
  };

  return (
    <div className="relative w-36 h-36 shrink-0">
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
  );
};

// --- KOMPONEN KARTU SIDE-BY-SIDE ---
const InfoCard = ({ title, icon: Icon, segments, total, onClick, onSegmentClick, colorClass }) => (
  <div 
    onClick={onClick}
    className={`bg-white p-6 rounded-[2.5rem] shadow-lg border-2 border-transparent ${onClick ? 'hover:border-blue-500 cursor-pointer active:scale-[0.98]' : ''} transition-all flex flex-col gap-4 overflow-hidden relative group`}
  >
    {/* Judul & Ikon */}
    <div className="flex items-center gap-3 shrink-0">
      <div className={`${colorClass} p-2 rounded-xl text-white`}><Icon size={18} /></div>
      <h4 className="text-xs font-black text-gray-800 uppercase tracking-tight">{title}</h4>
      {onClick && <MousePointer2 size={14} className="ml-auto text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />}
    </div>

    {/* Content Area: Split Kiri-Kanan */}
    <div className="flex items-center justify-between gap-6 flex-1 min-h-0">
      {/* Kiri: Donut */}
      <DonutChart segments={segments} total={total} onSegmentClick={onSegmentClick} />

      {/* Kanan: Legend (Padding di dalam Padding) */}
      <div className="flex-1 flex flex-col gap-2 overflow-y-auto max-h-40 pr-1">
        {segments.map((s, i) => (
          <div 
            key={i} 
            className="bg-gray-50 p-3 rounded-2xl border border-gray-100 flex items-center justify-between group/item hover:bg-gray-100 transition-colors"
            onClick={(e) => { if(onSegmentClick) { e.stopPropagation(); onSegmentClick(s.name); }}}
          >
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: s.color }}></div>
              <span className="text-[10px] font-bold text-gray-500 uppercase">{s.name}</span>
            </div>
            <span className="text-lg font-black text-gray-800">{s.value.toLocaleString('id-ID')}</span>
          </div>
        ))}
      </div>
    </div>
  </div>
);

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
      if (qual.includes('> S1')) res.kualifikasi.s1Atas++; else res.kualifikasi.s1Bawah++;

      if (String(ptk['Sertifikasi'] || '').includes('Sudah')) res.sertifikasi.sudah++; else res.sertifikasi.belum++;

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
    const dataFiltered = activeKualifikasi === 'SEMUA' ? data : data.filter(d => {
        const q = String(d['Kualifikasi'] || '').toUpperCase();
        return activeKualifikasi === '> S1' ? q.includes('> S1') : !q.includes('> S1');
    });
    return <RincianKualifikasi data={dataFiltered} qualificationLabel={activeKualifikasi} onBack={() => { setSelectedSubView('charts'); setActiveKualifikasi('SEMUA'); }} title={`${title} ${selectedYear}`} />;
  }

  return (
    <div className="h-full flex flex-col overflow-hidden p-4 bg-gray-100">
      {/* HEADER SLIM */}
      <div className="flex items-center justify-between mb-6 bg-white px-8 py-4 rounded-[2.5rem] shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2.5 bg-blue-50 text-blue-600 rounded-xl hover:bg-blue-100 active:scale-90 transition-all">
            <ArrowLeft size={22} />
          </button>
          <div className="text-left">
            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tighter leading-none">Rincian Data PTK</h2>
            <p className="text-xs font-bold text-gray-400 uppercase mt-1">{title} • {selectedYear}</p>
          </div>
        </div>
        <div className="bg-blue-600 px-6 py-2.5 rounded-2xl text-white shadow-lg flex items-center gap-3">
          <Users size={18} />
          <span className="text-lg font-black">{data.length.toLocaleString('id-ID')}</span>
        </div>
      </div>

      {/* GRID 2x2 ONE-SCREEN */}
      <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-6 min-h-0">
        <InfoCard 
          title="Kualifikasi Akademik" icon={GraduationCap} colorClass="bg-blue-600"
          total={data.length} onClick={() => { setActiveKualifikasi('SEMUA'); setSelectedSubView('table'); }}
          onSegmentClick={(label) => { setActiveKualifikasi(label); setSelectedSubView('table'); }}
          segments={[{ name: '> S1', value: stats.kualifikasi.s1Atas, color: '#2563eb' }, { name: '< S1', value: stats.kualifikasi.s1Bawah, color: '#1e3a8a' }]}
        />

        <InfoCard 
          title="Sertifikasi Guru" icon={Award} colorClass="bg-emerald-600"
          total={data.length}
          segments={[{ name: 'Sudah Sergur', value: stats.sertifikasi.sudah, color: '#10b981' }, { name: 'Belum Sergur', value: stats.sertifikasi.belum, color: '#064e3b' }]}
        />

        <InfoCard 
          title="Proyeksi Pensiun" icon={Calendar} colorClass="bg-orange-600"
          total={Object.values(stats.pensiun).reduce((a, b) => a + b, 0)}
          segments={[
            { name: 'Usia 56', value: stats.pensiun.u56, color: '#f97316' }, { name: 'Usia 57', value: stats.pensiun.u57, color: '#ea580c' },
            { name: 'Usia 58', value: stats.pensiun.u58, color: '#c2410c' }, { name: 'Usia 59', value: stats.pensiun.u59, color: '#9a3412' },
            { name: 'Usia 60', value: stats.pensiun.u60, color: '#7c2d12' }
          ]}
        />

        <InfoCard 
          title="Status Kepegawaian" icon={Briefcase} colorClass="bg-purple-600"
          total={data.length}
          segments={[
            { name: 'PNS', value: stats.pegawai.pns, color: '#9333ea' }, { name: 'PPPK', value: stats.pegawai.pppk, color: '#7e22ce' },
            { name: 'GTY', value: stats.pegawai.gty, color: '#6b21a8' }, { name: 'Hon. S', value: stats.pegawai.honorS, color: '#581c87' },
            { name: 'Hon. D', value: stats.pegawai.honorD, color: '#3b0764' }
          ]}
        />
      </div>
    </div>
  );
}