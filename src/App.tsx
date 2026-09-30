import { useState, useEffect } from 'react';
import SceneLive from './components/ScenarioLive';
import Dashboard from './components/Dashboard';
import Login from './components/Login';

import './App.css';

interface SessionState {
  view: 'login' | 'dashboard' | 'live';
  data?: {
    role?: 'civilian' | 'responder';
    userName?: string;
    serverName?: string;
    bpm?: number;
  };
}

const STORAGE_KEY = 'resqmesh_session';

function App() {
  const [viewState, setViewState] = useState<SessionState>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && (parsed.view === 'dashboard' || parsed.view === 'live')) {
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load session:', e);
    }
    return { view: 'login' };
  });

  useEffect(() => {
    try {
      if (viewState.view === 'login') {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(viewState));
      }
    } catch (e) {
      console.error('Failed to save session:', e);
    }
  }, [viewState]);

  const handleLogout = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setViewState({ view: 'login' });
  };

  return (
    <div className="App">
      <div className="ambient-background" />
      {viewState.view === 'login' && (
        <Login
          onLogin={(role, userName, serverName) =>
            setViewState({ view: 'dashboard', data: { role, userName, serverName } })
          }
        />
      )}
      {viewState.view === 'dashboard' && (
        <Dashboard
          role={viewState.data?.role}
          userName={viewState.data?.userName}
          serverName={viewState.data?.serverName}
          onSelectScenario={(s: any, data?: any) =>
            setViewState({ view: s, data: { ...viewState.data, ...data } })
          }
          onLogout={handleLogout}
        />
      )}
      {viewState.view === 'live' && (
        <SceneLive
          onBack={() => setViewState({ view: 'dashboard', data: viewState.data })}
          initialData={viewState.data}
        />
      )}
    </div>
  );
}

export default App;

