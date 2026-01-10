import React, { useEffect, useState } from 'react';
import { findUserByEmail, updateUser } from '../services/storage';
import { User } from '../types';

interface GuardiansProps {
  currentUser: User;
}

const Guardians: React.FC<GuardiansProps> = ({ currentUser }) => {
  const [emailInput, setEmailInput] = useState('');
  const [msg, setMsg] = useState<{type: 'success' | 'error' | 'info', text: string} | null>(null);
  const [loading, setLoading] = useState(false);
  
  // State to hold detailed guardian profiles (names, etc.)
  const [guardianProfiles, setGuardianProfiles] = useState<User[]>([]);
  const [loadingProfiles, setLoadingProfiles] = useState(false);

  // Fetch full details of guardians on mount
  useEffect(() => {
      const fetchProfiles = async () => {
          setLoadingProfiles(true);
          const profiles: User[] = [];
          for (const email of currentUser.guardians) {
              try {
                  const user = await findUserByEmail(email);
                  if (user) profiles.push(user);
                  else profiles.push({ name: 'Unknown', email: email } as User); // Fallback
              } catch (e) { console.error(e); }
          }
          setGuardianProfiles(profiles);
          setLoadingProfiles(false);
      };
      if (currentUser.guardians.length > 0) fetchProfiles();
      else setGuardianProfiles([]);
  }, [currentUser.guardians]);

  const addGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailToAdd = emailInput.trim();
    if (!emailToAdd) return;
    
    if (currentUser.guardians.includes(emailToAdd)) {
        setMsg({ type: 'error', text: "Already in your unit." });
        return;
    }
    if (emailToAdd.toLowerCase() === currentUser.email.toLowerCase()) {
        setMsg({ type: 'error', text: "Cannot add yourself." });
        return;
    }

    setLoading(true);
    setMsg(null);

    try {
        const targetUser = await findUserByEmail(emailToAdd);

        if (!targetUser) {
            setMsg({ 
                type: 'error', 
                text: "User not found. They must register first." 
            });
            setLoading(false);
            return;
        }

        const updatedUser = {
            ...currentUser,
            guardians: [...currentUser.guardians, targetUser.email]
        };
        
        await updateUser(updatedUser);
        setEmailInput('');
        setMsg({ type: 'success', text: `Unit Updated: ${targetUser.name} added.` });
    } catch (error) {
        console.error(error);
        setMsg({ type: 'error', text: "Connection failure." });
    } finally {
        setLoading(false);
    }
  };

  const removeGuardian = async (email: string) => {
      if (!window.confirm(`Detach ${email} from unit?`)) return;
      const updatedUser = {
          ...currentUser,
          guardians: currentUser.guardians.filter(g => g !== email)
      };
      await updateUser(updatedUser);
      window.location.reload(); 
  };

  return (
    <div className="space-y-8">
      {/* Add Section */}
      <div className="bg-zinc-900/50 backdrop-blur-sm p-6 rounded-3xl border border-zinc-700/50 shadow-xl">
        <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <span className="text-blue-500">➕</span> Add Unit Member
            </h2>
        </div>

        <form onSubmit={addGuardian} className="space-y-4 relative">
            <div className="relative group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-cyan-600 rounded-xl opacity-20 group-hover:opacity-40 transition duration-500"></div>
                <input 
                    type="email" 
                    placeholder="Enter agent email..."
                    className="relative w-full bg-black border border-zinc-800 rounded-xl px-5 py-4 text-white placeholder:text-zinc-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all font-mono text-sm"
                    value={emailInput}
                    onChange={e => setEmailInput(e.target.value)}
                    required
                />
            </div>
            
            {msg && (
                <div className={`text-xs font-mono p-2 rounded border ${
                    msg.type === 'success' ? 'bg-green-900/20 text-green-400 border-green-500/20' : 
                    'bg-red-900/20 text-red-400 border-red-500/20'
                }`}>
                    {msg.type === 'error' && <span className="font-bold mr-1">ERROR:</span>}
                    {msg.text}
                </div>
            )}

            <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-xl text-white font-bold uppercase tracking-widest text-xs shadow-lg shadow-blue-900/20 transition-all"
            >
                {loading ? 'Verifying Identity...' : 'Authorize User'}
            </button>
        </form>
      </div>

      {/* List Section */}
      <div>
          <h3 className="text-zinc-500 font-bold text-[10px] uppercase tracking-[0.2em] mb-4 pl-1">Active Guardians</h3>
          
          {loadingProfiles ? (
              <div className="text-center py-8 text-zinc-600 text-xs animate-pulse">Loading Unit Data...</div>
          ) : guardianProfiles.length === 0 ? (
              <div className="bg-zinc-900/30 rounded-2xl p-8 text-center border border-dashed border-zinc-800">
                  <p className="text-zinc-500 text-sm mb-4">No active guardians assigned.</p>
                  <button 
                    onClick={() => {
                        navigator.clipboard.writeText(currentUser.email);
                        setMsg({type:'info', text: 'ID Copied.'});
                    }}
                    className="text-blue-400 text-xs font-mono hover:text-white transition-colors border-b border-blue-400/30 pb-0.5"
                  >
                    Copy My ID: {currentUser.email}
                  </button>
              </div>
          ) : (
              <div className="grid gap-3">
                  {guardianProfiles.map((g, idx) => (
                      <div key={idx} className="flex justify-between items-center bg-zinc-900 p-4 rounded-2xl border border-zinc-800 hover:border-zinc-600 transition-all group">
                          <div className="flex items-center gap-4">
                              <div className="w-12 h-12 rounded-full bg-gradient-to-b from-zinc-700 to-zinc-800 flex items-center justify-center text-white font-bold border border-zinc-600 shadow-inner text-lg">
                                {g.name ? g.name[0].toUpperCase() : '?'}
                              </div>
                              <div>
                                  <div className="text-white font-bold text-sm">{g.name}</div>
                                  <div className="text-[10px] text-zinc-500 font-mono">{g.email}</div>
                              </div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                              <span className="w-2 h-2 bg-green-500 rounded-full shadow-[0_0_8px_#22c55e]"></span>
                              <button 
                                onClick={() => removeGuardian(g.email)}
                                className="text-zinc-600 hover:text-red-400 transition-colors"
                                title="Remove"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                                    <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                                </svg>
                              </button>
                          </div>
                      </div>
                  ))}
              </div>
          )}
      </div>
    </div>
  );
};

export default Guardians;