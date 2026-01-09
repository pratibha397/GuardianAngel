import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Auth from './pages/Auth';
import Dashboard from './pages/Dashboard';
import Guardians from './pages/Guardians';
import Chat from './pages/Chat';
import Settings from './pages/Settings';
import { User, AppRoute } from './types';
import { getCurrentUser, logoutUser } from './services/storage';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [currentRoute, setCurrentRoute] = useState<AppRoute>(AppRoute.AUTH);

  useEffect(() => {
    const user = getCurrentUser();
    if (user) {
      setCurrentUser(user);
      setCurrentRoute(AppRoute.DASHBOARD);
    }
  }, []);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    setCurrentRoute(AppRoute.DASHBOARD);
  };

  const handleLogout = () => {
    logoutUser();
    setCurrentUser(null);
    setCurrentRoute(AppRoute.AUTH);
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
        return <Settings currentUser={currentUser} />;
      default:
        return <Dashboard currentUser={currentUser} />;
    }
  };

  return (
    <Layout 
      currentUser={currentUser} 
      currentRoute={currentRoute} 
      onNavigate={setCurrentRoute}
      onLogout={handleLogout}
    >
      {renderContent()}
    </Layout>
  );
};

export default App;