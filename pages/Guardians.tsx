import React, { useState } from 'react';
import { findUserByEmail } from '../services/storage';
import { User } from '../types';

interface GuardiansProps {
  currentUser: User;
  onUserUpdated: (user: User) => void;
}

const Guardians: React.FC<GuardiansProps> = ({ currentUser, onUserUpdated }) => {
  const [emailInput, setEmailInput] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  // Safety check
  const guardianList = currentUser.guardians || [];

  const addGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    if (guardianList.includes(emailInput)) {
        setMsg("User is already a guardian.");
        return;
    }

    setLoading(true);
    setMsg('');

    try {
        // Use the new remote lookup function
        const targetUser = await findUserByEmail(emailInput);

        if (!targetUser) {
            setMsg("User not found. They must register first.");
            setLoading(false);
            return;
        }

        if (targetUser.email === currentUser.email) {
            setMsg("You cannot add yourself.");
            setLoading(false);
            return;
        }

        const updatedUser = {
            ...currentUser,
            guardians: [...guardianList, emailInput]
        };
        
        // Use the callback provided by App.tsx to update state immediately
        onUserUpdated(updatedUser);

        setEmailInput('');
        setMsg("Guardian added successfully.");
    } catch (error) {
        console.error(error);
        setMsg("Failed to add guardian.");
    } finally {
        setLoading(false);
    }
  };

  const removeGuardian = async (email: string) => {
      if (!window.confirm(`Remove ${email} from guardians?`)) return;
      
      const updatedUser = {
          ...currentUser,
          guardians: guardianList.filter(g => g !== email)
      };
      
      onUserUpdated(updatedUser);
  };

  return (
    <div className="space-y-6">
      <div className="bg-card/40 backdrop-blur-md p-8 rounded-3xl border border-white/5 shadow-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-32 h-32">
                <path fillRule="evenodd" d="M12.516 2.17a.75.75 0 00-1.032 0 11.209 11.209 0 01-7.877 3.08.75.75 0 00-.722.515A12.74 12.74 0 002.25 9.75c0 5.942 4.064 10.933 9.563 12.348a.749.749 0 00.374 0c5.499-1.415 9.563-6.406 9.563-12.348 0-1.352-.272-2.636-.759-3.807a.75.75 0 00-.724-.516 11.209 11.209 0 01-7.75-3.256zM8.25 10.5a.75.75 0 000 1.5h7.5a.75.75 0 000-1.5h-7.5z" clipRule="evenodd" />
            </svg>
        </div>

        <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Manage Guardians</h2>
        <p className="text-gray-400 text-sm mb-6 max-w-md leading-relaxed">
            Guardians are your safety net. They receive instant SOS alerts, live location tracking, and audio feeds during emergencies.
        </p>

        <form onSubmit={addGuardian} className="relative z-10 flex gap-3 max-w-lg">
            <input 
                type="email" 
                placeholder="Enter guardian email"
                className="flex-1 bg-slate-800/50 border border-white/10 rounded-2xl p-4 text-white placeholder:text-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                required
            />
            <button 
                type="submit" 
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-500 px-8 rounded-2xl text-white font-bold disabled:opacity-50 shadow-lg shadow-blue-900/20 transition-all hover:scale-105"
            >
                {loading ? '...' : 'Add'}
            </button>
        </form>
        {msg && <p className={`mt-4 text-sm font-medium animate-fade-in ${msg.includes('success') ? 'text-green-400' : 'text-amber-400'}`}>{msg}</p>}
      </div>

      <div className="grid gap-4">
          <h3 className="text-gray-400 font-bold text-sm uppercase tracking-wider ml-2">Trusted Contacts ({guardianList.length})</h3>
          {guardianList.length === 0 ? (
              <div className="text-center py-12 bg-white/5 rounded-3xl border border-dashed border-white/10">
                  <span className="text-4xl block mb-2 opacity-50">👥</span>
                  <p className="text-gray-400 text-sm">No guardians added yet.<br/>Add someone you trust above.</p>
              </div>
          ) : (
              <div className="grid gap-3">
                  {guardianList.map(g => (
                      <div key={g} className="flex justify-between items-center bg-card/60 backdrop-blur-sm p-4 rounded-2xl border border-white/5 hover:border-blue-500/30 transition-all group">
                          <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold shadow-lg">
                                {g[0].toUpperCase()}
                              </div>
                              <div>
                                  <div className="text-gray-200 font-medium">{g}</div>
                                  <div className="text-xs text-green-400 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
                                    Active
                                  </div>
                              </div>
                          </div>
                          <button 
                            onClick={() => removeGuardian(g)}
                            className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                            title="Remove Guardian"
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