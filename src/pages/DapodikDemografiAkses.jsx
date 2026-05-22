import React, { useState } from 'react';
import { 
  Map, 
  CreditCard, 
  Download, 
  MapPin, 
  FileSpreadsheet,
  Search
} from 'lucide-react';

export default function DapodikDemografiAkses({ selectedYear }) {
  // State untuk Tab Aktif ('aksesibilitas' atau 'pip')
  const [activeTab, setActiveTab] = useState('aksesibilitas');
  
  // State untuk Filter
  const [selectedWilayah, setSelectedWilayah] = useState('Semua');

  // Dummy Daftar Kabupaten/Kota di Kalbar (Bisa dinamis nanti dari data)
  const daftarWilayah = [
    "Semua",
    "Kabupaten Bengkayang",
    "Kabupaten Kapuas Hulu",
    "Kabupaten Kayong Utara",
    "Kabupaten Ketapang",
    "Kabupaten Kubu Raya",
    "Kabupaten Landak",
    "Kabupaten Melawi",
    "Kabupaten Mempawah",
    "Kabupaten Sambas",
    "Kabupaten Sanggau",
    "Kabupaten Sekadau",
    "Kabupaten Sintang",
    "Kota Pontianak",
    "Kota Singkawang"
  ];

  // ==========================================================================
  // RENDER: TAB AKSESIBILITAS
  // ==========================================================================
  const renderTabAksesibilitas = () => {
    return (
      <div className="flex flex-col h-full animate-in fade-in duration-300">
        {/* HEADER & TOOLBAR */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
          <div>
            <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight">
              Data Jarak & Waktu Tempuh Peserta Didik
            </h2>
            <p className="text-sm text-gray-500 font-medium mt-1">
              Tahun Data: <span className="font-bold text-blue-600">{selectedYear}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
            {/* Filter Wilayah */}
            <div className="relative flex-1 md:w-64">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <MapPin size={16} className="text-gray-400" />
              </div>
              <select
                value={selectedWilayah}
                onChange={(e) => setSelectedWilayah(e.target.value)}
                className="block w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none shadow-sm cursor-pointer"
              >
                {daftarWilayah.map(wilayah => (
                  <option key={wilayah} value={wilayah}>{wilayah}</option>
                ))}
              </select>
            </div>

            {/* Tombol Export */}
            <button className="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl transition-all shadow-sm active:scale-95">
              <FileSpreadsheet size={18} />
              <span className="hidden sm:inline">Unduh Excel</span>
            </button>
          </div>
        </div>

        {/* TABEL DATA */}
        <div className="flex-1 overflow-hidden bg-white border border-gray-200 rounded-2xl shadow-sm flex flex-col">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-600 font-black">
                  <th className="p-4 w-16 text-center">No</th>
                  <th className="p-4">Kecamatan</th>
                  <th className="p-4 text-right">Layak PIP</th>
                  <th className="p-4 text-right">Penerima KIP</th>
                  <th className="p-4 text-right">Selisih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {/* STATE KOSONG (Menunggu Logika Data) */}
                <tr>
                  <td colSpan="5" className="p-8 text-center text-gray-400 font-medium italic">
                    Menunggu kalkulasi data...
                  </td>
                </tr>
                {/* Contoh baris jika ada data nanti: 
                <tr className="hover:bg-blue-50/50 transition-colors">
                  <td className="p-4 text-center font-semibold text-gray-600">1</td>
                  <td className="p-4 font-bold text-gray-800">Pontianak Selatan</td>
                  <td className="p-4 text-right font-medium text-orange-600">1,250</td>
                  <td className="p-4 text-right font-medium text-green-600">1,100</td>
                  <td className="p-4 text-right font-bold text-red-600">150</td>
                </tr>
                */}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // ==========================================================================
  // RENDER: TAB KELAYAKAN PIP (Draft kosong untuk nanti)
  // ==========================================================================
  const renderTabPIP = () => {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 font-medium italic">
        Konten Kelayakan PIP akan dibangun di sini...
      </div>
    );
  };

  // ==========================================================================
  // MAIN RENDER
  // ==========================================================================
  return (
    <div className="h-full flex flex-col">
      {/* KONTROL TAB */}
      <div className="flex items-center gap-2 mb-6 border-b border-gray-200 pb-4">
        <button
          onClick={() => setActiveTab('aksesibilitas')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-sm uppercase tracking-wide transition-all ${
            activeTab === 'aksesibilitas'
              ? 'bg-blue-100 text-blue-700 shadow-sm'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
          }`}
        >
          <Map size={18} />
          Aksesibilitas
        </button>
        
        <button
          onClick={() => setActiveTab('pip')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-black text-sm uppercase tracking-wide transition-all ${
            activeTab === 'pip'
              ? 'bg-blue-100 text-blue-700 shadow-sm'
              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
          }`}
        >
          <CreditCard size={18} />
          Kelayakan PIP
        </button>
      </div>

      {/* AREA KONTEN AKTIF */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'aksesibilitas' ? renderTabAksesibilitas() : renderTabPIP()}
      </div>
    </div>
  );
}