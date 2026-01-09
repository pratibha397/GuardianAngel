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
          setError('Invalid credentials or user not found.');
        }
      } else {
        if (!formData.name) {
          setError('Name is required for registration.');
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
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-card p-8 rounded-xl shadow-2xl border border-gray-800">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white mb-2">{isLogin ? 'Welcome Back' : 'Join Sentinel'}</h2>
        <p className="text-gray-400">Your personal safety companion.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {!isLogin && (
          <div>
            <label className="block text-gray-400 text-sm mb-1">Full Name</label>
            <input
              type="text"
              required
              className="w-full bg-dark border border-gray-700 rounded p-3 text-white focus:border-blue-500 outline-none transition"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
            />
          </div>
        )}
        <div>
          <label className="block text-gray-400 text-sm mb-1">Email Address</label>
          <input
            type="email"
            required
            className="w-full bg-dark border border-gray-700 rounded p-3 text-white focus:border-blue-500 outline-none transition"
            value={formData.email}
            onChange={e => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
        <div>
          <label className="block text-gray-400 text-sm mb-1">Password</label>
          <input
            type="password"
            required
            className="w-full bg-dark border border-gray-700 rounded p-3 text-white focus:border-blue-500 outline-none transition"
            value={formData.password}
            onChange={e => setFormData({ ...formData, password: e.target.value })}
          />
        </div>

        {error && <p className="text-danger text-sm text-center">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800 text-white font-bold py-3 rounded transition shadow-lg shadow-blue-900/20 flex justify-center items-center"
        >
          {loading ? (
             <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
          ) : (
             isLogin ? 'Login' : 'Register'
          )}
        </button>
      </form>

      <div className="mt-6 text-center">
        <button
          onClick={() => { setIsLogin(!isLogin); setError(''); }}
          className="text-gray-400 hover:text-white text-sm underline"
        >
          {isLogin ? "Don't have an account? Register" : "Already registered? Login"}
        </button>
      </div>
    </div>
  );
};

export default Auth;