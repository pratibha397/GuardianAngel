import React, { useState } from 'react';
import { User } from '../types';
import { updateUser } from '../services/storage';

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
    <div className="bg-card p-6 rounded-xl border border-gray-800">
      <h2 className="text-2xl font-bold text-white mb-6">Security Settings</h2>
      
      <div className="mb-6">
          <label className="block text-gray-400 mb-2">Danger Phrase</label>
          <p className="text-xs text-gray-500 mb-2">
            The system will listen for this exact phrase when Monitoring is active. 
            Choose something unique but easy to say in distress.
          </p>
          <input 
            type="text"
            className="w-full bg-dark border border-gray-700 rounded p-3 text-white focus:border-red-500 outline-none"
            value={phrase}
            onChange={e => setPhrase(e.target.value)}
          />
      </div>

      <div className="flex items-center gap-4">
        <button 
            onClick={handleSave}
            disabled={saving}
            className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded text-white font-bold transition disabled:opacity-50"
        >
            {saving ? 'Saving...' : 'Save Changes'}
        </button>
        {msg && <span className="text-green-500 text-sm">{msg}</span>}
      </div>
    </div>
  );
};

export default Settings;