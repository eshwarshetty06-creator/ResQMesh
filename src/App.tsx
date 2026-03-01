import { useState } from 'react';
import SceneLive from './components/ScenarioLive';
import Dashboard from './components/Dashboard';

import './App.css';

function App() {
  const [viewState, setViewState] = useState<{ view: 'dashboard' | 'live', data?: any }>({ view: 'dashboard' });

  return (
    <div className="App">
      {viewState.view === 'dashboard' && (
        <Dashboard onSelectScenario={(s: any, data?: any) => setViewState({ view: s, data })} />
      )}
      {viewState.view === 'live' && (
        <SceneLive onBack={() => setViewState({ view: 'dashboard' })} initialData={viewState.data} />
      )}
    </div>
  );
}

export default App;
