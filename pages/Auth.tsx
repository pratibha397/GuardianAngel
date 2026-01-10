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

    // Artificial delay to prevent UI flicker on super fast local auth, 
    // but fast enough to feel instant.
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
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-zinc-950">
      <div className="w-full max-w-sm">
        <div className="mb-10 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-xl shadow-lg shadow-blue-900/20 mb-6">
                <span className="text-3xl">🛡️</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight mb-2">SENTINEL</h1>
            <p className="text-zinc-500 text-sm">Personal Security & Response System</p>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
            <form onSubmit={handleSubmit} className="space-y-5">
                {!isLogin && (
                <div>
                    <label className="block text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">Full Name</label>
                    <input
                    type="text"
                    required
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition-all placeholder:text-zinc-700"
                    placeholder="John Doe"
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    />
                </div>
                )}
                <div>
                <label className="block text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">Email</label>
                <input
                    type="email"
                    required
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition-all placeholder:text-zinc-700"
                    placeholder="name@example.com"
                    value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })}
                />
                </div>
                <div>
                <label className="block text-zinc-400 text-xs font-bold uppercase tracking-wider mb-2">Password</label>
                <input
                    type="password"
                    required
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:border-blue-600 focus:ring-1 focus:ring-blue-600 outline-none transition-all placeholder:text-zinc-700"
                    placeholder="••••••••"
                    value={formData.password}
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                />
                </div>

                {error && <div className="p-3 bg-red-900/20 border border-red-900/50 rounded-lg text-red-400 text-xs font-medium text-center">{error}</div>}

                <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-lg transition-all shadow-lg shadow-blue-900/20 flex justify-center items-center mt-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                {loading ? (
                    <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                ) : (
                    isLogin ? 'Access System' : 'Create Account'
                )}
                </button>
            </form>
        </div>

        <div className="mt-8 text-center">
            <button
            onClick={() => { setIsLogin(!isLogin); setError(''); }}
            className="text-zinc-500 hover:text-white text-sm font-medium transition-colors"
            >
            {isLogin ? "New user? Create an account" : "Existing user? Sign In"}
            </button>
        </div>
      </div>
      
      <div className="fixed bottom-6 text-zinc-700 text-xs">
          v2.1.0 • Secure Connection
      </div>
    </div>
  );
};

export default Auth;