import React, { useState } from 'react';
import { findUserByEmail, updateUser } from '../services/storage';
import { User } from '../types';

interface GuardiansProps {
  currentUser: User;
}

const Guardians: React.FC<GuardiansProps> = ({ currentUser }) => {
  const [emailInput, setEmailInput] = useState('');
  const [msg, setMsg] = useState<{text: string, type: 'success' | 'error'} | null>(null);
  const [loading, setLoading] = useState(false);

  const addGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    
    const targetEmail = emailInput.toLowerCase().trim();

    if (!targetEmail) return;
    if (currentUser.guardians.includes(targetEmail)) {
        setMsg({text: "User is already a guardian.", type: 'error'});
        return;
    }
    if (targetEmail === currentUser.email) {
        setMsg({text: "You cannot add yourself.", type: 'error'});
        return;
    }

    setLoading(true);

    try {
        // Efficient network lookup
        const targetUser = await findUserByEmail(targetEmail);

        if (!targetUser) {
            setMsg({text: "User not found. They must register on the app first.", type: 'error'});
            setLoading(false);
            return;
        }

        const updatedUser = {
            ...currentUser,
            guardians: [...currentUser.guardians, targetEmail]
        };
        
        await updateUser(updatedUser);
        setEmailInput('');
        setMsg({text: "Guardian added successfully.", type: 'success'});
    } catch (error) {
        console.error(error);
        setMsg({text: "Network error. Please try again.", type: 'error'});
    } finally {
        setLoading(false);
    }
  };

  const removeGuardian = async (email: string) => {
      if (!window.confirm(`Remove ${email} from guardians?`)) return;
      
      const updatedUser = {
          ...currentUser,
          guardians: currentUser.guardians.filter(g => g !== email)
      };
      await updateUser(updatedUser);
      // Force reload to refresh state if needed, or we could pass a callback from parent
      window.location.reload(); 
  };

  return (
    <div className="space-y-6">
      <div className="bg-card/40 backdrop-blur-md p-8 rounded-3xl border border-white/5 shadow-xl relative overflow-hidden group">
        <h2 className="text-3xl font-bold text-white mb-2 tracking-tight">Manage Guardians</h2>
        <p className="text-gray-400 text-sm mb-6 max-w-md leading-relaxed">
            Guardians receive your SOS alerts and messages.
        </p>

        <form onSubmit={addGuardian} className="relative z-10 flex gap-3 max-w-lg">
            <input 
                type="email" 
                placeholder="Enter guardian email"
                className="flex-1 bg-slate-800/50 border border-white/10 rounded-2xl p-4 text-white placeholder:text-gray-500 focus:border-blue-500 outline-none transition-all"
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
        {msg && (
            <div className={`mt-4 p-3 rounded-xl text-sm font-bold border ${msg.type === 'success' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400'}`}>
                {msg.text}
            </div>
        )}
      </div>

      <div className="grid gap-4">
          <h3 className="text-gray-400 font-bold text-sm uppercase tracking-wider ml-2">Trusted Contacts ({currentUser.guardians.length})</h3>
          {currentUser.guardians.length === 0 ? (
              <div className="text-center py-12 bg-white/5 rounded-3xl border border-dashed border-white/10">
                  <span className="text-4xl block mb-2 opacity-50">👥</span>
                  <p className="text-gray-400 text-sm">No guardians added yet.<br/>Add someone you trust above.</p>
              </div>
          ) : (
              <div className="grid gap-3">
                  {currentUser.guardians.map(g => (
                      <div key={g} className="flex justify-between items-center bg-card/60 backdrop-blur-sm p-4 rounded-2xl border border-white/5 hover:border-blue-500/30 transition-all group">
                          <div className="flex items-center gap-4">
                              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center text-white font-bold shadow-lg">
                                {g[0].toUpperCase()}
                              </div>
                              <div>
                                  <div className="text-gray-200 font-medium">{g}</div>
                                  <div className="text-xs text-green-400 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
                                    Verified
                                  </div>
                              </div>
                          </div>
                          <button 
                            onClick={() => removeGuardian(g)}
                            className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-all"
                          >
                              Remove
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