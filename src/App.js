import React, { useState } from 'react';
import './App.css';
import Header from './components/Header';
import MockInterview from './components/MockInterview';
import Dashboard from './components/Dashboard';
import Simulator from './components/Simulator';

function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [sessionData, setSessionData] = useState(null);

  const startSimulation = () => {
    setCurrentView('simulator');
  };

  const endSimulation = (data) => {
    setSessionData(data);
    setCurrentView('dashboard');
  };

  const goToDashboard = () => {
    setCurrentView('dashboard');
  };

  const goToMock = () => {
    setCurrentView('mock');
  };

  return (
    <div className="App">
      <Header currentView={currentView} onNavigate={goToDashboard} onNavigateMock={goToMock} />
      <main className="main-content">
        {currentView === 'dashboard' && (
          <Dashboard 
            onStartSimulation={startSimulation}
            sessionData={sessionData}
          />
        )}
        {currentView === 'simulator' && (
          <Simulator onEndSimulation={endSimulation} />
        )}
        {currentView === 'mock' && (
          <MockInterview />
        )}
      </main>
    </div>
  );
}

export default App; 