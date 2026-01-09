import React, { useState } from 'react';
import { findUserByEmail, updateUser } from '../services/storage';
import { User } from '../types';

interface GuardiansProps {
  currentUser: User;
}

const Guardians: React.FC<GuardiansProps> = ({ currentUser }) => {
  const [emailInput, setEmailInput] = useState('');
  const [msg, setMsg] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [loading, setLoading] = useState(false);

  const addGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailToAdd = emailInput.trim();
    if (!emailToAdd) return;
    
    if (currentUser.guardians.includes(emailToAdd)) {
        setMsg({ type: 'error', text: "User is already a guardian." });
        return;
    }
    if (emailToAdd.toLowerCase() === currentUser.email.toLowerCase()) {
        setMsg({ type: 'error', text: "You cannot add yourself." });
        return;
    }

    setLoading(true);
    setMsg(null);

    try {
        const targetUser = await findUserByEmail(emailToAdd);

        if (!targetUser) {
            setMsg({ type: 'error', text: "User not found. Check email or ask them to register." });
            setLoading(false);
            return;
        }

        const updatedUser = {
            ...currentUser,
            guardians: [...currentUser.guardians, targetUser.email] // Store the formatted email from DB
        };
        
        await updateUser(updatedUser);
        setEmailInput('');
        setMsg({ type: 'success', text: "Guardian added successfully." });
    } catch (error) {
        console.error(error);
        setMsg({ type: 'error', text: "Failed to add guardian." });
    } finally {
        setLoading(false);
    }
  };

  const removeGuardian = async (email: string) => {
      if (!window.confirm(`Remove ${email}?`)) return;
      const updatedUser = {
          ...currentUser,
          guardians: currentUser.guardians.filter(g => g !== email)
      };
      await updateUser(updatedUser);
      window.location.reload(); 
  };

  return (
    <div className="space-y-6">
      <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-sm">
        <h2 className="text-xl font-bold text-white mb-2">Manage Guardians</h2>
        <p className="text-slate-400 text-sm mb-6">
            Guardians receive immediate alerts when you trigger SOS.
        </p>

        <form onSubmit={addGuardian} className="flex gap-2">
            <input 
                type="email" 
                placeholder="Guardian's Email"
                className="flex-1 bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:border-blue-500 outline-none transition-all"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                required
            />
            <button 
                type="submit" 
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-500 px-6 rounded-xl text-white font-bold disabled:opacity-50 transition-colors"
            >
                {loading ? '...' : 'Add'}
            </button>
        </form>
        {msg && (
            <div className={`mt-4 p-3 rounded-lg text-sm font-medium ${msg.type === 'success' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                {msg.text}
            </div>
        )}
      </div>

      <div>
          <h3 className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-3 pl-1">Trusted Contacts</h3>
          {currentUser.guardians.length === 0 ? (
              <div className="bg-slate-800/50 rounded-xl p-8 text-center border border-dashed border-slate-700">
                  <p className="text-slate-500 text-sm">No guardians added.</p>
              </div>
          ) : (
              <div className="space-y-3">
                  {currentUser.guardians.map(g => (
                      <div key={g} className="flex justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700">
                          <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 font-bold">
                                {g[0].toUpperCase()}
                              </div>
                              <div>
                                  <div className="text-slate-200 font-medium">{g}</div>
                                  <div className="text-xs text-green-500 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                    Active
                                  </div>
                              </div>
                          </div>
                          <button 
                            onClick={() => removeGuardian(g)}
                            className="text-slate-500 hover:text-red-400 p-2"
                            title="Remove"
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