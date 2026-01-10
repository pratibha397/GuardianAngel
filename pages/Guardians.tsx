import React, { useState } from 'react';
import { findUserByEmail, updateUser } from '../services/storage';
import { User } from '../types';

interface GuardiansProps {
  currentUser: User;
}

const Guardians: React.FC<GuardiansProps> = ({ currentUser }) => {
  const [emailInput, setEmailInput] = useState('');
  const [msg, setMsg] = useState<{ type: 'error' | 'success' | 'info', text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const addGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = emailInput.trim();
    if (!email) return;

    if (currentUser.guardians.includes(email)) {
        setMsg({ type: 'error', text: "Already in your unit." });
        return;
    }
    if (email.toLowerCase() === currentUser.email.toLowerCase()) {
        setMsg({ type: 'error', text: "Cannot add yourself." });
        return;
    }

    setLoading(true);
    setMsg({ type: 'info', text: "Searching secure database..." });

    try {
        // Use direct DB lookup instead of fetching all users
        const targetUser = await findUserByEmail(email);

        if (!targetUser) {
            setMsg({ type: 'error', text: "User not registered in Sentinel database." });
            setLoading(false);
            return;
        }

        const updatedUser = {
            ...currentUser,
            guardians: [...currentUser.guardians, targetUser.email]
        };
        
        await updateUser(updatedUser);
        setEmailInput('');
        setMsg({ type: 'success', text: `Unit Member ${targetUser.name} authorized.` });
    } catch (error) {
        console.error(error);
        setMsg({ type: 'error', text: "Connection error. Try again." });
    } finally {
        setLoading(false);
    }
  };

  const removeGuardian = async (email: string) => {
      if (!window.confirm(`Revoke access for ${email}?`)) return;
      const updatedUser = {
          ...currentUser,
          guardians: currentUser.guardians.filter(g => g !== email)
      };
      await updateUser(updatedUser);
      window.location.reload(); 
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Add Guardian Card */}
      <div className="bg-slate-900/50 backdrop-blur-xl p-8 rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl"></div>
        
        <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-3">
            <span className="bg-blue-600/20 text-blue-400 p-2 rounded-lg">🛡️</span>
            Add Guardian Unit
        </h2>
        <p className="text-gray-400 text-sm mb-6">
            Authorize trusted users to receive your SOS signals and live location. They must be registered on Sentinel.
        </p>

        <form onSubmit={addGuardian} className="relative z-10 space-y-4">
            <div className="relative group">
                <input 
                    type="email" 
                    placeholder="Enter agent email address"
                    className="w-full bg-black/40 border border-white/10 rounded-xl p-4 pl-12 text-white placeholder:text-gray-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                    value={emailInput}
                    onChange={e => setEmailInput(e.target.value)}
                    required
                />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 group-focus-within:text-blue-500 transition-colors">
                    ✉️
                </div>
            </div>
            
            <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-900/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
            >
                {loading ? (
                    <>
                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                        Verifying Identity...
                    </>
                ) : (
                    'Authorize Guardian'
                )}
            </button>
        </form>

        {msg && (
            <div className={`mt-4 p-3 rounded-xl text-sm font-medium border flex items-center gap-2 animate-pulse ${
                msg.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 
                msg.type === 'error' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                'bg-blue-500/10 border-blue-500/20 text-blue-400'
            }`}>
                <span>{msg.type === 'success' ? '✅' : msg.type === 'error' ? '⚠️' : 'ℹ️'}</span>
                {msg.text}
            </div>
        )}
      </div>

      {/* List */}
      <div>
          <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="text-gray-400 font-bold text-xs uppercase tracking-widest">Active Units ({currentUser.guardians.length})</h3>
            <span className="text-[10px] text-gray-600 bg-white/5 px-2 py-1 rounded">Synced</span>
          </div>

          {currentUser.guardians.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 bg-white/5 rounded-3xl border border-dashed border-white/10 opacity-50">
                  <span className="text-5xl mb-4 grayscale opacity-50">👥</span>
                  <p className="text-gray-400 text-sm">No active units deployed.</p>
              </div>
          ) : (
              <div className="space-y-3">
                  {currentUser.guardians.map((g, idx) => (
                      <div 
                        key={g} 
                        className="flex justify-between items-center bg-card/60 backdrop-blur-md p-4 rounded-2xl border border-white/5 hover:border-blue-500/30 transition-all hover:translate-x-1 group"
                        style={{ animationDelay: `${idx * 100}ms` }}
                      >
                          <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-slate-700 to-slate-800 flex items-center justify-center text-white font-bold shadow-inner border border-white/5">
                                {g[0].toUpperCase()}
                              </div>
                              <div>
                                  <div className="text-white font-medium">{g}</div>
                                  <div className="text-[10px] text-green-400 flex items-center gap-1.5 mt-0.5">
                                    <span className="relative flex h-2 w-2">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                    </span>
                                    Status: Online
                                  </div>
                              </div>
                          </div>
                          
                          <button 
                            onClick={() => removeGuardian(g)}
                            className="p-3 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                            title="Revoke Access"
                          >
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                                <path fillRule="evenodd" d="M16.5 4.478v.227a48.816 48.816 0 013.878.512.75.75 0 11-.49 1.478 47.4 47.4 0 00-15.28 0 .75.75 0 01-.49-1.478 48.809 48.809 0 013.876-.512v-.227c0-1.005.81-1.847 1.819-1.936.85-.075 1.706-.115 2.568-.115.862 0 1.718.04 2.568.115 1.01.089 1.819.93 1.819 1.936zm-3.75 2.5a.75.75 0 00-1.5 0v7a.75.75 0 001.5 0v-7z" clipRule="evenodd" />
                              </svg>
                          </button>
                      </div>
                  ))}
              </div>
          )}
      </div>
    </div>
  );
};

export default Guardians;