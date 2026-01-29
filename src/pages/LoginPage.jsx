import React, { useState } from 'react';
import { UserCheck } from 'lucide-react';
import { Lock, Eye, EyeOff, LogIn } from 'lucide-react'; 

export default function LoginPage({ onLoginSuccess, onBack }) {
    const [username, setUsername] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [password, setPassword] = useState('');

  const handleLogin = (e) => {
    e.preventDefault();
    // Logika login sesuai kode asli (User: admin / Pass: 123)
    if (username === 'admin' && password === '123') { 
      onLoginSuccess(); 
    } else { 
      alert('Gagal! User: admin / Pass: 123'); 
    }
  };

  return (
    <div className="h-screen bg-blue-900 flex items-center justify-center p-6 text-center">
      <div className="bg-white w-full max-w-lg p-12 rounded-[3rem] shadow-2xl text-center">
        <div className="bg-blue-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 text-blue-600 shadow-inner">
          <UserCheck size={48} />
        </div>
        <h2 className="text-4xl font-black text-gray-800 tracking-tight mb-10 uppercase">Admin Login</h2>
        <form onSubmit={handleLogin} className="space-y-6 text-left">
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase ml-4 tracking-widest">Username</label>
            <input 
              type="text" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              className="w-full px-8 py-5 rounded-2xl border-4 border-gray-100 focus:border-blue-500 focus:outline-none bg-gray-50 text-xl font-bold" 
              placeholder="admin" 
            />
          </div>
          
          <div className="space-y-3 text-left w-full">
  <label className="text-xs font-black text-gray-400 uppercase ml-4 tracking-widest flex items-center gap-2">
    <Lock size={14}/> Password
  </label>
  
  <div className="relative group">
    <input 
      type={showPassword ? "text" : "password"} 
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      placeholder="••••••••"
      className="w-full px-8 py-5 rounded-[2rem] border-4 border-gray-100 focus:border-blue-500 focus:outline-none bg-gray-50 text-xl font-bold transition-all"
    />
    
        {/* TOMBOL EYE TOGGLE */}
        <button 
        type="button" // Penting agar tidak trigger submit form
        onClick={() => setShowPassword(!showPassword)}
        className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 transition-colors p-2"
        >
        {showPassword ? <EyeOff size={24} /> : <Eye size={24} />}
        </button>
    </div>
    </div>
          
          <button type="submit" className="w-full bg-blue-700 text-white py-6 rounded-2xl font-black text-2xl shadow-xl hover:bg-blue-800 active:scale-95 transition-all mt-6 uppercase">Masuk</button>
          <button type="button" onClick={onBack} className="w-full text-gray-400 font-bold py-4 hover:text-gray-600 uppercase text-sm tracking-widest text-center">Kembali</button>
        </form>
      </div>
    </div>
  );
}