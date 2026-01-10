import React, { useState } from 'react';
import { loginUser, registerUser } from '../services/storage';
import { User } from '../types';

interface AuthProps {
  onLogin: (user: User) => void;
}

const Auth: React.FC<AuthProps> = ({ onLogin }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        const user = await loginUser(formData.email, formData.password);
        if (user) {
          onLogin(user);
        } else {
          setError('Invalid credentials.');
        }
      } else {
        if (!formData.name) {
          setError('Name is required.');
          setLoading(false);
          return;
        }
        const user = await registerUser({ name: formData.name, email: formData.email, password: formData.password });
        if (user) {
          onLogin(user);
        } else {
          setError('User already exists.');
        }
      }
    } catch (err) {
      console.error(err);
      setError('Connection error. Using offline mode.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-black relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:50px_50px] [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,#000_70%,transparent_100%)]"></div>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-[100px] animate-pulse-slow"></div>
      </div>

      <div className="w-full max-w-sm relative z-10">
        <div className="mb-8 text-center animate-fade-in-down">
            <div className="relative inline-flex items-center justify-center w-20 h-20 mb-6 group">
                <div className="absolute inset-0 bg-blue-600 rounded-2xl rotate-6 opacity-20 group-hover:rotate-12 transition-transform duration-500"></div>
                <div className="absolute inset-0 bg-blue-600 rounded-2xl -rotate-6 opacity-20 group-hover:-rotate-12 transition-transform duration-500"></div>
                <div className="relative bg-zinc-900 border border-zinc-700 w-full h-full rounded-2xl flex items-center justify-center shadow-2xl shadow-blue-500/20">
                    <span className="text-4xl filter drop-shadow-[0_0_10px_rgba(59,130,246,0.5)]">🛡️</span>
                </div>
            </div>
            <h1 className="text-3xl font-black text-white tracking-tight mb-2">SENTINEL</h1>
            <p className="text-zinc-500 text-sm font-mono tracking-widest uppercase">Secure Access Terminal</p>
        </div>

        <div className="bg-zinc-900/80 backdrop-blur-xl border border-white/5 rounded-3xl p-8 shadow-2xl transform transition-all duration-500 hover:shadow-blue-900/20">
            <form onSubmit={handleSubmit} className="space-y-5">
                {/* Mode Toggle Tabs */}
                <div className="flex bg-zinc-950/50 p-1 rounded-xl mb-6 border border-white/5">
                    <button
                        type="button"
                        onClick={() => { setIsLogin(true); setError(''); }}
                        className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-300 ${isLogin ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        Login
                    </button>
                    <button
                        type="button"
                        onClick={() => { setIsLogin(false); setError(''); }}
                        className={`flex-1 py-2 text-xs font-bold uppercase tracking-wider rounded-lg transition-all duration-300 ${!isLogin ? 'bg-zinc-800 text-white shadow-lg' : 'text-zinc-500 hover:text-zinc-300'}`}
                    >
                        Register
                    </button>
                </div>

                <div className={`space-y-4 transition-all duration-300 ${loading ? 'opacity-50 pointer-events-none' : ''}`}>
                    {!isLogin && (
                    <div className="group">
                        <label className="block text-blue-400 text-[10px] font-bold uppercase tracking-wider mb-1.5 ml-1">Identity Name</label>
                        <input
                        type="text"
                        required
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder:text-zinc-800 focus:bg-zinc-900"
                        value={formData.name}
                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                        />
                    </div>
                    )}
                    <div className="group">
                    <label className="block text-blue-400 text-[10px] font-bold uppercase tracking-wider mb-1.5 ml-1">Access Email</label>
                    <input
                        type="email"
                        required
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder:text-zinc-800 focus:bg-zinc-900"
                        value={formData.email}
                        onChange={e => setFormData({ ...formData, email: e.target.value })}
                    />
                    </div>
                    <div className="group">
                    <label className="block text-blue-400 text-[10px] font-bold uppercase tracking-wider mb-1.5 ml-1">Passcode</label>
                    <input
                        type="password"
                        required
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3.5 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder:text-zinc-800 focus:bg-zinc-900"
                        value={formData.password}
                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                    />
                    </div>
                </div>

                {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 animate-pulse">
                        <span className="text-red-500 text-lg">⚠️</span>
                        <span className="text-red-400 text-xs font-bold">{error}</span>
                    </div>
                )}

                <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl transition-all shadow-lg shadow-blue-900/20 flex justify-center items-center mt-4 transform active:scale-[0.98] disabled:opacity-70 disabled:cursor-wait group relative overflow-hidden"
                >
                {loading ? (
                    <div className="flex items-center gap-2">
                         <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                         <span className="text-xs uppercase tracking-widest">Authenticating...</span>
                    </div>
                ) : (
                    <span className="flex items-center gap-2">
                        {isLogin ? 'INITIALIZE SESSION' : 'REGISTER AGENT'}
                        <svg className="w-4 h-4 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                        </svg>
                    </span>
                )}
                </button>
            </form>
        </div>
        
        <div className="mt-8 text-center text-zinc-600 text-[10px] font-mono uppercase tracking-widest">
            System Version 2.4.0 • Encrypted
        </div>
      </div>
    </div>
  );
};

export default Auth;