import React from 'react';
import { AppRoute, User } from '../types';

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
        <div className="min-h-screen bg-gradient-to-br from-slate-950 via-gray-900 to-black flex items-center justify-center p-4 relative overflow-hidden">
             {/* Abstract background blobs */}
             <div className="absolute top-0 left-0 w-96 h-96 bg-blue-600/20 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-blob"></div>
             <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-600/20 rounded-full mix-blend-screen filter blur-3xl opacity-30 animate-blob animation-delay-2000"></div>
             <div className="z-10 w-full max-w-md">{children}</div>
        </div>
    );
  }

  const NavItem = ({ route, label, icon }: { route: AppRoute; label: string; icon: string }) => {
    const isActive = currentRoute === route;
    return (
      <button
        onClick={() => onNavigate(route)}
        className={`flex flex-col items-center justify-center w-full py-2 px-1 rounded-2xl transition-all duration-300 group ${
          isActive 
            ? 'text-white' 
            : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
        }`}
      >
        <span className={`text-2xl mb-1 transition-transform duration-300 ${isActive ? '-translate-y-1 scale-110' : 'group-hover:scale-105'}`}>
            {icon}
        </span>
        <span className={`text-[10px] font-bold tracking-wide transition-all ${isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 group-hover:opacity-70 group-hover:translate-y-0'}`}>
            {label}
        </span>
        {isActive && (
            <div className="absolute bottom-1 w-1 h-1 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,1)]"></div>
        )}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col relative overflow-hidden">
      
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none">
         <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-900/10 rounded-full blur-[100px]"></div>
         <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-purple-900/10 rounded-full blur-[100px]"></div>
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-slate-900/60 border-b border-white/5 px-6 py-4 flex justify-between items-center">
        <h1 className="text-xl font-black text-white tracking-widest flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 ring-1 ring-white/10">
            🛡️
          </div>
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-200 to-gray-400 drop-shadow-sm">SENTINEL</span>
        </h1>
        <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Operator</span>
                <span className="text-sm font-bold text-gray-200">{currentUser.name}</span>
            </div>
            <button 
                onClick={onLogout}
                className="w-10 h-10 rounded-full bg-slate-800/50 hover:bg-red-500/10 hover:text-red-400 text-gray-400 flex items-center justify-center transition-all border border-white/5 hover:border-red-500/30"
                title="Logout"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                </svg>
            </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-4 pb-32 max-w-5xl mx-auto w-full no-scrollbar relative z-10">
        {children}
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-6 left-4 right-4 bg-slate-900/80 backdrop-blur-2xl border border-white/10 rounded-3xl flex justify-around p-3 shadow-2xl z-40 max-w-lg mx-auto shadow-black/50 ring-1 ring-white/5">
        <NavItem route={AppRoute.DASHBOARD} label="Home" icon="🏠" />
        <NavItem route={AppRoute.GUARDIANS} label="Guardians" icon="👥" />
        <NavItem route={AppRoute.CHAT} label="Chat" icon="💬" />
        <NavItem route={AppRoute.SETTINGS} label="Settings" icon="⚙️" />
      </nav>
    </div>
  );
};

export default Layout;