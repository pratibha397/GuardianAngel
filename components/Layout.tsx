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
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
             <div className="z-10 w-full max-w-md">{children}</div>
        </div>
    );
  }

  const NavItem = ({ route, label, icon }: { route: AppRoute; label: string; icon: React.ReactNode }) => {
    const isActive = currentRoute === route;
    return (
      <button
        onClick={() => onNavigate(route)}
        className={`flex flex-col items-center justify-center w-full py-2 px-1 rounded-xl transition-all duration-200 ${
          isActive 
            ? 'text-blue-400' 
            : 'text-gray-500 hover:text-gray-300'
        }`}
      >
        <span className={`mb-1 transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}>
            {icon}
        </span>
        <span className="text-[10px] font-semibold tracking-wide">
            {label}
        </span>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col text-slate-200">
      
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-900 border-b border-slate-800 px-6 py-4 flex justify-between items-center shadow-md">
        <h1 className="text-lg font-bold text-white tracking-wide flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm">
            🛡️
          </div>
          <span>SENTINEL</span>
        </h1>
        <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
                <span className="text-xs text-slate-400">Logged in as</span>
                <span className="text-sm font-semibold text-slate-200">{currentUser.name}</span>
            </div>
            <button 
                onClick={onLogout}
                className="p-2 rounded-full bg-slate-800 hover:bg-red-900/30 hover:text-red-400 text-slate-400 transition-colors border border-slate-700"
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
      <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 flex justify-around p-2 pb-6 z-40 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)]">
        <NavItem route={AppRoute.DASHBOARD} label="Home" icon={
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" /></svg>
        } />
        <NavItem route={AppRoute.GUARDIANS} label="Guardians" icon={
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" /></svg>
        } />
        <NavItem route={AppRoute.CHAT} label="Chat" icon={
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" /></svg>
        } />
        <NavItem route={AppRoute.SETTINGS} label="Settings" icon={
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12a7.5 7.5 0 0015 0m-15 0a7.5 7.5 0 1115 0m-15 0H3m16.5 0H21m-1.5 0H12m-8.457 3.077l1.41-.513m14.095-5.13l1.41-.513M5.106 17.785l1.15-.964m11.49-9.642l1.149-.964M7.501 19.795l.75-1.3m7.5-12.99l.75-1.3m-6.063 16.658l.26-1.477m2.605-14.772l.26-1.477m0 17.726l-.26-1.477M10.698 4.614l-.26-1.477M16.5 19.795l-.75-1.3m-7.5-12.99l-.75-1.3m11.49 11.56l-1.149-.964m-11.49-9.642l-1.15-.964m14.095 5.13l-1.41-.513M5.106 10.215l-1.41-.513M9 12a3 3 0 116 0 3 3 0 01-6 0z" /></svg>
        } />
      </nav>
    </div>
  );
};

export default Layout;