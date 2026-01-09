import React, { useState } from 'react';
import { User } from '../types';
import { getUsers, updateUser } from '../services/storage';

interface GuardiansProps {
  currentUser: User;
}

const Guardians: React.FC<GuardiansProps> = ({ currentUser }) => {
  const [emailInput, setEmailInput] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const addGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    if (currentUser.guardians.includes(emailInput)) {
        setMsg("User is already a guardian.");
        return;
    }

    setLoading(true);
    setMsg('');

    try {
        const allUsers = await getUsers();
        const targetUser = allUsers.find(u => u.email === emailInput);

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
            guardians: [...currentUser.guardians, emailInput]
        };
        
        await updateUser(updatedUser);
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
          guardians: currentUser.guardians.filter(g => g !== email)
      };
      await updateUser(updatedUser);
      // Force reload to refresh current user state from storage
      window.location.reload(); 
  };

  return (
    <div className="space-y-6">
      <div className="bg-card p-6 rounded-xl border border-gray-800">
        <h2 className="text-2xl font-bold text-white mb-4">Manage Guardians</h2>
        <p className="text-gray-400 text-sm mb-6">
            Guardians will receive your SOS alerts and Live Location. 
            They must be registered users of this app.
        </p>

        <form onSubmit={addGuardian} className="flex gap-2">
            <input 
                type="email" 
                placeholder="Guardian Email"
                className="flex-1 bg-dark border border-gray-700 rounded p-3 text-white focus:border-blue-500 outline-none"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
                required
            />
            <button 
                type="submit" 
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 px-6 rounded text-white font-bold disabled:opacity-50"
            >
                {loading ? '...' : 'Add'}
            </button>
        </form>
        {msg && <p className="mt-2 text-sm text-yellow-500">{msg}</p>}
      </div>

      <div className="bg-card p-6 rounded-xl border border-gray-800">
          <h3 className="text-white font-bold mb-4">Your Circle</h3>
          {currentUser.guardians.length === 0 ? (
              <p className="text-gray-500 italic">No guardians added yet.</p>
          ) : (
              <ul className="space-y-3">
                  {currentUser.guardians.map(g => (
                      <li key={g} className="flex justify-between items-center bg-dark p-3 rounded border border-gray-700">
                          <span className="text-gray-200">{g}</span>
                          <button 
                            onClick={() => removeGuardian(g)}
                            className="text-red-400 hover:text-red-300 text-sm"
                          >
                              Remove
                          </button>
                      </li>
                  ))}
              </ul>
          )}
      </div>
    </div>
  );
};

export default Guardians;