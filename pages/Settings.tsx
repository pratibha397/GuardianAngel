import React, { useState } from 'react';
import { updateUser } from '../services/storage';
import { User } from '../types';

interface SettingsProps {
  currentUser: User;
}

const Settings: React.FC<SettingsProps> = ({ currentUser }) => {
  const [phrase, setPhrase] = useState(currentUser.dangerPhrase);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!phrase.trim()) {
        setMsg("Phrase cannot be empty.");
        return;
    }
    setSaving(true);
    const updated = { ...currentUser, dangerPhrase: phrase };
    await updateUser(updated);
    setMsg("Settings saved successfully.");
    setSaving(false);
    setTimeout(() => setMsg(''), 3000);
  };

  return (
  <div className="bg-card/40 backdrop-blur-md p-8 rounded-3xl border border-white/5 shadow-xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

      <h2 className="text-3xl font-bold text-white mb-8 flex items-center gap-3">
        <span className="bg-slate-700/50 p-2 rounded-xl text-2xl">⚙️</span>
        Security Settings
      </h2>
      
      <div className="mb-8 p-6 bg-slate-800/30 rounded-2xl border border-white/5 hover:border-blue-500/20 transition-colors">
          <label className="block text-blue-400 text-sm font-bold uppercase tracking-wider mb-3">Danger Trigger Phrase</label>
          <div className="relative"><input type="text" className="w-full bg-slate-900/50 border border-white/10 rounded-xl p-4 pl-12 text-white text-lg focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all placeholder:text-gray-600"
                value={phrase}
                onChange={e => setPhrase(e.target.value)}
                placeholder="e.g. Help me now"
              />
              <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                🎤
              </div>
          </div>
          <p className="text-xs text-gray-500 mt-3 leading-relaxed">
            The system continuously monitors for this phrase when "Active Shield" is enabled. 
            Choose a phrase that is unique but natural to say in an emergency.
          </p>
      </div>

      <div className="flex items-center gap-4">
        <button 
            onClick={handleSave}
            disabled={saving}
            className={`flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold py-4 rounded-xl shadow-lg shadow-blue-900/20 transition-all transform active:scale-95 disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2`}
        >
            {saving ? (
                <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Saving...
                </>
            ) : (
                'Save Changes'
            )}
        </button>
      </div>
      
      {msg && (
        <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 text-green-400 rounded-xl text-center text-sm font-medium animate-fade-in">
            {msg}
        </div>
      )}

      <div className="mt-12 pt-8 border-t border-white/5">
        <h3 className="text-gray-400 text-sm font-bold uppercase mb-4">Account</h3>
        <div className="text-gray-500 text-sm">
            <p>Email: <span className="text-gray-300">{currentUser.email}</span></p>
            <p className="mt-2">User ID: <span className="font-mono text-xs opacity-50">{currentUser.id}</span></p>
        </div>
      </div>
    </div>
  );
};

export default Settings;