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

  // Robustly load guardians. 
  // FIX: Even if user lookup fails, we MUST show the email in the list.
  useEffect(() => {
    const loadGuardians = async () => {
        const list = currentUser.guardians || [];
        const profiles = [];
        
        for (const email of list) {
            let user = null;
            try {
                user = await findUserByEmail(email);
            } catch (e) {
                console.warn(`Could not fetch details for ${email}`);
            }

            profiles.push({ 
                name: user ? user.name : "Contact", 
                email: email 
            });
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

    // Try to find user, but allow adding even if offline/check fails to ensure UX responsiveness? 
    // No, we should verify existence for safety app.
    try {
        const user = await findUserByEmail(target);
        if (!user) {
            setMsg({type: 'error', text: "User not found. Ask them to register first."});
        } else {
            const updatedGuardians = [...(currentUser.guardians || []), target];
            const updatedUser = { ...currentUser, guardians: updatedGuardians };
            onUserUpdated(updatedUser);
            setMsg({type: 'success', text: `Added ${user.name} successfully.`});
            setEmailInput('');
        }
    } catch (e) {
        setMsg({type: 'error', text: "Connection error. Please try again."});
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
          <p className="text-gray-400 text-sm mb-4">Enter the email of a registered user.</p>
          
          <form onSubmit={handleAdd} className="relative">
              <input 
                type="email" 
                required
                className="w-full bg-slate-900 border border-white/10 rounded-xl p-4 pr-32 text-white focus:border-blue-500 outline-none transition-all placeholder:text-gray-600"
                placeholder="email@example.com"
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
                              {p.name[0]?.toUpperCase() || '?'}
                          </div>
                          <div>
                              <div className="text-white font-bold">{p.name}</div>
                              <div className="text-gray-500 text-xs">{p.email}</div>
                          </div>
                      </div>
                      <button 
                        onClick={() => handleRemove(p.email)}
                        className="text-gray-500 hover:text-red-400 hover:bg-red-400/10 p-2 rounded-lg transition-all"
                      >
                          Remove
                      </button>
                  </div>
              ))
          )}
      </div>
    </div>
  );
};

export default Guardians;
