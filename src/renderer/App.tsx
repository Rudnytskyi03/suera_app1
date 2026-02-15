import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import { getSession, clearSession } from './services/authService';
import { ToastProvider } from './components/ToastProvider';

type UserSession = {
  email: string;
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  const initializeApp = useCallback(() => {
    setIsLoading(true);
    const session = getSession();
    if (session) {
      setIsAuthenticated(true);
      setUserEmail(session.email);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);

  const handleLogin = useCallback((session: UserSession) => {
    setIsAuthenticated(true);
    setUserEmail(session.email);
  }, []);

  const handleLogout = useCallback(() => {
    clearSession();
    setIsAuthenticated(false);
    setUserEmail('');
  }, []);

  const memoizedContent = useMemo(() => {
    if (isLoading) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <div className="flex items-center gap-3 rounded-2xl bg-white/80 px-6 py-4 shadow-2xl">
            <Loader2 className="h-5 w-5 animate-spin text-purple-500" />
            <span className="text-sm font-medium text-slate-600">Завантаження системи...</span>
          </div>
        </div>
      );
    }

    if (!isAuthenticated) {
      return <LoginPage onLoginSuccess={handleLogin} />;
    }

    return <Dashboard email={userEmail} onLogout={handleLogout} />;
  }, [handleLogin, handleLogout, isAuthenticated, isLoading, userEmail]);

  return <ToastProvider>{memoizedContent}</ToastProvider>;
}

export default App;
