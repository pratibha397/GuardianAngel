import React, { useState } from 'react';
import { findUserByEmail, updateUser } from '../services/storage';
import { User } from '../types';

interface GuardiansProps {
  currentUser: User;
}

const Guardians: React.FC<GuardiansProps> = ({ currentUser }) => {
  const [emailInput, setEmailInput] = useState('');
  const [msg, setMsg] = useState<{type: 'success' | 'error' | 'info', text: string} | null>(null);
  const [loading, setLoading] = useState(false);

  const addGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailToAdd = emailInput.trim();
    if (!emailToAdd) return;
    
    if (currentUser.guardians.includes(emailToAdd)) {
        setMsg({ type: 'error', text: "User is already in your guardian list." });
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
            setMsg({ 
                type: 'error', 
                text: "User not found. They must register an account on this app first." 
            });
            setLoading(false);
            return;
        }

        const updatedUser = {
            ...currentUser,
            guardians: [...currentUser.guardians, targetUser.email] // Store the formatted email from DB
        };
        
        await updateUser(updatedUser);
        setEmailInput('');
        setMsg({ type: 'success', text: `Successfully added ${targetUser.name}!` });
    } catch (error) {
        console.error(error);
        setMsg({ type: 'error', text: "Network error. Please try again." });
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
        <h2 className="text-xl font-bold text-white mb-2">Add Guardian</h2>
        <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            Enter the email address of a person you trust. <br/>
            <span className="text-slate-500 italic">Note: They must also have an account on Sentinel.</span>
        </p>

        <form onSubmit={addGuardian} className="space-y-4">
            <div className="relative">
                <input 
                    type="email" 
                    placeholder="guardian@example.com"
                    className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-4 text-white placeholder:text-slate-600 focus:border-blue-500 outline-none transition-all"
                    value={emailInput}
                    onChange={e => setEmailInput(e.target.value)}
                    required
                />
            </div>
            <button 
                type="submit" 
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-xl text-white font-bold disabled:opacity-50 transition-colors shadow-lg shadow-blue-900/10"
            >
                {loading ? 'Searching User...' : 'Add Guardian'}
            </button>
        </form>
        {msg && (
            <div className={`mt-4 p-4 rounded-lg text-sm font-medium border ${
                msg.type === 'success' ? 'bg-green-900/20 text-green-400 border-green-500/20' : 
                msg.type === 'info' ? 'bg-blue-900/20 text-blue-400 border-blue-500/20' :
                'bg-red-900/20 text-red-400 border-red-500/20'
            }`}>
                {msg.text}
            </div>
        )}
      </div>

      <div>
          <h3 className="text-slate-500 font-bold text-xs uppercase tracking-wider mb-3 pl-1">Your Guardians</h3>
          {currentUser.guardians.length === 0 ? (
              <div className="bg-slate-800/50 rounded-xl p-8 text-center border border-dashed border-slate-700">
                  <span className="text-3xl block mb-2 opacity-50">👥</span>
                  <p className="text-slate-500 text-sm">You haven't added anyone yet.</p>
                  <button 
                    onClick={() => {
                        navigator.clipboard.writeText(currentUser.email);
                        setMsg({type:'info', text: 'Email copied to clipboard. Share it with your guardian.'});
                    }}
                    className="mt-4 text-blue-400 text-xs font-bold hover:underline"
                  >
                    Copy My Email to Share
                  </button>
              </div>
          ) : (
              <div className="space-y-3">
                  {currentUser.guardians.map(g => (
                      <div key={g} className="flex justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700">
                          <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-slate-700 flex items-center justify-center text-slate-300 font-bold border border-slate-600">
                                {g[0].toUpperCase()}
                              </div>
                              <div>
                                  <div className="text-slate-200 font-medium">{g}</div>
                                  <div className="text-[10px] text-green-500 flex items-center gap-1 font-bold uppercase tracking-wider">
                                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                    Connected
                                  </div>
                              </div>
                          </div>
                          <button 
                            onClick={() => removeGuardian(g)}
                            className="text-slate-500 hover:text-red-400 p-2 hover:bg-red-500/10 rounded-lg transition-colors"
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