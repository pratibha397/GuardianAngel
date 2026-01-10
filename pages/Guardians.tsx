import React, { useEffect, useState } from 'react';
import { findUserByEmail } from '../services/storage';
import { User } from '../types';

interface GuardiansProps {
  currentUser: User;
  onUserUpdated: (user: User) => void;
}

const Guardians: React.FC<GuardiansProps> = ({ currentUser, onUserUpdated }) => {
  const [emailInput, setEmailInput] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Local state to store full guardian details (Name + Email)
  const [guardianDetails, setGuardianDetails] = useState<{name: string, email: string}[]>([]);

  // Load guardian details from DB whenever the currentUser.guardians list changes
  useEffect(() => {
    const loadDetails = async () => {
        const list = currentUser.guardians || [];
        const details = [];
        for (const email of list) {
            const user = await findUserByEmail(email);
            if (user) {
                details.push({ name: user.name, email: user.email });
            } else {
                details.push({ name: "Unknown User", email: email });
            }
        }
        setGuardianDetails(details);
    };
    loadDetails();
  }, [currentUser.guardians]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setLoading(true);
    
    const targetEmail = emailInput.toLowerCase().trim();

    // 1. Validation
    if (targetEmail === currentUser.email) {
        setMsg("Cannot add yourself.");
        setLoading(false);
        return;
    }
    if (currentUser.guardians?.includes(targetEmail)) {
        setMsg("User already in guardian list.");
        setLoading(false);
        return;
    }

    // 2. Database Lookup
    const userExists = await findUserByEmail(targetEmail);
    if (!userExists) {
        setMsg("User not found. They must register first.");
        setLoading(false);
        return;
    }

    // 3. Update User
    const updatedList = [...(currentUser.guardians || []), targetEmail];
    const updatedUser = { ...currentUser, guardians: updatedList };
    
    onUserUpdated(updatedUser);
    setMsg(`Successfully added ${userExists.name}!`);
    setEmailInput('');
    setLoading(false);
  };

  const handleRemove = (emailToRemove: string) => {
      if (!confirm(`Remove ${emailToRemove}?`)) return;
      
      const updatedList = (currentUser.guardians || []).filter(e => e !== emailToRemove);
      const updatedUser = { ...currentUser, guardians: updatedList };
      onUserUpdated(updatedUser);
  };

  return (
    <div className="space-y-6">
      {/* Add Guardian Card */}
      <div className="bg-card/40 border border-white/5 p-6 rounded-3xl">
          <h2 className="text-2xl font-bold text-white mb-4">Add Guardian</h2>
          <form onSubmit={handleAdd} className="flex flex-col gap-4">
              <input 
                type="email"
                required
                placeholder="Enter guardian's email"
                className="bg-slate-800 p-4 rounded-xl text-white outline-none border border-white/10 focus:border-blue-500"
                value={emailInput}
                onChange={e => setEmailInput(e.target.value)}
              />
              <button 
                type="submit"
                disabled={loading}
                className="bg-blue-600 p-4 rounded-xl text-white font-bold hover:bg-blue-500 transition-colors disabled:opacity-50"
              >
                  {loading ? 'Searching...' : 'Add Guardian'}
              </button>
              {msg && <p className={`text-sm ${msg.includes('Success') ? 'text-green-400' : 'text-red-400'}`}>{msg}</p>}
          </form>
      </div>

      {/* List */}
      <div className="space-y-3">
          <h3 className="text-gray-400 font-bold uppercase text-xs tracking-wider">Your Guardians</h3>
          {guardianDetails.length === 0 ? (
              <p className="text-gray-500 text-sm">No guardians added yet.</p>
          ) : (
              guardianDetails.map((g) => (
                  <div key={g.email} className="bg-slate-800/50 p-4 rounded-xl flex justify-between items-center border border-white/5">
                      <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold">
                              {g.name[0]?.toUpperCase()}
                          </div>
                          <div>
                              <div className="text-white font-medium">{g.name}</div>
                              <div className="text-gray-500 text-xs">{g.email}</div>
                          </div>
                      </div>
                      <button 
                        onClick={() => handleRemove(g.email)}
                        className="text-gray-500 hover:text-red-400"
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
