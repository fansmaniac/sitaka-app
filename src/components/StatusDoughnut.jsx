import React from 'react';

export const StatusDoughnut = ({ 
  label, 
  total, 
  nValue, 
  xValue, 
  xLabel,
  colorPrimary = "#3b82f6",     // Biru (Negeri)
  colorSecondary = "#10b981",   // Hijau (Swasta)
  colorTertiary = "#ef4444"     // Merah (Kosong / xValue)
}) => {
  // Pengaman pembagian dengan nol
  const safeTotal = total > 0 ? total : 1; 

  // Kalkulasi persentase
  const nPercent = total > 0 ? Math.round((nValue / safeTotal) * 100) : 0;
  const xPercent = xValue !== undefined && total > 0 ? Math.round((xValue / safeTotal) * 100) : 0;
  
  // Sisa persentase untuk Swasta agar total selalu pas 100%
  const sPercent = total > 0 ? Math.max(0, 100 - nPercent - xPercent) : 0;

  const radius = 65;
  const strokeWidth = 20;
  const circumference = 2 * Math.PI * radius;
  
  // Kalkulasi jarak putaran garis (offset)
  const offsetPrimary = circumference - (circumference * nPercent) / 100;
  const offsetTertiary = circumference - (circumference * (nPercent + xPercent)) / 100;

  return (
    <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 flex flex-col items-center justify-center shadow-sm">
      <p className="text-xl font-black text-gray-600 uppercase tracking-tighter mb-6 text-center h-12 flex items-center leading-none">{label}</p>
      
      <div className="relative w-40 h-40 mb-6 flex items-center justify-center shrink-0">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
          {/* Dasar: Abu-abu jika total 0 */}
          <circle cx="80" cy="80" r={radius} stroke="#f3f4f6" strokeWidth={strokeWidth} fill="transparent" />
          
          {/* Layer 1 (Bawah): Swasta (Memenuhi seluruh lingkaran yang ada datanya) */}
          {total > 0 && (
            <circle cx="80" cy="80" r={radius} stroke={colorSecondary} strokeWidth={strokeWidth} fill="transparent" />
          )}
          
          {/* Layer 2 (Tengah): xValue / Kosong */}
          {xValue !== undefined && total > 0 && (
            <circle 
              cx="80" cy="80" r={radius} 
              stroke={colorTertiary} 
              strokeWidth={strokeWidth} 
              fill="transparent" 
              strokeDasharray={circumference} 
              strokeDashoffset={offsetTertiary} 
              strokeLinecap="round" 
              className="transition-all duration-1000 ease-out" 
            />
          )}

          {/* Layer 3 (Atas): Primary / Negeri */}
          {total > 0 && (
            <circle 
              cx="80" cy="80" r={radius} 
              stroke={colorPrimary} 
              strokeWidth={strokeWidth} 
              fill="transparent" 
              strokeDasharray={circumference} 
              strokeDashoffset={offsetPrimary} 
              strokeLinecap="round" 
              className="transition-all duration-1000 ease-out" 
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black text-gray-900 leading-none tracking-tighter">{total.toLocaleString('id-ID')}</span>
        </div>
      </div>

      {/* Bagian Keterangan / Legend */}
      <div className={`flex flex-wrap ${xValue !== undefined ? 'gap-2 justify-center' : 'gap-8 justify-center'} mt-2 w-full`}>
        <div className="text-center">
          <p className="text-[11px] sm:text-xs font-black uppercase tracking-tight" style={{ color: colorPrimary }}>
            NEG {nPercent}%
          </p>
        </div>
        
        {/* Render legend ketiga HANYA jika parameter xValue dipanggil dari parent */}
        {xValue !== undefined && (
          <div className="text-center flex items-center border-l border-r border-gray-200 px-2">
            <p className="text-[11px] sm:text-xs font-black uppercase tracking-tight" style={{ color: colorTertiary }}>
              {xLabel || 'KOSONG'} {xPercent}%
            </p>
          </div>
        )}

        <div className="text-center">
          <p className="text-[11px] sm:text-xs font-black uppercase tracking-tight" style={{ color: colorSecondary }}>
            SWA {sPercent}%
          </p>
        </div>
      </div>
    </div>
  );
};