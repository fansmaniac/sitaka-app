import React from 'react';

export const StatusDoughnut = ({ label, total, nValue, colorPrimary = "#3b82f6", colorSecondary = "#10b981" }) => {
    const nPercent = total > 0 ? Math.round((nValue / total) * 100) : 0;
    const radius = 65;
    const strokeWidth = 20;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (circumference * nPercent) / 100;

    return (
      <div className="bg-white p-6 rounded-[2.5rem] border border-gray-100 flex flex-col items-center justify-center shadow-sm">
        <p className="text-xl font-black text-gray-600 uppercase tracking-tighter mb-6 text-center h-12 flex items-center leading-none">{label}</p>
        <div className="relative w-40 h-40 mb-6 flex items-center justify-center">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
            <circle cx="80" cy="80" r={radius} stroke="#f3f4f6" strokeWidth={strokeWidth} fill="transparent" />
            {total > 0 && <circle cx="80" cy="80" r={radius} stroke={colorSecondary} strokeWidth={strokeWidth} fill="transparent" />}
            <circle cx="80" cy="80" r={radius} stroke={colorPrimary} strokeWidth={strokeWidth} fill="transparent" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-1000 ease-out" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-black text-gray-900 leading-none tracking-tighter">{total.toLocaleString()}</span>
          </div>
        </div>
        <div className="flex gap-8 mt-2 w-full justify-center">
          <div className="text-center"><p className="text-base font-black uppercase tracking-tight" style={{ color: colorPrimary }}>NEG {nPercent}%</p></div>
          <div className="text-center"><p className="text-base font-black uppercase tracking-tight" style={{ color: colorSecondary }}>SWA {100 - nPercent}%</p></div>
        </div>
      </div>
    );
};