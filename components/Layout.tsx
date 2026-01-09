import React from 'react';
import { User, AppRoute } from '../types';

interface LayoutProps {
  children: React.ReactNode;
  currentUser: User | null;
  currentRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onLogout: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, currentUser, currentRoute, onNavigate, onLogout }) => {
  if (!currentUser) {
    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 to-black flex items-center justify-center p-4 relative overflow-hidden">
             {/* Abstract background blobs */}
             <div className="absolute top-0 left-0 w-72 h-72 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
             <div className="absolute top-0 right-0 w-72 h-72 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
             <div className="absolute -bottom-8 left-20 w-72 h-72 bg-indigo-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
             <div className="z-10 w-full max-w-md">{children}</div>
        </div>
    );
  }

  const NavItem = ({ route, label, icon }: { route: AppRoute; label: string; icon: string }) => {
    const isActive = currentRoute === route;
    return (
      <button
        onClick={() => onNavigate(route)}
        className={`flex flex-col items-center justify-center w-full py-2 px-1 rounded-xl transition-all duration-300 ${
          isActive 
            ? 'text-blue-400 -translate-y-2' 
            : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
        }`}
      >
        <span className={`text-2xl mb-1 transition-transform ${isActive ? 'scale-110 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]' : ''}`}>{icon}</span>
        <span className="text-[10px] font-medium tracking-wide">{label}</span>
        {isActive && <div className="w-1 h-1 bg-blue-500 rounded-full mt-1"></div>}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-dark flex flex-col relative bg-gradient-to-b from-slate-900 to-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-dark/70 border-b border-white/5 px-6 py-4 flex justify-between items-center shadow-lg shadow-black/20">
        <h1 className="text-xl font-black text-white tracking-widest flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-tr from-blue-600 to-cyan-400 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/30">
            🛡️
          </div>
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">SENTINEL</span>
        </h1>
        <div className="flex items-center gap-3">
            <div className="flex flex-col items-end hidden sm:flex">
                <span className="text-xs text-gray-400">Logged in as</span>
                <span className="text-sm font-bold text-gray-200">{currentUser.name}</span>
            </div>
            <button 
                onClick={onLogout}
                className="p-2 rounded-full bg-gray-800/50 hover:bg-red-500/20 hover:text-red-400 transition-colors border border-white/5"
                title="Logout"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
            </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 pb-32 max-w-4xl mx-auto w-full no-scrollbar">
        {children}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-6 left-4 right-4 bg-card/80 backdrop-blur-xl border border-white/10 rounded-2xl flex justify-around p-2 shadow-2xl z-40 max-w-lg mx-auto">
        <NavItem route={AppRoute.DASHBOARD} label="Home" icon="🏠" />
        <NavItem route={AppRoute.GUARDIANS} label="Guardians" icon="👥" />
        <NavItem route={AppRoute.CHAT} label="Comms" icon="💬" />
        <NavItem route={AppRoute.SETTINGS} label="Settings" icon="⚙️" />
      </nav>
    </div>
  );
};

export default Layout;