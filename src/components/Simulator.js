import React, { useState, useRef, useEffect } from 'react';
import * as faceapi from 'face-api.js';
import sentimentAnalyzer from '../utils/sentimentAnalysis';
import facialAnalyzer from '../utils/facialAnalysis';
import './Simulator.css';

const Simulator = ({ onEndSimulation }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState('');
  const [confidence, setConfidence] = useState(0);
  const [eyeContact, setEyeContact] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [speechText, setSpeechText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [hasSpeechRecognition, setHasSpeechRecognition] = useState(false);
  const [speechError, setSpeechError] = useState('');

  // New state for enhanced feedback
  const [facialEngagement, setFacialEngagement] = useState(null);
  const [toneAnalysis, setToneAnalysis] = useState(null);
  const [volumeAnalysis, setVolumeAnalysis] = useState(null);
  const [paceAnalysis, setPaceAnalysis] = useState(null);
  const [fillerAnalysis, setFillerAnalysis] = useState(null);
  const [currentVolume, setCurrentVolume] = useState(0);
  const [postureAnalysis, setPostureAnalysis] = useState(null);
  const [gestureAnalysis, setGestureAnalysis] = useState(null);

  // Session data tracking
  const [sessionData, setSessionData] = useState({
    emotions: [],
    confidenceScores: [],
    eyeContactScores: [],
    speechData: [],
    facialEngagementData: [],
    toneData: [],
    volumeData: [],
    paceData: [],
    fillerData: [],
    bodyLanguageData: []
  });

  const [cumulativeTranscript, setCumulativeTranscript] = useState('');
  const [totalSpeakingTime, setTotalSpeakingTime] = useState(0);
  const [recordStartMs, setRecordStartMs] = useState(null);

  const recognitionRef = useRef(null);
  const intervalRef = useRef(null);
  const audioStreamRef = useRef(null);
  const speechKeepAliveRef = useRef(null);
  const cumulativeTranscriptRef = useRef('');
  const cumulativeWordCountRef = useRef(0);
  const isRecordingRef = useRef(false);
  const sessionStartTimeRef = useRef(null);

  // Load face-api models and initialize analyzers
  useEffect(() => {
    const loadModels = async () => {
      try {
        const MODEL_URL = '/models';

        // Load models from CDN if local models are not available
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri('https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights'),
          faceapi.nets.faceLandmark68Net.loadFromUri('https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights'),
          faceapi.nets.faceRecognitionNet.loadFromUri('https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights'),
          faceapi.nets.faceExpressionNet.loadFromUri('https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights')
        ]);

        // Initialize analyzers
        await sentimentAnalyzer.initialize();

        setIsModelLoaded(true);
      } catch (error) {
        console.error('Error loading face-api models:', error);
        // Fallback - set model as loaded even if there's an error
        setIsModelLoaded(true);
      }
    };

    loadModels();
  }, []);

  // Initialize camera and audio with robust fallbacks
  const startCamera = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      alert('This browser does not support camera access. Try latest Chrome/Edge/Firefox.');
      return null;
    }
    // Stop any existing stream first
    try {
      const existing = videoRef.current && videoRef.current.srcObject;
      if (existing) {
        existing.getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
    } catch { }

    // Helper to try constraints in order
    const tryGetUserMedia = async (constraintsList) => {
      for (const constraints of constraintsList) {
        try {
          const s = await navigator.mediaDevices.getUserMedia(constraints);
          return s;
        } catch (e) {
          console.warn('getUserMedia failed for constraints', constraints, e);
        }
      }
      throw new Error('All media constraints failed');
    };

    try {
      // Verify devices are visible
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      const hasVideo = devices.some(d => d.kind === 'videoinput');
      const hasAudio = devices.some(d => d.kind === 'audioinput');
      const firstCam = devices.find(d => d.kind === 'videoinput');

      if (!hasVideo && !hasAudio) {
        alert('No camera or microphone devices detected. Connect a device and try again.');
        return null;
      }

      // Prefer front camera
      const constraintsOrder = [
        // Prefer deviceId when known
        firstCam && { video: { deviceId: { exact: firstCam.deviceId }, width: { ideal: 720 }, height: { ideal: 560 } }, audio: true },
        { video: { facingMode: { ideal: 'user' }, width: { ideal: 720 }, height: { ideal: 560 } }, audio: true },
        { video: { width: 720, height: 560 }, audio: true },
        { video: true, audio: true }
      ].filter(Boolean);

      const stream = await tryGetUserMedia(constraintsOrder);

      if (videoRef.current) {
        const video = videoRef.current;
        video.setAttribute('playsinline', 'true');
        video.muted = true;
        video.srcObject = stream;
        await new Promise((resolve) => {
          if (video.readyState >= 2) return resolve();
          video.onloadedmetadata = () => resolve();
        });
        try { await video.play(); } catch { }
      }

      // Connect audio stream to sentiment analyzer for volume analysis
      audioStreamRef.current = stream;
      sentimentAnalyzer.connectAudioStream(stream);

      return stream;
    } catch (error) {
      console.error('Error accessing camera:', error);
      let message = 'Unable to access camera. Please check your browser permissions.';
      if (error && error.name === 'NotAllowedError') {
        message = 'Camera/Mic permission was denied. Click the camera icon in the address bar to allow access, then retry.';
      } else if (error && (error.name === 'NotFoundError' || error.name === 'OverconstrainedError')) {
        message = 'No camera or microphone found or constraint not supported. Connect a device and try again.';
      } else if (error && (error.name === 'NotReadableError' || error.name === 'TrackStartError')) {
        message = 'Your camera is in use by another app. Close other apps using the camera and retry.';
      } else if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
        message = 'Camera access requires HTTPS or localhost. Please run locally (http://localhost) or use HTTPS.';
      }
      alert(message);
      return null;
    }
  };

  // Proactively request permissions on user gesture
  const ensureMediaPermissions = async () => {
    try {
      // Query permissions when supported
      const canQuery = navigator.permissions && navigator.permissions.query;
      if (canQuery) {
        try {
          const cam = await navigator.permissions.query({ name: 'camera' });
          const mic = await navigator.permissions.query({ name: 'microphone' });
          // If already granted, nothing to do
          if (cam.state === 'granted' && mic.state === 'granted') return true;
        } catch (_) {
          // ignore if browser blocks querying
        }
      }
      // Trigger permission prompt with minimal constraints and stop immediately
      const tmp = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      tmp.getTracks().forEach(t => t.stop());
      return true;
    } catch (err) {
      console.warn('Permission request failed:', err);
      return false;
    }
  };

  // Initialize speech recognition
  const initSpeechRecognition = () => {
    if (recognitionRef.current) return;
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;
      setHasSpeechRecognition(true);

      let lastRestartAt = 0;
      recognition.onresult = (event) => {
        // If we get results, we definitely are listening
        if (!isListening) setIsListening(true);
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          const transcript = result[0].transcript;
          if (result.isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        const fullText = (cumulativeTranscriptRef.current ? cumulativeTranscriptRef.current + ' ' : '') + finalTranscript + interimTranscript;
        setSpeechText(fullText);

        // Debug logging for speech recognition
        if (finalTranscript) {
          console.log('=== Speech Recognition Debug ===');
          console.log('Final transcript:', finalTranscript);
          console.log('Interim transcript:', interimTranscript);
          console.log('Full text:', fullText);
        }

        if (finalTranscript) {
          const timestamp = Date.now();

          // Accumulate transcript for session recording
          cumulativeTranscriptRef.current += (cumulativeTranscriptRef.current ? ' ' : '') + finalTranscript.trim();
          setCumulativeTranscript(cumulativeTranscriptRef.current);

          // Analyze new speech features
          const volumeLevel = sentimentAnalyzer.getVolumeLevel();
          const frequencyData = sentimentAnalyzer.dataArray;

          const toneResult = sentimentAnalyzer.detectTone(finalTranscript, volumeLevel, frequencyData);
          const volumeResult = sentimentAnalyzer.analyzeVolume(volumeLevel);
          const fillerResult = sentimentAnalyzer.detectFillersAndPauses(finalTranscript, timestamp);

          // Debug logging for filler analysis
          console.log('=== Filler Analysis Debug ===');
          console.log('Filler result:', fillerResult);
          console.log('Filler count:', fillerResult.fillerCount);
          console.log('Filler percentage:', fillerResult.fillerPercentage);
          console.log('Detected fillers:', fillerResult.fillerWords);
          console.log('===========================');

          // Calculate speaking pace using rolling window based on finalized segments
          const sessionStartTime = sessionStartTimeRef.current;
          const sessionTime = sessionStartTime ? timestamp - sessionStartTime : 1000;
          const newWords = finalTranscript.trim().split(/\s+/).filter(w => w.length > 0).length;
          cumulativeWordCountRef.current += newWords;
          const isFinalSegment = finalTranscript.length > 0;
          const paceWords = isFinalSegment ? newWords : cumulativeWordCountRef.current;
          const paceResult = sentimentAnalyzer.analyzeSpeakingPace(paceWords, sessionTime, isFinalSegment);

          // Update real-time feedback
          setToneAnalysis(toneResult);
          setVolumeAnalysis(volumeResult);
          setFillerAnalysis(fillerResult);
          setPaceAnalysis(paceResult);
          setCurrentVolume(volumeLevel);

          // Store in session data
          setSessionData(prev => ({
            ...prev,
            speechData: [...prev.speechData, {
              text: finalTranscript,
              timestamp: timestamp
            }],
            toneData: [...prev.toneData, { ...toneResult, timestamp }],
            volumeData: [...prev.volumeData, { ...volumeResult, timestamp }],
            fillerData: [...prev.fillerData, { ...fillerResult, timestamp }],
            paceData: [...prev.paceData, { ...paceResult, timestamp }]
          }));
        }
      };

      recognition.onstart = () => {
        setIsListening(true);
        setSpeechError('');
      };

      recognition.onaudiostart = () => {
        setIsListening(true);
        setSpeechError('');
      };

      recognition.onaudioend = () => {
        // Just let it naturally end and trigger onend
      };

      recognition.onend = () => {
        // Auto-restart while recording session is active
        if (isRecordingRef.current && recognitionRef.current) {
          const now = Date.now();
          if (now - lastRestartAt > 500) {
            lastRestartAt = now;
            try { recognitionRef.current.start(); } catch { }
          }
        } else {
          setIsListening(false);
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error !== 'no-speech' && event.error !== 'aborted') {
          setSpeechError(`Error: ${event.error}`);
        }

        if (event.error === 'not-allowed' || event.error === 'audio-capture') {
          setSpeechError('Microphone access is blocked in browser or OS.');
        }

        // We do NOT need to call start() here because onerror is always followed by onend
        // according to the Web Speech API spec. onend will handle the restart.
      };
    }
  };

  // Enhanced face detection and analysis
  const detectFaces = async () => {
    if (videoRef.current && canvasRef.current && isModelLoaded) {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      // Set canvas dimensions to match video
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      try {
        const detections = await faceapi
          .detectAllFaces(video, new faceapi.TinyFaceDetectorOptions())
          .withFaceLandmarks()
          .withFaceExpressions();

        if (detections.length > 0) {
          const detection = detections[0];
          const timestamp = Date.now();

          // Draw detections on canvas
          faceapi.draw.drawDetections(canvas, detections);
          faceapi.draw.drawFaceLandmarks(canvas, detections);
          faceapi.draw.drawFaceExpressions(canvas, detections);

          // Get emotion with highest confidence
          const expressions = detection.expressions;
          const maxExpression = Object.keys(expressions).reduce((a, b) =>
            expressions[a] > expressions[b] ? a : b
          );

          setCurrentEmotion(maxExpression);

          // Enhanced facial engagement analysis
          const engagementResult = facialAnalyzer.analyzeFacialEngagement(detection, timestamp);
          setFacialEngagement(engagementResult);
          // Body language (MVP-lite)
          const posture = engagementResult?.bodyLanguage?.posture || null;
          const gestures = engagementResult?.bodyLanguage?.gestures || null;
          setPostureAnalysis(posture);
          setGestureAnalysis(gestures);

          // Calculate confidence score using multiple factors
          const expressionConfidence = expressions[maxExpression] * 100;
          let calculatedConfidence = Math.min(100, Math.max(0,
            (expressions.happy + expressions.neutral) * 100 - expressions.sad * 50
          ));

          // Enhance confidence calculation with sentiment analysis and engagement
          if (speechText.trim()) {
            const sentimentConfidence = sentimentAnalyzer.getSpeakingConfidence(speechText, expressions);
            calculatedConfidence = (calculatedConfidence + sentimentConfidence) / 2;
          }

          // Factor in facial engagement score
          if (engagementResult && engagementResult.overallEngagement) {
            calculatedConfidence = (calculatedConfidence + engagementResult.overallEngagement.score) / 2;
          }

          setConfidence(Math.round(calculatedConfidence));

          // Use enhanced eye contact from facial analyzer
          const eyeContactScore = engagementResult?.eyeContact?.percentage || 50;
          setEyeContact(eyeContactScore);

          // Store enhanced session data
          setSessionData(prev => ({
            ...prev,
            emotions: [...prev.emotions, { emotion: maxExpression, timestamp }],
            confidenceScores: [...prev.confidenceScores, { score: calculatedConfidence, timestamp }],
            eyeContactScores: [...prev.eyeContactScores, { score: eyeContactScore, timestamp }],
            facialEngagementData: [...prev.facialEngagementData, { ...engagementResult, timestamp }],
            bodyLanguageData: [...prev.bodyLanguageData, { posture, gestures, timestamp }]
          }));
        }
      } catch (error) {
        console.error('Face detection error:', error);
      }
    }
  };

  // Start recording session
  const startRecording = async () => {
    const ok = await ensureMediaPermissions();
    if (!ok) {
      alert('Please allow camera and microphone permissions to start the session.');
      return;
    }
    if (!hasSpeechRecognition && !('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert('Live transcription is not supported in this browser. Please use Chrome/Edge on desktop.');
    }
    const stream = await startCamera();
    initSpeechRecognition();

    // Reset analyzers for new session
    facialAnalyzer.resetSession();
    sentimentAnalyzer.resetSession();

    // Initialize session
    setIsRecording(true);
    isRecordingRef.current = true;
    setSpeechError('');
    const now = Date.now();
    setSessionStartTime(now);
    sessionStartTimeRef.current = now;
    setCumulativeTranscript('');
    cumulativeTranscriptRef.current = '';
    cumulativeWordCountRef.current = 0;
    setTotalSpeakingTime(0);
    setRecordStartMs(now);

    if (recognitionRef.current) {
      try {
        recognitionRef.current.start();
        setIsListening(true);
      } catch (e) {
        console.error("Speech start error:", e);
        setSpeechError(`Start error: ${e.message}`);
      }
    }

    // Start face detection interval
    intervalRef.current = setInterval(detectFaces, 1000);

    // Fallback: if not listening within 3s, try to restart once
    if (speechKeepAliveRef.current) clearTimeout(speechKeepAliveRef.current);
    speechKeepAliveRef.current = setInterval(() => {
      if (isRecordingRef.current && recognitionRef.current && !isListening) {
        try {
          recognitionRef.current.start();
        } catch (e) {
          // Ignore, it might just be starting
        }
      }
    }, 3000);
  };

  // Stop recording session
  const stopRecording = () => {
    setIsRecording(false);
    isRecordingRef.current = false;
    setIsListening(false);

    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (speechKeepAliveRef.current) {
      clearInterval(speechKeepAliveRef.current);
      speechKeepAliveRef.current = null;
    }

    // Stop camera and audio
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
    }


    // Calculate comprehensive session summary
    const sessionDuration = sessionStartTime ?
      Math.round((Date.now() - sessionStartTime) / 1000) : 0;

    const avgConfidence = sessionData.confidenceScores.length > 0 ?
      Math.round(sessionData.confidenceScores.reduce((sum, item) => sum + item.score, 0) / sessionData.confidenceScores.length) : 0;

    const avgEyeContact = sessionData.eyeContactScores.length > 0 ?
      Math.round(sessionData.eyeContactScores.reduce((sum, item) => sum + item.score, 0) / sessionData.eyeContactScores.length) : 0;

    const dominantEmotion = sessionData.emotions.length > 0 ?
      sessionData.emotions.reduce((acc, curr) => {
        acc[curr.emotion] = (acc[curr.emotion] || 0) + 1;
        return acc;
      }, {}) : {};

    const mostFrequentEmotion = Object.keys(dominantEmotion).length > 0 ?
      Object.keys(dominantEmotion).reduce((a, b) => dominantEmotion[a] > dominantEmotion[b] ? a : b) : 'neutral';

    // Analyze comprehensive speech patterns
    const speechAnalysis = sentimentAnalyzer.analyzeSpeakingPatterns(sessionData.speechData);

    // Calculate average scores for new metrics
    const avgFacialEngagement = sessionData.facialEngagementData.length > 0 ?
      Math.round(sessionData.facialEngagementData.reduce((sum, item) => sum + item.overallEngagement.score, 0) / sessionData.facialEngagementData.length) : 0;

    const avgVolumeLevel = sessionData.volumeData.length > 0 ?
      Math.round(sessionData.volumeData.reduce((sum, item) => sum + item.level, 0) / sessionData.volumeData.length) : 0;

    const totalFillerPercentage = speechAnalysis.fillerPercentage;

    // Body language summary (optional)
    const postureScores = sessionData.bodyLanguageData
      .map(item => item.posture?.score)
      .filter(v => typeof v === 'number');
    const avgPostureScore = postureScores.length > 0 ?
      Math.round(postureScores.reduce((a, b) => a + b, 0) / postureScores.length) : 0;

    const gestureLabels = sessionData.bodyLanguageData
      .map(item => item.gestures?.label)
      .filter(Boolean);
    const gestureCounts = gestureLabels.reduce((acc, label) => {
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {});
    const dominantGesture = Object.keys(gestureCounts).length > 0 ?
      Object.keys(gestureCounts).reduce((a, b) => gestureCounts[a] > gestureCounts[b] ? a : b) : 'balanced';

    const summary = {
      duration: `${Math.floor(sessionDuration / 60)}:${String(sessionDuration % 60).padStart(2, '0')}`,
      averageConfidence: avgConfidence,
      eyeContact: avgEyeContact,
      dominantEmotion: mostFrequentEmotion,
      speechLength: speechText.length,
      speechSentiment: speechAnalysis.avgSentiment,
      speakingRate: speechAnalysis.speakingRate,
      wordCount: speechAnalysis.wordCount,

      // New enhanced metrics
      facialEngagement: avgFacialEngagement,
      dominantTone: speechAnalysis.toneAnalysis?.dominantTone || 'neutral',
      averageVolume: avgVolumeLevel,
      fillerWordPercentage: totalFillerPercentage,
      avgPauseDuration: speechAnalysis.avgPauseDuration,
      postureScore: avgPostureScore,
      gestureBalance: dominantGesture,

      // Detailed breakdown for dashboard
      detailedAnalysis: {
        facial: sessionData.facialEngagementData,
        tone: sessionData.toneData,
        volume: sessionData.volumeData,
        pace: sessionData.paceData,
        fillers: sessionData.fillerData,
        bodyLanguage: sessionData.bodyLanguageData
      }
    };

    onEndSimulation(summary);
  };


  // Get status indicator color for different metrics
  const getStatusColor = (status) => {
    switch (status) {
      case 'excellent': case 'genuine': case 'just_right': case 'ideal': return '#4CAF50';
      case 'good': case 'mild': case 'moderate': return '#FF9800';
      case 'poor': case 'too_soft': case 'too_loud': case 'too_fast': case 'too_slow': return '#f44336';
      default: return '#9E9E9E';
    }
  };

  return (
    <div className="container">
      <div className="simulator">
        <div className="simulator-header">
          <h2>Public Speaking Session</h2>
          <div className="controls">
            {!isRecording ? (
              <button
                className="btn btn-primary"
                onClick={startRecording}
                disabled={!isModelLoaded}
              >
                {isModelLoaded ? 'Start Session' : 'Loading Models...'}
              </button>
            ) : (
              <button className="btn btn-danger" onClick={stopRecording}>
                End Session
              </button>
            )}
          </div>
        </div>


        <div className="simulator-content">
          <div className="video-section">
            <div className="video-container">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="video-feed"
              />
              <canvas
                ref={canvasRef}
                className="overlay-canvas"
              />
            </div>
          </div>

          <div className="feedback-section">
            <div className="feedback-panel">
              <h3>Real-time Feedback</h3>

              {/* Basic metrics */}
              <div className="feedback-item">
                <label>Current Emotion:</label>
                <span className={`emotion-badge ${currentEmotion}`}>
                  {currentEmotion || 'Detecting...'}
                </span>
              </div>

              <div className="feedback-item">
                <label>Confidence Level:</label>
                <div className="progress-bar">
                  <div
                    className="progress-fill"
                    style={{ width: `${confidence}%` }}
                  ></div>
                  <span className="progress-text">{confidence}%</span>
                </div>
              </div>

              {/* Enhanced facial engagement */}
              {facialEngagement && (
                <>
                  <div className="feedback-item">
                    <label>Smile Engagement:</label>
                    <div className="engagement-indicator">
                      <span
                        className="status-badge"
                        style={{ backgroundColor: getStatusColor(facialEngagement.smile.status) }}
                      >
                        {facialEngagement.smile.status}
                      </span>
                      <span className="score">{facialEngagement.smile.score}%</span>
                    </div>
                    <div className="feedback-text">{facialEngagement.smile.feedback}</div>
                  </div>

                  <div className="feedback-item">
                    <label>Eye Contact:</label>
                    <div className="engagement-indicator">
                      <span
                        className="status-badge"
                        style={{ backgroundColor: getStatusColor(facialEngagement.eyeContact.status) }}
                      >
                        {facialEngagement.eyeContact.status}
                      </span>
                      <span className="score">{facialEngagement.eyeContact.percentage}%</span>
                    </div>
                    <div className="feedback-text">{facialEngagement.eyeContact.feedback}</div>
                  </div>

                  <div className="feedback-item">
                    <label>Nervous Tics:</label>
                    <div className="engagement-indicator">
                      <span
                        className="status-badge"
                        style={{ backgroundColor: getStatusColor(facialEngagement.nervousTics.severity === 'none' ? 'excellent' : 'poor') }}
                      >
                        {facialEngagement.nervousTics.severity}
                      </span>
                      <span className="score">{facialEngagement.nervousTics.score}%</span>
                    </div>
                    <div className="feedback-text">{facialEngagement.nervousTics.feedback}</div>
                  </div>
                </>
              )}

              {/* Voice and speech analysis */}
              {toneAnalysis && (
                <div className="feedback-item">
                  <label>Speaking Tone:</label>
                  <div className="engagement-indicator">
                    <span className="status-badge tone-badge">
                      {toneAnalysis.dominantTone}
                    </span>
                    <span className="score">{toneAnalysis.confidence}%</span>
                  </div>
                </div>
              )}

              {volumeAnalysis && (
                <div className="feedback-item">
                  <label>Volume Level:</label>
                  <div className="engagement-indicator">
                    <span
                      className="status-badge"
                      style={{ backgroundColor: getStatusColor(volumeAnalysis.status) }}
                    >
                      {volumeAnalysis.status.replace('_', ' ')}
                    </span>
                    <span className="score">{Math.round(currentVolume)}</span>
                  </div>
                  <div className="feedback-text">{volumeAnalysis.message}</div>
                </div>
              )}

              {paceAnalysis && (
                <div className="feedback-item">
                  <label>Speaking Pace:</label>
                  <div className="engagement-indicator">
                    <span
                      className="status-badge"
                      style={{ backgroundColor: getStatusColor(paceAnalysis.status) }}
                    >
                      {paceAnalysis.status.replace('_', ' ')}
                    </span>
                    <span className="score">{paceAnalysis.wpm} WPM</span>
                  </div>
                  <div className="feedback-text">{paceAnalysis.feedback}</div>
                </div>
              )}

              {fillerAnalysis && (
                <div className="feedback-item">
                  <label>Filler Words:</label>
                  <div className="engagement-indicator">
                    <span
                      className="status-badge"
                      style={{ backgroundColor: fillerAnalysis.fillerPercentage > 8 ? '#f44336' : '#4CAF50' }}
                    >
                      {fillerAnalysis.fillerPercentage}%
                    </span>
                    <span className="score">{fillerAnalysis.fillerCount} words</span>
                  </div>
                  <div className="feedback-text">{fillerAnalysis.feedback}</div>
                </div>
              )}

              {/* Real-time body language advice */}
              {postureAnalysis && (
                <div className="feedback-item">
                  <label>Posture:</label>
                  <div className="engagement-indicator">
                    <span
                      className="status-badge"
                      style={{ backgroundColor: getStatusColor(postureAnalysis.status) }}
                    >
                      {postureAnalysis.label}
                    </span>
                    <span className="score">{postureAnalysis.score}%</span>
                  </div>
                  <div className="feedback-text">{postureAnalysis.feedback}</div>
                </div>
              )}

              {gestureAnalysis && (
                <div className="feedback-item">
                  <label>Gestures:</label>
                  <div className="engagement-indicator">
                    <span
                      className="status-badge"
                      style={{ backgroundColor: getStatusColor(gestureAnalysis.status) }}
                    >
                      {gestureAnalysis.label.replace('_', ' ')}
                    </span>
                    <span className="score">activity {gestureAnalysis.activity}</span>
                  </div>
                  <div className="feedback-text">{gestureAnalysis.feedback}</div>
                </div>
              )}

              <div className="feedback-item">
                <label>Speech Recognition:</label>
                <div className="speech-status">
                  {isListening ? (
                    <span className="listening">🎤 Listening...</span>
                  ) : (
                    <span className="not-listening">🎤 Not listening</span>
                  )}
                </div>
                {speechError && (
                  <div className="feedback-text" style={{ color: '#f44336', marginTop: '5px' }}>
                    {speechError}
                  </div>
                )}
              </div>
            </div>

            {speechText && (
              <div className="speech-panel">
                <h4>Live Transcript:</h4>
                <div className="speech-text">
                  {speechText}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Simulator; 