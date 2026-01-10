import React, { useEffect, useState } from 'react';
import { findUserByEmail } from '../services/storage';
import { User } from '../types';

interface GuardiansProps {
  currentUser: User;
  onUserUpdated: (user: User) => void;
}

const Guardians: React.FC<GuardiansProps> = ({ currentUser, onUserUpdated }) => {
  const [emailInput, setEmailInput] = useState('');
  const [msg, setMsg] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [loading, setLoading] = useState(false);
  const [guardianProfiles, setGuardianProfiles] = useState<{name: string, email: string}[]>([]);

  // Fetch guardian profiles on mount or when list changes
  useEffect(() => {
    const loadGuardians = async () => {
        const list = currentUser.guardians || [];
        const profiles = [];
        
        for (const email of list) {
            const user = await findUserByEmail(email);
            if (user) {
                profiles.push({ name: user.name, email: user.email });
            } else {
                profiles.push({ name: "Unregistered User", email: email });
            }
        }
        setGuardianProfiles(profiles);
    };
    loadGuardians();
  }, [currentUser.guardians]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    
    const target = emailInput.trim().toLowerCase();

    // Validations
    if (!target) { setLoading(false); return; }
    if (target === currentUser.email) {
        setMsg({type: 'error', text: "You cannot add yourself."});
        setLoading(false);
        return;
    }
    if (currentUser.guardians && currentUser.guardians.includes(target)) {
        setMsg({type: 'error', text: "This user is already a guardian."});
        setLoading(false);
        return;
    }

    // DB Check
    try {
        const user = await findUserByEmail(target);
        if (!user) {
            setMsg({type: 'error', text: "User not found. They must register on the app first."});
        } else {
            // Success
            const updatedGuardians = [...(currentUser.guardians || []), target];
            const updatedUser = { ...currentUser, guardians: updatedGuardians };
            onUserUpdated(updatedUser);
            setMsg({type: 'success', text: `Added ${user.name} to guardians.`});
            setEmailInput('');
        }
    } catch (e) {
        setMsg({type: 'error', text: "Connection error."});
    }
    setLoading(false);
  };

  const handleRemove = (email: string) => {
      if (confirm(`Remove ${email} from guardians?`)) {
          const updated = (currentUser.guardians || []).filter(e => e !== email);
          onUserUpdated({ ...currentUser, guardians: updated });
      }
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/60 backdrop-blur border border-white/5 p-6 rounded-3xl shadow-xl">
          <h2 className="text-2xl font-bold text-white mb-2">Add Guardian</h2>
          <p className="text-gray-400 text-sm mb-4">Enter the email of a registered user to add them to your safety network.</p>
          
          <form onSubmit={handleAdd} className="relative">
              <input 
                type="email" 
                required
                className="w-full bg-slate-900 border border-white/10 rounded-xl p-4 pr-32 text-white focus:border-blue-500 outline-none transition-all placeholder:text-gray-600"
                placeholder="guardian@example.com"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
              />
              <button 
                type="submit"
                disabled={loading}
                className="absolute right-2 top-2 bottom-2 bg-blue-600 hover:bg-blue-500 text-white px-6 rounded-lg font-bold shadow-lg transition-all disabled:opacity-50"
              >
                  {loading ? '...' : 'Add'}
              </button>
          </form>
          
          {msg && (
              <div className={`mt-4 p-3 rounded-xl text-sm font-bold border ${msg.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'} animate-fade-in`}>
                  {msg.text}
              </div>
          )}
      </div>

      <div className="space-y-3">
          <h3 className="text-gray-500 font-bold text-xs uppercase tracking-wider pl-2">Your Trusted Guardians</h3>
          
          {guardianProfiles.length === 0 ? (
              <div className="text-center py-10 bg-white/5 rounded-2xl border border-dashed border-white/10">
                  <p className="text-gray-500">No guardians yet.</p>
              </div>
          ) : (
              guardianProfiles.map(p => (
                  <div key={p.email} className="bg-card/80 p-4 rounded-xl flex items-center justify-between border border-white/5 hover:border-white/10 transition-colors">
                      <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-r from-cyan-500 to-blue-500 flex items-center justify-center text-white font-bold shadow-lg">
                              {p.name[0]?.toUpperCase()}
                          </div>
                          <div>
                              <div className="text-white font-bold">{p.name}</div>
                              <div className="text-gray-500 text-xs">{p.email}</div>
                          </div>
                      </div>
                      <button 
                        onClick={() => handleRemove(p.email)}
                        className="text-gray-500 hover:text-red-400 hover:bg-red-400/10 p-2 rounded-lg transition-all"
                        title="Remove"
                      >
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                            <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                          </svg>
                      </button>
                  </div>
              ))
          )}
      </div>
    </div>
  );
};

export default Guardians;