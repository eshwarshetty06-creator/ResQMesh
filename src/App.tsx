import { useState } from 'react';
import SceneLive from './components/ScenarioLive';
import Dashboard from './components/Dashboard';
import Login from './components/Login';

import './App.css';

function App() {
  const [viewState, setViewState] = useState<{ view: 'login' | 'dashboard' | 'live', data?: any }>({ view: 'login' });

  return (
    <div className="App">
      {viewState.view === 'login' && (
        <Login onLogin={(role, userName, serverName) => setViewState({ view: 'dashboard', data: { role, userName, serverName } })} />
      )}
      {viewState.view === 'dashboard' && (
        <Dashboard
          role={viewState.data?.role}
          userName={viewState.data?.userName}
          serverName={viewState.data?.serverName}
          onSelectScenario={(s: any, data?: any) => setViewState({ view: s, data: { ...viewState.data, ...data } })}
          onLogout={() => setViewState({ view: 'login' })}
        />
      )}
      {viewState.view === 'live' && (
        <SceneLive onBack={() => setViewState({ view: 'dashboard', data: viewState.data })} initialData={viewState.data} />
      )}
    </div>
  );
}

export default App;
