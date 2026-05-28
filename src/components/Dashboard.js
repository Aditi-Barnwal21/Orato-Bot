import React from 'react';
import './Dashboard.css';

const Dashboard = ({ onStartSimulation, sessionData }) => {
  // Helper function to get status color
  const getStatusColor = (value, type) => {
    switch (type) {
      case 'percentage':
        if (value >= 80) return '#4CAF50';
        if (value >= 60) return '#FF9800';
        return '#f44336';
      case 'engagement':
        if (value >= 75) return '#4CAF50';
        if (value >= 50) return '#FF9800';
        return '#f44336';
      case 'fillers':
        if (value <= 3) return '#4CAF50';
        if (value <= 8) return '#FF9800';
        return '#f44336';
      case 'pace':
        if (value >= 140 && value <= 180) return '#4CAF50';
        if ((value >= 120 && value < 140) || (value > 180 && value <= 200)) return '#FF9800';
        return '#f44336';
      default:
        return '#9E9E9E';
    }
  };

  // Helper function to get tone emoji
  const getToneEmoji = (tone) => {
    switch (tone) {
      case 'confident': return '💪';
      case 'enthusiastic': return '🎉';
      case 'anxious': return '😰';
      case 'monotone': return '😐';
      default: return '🎤';
    }
  };

  return (
    <div className="container">
      <div className="dashboard">
        <div className="welcome-section">
          <div className="card">
            <h2 className="mb-4">Welcome to Public Speaking Simulator</h2>
            <p className="mb-6">
              Practice your public speaking skills with real-time AI feedback on your facial expressions, 
              voice tone, speaking pace, volume control, and overall presentation confidence.
            </p>
            <button className="btn btn-primary" onClick={onStartSimulation}>
              Start New Session
            </button>
          </div>
        </div>

        {sessionData && (
          <div className="session-results">
            <div className="card">
              <h3 className="mb-4">Latest Session Results</h3>
              
              {/* Basic Session Info */}
              <div className="session-overview">
                <div className="overview-grid">
                  <div className="overview-item">
                    <div className="overview-icon">⏱️</div>
                    <div className="overview-content">
                      <div className="overview-label">Duration</div>
                      <div className="overview-value">{sessionData.duration || 'N/A'}</div>
                    </div>
                  </div>
                  <div className="overview-item">
                    <div className="overview-icon">🎯</div>
                    <div className="overview-content">
                      <div className="overview-label">Overall Confidence</div>
                      <div className="overview-value">{sessionData.averageConfidence || 'N/A'}%</div>
                    </div>
                  </div>
                  <div className="overview-item">
                    <div className="overview-icon">💭</div>
                    <div className="overview-content">
                      <div className="overview-label">Words Spoken</div>
                      <div className="overview-value">{sessionData.wordCount || 'N/A'}</div>
                    </div>
                  </div>
                  <div className="overview-item">
                    <div className="overview-icon">😊</div>
                    <div className="overview-content">
                      <div className="overview-label">Dominant Emotion</div>
                      <div className="overview-value">{sessionData.dominantEmotion || 'N/A'}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Enhanced Metrics Grid */}
              <div className="enhanced-metrics">
                <h4 className="metrics-title">📊 Detailed Analysis</h4>
                <div className="metrics-grid">
                  
                  {/* Facial Engagement */}
                  <div className="metric-card">
                    <div className="metric-header">
                      <span className="metric-icon">😊</span>
                      <span className="metric-title">Facial Engagement</span>
                    </div>
                    <div className="metric-score" style={{ color: getStatusColor(sessionData.facialEngagement || 0, 'engagement') }}>
                      {sessionData.facialEngagement || 0}%
                    </div>
                    <div className="metric-description">Smile, eye contact, composure</div>
                  </div>

                  {/* Eye Contact */}
                  <div className="metric-card">
                    <div className="metric-header">
                      <span className="metric-icon">👁️</span>
                      <span className="metric-title">Eye Contact</span>
                    </div>
                    <div className="metric-score" style={{ color: getStatusColor(sessionData.eyeContact || 0, 'percentage') }}>
                      {sessionData.eyeContact || 0}%
                    </div>
                    <div className="metric-description">Camera engagement time</div>
                  </div>

                  {/* Speaking Tone */}
                  <div className="metric-card">
                    <div className="metric-header">
                      <span className="metric-icon">{getToneEmoji(sessionData.dominantTone)}</span>
                      <span className="metric-title">Speaking Tone</span>
                    </div>
                    <div className="metric-score tone-display">
                      {(sessionData.dominantTone || 'neutral').charAt(0).toUpperCase() + (sessionData.dominantTone || 'neutral').slice(1)}
                    </div>
                    <div className="metric-description">Confidence, enthusiasm, anxiety</div>
                  </div>

                  {/* Speaking Pace */}
                  <div className="metric-card">
                    <div className="metric-header">
                      <span className="metric-icon">🏃</span>
                      <span className="metric-title">Speaking Pace</span>
                    </div>
                    <div className="metric-score" style={{ color: getStatusColor(sessionData.speakingRate || 0, 'pace') }}>
                      {sessionData.speakingRate || 0} WPM
                    </div>
                    <div className="metric-description">Words per minute</div>
                  </div>

                  {/* Volume Level */}
                  <div className="metric-card">
                    <div className="metric-header">
                      <span className="metric-icon">🔊</span>
                      <span className="metric-title">Average Volume</span>
                    </div>
                    <div className="metric-score">
                      {sessionData.averageVolume ? 
                        (sessionData.averageVolume >= 80 && sessionData.averageVolume <= 140 ? '✅ Good' : 
                         sessionData.averageVolume < 80 ? '🔽 Too Soft' : '🔊 Too Loud') 
                        : 'N/A'}
                    </div>
                    <div className="metric-description">Audio level consistency</div>
                  </div>

                  {/* Filler Words */}
                  <div className="metric-card">
                    <div className="metric-header">
                      <span className="metric-icon">🚫</span>
                      <span className="metric-title">Filler Words</span>
                    </div>
                    <div className="metric-score" style={{ color: getStatusColor(sessionData.fillerWordPercentage || 0, 'fillers') }}>
                      {sessionData.fillerWordPercentage || 0}%
                    </div>
                    <div className="metric-description">Um, uh, like frequency</div>
                  </div>

                  {/* Posture (optional) */}
                  <div className="metric-card">
                    <div className="metric-header">
                      <span className="metric-icon">🧍</span>
                      <span className="metric-title">Posture</span>
                    </div>
                    <div className="metric-score" style={{ color: getStatusColor(sessionData.postureScore || 0, 'engagement') }}>
                      {sessionData.postureScore !== undefined ? `${sessionData.postureScore}%` : 'N/A'}
                    </div>
                    <div className="metric-description">Upright vs slouching</div>
                  </div>

                  {/* Gesture Balance (optional) */}
                  <div className="metric-card">
                    <div className="metric-header">
                      <span className="metric-icon">✋</span>
                      <span className="metric-title">Gesture Balance</span>
                    </div>
                    <div className="metric-score">
                      {(sessionData.gestureBalance || 'balanced').replace('_', ' ')}
                    </div>
                    <div className="metric-description">Too little, balanced, or too much</div>
                  </div>

                </div>
              </div>

              {/* Traditional Results Grid */}
              {(sessionData.speechSentiment || sessionData.avgPauseDuration) && (
                <div className="additional-metrics">
                  <h4 className="metrics-title">📈 Additional Insights</h4>
                  <div className="results-grid">
                    {sessionData.speechSentiment && (
                      <div className="result-item">
                        <span className="result-label">Speech Sentiment:</span>
                        <span className="result-value">{sessionData.speechSentiment}</span>
                      </div>
                    )}
                    {sessionData.avgPauseDuration > 0 && (
                      <div className="result-item">
                        <span className="result-label">Average Pause:</span>
                        <span className="result-value">{Math.round(sessionData.avgPauseDuration / 1000)}s</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Body Language Insights (optional) */}
              {sessionData.detailedAnalysis && sessionData.detailedAnalysis.bodyLanguage && sessionData.detailedAnalysis.bodyLanguage.length > 0 && (
                <div className="additional-metrics">
                  <h4 className="metrics-title">🧍 Body Language Insights</h4>
                  <div className="results-grid">
                    {(() => {
                      const history = sessionData.detailedAnalysis.bodyLanguage;
                      const recent = history.slice(-3);
                      return (
                        <>
                          <div className="result-item">
                            <span className="result-label">Recent Posture:</span>
                            <span className="result-value">
                              {recent.map((item, idx) => {
                                const label = item.posture?.label || 'unknown';
                                const score = item.posture?.score ?? '—';
                                return (
                                  <span key={idx} style={{ marginRight: 8 }}>
                                    {label} ({score}%)
                                  </span>
                                );
                              })}
                            </span>
                          </div>
                          <div className="result-item">
                            <span className="result-label">Recent Gestures:</span>
                            <span className="result-value">
                              {recent.map((item, idx) => {
                                const label = (item.gestures?.label || 'unknown').replace('_', ' ');
                                return (
                                  <span key={idx} style={{ marginRight: 8 }}>
                                    {label}
                                  </span>
                                );
                              })}
                            </span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                  <div className="metric-description" style={{ marginTop: 8 }}>
                    Posture is estimated from head level and face framing; gesture balance comes from movement variability. Accuracy improves with good lighting and a centered upper-body frame.
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        <div className="features-section">
          <h3 className="mb-4 text-center">Enhanced Features</h3>
          <div className="grid grid-3">
            <div className="card feature-card">
              <div className="feature-icon">😊</div>
              <h4>Facial Engagement</h4>
              <p>Real-time analysis of smiles, eye contact, and nervous tics using advanced facial recognition.</p>
            </div>
            <div className="card feature-card">
              <div className="feature-icon">🎵</div>
              <h4>Voice & Tone Analysis</h4>
              <p>Detect confidence, enthusiasm, anxiety, and monotone patterns in your speaking voice.</p>
            </div>
            <div className="card feature-card">
              <div className="feature-icon">🔊</div>
              <h4>Volume Control</h4>
              <p>Get feedback on speaking volume - too soft, too loud, or just right for optimal delivery.</p>
            </div>
            <div className="card feature-card">
              <div className="feature-icon">⚡</div>
              <h4>Speaking Pace</h4>
              <p>Monitor your words per minute and get guidance on ideal speaking rhythm for clarity.</p>
            </div>
            <div className="card feature-card">
              <div className="feature-icon">🚫</div>
              <h4>Filler Word Detection</h4>
              <p>Track usage of "um", "uh", "like" and other filler words to improve speech fluency.</p>
            </div>
            <div className="card feature-card">
              <div className="feature-icon">🧍✋</div>
              <h4>Body Language Assessment</h4>
              <p>Optional posture recognition (slouching vs upright) and gesture balance (too little, balanced, too much) using lightweight heuristics.</p>
            </div>
            <div className="card feature-card">
              <div className="feature-icon">📊</div>
              <h4>Comprehensive Analytics</h4>
              <p>Detailed session reports with actionable insights to improve your presentation skills.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard; 