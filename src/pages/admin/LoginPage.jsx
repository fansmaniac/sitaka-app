import React, { useState } from 'react';
import { UserCheck, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../firebase/config'; // Pastikan path ini benar menuju file config firebase kamu

export default function LoginPage({ onBack }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    console.log("🔥 1. Tombol login ditekan. Memulai proses...");

    try {
      // --- LOGIKA ALIAS USERNAME ---
      // Jika user mengetik 'admin', ubah ke email lengkap
      const emailToLogin = username.toLowerCase() === 'admin' 
        ? 'admin@bpmpkalbar.id' 
        : username;
        
      console.log(`Mencoba login Firebase Auth dengan email: ${emailToLogin}`);

      // Eksekusi Login Firebase dan simpan hasilnya ke variabel
      const userCredential = await signInWithEmailAndPassword(auth, emailToLogin, password);
      
      console.log("✅ 2. Login Firebase Auth Berhasil! UID:", userCredential.user.uid);
      // Jika berhasil, onAuthStateChanged di App.jsx akan otomatis mengarahkan ke dashboard
      
    } catch (err) {
      console.error("❌ 3. ERROR LOGIN AUTH:", err.code, err.message);
      // Menampilkan pesan error asli dari Firebase ke UI agar ketahuan masalahnya
      setError(`Username/Password salah atau: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen bg-blue-900 flex items-center justify-center p-6 text-center">
      <div className="bg-white w-full max-w-lg p-12 rounded-[3rem] shadow-2xl text-center">
        <div className="bg-blue-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 text-blue-600 shadow-inner">
          <UserCheck size={48} />
        </div>
        
        <h2 className="text-4xl font-black text-gray-800 tracking-tight mb-8 uppercase">Admin Login</h2>
        
        {/* Pesan Error */}
        {error && (
          <div className="bg-red-50 text-red-600 p-4 rounded-xl mb-6 font-bold text-sm border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6 text-left">
          <div className="space-y-2">
            <label className="text-xs font-black text-gray-400 uppercase ml-4 tracking-widest">Username</label>
            <input 
              type="text" 
              value={username} 
              onChange={(e) => setUsername(e.target.value)} 
              className="w-full px-8 py-5 rounded-2xl border-4 border-gray-100 focus:border-blue-500 focus:outline-none bg-gray-50 text-xl font-bold transition-all" 
              placeholder="admin"
              required
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
                required
              />
              
              <button 
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-6 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 transition-colors p-2"
              >
                {showPassword ? <EyeOff size={24} /> : <Eye size={24} />}
              </button>
            </div>
          </div>
          
          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-blue-700 text-white py-6 rounded-2xl font-black text-2xl shadow-xl hover:bg-blue-800 active:scale-95 transition-all mt-6 uppercase flex items-center justify-center gap-3"
          >
            {loading ? <Loader2 className="animate-spin" size={24} /> : "Masuk"}
          </button>
          
          <button 
            type="button" 
            onClick={onBack} 
            className="w-full text-gray-400 font-bold py-4 hover:text-gray-600 uppercase text-sm tracking-widest text-center"
          >
            Kembali
          </button>
        </form>
      </div>
    </div>
  );
}