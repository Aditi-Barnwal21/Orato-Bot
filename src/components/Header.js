import React from 'react';
import './Header.css';

const Header = ({ currentView, onNavigate, onNavigateMock }) => {
  return (
    <header className="header">
      <div className="container">
        <div className="header-content">
          <div className="logo">
            <h1>🎤 OratoBot</h1>
          </div>
          <nav className="nav">
            <button 
              className={`nav-btn ${currentView === 'dashboard' ? 'active' : ''}`}
              onClick={onNavigate}
            >
              Dashboard
            </button>
            <button 
              className={`nav-btn ${currentView === 'mock' ? 'active' : ''}`}
              onClick={onNavigateMock}
            >
              Mock Interview
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
};

export default Header; 