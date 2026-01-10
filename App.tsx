import React, { useEffect, useRef, useState } from 'react';
import Layout from './components/Layout';
import Auth from './pages/Auth';
import Chat from './pages/Chat';
import Dashboard from './pages/Dashboard';
import Guardians from './pages/Guardians';
import Settings from './pages/Settings';
import { getCurrentUser, logoutUser, subscribeToAlerts } from './services/storage';
import { Alert, AppRoute, User } from './types';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(AppRoute.AUTH);
  const [incomingAlert, setIncomingAlert] = useState<Alert | null>(null);
  
  // Audio reference for the alarm
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      setCurrentUser(user);
      setCurrentRoute(AppRoute.DASHBOARD);
    }
  }, []);

  // --- Global Alert Listener (The "Phone Ring" Logic) ---
  useEffect(() => {
    if (!currentUser) return;

    const unsubscribe = subscribeToAlerts(currentUser.email, (alerts) => {
        // Find any alert that is less than 5 minutes old
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
        const recentAlert = alerts.find(a => a.timestamp > fiveMinutesAgo && !a.acknowledged);

        if (recentAlert) {
            setIncomingAlert(recentAlert);
            playAlarm();
        }
    });

    return () => {
        unsubscribe();
        stopAlarm();
    };
  }, [currentUser]);

  const playAlarm = () => {
    if (!audioRef.current) {
        audioRef.current = new Audio('https://actions.google.com/sounds/v1/alarms/bugle_tune.ogg');
        audioRef.current.loop = true;
    }
    audioRef.current.play().catch(e => console.log("User interaction needed for audio"));
  };

  const stopAlarm = () => {
    if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
    }
  };

  const handleAcknowledge = () => {
      stopAlarm();
      setIncomingAlert(null);
      if (incomingAlert) {
         setCurrentRoute(AppRoute.CHAT); // Go to chat to help
      }
  };

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    setCurrentRoute(AppRoute.DASHBOARD);
  };

  const handleLogout = () => {
    logoutUser();
    setCurrentUser(null);
    setCurrentRoute(AppRoute.AUTH);
  };

  const handleUpdateUser = (updatedUser: User) => {
    setCurrentUser(updatedUser);
  };

  const renderContent = () => {
    if (!currentUser) return <Auth onLogin={handleLogin} />;

    switch (currentRoute) {
      case AppRoute.DASHBOARD:
        return <Dashboard currentUser={currentUser} />;
      case AppRoute.GUARDIANS:
        return <Guardians currentUser={currentUser} />;
      case AppRoute.CHAT:
        return <Chat currentUser={currentUser} />;
      case AppRoute.SETTINGS:
        return <Settings currentUser={currentUser} onUpdateUser={handleUpdateUser} />;
      default:
        return <Dashboard currentUser={currentUser} />;
    }
  };

  return (
    <>
        <Layout 
          currentUser={currentUser} 
          currentRoute={currentRoute} 
          onNavigate={setCurrentRoute}
          onLogout={handleLogout}
        >
          {renderContent()}
        </Layout>

        {/* INCOMING CALL / SOS OVERLAY */}
        {incomingAlert && (
            <div className="fixed inset-0 z-[200] bg-gray-900 flex flex-col items-center justify-between p-8 animate-pulse-fast">
                <div className="mt-12 flex flex-col items-center text-center">
                    <div className="w-32 h-32 bg-red-600 rounded-full flex items-center justify-center animate-bounce shadow-[0_0_50px_rgba(220,38,38,0.6)] mb-8">
                        <span className="text-6xl">⚠️</span>
                    </div>
                    <h1 className="text-white text-4xl font-black uppercase tracking-widest mb-2">Incoming SOS</h1>
                    <p className="text-red-400 text-xl font-bold">{incomingAlert.senderEmail}</p>
                    <p className="text-gray-400 mt-4 max-w-xs">{incomingAlert.reason}</p>
                </div>

                <div className="w-full max-w-sm space-y-4 mb-12">
                     <button 
                        onClick={handleAcknowledge}
                        className="w-full py-6 bg-green-500 hover:bg-green-400 text-white text-xl font-bold rounded-full shadow-2xl transform hover:scale-105 transition-all flex items-center justify-center gap-3"
                     >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                            <path fillRule="evenodd" d="M1.5 4.5a3 3 0 013-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 01-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 006.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 011.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 01-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5z" clipRule="evenodd" />
                        </svg>
                        RESPOND NOW
                     </button>
                     <p className="text-center text-gray-500 text-xs">Swipe up to ignore (not really)</p>
                </div>
            </div>
        )}
    </>
  );
};

export default App;