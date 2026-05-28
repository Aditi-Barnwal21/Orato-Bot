import React from 'react';
import './AnalysisDashboard.css';

const AnalysisDashboard = ({ sessionData, onRestart }) => {
  // Calculate WPM (Words Per Minute)
  const calculateWPM = () => {
    if (!sessionData || !sessionData.totalSpeakingTime || !sessionData.totalWords || sessionData.totalSpeakingTime === 0) {
      return 0;
    }
    const minutes = sessionData.totalSpeakingTime / 60000; // Convert ms to minutes
    if (minutes === 0) return 0;
    return Math.round(sessionData.totalWords / minutes);
  };

  // Analyze filler words in transcript
  const analyzeFillerWords = (transcript) => {
    if (!transcript || transcript.trim().length === 0) {
      return { fillerWords: [], totalCount: 0, fillerWordCounts: {} };
    }

    const fillerWordList = ["um", "uh", "er", "ah", "like", "okay", "right", "so", "you know", "well", "basically", "actually", "literally", "sort of", "kind of"];
    const words = transcript.toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .split(/\s+/)
      .filter(word => word.length > 0); // Remove empty strings

    const fillerWordCounts = {};
    let totalCount = 0;

    words.forEach(word => {
      if (fillerWordList.includes(word)) {
        fillerWordCounts[word] = (fillerWordCounts[word] || 0) + 1;
        totalCount++;
      }
    });

    return {
      fillerWords: Object.keys(fillerWordCounts),
      totalCount,
      fillerWordCounts
    };
  };

  // Debug logging
  console.log('Analysis Dashboard - Session Data:', sessionData);

  const wpm = calculateWPM();
  const fillerAnalysis = analyzeFillerWords(sessionData?.fullTranscript || '');

  // Calculate overall interview score
  const calculateInterviewScore = () => {
    if (!sessionData || !sessionData.results || sessionData.results.length === 0) {
      return { score: 0, grade: 'N/A', feedback: 'No interview data available', breakdown: { technical: 0, clarity: 0, confidence: 0, wpm: 0, fillers: 0 } };
    }

    // Calculate average scores from interview results
    const avgTechnical = sessionData.results.reduce((sum, r) => sum + (r.scores?.technicalAccuracy || 0), 0) / sessionData.results.length;
    const avgClarity = sessionData.results.reduce((sum, r) => sum + (r.scores?.clarity || 0), 0) / sessionData.results.length;
    const avgConfidence = sessionData.results.reduce((sum, r) => sum + (r.scores?.confidence || 0), 0) / sessionData.results.length;

    // Calculate WPM score (ideal range: 140-180 WPM)
    let wpmScore = 50; // Base score
    if (wpm > 0) {
      if (wpm >= 140 && wpm <= 180) {
        wpmScore = 100; // Perfect range
      } else if (wpm >= 120 && wpm < 140) {
        wpmScore = 80; // Good but slightly slow
      } else if (wpm > 180 && wpm <= 200) {
        wpmScore = 80; // Good but slightly fast
      } else if (wpm < 120) {
        wpmScore = 60; // Too slow
      } else if (wpm > 200) {
        wpmScore = 60; // Too fast
      }
    } else {
      wpmScore = 0; // No speech detected
    }

    // Calculate filler word score (lower is better)
    let fillerScore = 100;
    if (fillerAnalysis.totalCount > 0) {
      const fillerPercentage = (fillerAnalysis.totalCount / sessionData.totalWords) * 100;
      if (fillerPercentage <= 3) {
        fillerScore = 100; // Excellent
      } else if (fillerPercentage <= 8) {
        fillerScore = 80; // Good
      } else if (fillerPercentage <= 15) {
        fillerScore = 60; // Fair
      } else {
        fillerScore = 40; // Poor
      }
    }

    // Calculate overall score (weighted average)
    const overallScore = Math.round(
      (avgTechnical * 0.3) +
      (avgClarity * 0.25) +
      (avgConfidence * 0.25) +
      (wpmScore * 0.1) +
      (fillerScore * 0.1)
    );

    // Determine grade and feedback
    let grade, feedback;
    if (overallScore >= 90) {
      grade = 'A+';
      feedback = 'Outstanding performance! You demonstrated excellent technical knowledge, clear communication, and high confidence.';
    } else if (overallScore >= 80) {
      grade = 'A';
      feedback = 'Excellent performance! Strong technical skills and clear communication with good confidence levels.';
    } else if (overallScore >= 70) {
      grade = 'B+';
      feedback = 'Good performance! Solid technical knowledge and communication skills with room for minor improvements.';
    } else if (overallScore >= 60) {
      grade = 'B';
      feedback = 'Satisfactory performance. Good foundation but consider working on clarity and confidence.';
    } else if (overallScore >= 50) {
      grade = 'C';
      feedback = 'Fair performance. Focus on improving technical accuracy and reducing filler words.';
    } else {
      grade = 'D';
      feedback = 'Needs improvement. Work on all aspects: technical knowledge, clarity, and confidence.';
    }

    return {
      score: overallScore,
      grade,
      feedback,
      breakdown: {
        technical: Math.round(avgTechnical),
        clarity: Math.round(avgClarity),
        confidence: Math.round(avgConfidence),
        wpm: wpmScore,
        fillers: fillerScore
      }
    };
  };

  const interviewScore = calculateInterviewScore();

  console.log('WPM Calculation:', {
    totalWords: sessionData?.totalWords,
    totalSpeakingTime: sessionData?.totalSpeakingTime,
    wpm
  });
  console.log('Filler Analysis:', fillerAnalysis);
  console.log('Interview Score:', interviewScore);

  return (
    <div className="analysis-dashboard">
      <div className="dashboard-header">
        <h2>📊 Interview Analysis Dashboard</h2>
        <p>Comprehensive analysis of your mock interview performance</p>
      </div>

      <div className="dashboard-content">
        {/* Interview Score Section */}
        <div className="interview-score-section">
          <div className="score-header">
            <h3>🎯 Overall Interview Score</h3>
          </div>
          <div className="score-display">
            <div className="main-score">
              <div className={`score-circle grade-${interviewScore.grade.replace('+', 'plus').replace('-', 'minus')}`}>
                <div className="score-number">{interviewScore.score}</div>
                <div className="score-grade">{interviewScore.grade}</div>
              </div>
            </div>
            <div className="score-details">
              <div className="score-feedback">{interviewScore.feedback}</div>
              <div className="score-methodology">
                <small style={{ color: 'rgba(255, 255, 255, 0.7)', fontSize: '0.85rem' }}>
                  Score calculated from: Technical Accuracy (30%), Clarity (25%), Confidence (25%), Speaking Pace (10%), Filler Control (10%)
                </small>
              </div>
              <div className="score-breakdown">
                <div className="breakdown-item">
                  <span className="breakdown-label">Technical Accuracy:</span>
                  <span className="breakdown-value">{interviewScore.breakdown.technical}%</span>
                </div>
                <div className="breakdown-item">
                  <span className="breakdown-label">Clarity:</span>
                  <span className="breakdown-value">{interviewScore.breakdown.clarity}%</span>
                </div>
                <div className="breakdown-item">
                  <span className="breakdown-label">Confidence:</span>
                  <span className="breakdown-value">{interviewScore.breakdown.confidence}%</span>
                </div>
                <div className="breakdown-item">
                  <span className="breakdown-label">Speaking Pace:</span>
                  <span className="breakdown-value">{interviewScore.breakdown.wpm}%</span>
                </div>
                <div className="breakdown-item">
                  <span className="breakdown-label">Filler Control:</span>
                  <span className="breakdown-value">{interviewScore.breakdown.fillers}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Full Transcript Section */}
        <div className="analysis-section">
          <h3>📝 Full Transcript</h3>
          <div className="transcript-container">
            <div className="transcript-content">
              {sessionData?.fullTranscript || 'No transcript available'}
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="metrics-grid">
          {/* WPM Section */}
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-icon">🏃</span>
              <h4>Speaking Pace</h4>
            </div>
            <div className="metric-value">{wpm} WPM</div>
            <div className="metric-description">
              {wpm < 120 ? 'Consider speaking a bit faster' :
                wpm > 200 ? 'Try slowing down for clarity' :
                  'Good speaking pace!'}
            </div>
          </div>

          {/* Filler Words Section */}
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-icon">🚫</span>
              <h4>Filler Words</h4>
            </div>
            <div className="metric-value">{fillerAnalysis.totalCount}</div>
            <div className="metric-description">
              {fillerAnalysis.totalCount === 0 ? 'Excellent! No filler words detected' :
                fillerAnalysis.totalCount < 5 ? 'Good control of filler words' :
                  'Try to reduce filler words for better clarity'}
            </div>
          </div>

          {/* Session Duration */}
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-icon">⏱️</span>
              <h4>Session Duration</h4>
            </div>
            <div className="metric-value">
              {sessionData?.totalSpeakingTime && sessionData.totalSpeakingTime > 0 ?
                `${Math.round(sessionData.totalSpeakingTime / 1000)}s` : 'N/A'}
            </div>
            <div className="metric-description">Total speaking time</div>
          </div>

          {/* Word Count */}
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-icon">📝</span>
              <h4>Words Spoken</h4>
            </div>
            <div className="metric-value">{sessionData?.totalWords || 0}</div>
            <div className="metric-description">Total words in transcript</div>
          </div>
        </div>

        {/* Filler Words Breakdown */}
        {fillerAnalysis.fillerWords.length > 0 && (
          <div className="analysis-section">
            <h3>🔍 Filler Words Breakdown</h3>
            <div className="filler-words-list">
              {fillerAnalysis.fillerWords.map((word, index) => (
                <div key={index} className="filler-word-item">
                  <span className="filler-word">{word}</span>
                  <span className="filler-count">{fillerAnalysis.fillerWordCounts[word]} times</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Interview Results Summary */}
        {sessionData?.results && sessionData.results.length > 0 && (
          <div className="analysis-section">
            <h3>📈 Interview Results Summary</h3>
            <div className="results-summary">
              {sessionData.results.map((result, index) => (
                <div key={index} className="result-item">
                  <div className="question-number">Question {index + 1}</div>
                  <div className="question-text">{result.question}</div>
                  <div className="scores">
                    <span className="score-item">
                      Technical: <strong>{result.scores?.technicalAccuracy ?? 'N/A'}</strong>
                    </span>
                    <span className="score-item">
                      Clarity: <strong>{result.scores?.clarity ?? 'N/A'}</strong>
                    </span>
                    <span className="score-item">
                      Confidence: <strong>{result.scores?.confidence ?? 'N/A'}</strong>
                    </span>
                  </div>
                  <div className="feedback-text">{result.feedback?.overall || 'No feedback available'}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="dashboard-actions">
          <button className="btn btn-primary" onClick={onRestart}>
            Start New Interview
          </button>
        </div>
      </div>
    </div>
  );
};

export default AnalysisDashboard;
