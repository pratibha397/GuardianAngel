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
    setMsg("Security profile updated.");
    setSaving(false);
    setTimeout(() => setMsg(''), 3000);
  };

  return (
    <div className="p-4 space-y-6">
      <h2 className="text-2xl font-bold text-white mb-6">Settings</h2>
      
      <div className="bg-slate-900/50 p-6 rounded-2xl border border-white/5">
          <label className="block text-blue-400 text-xs font-bold uppercase tracking-wider mb-2">Safety Trigger</label>
          <input 
            type="text"
            className="w-full bg-black/20 border border-white/10 rounded-xl p-3 text-white mb-2 focus:border-blue-500 outline-none"
            value={phrase}
            onChange={e => setPhrase(e.target.value)}
          />
          <p className="text-xs text-gray-500">Say this phrase to instantly trigger SOS.</p>
      </div>

      <button 
        onClick={handleSave}
        disabled={saving}
        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl shadow-lg transition-all"
      >
        {saving ? 'Saving...' : 'Save Configuration'}
      </button>

      {msg && <div className="text-center text-green-400 text-sm font-medium animate-pulse">{msg}</div>}

      <div className="border-t border-white/5 pt-6 mt-8">
        <h3 className="text-gray-500 text-xs font-bold uppercase mb-4">Device Info</h3>
        <div className="bg-black/20 p-4 rounded-xl border border-white/5 space-y-2">
            <div className="flex justify-between text-sm">
                <span className="text-gray-400">Account</span>
                <span className="text-white truncate max-w-[200px]">{currentUser.email}</span>
            </div>
            <div className="flex justify-between text-sm">
                <span className="text-gray-400">Version</span>
                <span className="text-white">Sentinel v2.5.1</span>
            </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;