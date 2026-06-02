import React, { useEffect, useMemo, useRef, useState } from 'react';
import './Simulator.css';
import sentimentAnalyzer from '../utils/sentimentAnalysis';
import facialAnalyzer from '../utils/facialAnalysis';
import AnalysisDashboard from './AnalysisDashboard';

// Point to your backend on port 5050
// Point to your backend (proxy handles this in dev, relative path in prod)
const apiBase = '';

const MockInterview = () => {
	const [profileText, setProfileText] = useState('');
	const [loading, setLoading] = useState(false);
	const [questions, setQuestions] = useState([]);
	const [currentIdx, setCurrentIdx] = useState(0);
	const [answer, setAnswer] = useState('');
	const [results, setResults] = useState([]);
	const [sessionComplete, setSessionComplete] = useState(false);
	const [cameraOn, setCameraOn] = useState(false);
	const [micOn, setMicOn] = useState(false);
	const [mediaError, setMediaError] = useState('');
	const videoRef = useRef(null);
	const mediaStreamRef = useRef(null);
	const [facialSnapshot, setFacialSnapshot] = useState({ eyeContact: 50, postureScore: 50 });
	// Speech-to-Text (Web Speech API)
	const recognitionRef = useRef(null);
	const [isRecording, setIsRecording] = useState(false);
	const [recordStartMs, setRecordStartMs] = useState(null);
	const [lastRecordDurationMs, setLastRecordDurationMs] = useState(null);
	// Live metrics for display
	const [currentEmotion, setCurrentEmotion] = useState('');
	const [confidence, setConfidence] = useState(0);
	const [facialEngagement, setFacialEngagement] = useState(null);
	const [toneAnalysis, setToneAnalysis] = useState(null);
	const [volumeAnalysis, setVolumeAnalysis] = useState(null);
	const [paceAnalysis, setPaceAnalysis] = useState(null);
	const [fillerAnalysis, setFillerAnalysis] = useState(null);
	const [postureAnalysis, setPostureAnalysis] = useState(null);
	const [gestureAnalysis, setGestureAnalysis] = useState(null);
	const [currentVolume, setCurrentVolume] = useState(0);
	const [facialReady, setFacialReady] = useState(false);
	const [sessionActive, setSessionActive] = useState(false);
	const [showAnalysisDashboard, setShowAnalysisDashboard] = useState(false);
	const [sessionAnalysisData, setSessionAnalysisData] = useState(null);
	const [sessionStartTime, setSessionStartTime] = useState(null);
	const [cumulativeTranscript, setCumulativeTranscript] = useState('');
	const [totalSpeakingTime, setTotalSpeakingTime] = useState(0);


	useEffect(() => {
		sentimentAnalyzer.initialize();

		// Initialize facial analysis models
		try {
			if (facialAnalyzer && typeof facialAnalyzer.initialize === 'function') {
				facialAnalyzer.initialize();
			}
		} catch { }

		// Defer Web Speech object creation until first user gesture to avoid autoplay/permission issues
		const initRecognition = () => {
			try {
				if (recognitionRef.current) return;
				const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
				if (!SpeechRecognition) return;
				const recognition = new SpeechRecognition();
				recognition.lang = 'en-US';
				recognition.continuous = true;
				recognition.interimResults = true;
				recognition.maxAlternatives = 1;
				// Improve accuracy settings
				if (recognition.serviceURI) {
					recognition.serviceURI = 'wss://www.google.com/speech-api/full-duplex/v1/up';
				}

				// Reduce auto-restart storms with a small cooldown
				let lastRestartAt = 0;

				recognition.onresult = (event) => {
					let interim = '';
					let finalText = '';
					for (let i = event.resultIndex; i < event.results.length; i++) {
						const result = event.results[i];
						const transcript = result[0].transcript;
						const confidence = result[0].confidence || 0.8; // Default confidence if not provided

						// Only process results with reasonable confidence
						if (confidence > 0.3) {
							if (result.isFinal) {
								finalText += transcript + ' ';
							} else {
								interim += transcript;
							}
						}
					}
					const combined = (finalText.trim() || interim.trim());
					if (combined) {
						setAnswer(combined);
						// Accumulate final text to cumulative transcript
						if (finalText.trim()) {
							setCumulativeTranscript(prev => prev + ' ' + finalText.trim());
						}
					}
				};

				recognition.onstart = () => setIsRecording(true);

				recognition.onend = () => {
					if (sessionActive) {
						const now = Date.now();
						if (now - lastRestartAt > 500) {
							lastRestartAt = now;
							try { recognition.start(); } catch { }
						}
					} else {
						setIsRecording(false);
					}
				};

				recognition.onerror = (e) => {
					setIsRecording(false);
					if (e.error === 'not-allowed' || e.error === 'audio-capture') {
						alert('Microphone access is blocked. Click the mic icon in the address bar to Allow, then reload.');
					}
					if (sessionActive && (e.error === 'no-speech' || e.error === 'network' || e.error === 'aborted')) {
						const now = Date.now();
						if (now - lastRestartAt > 500) {
							lastRestartAt = now;
							try { recognition.start(); } catch { }
						}
					}
				};

				recognitionRef.current = recognition;
				window.removeEventListener('click', initRecognition, { capture: true });
				window.removeEventListener('keydown', initRecognition, { capture: true });
			} catch (e) {
				console.warn('SpeechRecognition not available:', e);
			}
		};

		// Hook into the first user gesture to initialize SR cleanly
		window.addEventListener('click', initRecognition, { once: true, capture: true });
		window.addEventListener('keydown', initRecognition, { once: true, capture: true });

		return () => {
			sentimentAnalyzer.resetSession();
			facialAnalyzer.resetSession();
			if (mediaStreamRef.current) {
				mediaStreamRef.current.getTracks().forEach(t => t.stop());
			}
			if (recognitionRef.current && isRecording) {
				try { recognitionRef.current.stop(); } catch { }
			}
			try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch { }
		};
	}, [sessionActive, isRecording]);

	// Auto-speak question on load and when index changes
	useEffect(() => {
		if (!questions || questions.length === 0) return;
		if (!questions[currentIdx]?.question) return;
		speakCurrentQuestion();
	}, [questions, currentIdx]);

	// Live facial analysis while camera is on
	useEffect(() => {
		let intervalId;
		const runAnalysis = async () => {
			try {
				if (!cameraOn || !videoRef.current || !facialReady) return;
				if (!facialAnalyzer || typeof facialAnalyzer.analyze !== 'function') return;
				const metrics = await facialAnalyzer.analyze(videoRef.current);
				if (metrics && typeof metrics === 'object') {
					setFacialSnapshot(prev => ({
						...prev,
						...metrics
					}));
					// Update live metrics for display
					if (metrics.emotion) setCurrentEmotion(metrics.emotion);
					if (metrics.confidence !== undefined) setConfidence(metrics.confidence);
					if (metrics.facialEngagement) setFacialEngagement(metrics.facialEngagement);
					if (metrics.postureAnalysis) setPostureAnalysis(metrics.postureAnalysis);
					if (metrics.gestureAnalysis) setGestureAnalysis(metrics.gestureAnalysis);
				} else {
					// Help diagnose when models aren't returning anything
					console.warn('Facial analysis returned no metrics');
				}
			} catch (e) {
				// ignore individual frame errors
			}
		};
		if (cameraOn && facialReady) {
			intervalId = setInterval(runAnalysis, 1000);
		}
		return () => {
			if (intervalId) clearInterval(intervalId);
		};
	}, [cameraOn, facialReady]);

	// Live voice analysis while mic is on
	useEffect(() => {
		let intervalId;
		const runVoiceAnalysis = () => {
			try {
				if (!micOn) return;

				// Get current volume
				const volume = sentimentAnalyzer.getVolumeLevel();
				setCurrentVolume(volume);

				// Analyze tone
				const tone = sentimentAnalyzer.detectTone(answer, volume, null);
				if (tone) {
					setToneAnalysis({
						dominantTone: tone.emotion || 'neutral',
						confidence: tone.confidence || 50
					});
				}

				// Analyze volume
				if (volume > 0) {
					let status = 'good';
					let message = 'Good volume level';
					if (volume < 20) {
						status = 'too_low';
						message = 'Speak louder';
					} else if (volume > 80) {
						status = 'too_high';
						message = 'Lower your voice';
					}
					setVolumeAnalysis({ status, message });
				}

				// Analyze pace and fillers
				if (answer.trim()) {
					const words = answer.trim().split(/\s+/).length;
					const wpm = lastRecordDurationMs && lastRecordDurationMs > 0
						? Math.max(0, Math.round(words / (lastRecordDurationMs / 60000)))
						: 0;

					if (wpm > 0) {
						let status = 'good';
						let feedback = 'Good speaking pace';
						if (wpm < 120) {
							status = 'too_slow';
							feedback = 'Speak a bit faster';
						} else if (wpm > 200) {
							status = 'too_fast';
							feedback = 'Slow down slightly';
						}
						setPaceAnalysis({ status, wpm, feedback });
					}

					const filler = sentimentAnalyzer.detectFillersAndPauses(answer, Date.now());
					if (filler) {
						const fillerWords = ['um', 'uh', 'like', 'you know', 'so', 'well'];
						const words = answer.toLowerCase().split(/\s+/);
						const fillerCount = words.filter(word => fillerWords.includes(word)).length;
						const fillerPercentage = words.length > 0 ? Math.round((fillerCount / words.length) * 100) : 0;

						setFillerAnalysis({
							fillerCount,
							fillerPercentage,
							feedback: fillerPercentage > 8 ? 'Try to reduce filler words' : 'Good use of language'
						});
					}
				}
			} catch (e) {
				// ignore voice analysis errors
			}
		};

		if (micOn) {
			intervalId = setInterval(runVoiceAnalysis, 2000);
		}
		return () => {
			if (intervalId) clearInterval(intervalId);
		};
	}, [micOn, answer, lastRecordDurationMs]);

	// Helper function for status colors
	const getStatusColor = (status) => {
		switch (status) {
			case 'excellent': case 'good': return '#4CAF50';
			case 'fair': case 'moderate': return '#FF9800';
			case 'poor': case 'bad': case 'too_low': case 'too_high': case 'too_slow': case 'too_fast': return '#f44336';
			default: return '#9E9E9E';
		}
	};

	const startRecordingAnswer = () => {
		if (!recognitionRef.current) {
			alert('Speech recognition not supported in this browser. Please type your answer.');
			return;
		}
		try {
			setAnswer('');
			setLastRecordDurationMs(null);
			setRecordStartMs(Date.now());
			recognitionRef.current.start();
		} catch { }
	};

	const stopRecordingAnswer = () => {
		if (recognitionRef.current) {
			recognitionRef.current.stop();
		}
		if (recordStartMs) {
			const duration = Date.now() - recordStartMs;
			setLastRecordDurationMs(duration);
			setTotalSpeakingTime(prev => prev + duration);
			setRecordStartMs(null);
		}
	};

	// Text-to-Speech for questions
	const speakCurrentQuestion = () => {
		try {
			const synth = window.speechSynthesis;
			if (!synth || !questions[currentIdx]?.question) return;
			synth.cancel();
			const text = `Question ${currentIdx + 1} of ${questions.length}. ${questions[currentIdx].question}`;
			const utter = new SpeechSynthesisUtterance(text);
			utter.lang = 'en-US';
			utter.rate = 1.0;
			utter.pitch = 1.0;
			synth.speak(utter);
		} catch { }
	};

	const startMedia = async () => {
		try {
			// Proactively request permissions when possible
			try {
				if (navigator.permissions && navigator.permissions.query) {
					await navigator.permissions.query({ name: 'camera' }).catch(() => { });
					await navigator.permissions.query({ name: 'microphone' }).catch(() => { });
				}
			} catch { }
			if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
				alert('This browser does not support camera access. Try latest Chrome/Edge/Firefox.');
				return;
			}
			// Stop any existing stream first
			if (mediaStreamRef.current) {
				try { mediaStreamRef.current.getTracks().forEach(t => t.stop()); } catch { }
			}
			// Prefer a concrete camera when known
			let constraints = { video: { facingMode: { ideal: 'user' } }, audio: true };
			try {
				const devices = await navigator.mediaDevices.enumerateDevices();
				const cam = devices.find(d => d.kind === 'videoinput');
				if (cam) constraints = { video: { deviceId: { exact: cam.deviceId } }, audio: true };
			} catch { }
			const stream = await navigator.mediaDevices.getUserMedia(constraints);
			mediaStreamRef.current = stream;
			if (videoRef.current) {
				videoRef.current.setAttribute('playsinline', 'true');
				videoRef.current.muted = true;
				videoRef.current.srcObject = stream;
				// Ensure video element has dimensions before analysis
				await new Promise((resolve) => {
					if (videoRef.current.readyState >= 2) return resolve();
					videoRef.current.onloadedmetadata = () => resolve();
				});
				try { await videoRef.current.play(); } catch { }
				try {
					if (facialAnalyzer && typeof facialAnalyzer.initialize === 'function') {
						await facialAnalyzer.initialize();
					}
					setFacialReady(true);
				} catch (e) { console.warn('Facial analyzer init failed:', e); }
			}
			sentimentAnalyzer.connectAudioStream(stream);
			setCameraOn(true);
			setMicOn(true);
		} catch (e) {
			console.error(e);
			let message = 'Unable to access camera/microphone. Check browser permissions.';
			if (e && e.name === 'NotAllowedError') {
				message = 'Permission denied. Click the camera icon in the address bar to allow access and try again.';
			} else if (e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError')) {
				message = 'No camera or microphone found. Connect a device and try again.';
			} else if (e && (e.name === 'NotReadableError' || e.name === 'TrackStartError')) {
				message = 'Camera appears busy. Close other apps using the camera and retry.';
			} else if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
				message = 'Camera access requires HTTPS or localhost. Use http://localhost during development or serve over HTTPS.';
			}
			setMediaError(message);
		}
	};

	const stopMedia = () => {
		if (mediaStreamRef.current) mediaStreamRef.current.getTracks().forEach(t => t.stop());
		setCameraOn(false);
		setMicOn(false);
	};

	const startSession = async () => {
		try {
			setSessionActive(true);
			setSessionComplete(false);
			setResults([]);
			setAnswer('');
			setCumulativeTranscript('');
			setTotalSpeakingTime(0);
			setSessionStartTime(Date.now());
			// Ensure media ready for live metrics
			if (!cameraOn || !micOn) {
				await startMedia();
			}
			// Auto-start speech recognition if available
			if (recognitionRef.current && !isRecording) {
				try { startRecordingAnswer(); } catch { }
			}
		} catch { }
	};

	const endSession = () => {
		try {
			if (isRecording && recognitionRef.current) {
				recognitionRef.current.stop();
			}

			// Collect session data for analysis
			const fullTranscript = results.map(r => `Q: ${r.question}\nYour Answer: ${r.answer}`).join('\n\n');
			const totalWords = results.map(r => r.answer).join(' ').split(/\s+/).filter(word => word.length > 0).length;
			const sessionDuration = sessionStartTime ? Date.now() - sessionStartTime : 0;
			
			// If user typed instead of using voice recording, estimate speaking time (150 WPM) to avoid WPM penalty
			let finalSpeakingTime = totalSpeakingTime;
			if (finalSpeakingTime === 0 && totalWords > 0) {
				finalSpeakingTime = (totalWords / 150) * 60000;
			}

			const analysisData = {
				fullTranscript,
				totalWords,
				totalSpeakingTime: finalSpeakingTime,
				results: results,
				questions: questions,
				answers: results.map(r => r.answer),
				sessionDuration: sessionDuration
			};


			setSessionAnalysisData(analysisData);
			setShowAnalysisDashboard(true);

			stopMedia();
			setSessionComplete(true);
		} catch { }
		setSessionActive(false);
	};


	// Initialize session state on mount without triggering media prompts
	useEffect(() => {
		setSessionActive(true);
		setSessionStartTime(Date.now());
		setSessionComplete(false);
		setResults([]);
		setCumulativeTranscript('');
		setTotalSpeakingTime(0);
	}, []);

	const restartInterview = () => {
		setShowAnalysisDashboard(false);
		setSessionAnalysisData(null);
		setQuestions([]);
		setResults([]);
		setAnswer('');
		setCurrentIdx(0);
		setSessionComplete(false);
		setSessionActive(true);
		setSessionStartTime(Date.now());
		setCumulativeTranscript('');
		setTotalSpeakingTime(0);
	};

	const generateQuestions = async () => {
		if (!profileText.trim()) return;
		setLoading(true);
		try {
			const resp = await fetch(`${apiBase}/api/generate-questions`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ profileText, numQuestions: 6 })
			});
			if (!resp.ok) {
				const errData = await resp.json().catch(() => ({}));
				alert(`Failed to generate questions: ${errData.error || resp.statusText}. Make sure the backend server is running on port 5050.`);
				return;
			}
			const data = await resp.json();
			// Normalize and keep questions concise & human-like
			const normalized = (data.questions || []).map((q) => {
				const obj = typeof q === 'string' ? { question: q } : q;
				let text = (obj.question || '').trim();
				// Keep first sentence if multiple, and trim to ~140 chars
				const firstSentence = text.split(/[!?\.]/)[0].trim();
				text = firstSentence.length > 0 ? firstSentence : text;
				if (text.length > 140) text = text.slice(0, 137).trim() + '...';
				// Ensure natural phrasing (remove trailing quotes/backticks)
				text = text.replace(/^"|^\'|^`/, '').replace(/"$|\'$|`$/, '');
				return { ...obj, question: text };
			});
			if (normalized.length === 0) {
				alert('No questions were generated. Try providing more details in your profile.');
				return;
			}
			setQuestions(normalized);
			setCurrentIdx(0);
			setResults([]);
			setSessionComplete(false);
		} catch (e) {
			console.error(e);
			alert('Could not connect to the server. Make sure the backend is running:\n\ncd to project folder and run: npm run server');
		} finally {
			setLoading(false);
		}
	};

	const takeFacialSnapshot = async () => {
		try {
			if (!videoRef.current) return;
			if (facialAnalyzer && typeof facialAnalyzer.analyze === 'function') {
				const metrics = await facialAnalyzer.analyze(videoRef.current);
				if (metrics && typeof metrics === 'object') {
					setFacialSnapshot(prev => ({ ...prev, ...metrics }));
				} else {
					setFacialSnapshot(prev => ({ ...prev }));
				}
			} else {
				setFacialSnapshot(prev => ({ ...prev }));
			}
		} catch (e) {
			console.error(e);
		}
	};

	const evaluateAnswer = async () => {
		if (!answer.trim() || !questions[currentIdx]) return;

		// Voice metrics (simplified): map from sentiment/tone and optional volume
		const volume = sentimentAnalyzer.getVolumeLevel();
		const filler = sentimentAnalyzer.detectFillersAndPauses(answer, Date.now());
		const tone = sentimentAnalyzer.detectTone(answer, volume, null);
		const words = answer.trim().length ? answer.trim().split(/\s+/).length : 0;
		const wpm = lastRecordDurationMs && lastRecordDurationMs > 0
			? Math.max(0, Math.round(words / (lastRecordDurationMs / 60000)))
			: 0;

		await takeFacialSnapshot();

		const modalities = {
			voice: {
				volume,
				wpm,
				toneConfidence: tone.confidence || 50,
				fillerCount: filler?.fillerCount ?? undefined,
				pauseCount: filler?.pauseCount ?? undefined,
				totalPauseMs: filler?.totalPauseMs ?? undefined
			},
			facial: {
				eyeContact: facialSnapshot?.eyeContact ?? 50,
				postureScore: facialSnapshot?.postureScore ?? 50,
				smileScore: facialSnapshot?.smileScore ?? undefined,
				headPose: facialSnapshot?.headPose ?? undefined
			}
		};

		setLoading(true);
		try {
			const resp = await fetch(`${apiBase}/api/evaluate-answer`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					question: questions[currentIdx].question,
					answer,
					modalities
				})
			});
			const data = await resp.json();
			setResults(prev => ([
				...prev,
				{
					question: questions[currentIdx].question,
					answer,
					scores: data.scores,
					feedback: data.feedback
				}
			]));
			setAnswer('');
			if (currentIdx < questions.length - 1) {
				setCurrentIdx(currentIdx + 1);
			} else {
				// End session after last question
				setSessionComplete(true);
				try { window.speechSynthesis && window.speechSynthesis.cancel(); } catch { }
				if (recognitionRef.current && isRecording) {
					recognitionRef.current.stop();
				}
			}
		} catch (e) {
			console.error(e);
		} finally {
			setLoading(false);
		}
	};

	const summary = useMemo(() => {
		if (results.length === 0) return null;
		const avg = (arr) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
		const tech = avg(results.map(r => r.scores?.technicalAccuracy || 0));
		const clarity = avg(results.map(r => r.scores?.clarity || 0));
		const confidence = avg(results.map(r => r.scores?.confidence || 0));
		return { tech, clarity, confidence };
	}, [results]);

	const overallFeedback = useMemo(() => {
		if (!summary || results.length === 0) return '';
		const parts = [];
		if (summary.tech >= 75) parts.push('Strong technical depth');
		else if (summary.tech >= 50) parts.push('Decent technical coverage');
		else parts.push('Work on technical accuracy');
		if (summary.clarity >= 75) parts.push('clear communication');
		else if (summary.clarity >= 50) parts.push('okay structure');
		else parts.push('improve structure and conciseness');
		if (summary.confidence >= 75) parts.push('confident delivery');
		else if (summary.confidence >= 50) parts.push('moderate confidence');
		else parts.push('build confidence and reduce fillers');
		const tips = [];
		results.forEach(r => {
			if (Array.isArray(r.feedback?.tips)) {
				r.feedback.tips.slice(0, 1).forEach(t => tips.push(t));
			}
		});
		const tipsLine = tips.length ? ` Tips: ${tips.slice(0, 3).join(' | ')}` : '';
		return `${parts.join(', ')}.${tipsLine}`;
	}, [summary, results]);

	// Show Analysis Dashboard if session is complete
	if (showAnalysisDashboard && sessionAnalysisData) {
		return <AnalysisDashboard sessionData={sessionAnalysisData} onRestart={restartInterview} />;
	}

	return (
		<div className="simulator-container">
			<div className="controls">
				<h2>🔴 Mock Interview (AI-Powered)</h2>
				<div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '8px 0 12px 0' }}>
					<button onClick={endSession} disabled={!sessionActive}>End Session</button>
				</div>
				<textarea
					value={profileText}
					onChange={(e) => setProfileText(e.target.value)}
					placeholder="Paste resume, skills, or project details here..."
					rows={6}
				/>
				<div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
					<button onClick={generateQuestions} disabled={loading || !profileText.trim()}>Generate Questions</button>
					{!cameraOn || !micOn ? (
						<button onClick={startMedia}>Enable Camera & Mic</button>
					) : (
						<button onClick={stopMedia}>Disable Camera & Mic</button>
					)}
				</div>
				{mediaError && (
					<div style={{ marginTop: 8, padding: 8, backgroundColor: '#ffebee', color: '#c62828', borderRadius: 4, fontSize: '13px' }}>
						{mediaError}
					</div>
				)}
			</div>


			<div className="simulator-grid">
				<div className="video-panel">
					<video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', borderRadius: 8, background: '#000' }} />
					{isRecording && (
						<div className="recording-indicator">
							<div className="recording-dot"></div>
							<span>Recording in progress...</span>
						</div>
					)}
				</div>
				<div className="prompt-panel">
					<h3>AI Interviewer</h3>
					{questions.length === 0 ? (
						<p>Provide your profile and click Generate Questions.</p>
					) : (
						<div>
							<div style={{ marginBottom: 8 }}>
								<span style={{ fontWeight: 600 }}>Question {currentIdx + 1} of {questions.length}</span>
								<p style={{ marginTop: 6 }}>{questions[currentIdx]?.question}</p>
							</div>
							<textarea
								value={answer}
								onChange={(e) => setAnswer(e.target.value)}
								placeholder="Type your answer here (or speak and then summarize)..."
								rows={5}
							/>
							<div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
								{!isRecording ? (
									<button onClick={startRecordingAnswer}>🎙 Start Recording</button>
								) : (
									<button onClick={stopRecordingAnswer} style={{ backgroundColor: '#f44336', color: 'white' }}>⏹ Stop Recording</button>
								)}
								<button onClick={speakCurrentQuestion} disabled={!questions[currentIdx]?.question}>🔊 Speak Question</button>
								<button onClick={evaluateAnswer} disabled={loading || !answer.trim()}>Submit Answer</button>
								{currentIdx < questions.length - 1 && (
									<button onClick={() => { setAnswer(''); setCurrentIdx(currentIdx + 1); }}>Skip</button>
								)}
							</div>
							{isRecording && (
								<div style={{
									marginTop: 8,
									padding: 8,
									backgroundColor: '#e3f2fd',
									border: '1px solid #2196f3',
									borderRadius: 4,
									display: 'flex',
									alignItems: 'center',
									gap: 8
								}}>
									<div style={{
										width: 12,
										height: 12,
										backgroundColor: '#f44336',
										borderRadius: '50%',
										animation: 'pulse 1s infinite'
									}}></div>
									<span style={{ fontSize: '14px', color: '#1976d2' }}>Recording in progress...</span>
								</div>
							)}
						</div>
					)}
				</div>
				<div className="metrics-panel">
					<h3>Performance</h3>
					{/* Live Metrics Display */}
					{(cameraOn || micOn) && (
						<div style={{ marginBottom: 16, padding: 12, background: '#f8f9fa', borderRadius: 8, border: '1px solid #e9ecef' }}>
							<h4 style={{ margin: '0 0 8px 0', fontSize: 14, color: '#495057' }}>Live Feedback</h4>

							{/* Basic metrics */}
							{currentEmotion && (
								<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
									<span style={{ fontSize: 12, color: '#6c757d' }}>Emotion:</span>
									<span style={{ fontSize: 12, fontWeight: 500, color: '#495057' }}>{currentEmotion}</span>
								</div>
							)}

							{confidence > 0 && (
								<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
									<span style={{ fontSize: 12, color: '#6c757d' }}>Confidence:</span>
									<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
										<div style={{ width: 60, height: 4, background: '#e9ecef', borderRadius: 2, overflow: 'hidden' }}>
											<div
												style={{
													width: `${confidence}%`,
													height: '100%',
													background: confidence >= 70 ? '#4CAF50' : confidence >= 40 ? '#FF9800' : '#f44336',
													transition: 'width 0.3s ease'
												}}
											></div>
										</div>
										<span style={{ fontSize: 12, fontWeight: 500 }}>{confidence}%</span>
									</div>
								</div>
							)}

							{/* Facial engagement */}
							{facialEngagement && (
								<>
									{facialEngagement.smile && (
										<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
											<span style={{ fontSize: 12, color: '#6c757d' }}>Smile:</span>
											<span
												style={{
													fontSize: 11,
													padding: '2px 6px',
													borderRadius: 4,
													background: getStatusColor(facialEngagement.smile.status),
													color: 'white'
												}}
											>
												{facialEngagement.smile.status} ({facialEngagement.smile.score}%)
											</span>
										</div>
									)}

									{facialEngagement.eyeContact && (
										<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
											<span style={{ fontSize: 12, color: '#6c757d' }}>Eye Contact:</span>
											<span
												style={{
													fontSize: 11,
													padding: '2px 6px',
													borderRadius: 4,
													background: getStatusColor(facialEngagement.eyeContact.status),
													color: 'white'
												}}
											>
												{facialEngagement.eyeContact.status} ({facialEngagement.eyeContact.percentage}%)
											</span>
										</div>
									)}
								</>
							)}

							{/* Voice analysis */}
							{toneAnalysis && (
								<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
									<span style={{ fontSize: 12, color: '#6c757d' }}>Tone:</span>
									<span style={{ fontSize: 12, fontWeight: 500 }}>{toneAnalysis.dominantTone} ({toneAnalysis.confidence}%)</span>
								</div>
							)}

							{volumeAnalysis && (
								<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
									<span style={{ fontSize: 12, color: '#6c757d' }}>Volume:</span>
									<span
										style={{
											fontSize: 11,
											padding: '2px 6px',
											borderRadius: 4,
											background: getStatusColor(volumeAnalysis.status),
											color: 'white'
										}}
									>
										{volumeAnalysis.status.replace('_', ' ')} ({Math.round(currentVolume)})
									</span>
								</div>
							)}

							{paceAnalysis && (
								<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
									<span style={{ fontSize: 12, color: '#6c757d' }}>Pace:</span>
									<span
										style={{
											fontSize: 11,
											padding: '2px 6px',
											borderRadius: 4,
											background: getStatusColor(paceAnalysis.status),
											color: 'white'
										}}
									>
										{paceAnalysis.status.replace('_', ' ')} ({paceAnalysis.wpm} WPM)
									</span>
								</div>
							)}

							{fillerAnalysis && (
								<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
									<span style={{ fontSize: 12, color: '#6c757d' }}>Fillers:</span>
									<span
										style={{
											fontSize: 11,
											padding: '2px 6px',
											borderRadius: 4,
											background: fillerAnalysis.fillerPercentage > 8 ? '#f44336' : '#4CAF50',
											color: 'white'
										}}
									>
										{fillerAnalysis.fillerPercentage}% ({fillerAnalysis.fillerCount} words)
									</span>
								</div>
							)}

							{/* Posture and gestures */}
							{postureAnalysis && (
								<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
									<span style={{ fontSize: 12, color: '#6c757d' }}>Posture:</span>
									<span
										style={{
											fontSize: 11,
											padding: '2px 6px',
											borderRadius: 4,
											background: getStatusColor(postureAnalysis.status),
											color: 'white'
										}}
									>
										{postureAnalysis.label} ({postureAnalysis.score}%)
									</span>
								</div>
							)}

							{gestureAnalysis && (
								<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
									<span style={{ fontSize: 12, color: '#6c757d' }}>Gestures:</span>
									<span
										style={{
											fontSize: 11,
											padding: '2px 6px',
											borderRadius: 4,
											background: getStatusColor(gestureAnalysis.status),
											color: 'white'
										}}
									>
										{gestureAnalysis.label.replace('_', ' ')} (activity {gestureAnalysis.activity})
									</span>
								</div>
							)}
						</div>
					)}

					{summary ? (
						<div>
							<p>Technical Accuracy Score: <strong>{summary.tech}</strong></p>
							<p>Communication Score: <strong>{summary.clarity}</strong></p>
							<p>Confidence Score: <strong>{summary.confidence}</strong></p>
							{sessionComplete && (
								<div style={{ marginTop: 8, padding: 8, background: '#f7f7f7', borderRadius: 8 }}>
									<div style={{ fontWeight: 600, marginBottom: 4 }}>Overall Feedback</div>
									<div style={{ fontSize: 14 }}>{overallFeedback}</div>
								</div>
							)}
							<button onClick={() => { setQuestions([]); setResults([]); setAnswer(''); setCurrentIdx(0); setSessionComplete(false); }}>Restart</button>
						</div>
					) : (
						<p>Scores will appear after you start answering.</p>
					)}
					<div style={{ marginTop: 12 }}>
						<h4>Detailed Feedback</h4>
						{results.map((r, i) => (
							<div key={i} style={{ padding: 8, border: '1px solid #ddd', borderRadius: 8, marginBottom: 8 }}>
								<div style={{ fontWeight: 600 }}>Q{i + 1}: {r.question}</div>
								<div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Your answer: {r.answer}</div>
								<div style={{ marginTop: 6 }}>
									<p>Technical: {r.scores?.technicalAccuracy ?? 'N/A'} | Clarity: {r.scores?.clarity ?? 'N/A'} | Confidence: {r.scores?.confidence ?? 'N/A'}</p>
									<p>{r.feedback?.overall || 'No feedback available'}</p>
									{Array.isArray(r.feedback?.tips) && r.feedback.tips.length > 0 && (
										<ul>
											{r.feedback.tips.map((t, idx) => <li key={idx}>{t}</li>)}
										</ul>
									)}
								</div>
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
};

export default MockInterview;
