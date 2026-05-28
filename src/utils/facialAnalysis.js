import * as faceapi from 'face-api.js';

// Enhanced facial analysis for presentation feedback
class FacialAnalyzer {
  constructor() {
    this.previousLandmarks = null;
    this.blinkHistory = [];
    this.headMovements = [];
    this.eyeContactHistory = [];
    this.smileHistory = [];
    this.faceBoxHistory = [];
    this.positionHistory = [];
    this.nervousTics = {
      eyeBlinking: 0,
      headShaking: 0,
      faceTouching: 0,
      lipBiting: 0
    };
    this.baselineEstablished = false;
    this.normalBlinkRate = 15; // blinks per minute
    this.lastBlinkTime = 0;
    this.postureBaseline = null; // { yCenter, height }
    this.postureEma = null; // smoothed posture score
    this.modelsLoaded = false;
    this.lastEyeContactPercent = 50;
  }

  async initialize(modelsPath = '/models') {
    if (this.modelsLoaded) return;
    try {
      // Prefer webgl backend when available
      if (faceapi.tf && faceapi.tf.getBackend && faceapi.tf.setBackend) {
        const backend = faceapi.tf.getBackend();
        if (backend !== 'webgl') {
          try { await faceapi.tf.setBackend('webgl'); await faceapi.tf.ready(); } catch {}
        }
      }
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(modelsPath),
        faceapi.nets.faceLandmark68Net.loadFromUri(modelsPath),
        faceapi.nets.faceExpressionNet.loadFromUri(modelsPath)
      ]);
      this.modelsLoaded = true;
    } catch (err) {
      this.modelsLoaded = false;
      // Surface minimal error without breaking app
      // eslint-disable-next-line no-console
      console.warn('facialAnalysis: model load failed', err);
    }
  }

  async analyze(videoEl) {
    if (!this.modelsLoaded || !videoEl || videoEl.readyState < 2) {
      return null;
    }
    try {
      const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 });
      const det = await faceapi
        .detectSingleFace(videoEl, options)
        .withFaceLandmarks()
        .withFaceExpressions();
      if (!det) return null;

      const engagement = this.analyzeFacialEngagement(det, Date.now());
      const emotionScores = det.expressions || {};
      // Determine dominant emotion
      let dominant = 'neutral';
      let maxScore = 0;
      Object.keys(emotionScores).forEach((k) => {
        if (emotionScores[k] > maxScore) { maxScore = emotionScores[k]; dominant = k; }
      });

      return {
        facialEngagement: {
          smile: engagement.smile,
          eyeContact: engagement.eyeContact,
          nervousTics: engagement.nervousTics,
          overallEngagement: engagement.overallEngagement
        },
        eyeContact: engagement.eyeContact.percentage,
        postureScore: engagement.bodyLanguage && engagement.bodyLanguage.posture ? engagement.bodyLanguage.posture.score : 0,
        smileScore: engagement.smile.score,
        headPose: {
          tilt: engagement.eyeContact.faceAngle
        },
        postureAnalysis: engagement.bodyLanguage ? engagement.bodyLanguage.posture : undefined,
        gestureAnalysis: engagement.bodyLanguage ? engagement.bodyLanguage.gestures : undefined,
        emotion: dominant,
        confidence: Math.round((engagement.overallEngagement.score || 0))
      };
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('facialAnalysis: analyze failed', err);
      return null;
    }
  }

  // Analyze facial engagement metrics
  analyzeFacialEngagement(detection, timestamp = Date.now()) {
    if (!detection || !detection.landmarks) {
      return this.getDefaultEngagement();
    }

    const landmarks = detection.landmarks;
    const expressions = detection.expressions;

    // Analyze smile
    const smileAnalysis = this.analyzeSmile(expressions, landmarks);
    
    // Analyze eye contact
    const eyeContactAnalysis = this.analyzeEyeContact(landmarks, detection.alignedRect);
    
    // Body language (MVP-lite)
    const postureAnalysis = this.analyzePosture(detection, landmarks, timestamp);
    const gestureAnalysis = this.analyzeHandGestures(detection, landmarks, timestamp);
    
    // Detect nervous tics
    const nervousTicsAnalysis = this.detectNervousTics(landmarks, expressions, timestamp);
    
    // Update histories
    this.updateHistories(smileAnalysis, eyeContactAnalysis, nervousTicsAnalysis, timestamp);

    return {
      smile: smileAnalysis,
      eyeContact: eyeContactAnalysis,
      nervousTics: nervousTicsAnalysis,
      overallEngagement: this.calculateOverallEngagement(smileAnalysis, eyeContactAnalysis, nervousTicsAnalysis),
      bodyLanguage: {
        posture: postureAnalysis,
        gestures: gestureAnalysis
      },
      timestamp: timestamp
    };
  }

  // Heuristic posture analysis (slouching vs upright)
  analyzePosture(detection, landmarks, timestamp) {
    const rect = detection.alignedRect && detection.alignedRect.box ? detection.alignedRect.box : (detection.detection ? detection.detection.box : null);
    if (!rect) {
      return { label: 'unknown', score: 0, feedback: 'No face box', status: 'unknown' };
    }
    const yCenter = rect.y + rect.height / 2;
    const height = rect.height;

    // Establish baseline over first few frames
    this.faceBoxHistory.push({ yCenter, height, timestamp });
    if (this.faceBoxHistory.length > 60) this.faceBoxHistory.shift();
    if (!this.postureBaseline && this.faceBoxHistory.length >= 20) {
      const avgY = this.faceBoxHistory.reduce((s, v) => s + v.yCenter, 0) / this.faceBoxHistory.length;
      const avgH = this.faceBoxHistory.reduce((s, v) => s + v.height, 0) / this.faceBoxHistory.length;
      this.postureBaseline = { yCenter: avgY, height: avgH };
    }

    // Head tilt from eyes (roll)
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    const eyeCenterLeft = this.calculateCenter(leftEye);
    const eyeCenterRight = this.calculateCenter(rightEye);
    const tilt = Math.abs(this.calculateFaceAngle(eyeCenterLeft, eyeCenterRight));

    // Pitch proxy: compare eyes->mouth distance and nose->chin to face height
    const mouth = landmarks.getMouth();
    const jaw = landmarks.getJawOutline ? landmarks.getJawOutline() : null;
    const mouthCenter = this.calculateCenter(mouth);
    const eyeLineY = (eyeCenterLeft.y + eyeCenterRight.y) / 2;
    const eyesToMouth = Math.abs(mouthCenter.y - eyeLineY);
    let noseToChin = 0;
    if (jaw && jaw[8]) {
      const noseCenter = this.calculateCenter(landmarks.getNose());
      const chin = jaw[8];
      noseToChin = Math.abs(chin.y - noseCenter.y);
    }
    const normEyesToMouth = height > 0 ? eyesToMouth / height : 0;
    const normNoseToChin = height > 0 ? noseToChin / height : 0;
    const pitchRisk = Math.max(0, (0.22 - normEyesToMouth) * 220) + Math.max(0, (normNoseToChin - 0.18) * 300);

    // Compare current box to baseline
    let slouchScore = 0; // higher means more slouching
    if (this.postureBaseline) {
      const deltaY = yCenter - this.postureBaseline.yCenter; // positive means lower in frame
      const heightRatio = height / this.postureBaseline.height; // >1 means closer/leaning in
      if (deltaY > 10) slouchScore += Math.min(25, (deltaY - 10) * 0.7);
      if (heightRatio > 1.08) slouchScore += Math.min(35, (heightRatio - 1.08) * 180);
      if (tilt > 10) slouchScore += Math.min(15, (tilt - 10) * 0.9);
    }
    // Add pitch risk component
    slouchScore += Math.min(40, pitchRisk);

    let uprightScore = Math.max(0, 100 - Math.round(slouchScore));
    // Smooth with EMA to avoid jitter
    const alpha = 0.2;
    if (this.postureEma === null) this.postureEma = uprightScore;
    else this.postureEma = Math.round(alpha * uprightScore + (1 - alpha) * this.postureEma);
    uprightScore = this.postureEma;
    let label = 'upright';
    let status = 'excellent';
    let feedback = 'Good upright posture.';
    if (uprightScore < 75) {
      label = 'slouching';
      status = 'moderate';
      feedback = 'Sit up straight and level your head.';
    }
    if (uprightScore < 55) {
      label = 'slouching';
      status = 'poor';
      feedback = 'Noticeable slouching. Straighten your back and raise your chin slightly.';
    }

    return { label, score: uprightScore, feedback, status };
  }

  // Heuristic hand gesture balance via head/box movement variability
  analyzeHandGestures(detection, landmarks, timestamp) {
    const rect = detection.alignedRect && detection.alignedRect.box ? detection.alignedRect.box : (detection.detection ? detection.detection.box : null);
    if (!rect) {
      return { label: 'unknown', activity: 0, feedback: 'Insufficient data', status: 'unknown' };
    }

    const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    this.positionHistory.push({ x: center.x, y: center.y, t: timestamp });
    if (this.positionHistory.length > 60) this.positionHistory.shift();

    // Compute movement variability (px/frame)
    let total = 0;
    let count = 0;
    for (let i = 1; i < this.positionHistory.length; i++) {
      const a = this.positionHistory[i - 1];
      const b = this.positionHistory[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      total += Math.sqrt(dx * dx + dy * dy);
      count++;
    }
    const variability = count > 0 ? total / count : 0;

    // Combine with head movement metric
    const headAvg = this.headMovements.length > 0 ? this.headMovements.reduce((s, v) => s + v, 0) / this.headMovements.length : 0;
    const activity = Math.round(variability * 0.7 + headAvg * 0.3);

    let label = 'balanced';
    let status = 'good';
    let feedback = 'Natural hand and head movement.';
    if (activity < 1.5) {
      label = 'too_little';
      status = 'moderate';
      feedback = 'Consider using occasional gestures to emphasize points.';
    } else if (activity > 6) {
      label = 'too_much';
      status = 'poor';
      feedback = 'Gestures seem excessive. Slow down and hold gestures longer.';
    }

    return { label, activity, feedback, status };
  }

  // Analyze smile genuineness and frequency
  analyzeSmile(expressions, landmarks) {
    const happyScore = expressions.happy || 0;
    const neutralScore = expressions.neutral || 0;
    const sadScore = expressions.sad || 0;

    // Check for genuine smile using facial landmarks
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    const mouth = landmarks.getMouth();

    // Calculate mouth curvature for smile detection
    const mouthLeft = mouth[0];
    const mouthRight = mouth[6];
    const mouthCenter = mouth[3];
    
    const leftCurvature = mouthLeft.y - mouthCenter.y;
    const rightCurvature = mouthRight.y - mouthCenter.y;
    const avgCurvature = (leftCurvature + rightCurvature) / 2;

    // Check for eye involvement (Duchenne smile)
    const leftEyeHeight = this.calculateEyeHeight(leftEye);
    const rightEyeHeight = this.calculateEyeHeight(rightEye);
    const eyeInvolvement = (leftEyeHeight + rightEyeHeight) / 2;

    const isSmiling = happyScore > 0.3 || avgCurvature < -2;
    const isGenuineSmile = isSmiling && eyeInvolvement < 8; // Eyes slightly closed when genuinely smiling

    let feedback = '';
    let status = '';

    if (isGenuineSmile) {
      feedback = 'Great genuine smile! You look confident and approachable.';
      status = 'genuine';
    } else if (isSmiling) {
      feedback = 'Good smile! Try to engage your eyes more for a warmer expression.';
      status = 'mild';
    } else if (happyScore < 0.1 && neutralScore < 0.5) {
      feedback = 'Try to smile more - it helps engage your audience.';
      status = 'none';
    } else {
      feedback = 'Neutral expression is fine, but occasional smiles can help.';
      status = 'neutral';
    }

    return {
      isSmiling: isSmiling,
      isGenuine: isGenuineSmile,
      intensity: Math.round(happyScore * 100),
      feedback: feedback,
      status: status,
      score: isGenuineSmile ? 90 : isSmiling ? 70 : neutralScore > 0.5 ? 50 : 30
    };
  }

  // Calculate eye height for smile analysis
  calculateEyeHeight(eyeLandmarks) {
    const top = Math.min(...eyeLandmarks.map(p => p.y));
    const bottom = Math.max(...eyeLandmarks.map(p => p.y));
    return bottom - top;
  }

  // Analyze eye contact quality
  analyzeEyeContact(landmarks, faceRect) {
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    const nose = landmarks.getNose();

    // Calculate eye center positions
    const leftEyeCenter = this.calculateCenter(leftEye);
    const rightEyeCenter = this.calculateCenter(rightEye);
    const noseCenter = this.calculateCenter(nose);

    // Calculate face angle and direction
    const faceAngle = this.calculateFaceAngle(leftEyeCenter, rightEyeCenter);
    const eyeDirection = this.calculateEyeDirection(leftEyeCenter, rightEyeCenter, noseCenter);

    // Normalize direction by inter-eye distance to make thresholds device-independent
    const interEyeDx = rightEyeCenter.x - leftEyeCenter.x;
    const interEyeDy = rightEyeCenter.y - leftEyeCenter.y;
    const interEyeDist = Math.max(1, Math.sqrt(interEyeDx * interEyeDx + interEyeDy * interEyeDy));

    // If face is too small (very low inter-eye pixels), return last stable value instead of 0
    if (interEyeDist < 6) {
      const percent = Math.round(this.lastEyeContactPercent);
      return {
        isLookingAtCamera: false,
        percentage: percent,
        faceAngle: Math.round(this.calculateFaceAngle(leftEyeCenter, rightEyeCenter)),
        eyeDirection: { horizontal: 0, vertical: 0 },
        feedback: percent > 60 ? 'Good eye contact detected previously.' : 'Move closer and center your face for better detection.',
        status: percent > 80 ? 'excellent' : percent > 60 ? 'good' : percent > 40 ? 'moderate' : 'poor',
        score: percent
      };
    }
    const normHorizontal = eyeDirection.horizontal / interEyeDist; // roughly -1..1 when centered
    const normVertical = eyeDirection.vertical / interEyeDist;

    // Determine if looking at camera with more forgiving relative thresholds
    // Face tilt within 15°, horizontal within 0.25 inter-eye, vertical within 0.20 inter-eye
    const isLookingAtCamera = Math.abs(faceAngle) < 15 && 
                              Math.abs(normHorizontal) < 0.25 &&
                              Math.abs(normVertical) < 0.20;

    // Calculate eye contact percentage based on recent history
    const recentEyeContact = this.eyeContactHistory.slice(-14);
    const windowWithCurrent = [...recentEyeContact, isLookingAtCamera];
    let eyeContactPercentage;
    if (windowWithCurrent.length >= 4) {
      eyeContactPercentage = (windowWithCurrent.filter(ec => ec).length / windowWithCurrent.length) * 100;
    } else {
      // Warm-up baseline to avoid constant 0% early on
      eyeContactPercentage = isLookingAtCamera ? 70 : 45;
    }
    // Low-pass filter the percentage with last value for stability
    const alpha = 0.25; // smoothing factor
    eyeContactPercentage = alpha * eyeContactPercentage + (1 - alpha) * (this.lastEyeContactPercent ?? 50);

    let feedback = '';
    let status = '';

    if (eyeContactPercentage > 80) {
      feedback = 'Excellent eye contact! You\'re engaging well with the audience.';
      status = 'excellent';
    } else if (eyeContactPercentage > 60) {
      feedback = 'Good eye contact. Try to maintain it a bit more consistently.';
      status = 'good';
    } else if (eyeContactPercentage > 40) {
      feedback = 'Moderate eye contact. Look at the camera more frequently.';
      status = 'moderate';
    } else {
      feedback = 'Poor eye contact. Try to look at the camera more often.';
      status = 'poor';
    }

    const result = {
      isLookingAtCamera: isLookingAtCamera,
      percentage: Math.max(0, Math.min(100, Math.round(eyeContactPercentage))),
      faceAngle: Math.round(faceAngle),
      eyeDirection: { horizontal: Math.round(normHorizontal * 100) / 100, vertical: Math.round(normVertical * 100) / 100 },
      feedback: feedback,
      status: status,
      score: Math.round(eyeContactPercentage)
    };
    this.lastEyeContactPercent = result.percentage;
    return result;
  }

  // Calculate center point of landmark array
  calculateCenter(landmarks) {
    const x = landmarks.reduce((sum, point) => sum + point.x, 0) / landmarks.length;
    const y = landmarks.reduce((sum, point) => sum + point.y, 0) / landmarks.length;
    return { x, y };
  }

  // Calculate face angle (head tilt)
  calculateFaceAngle(leftEye, rightEye) {
    const deltaY = rightEye.y - leftEye.y;
    const deltaX = rightEye.x - leftEye.x;
    return Math.atan2(deltaY, deltaX) * (180 / Math.PI);
  }

  // Calculate eye direction
  calculateEyeDirection(leftEye, rightEye, nose) {
    const eyeCenter = {
      x: (leftEye.x + rightEye.x) / 2,
      y: (leftEye.y + rightEye.y) / 2
    };

    const horizontal = nose.x - eyeCenter.x;
    const vertical = nose.y - eyeCenter.y;

    return { horizontal, vertical };
  }

  // Detect nervous tics and fidgeting
  detectNervousTics(landmarks, expressions, timestamp) {
    const tics = {
      excessiveBlinking: this.detectExcessiveBlinking(landmarks, timestamp),
      headShaking: this.detectHeadShaking(landmarks),
      nervousExpressions: this.detectNervousExpressions(expressions),
      fidgeting: this.detectFidgeting(landmarks)
    };

    // Count total tics
    const totalTics = Object.values(tics).reduce((sum, tic) => sum + (tic.detected ? 1 : 0), 0);
    
    let feedback = '';
    let severity = 'none';

    if (totalTics === 0) {
      feedback = 'Great composure! No nervous tics detected.';
      severity = 'none';
    } else if (totalTics === 1) {
      feedback = 'Minor nervous behavior detected. Try to stay relaxed.';
      severity = 'mild';
    } else if (totalTics === 2) {
      feedback = 'Some nervous tics detected. Take a deep breath and relax.';
      severity = 'moderate';
    } else {
      feedback = 'Multiple nervous tics detected. Practice relaxation techniques.';
      severity = 'high';
    }

    return {
      tics: tics,
      totalCount: totalTics,
      severity: severity,
      feedback: feedback,
      score: Math.max(0, 100 - (totalTics * 25))
    };
  }

  // Detect excessive blinking
  detectExcessiveBlinking(landmarks, timestamp) {
    const leftEye = landmarks.getLeftEye();
    const rightEye = landmarks.getRightEye();
    
    const leftEyeHeight = this.calculateEyeHeight(leftEye);
    const rightEyeHeight = this.calculateEyeHeight(rightEye);
    const avgEyeHeight = (leftEyeHeight + rightEyeHeight) / 2;

    // Detect blink (eyes significantly closed)
    const isBlink = avgEyeHeight < 3;
    
    if (isBlink && timestamp - this.lastBlinkTime > 200) { // Avoid double counting
      this.blinkHistory.push(timestamp);
      this.lastBlinkTime = timestamp;
      
      // Clean old blinks (older than 1 minute)
      this.blinkHistory = this.blinkHistory.filter(time => timestamp - time < 60000);
    }

    const blinksPerMinute = this.blinkHistory.length;
    const isExcessive = blinksPerMinute > 25; // Normal is 15-20 per minute

    return {
      detected: isExcessive,
      rate: blinksPerMinute,
      severity: blinksPerMinute > 40 ? 'high' : blinksPerMinute > 25 ? 'moderate' : 'normal'
    };
  }

  // Detect head shaking/movement
  detectHeadShaking(landmarks) {
    const nose = landmarks.getNose();
    const noseCenter = this.calculateCenter(nose);

    if (this.previousLandmarks) {
      const prevNose = this.calculateCenter(this.previousLandmarks.getNose());
      const movement = Math.sqrt(
        Math.pow(noseCenter.x - prevNose.x, 2) + 
        Math.pow(noseCenter.y - prevNose.y, 2)
      );

      this.headMovements.push(movement);
      if (this.headMovements.length > 10) {
        this.headMovements.shift();
      }

      const avgMovement = this.headMovements.reduce((a, b) => a + b, 0) / this.headMovements.length;
      const isShaking = avgMovement > 5; // Threshold for head movement

      return {
        detected: isShaking,
        intensity: Math.round(avgMovement),
        severity: avgMovement > 10 ? 'high' : avgMovement > 5 ? 'moderate' : 'low'
      };
    }

    this.previousLandmarks = landmarks;
    return { detected: false, intensity: 0, severity: 'low' };
  }

  // Detect nervous facial expressions
  detectNervousExpressions(expressions) {
    const fearful = expressions.fearful || 0;
    const surprised = expressions.surprised || 0;
    const angry = expressions.angry || 0;
    const sad = expressions.sad || 0;

    const nervousness = fearful + surprised * 0.5 + angry * 0.3 + sad * 0.3;
    const isNervous = nervousness > 0.3;

    return {
      detected: isNervous,
      level: Math.round(nervousness * 100),
      dominantEmotion: fearful > 0.2 ? 'fearful' : surprised > 0.2 ? 'surprised' : angry > 0.2 ? 'angry' : 'sad'
    };
  }

  // Detect general fidgeting (simplified)
  detectFidgeting(landmarks) {
    // This is a simplified version - in a real implementation,
    // you might track more subtle movements and patterns
    const mouth = landmarks.getMouth();
    const mouthCenter = this.calculateCenter(mouth);

    // Track small mouth movements that might indicate nervous habits
    let isFidgeting = false;
    if (this.previousLandmarks) {
      const prevMouth = this.calculateCenter(this.previousLandmarks.getMouth());
      const mouthMovement = Math.abs(mouthCenter.y - prevMouth.y);
      isFidgeting = mouthMovement > 2; // Small threshold for subtle movements
    }

    return {
      detected: isFidgeting,
      type: 'mouth_movement',
      intensity: 'low'
    };
  }

  // Update analysis histories
  updateHistories(smileAnalysis, eyeContactAnalysis, nervousTicsAnalysis, timestamp) {
    this.smileHistory.push({ 
      isSmiling: smileAnalysis.isSmiling, 
      isGenuine: smileAnalysis.isGenuine, 
      timestamp 
    });
    
    this.eyeContactHistory.push(eyeContactAnalysis.isLookingAtCamera);
    
    // Keep only recent history (last 30 seconds)
    const cutoffTime = timestamp - 30000;
    this.smileHistory = this.smileHistory.filter(entry => entry.timestamp > cutoffTime);
    
    if (this.eyeContactHistory.length > 30) {
      this.eyeContactHistory.shift();
    }
  }

  // Calculate overall engagement score
  calculateOverallEngagement(smileAnalysis, eyeContactAnalysis, nervousTicsAnalysis) {
    const smileScore = smileAnalysis.score * 0.3;
    const eyeContactScore = eyeContactAnalysis.score * 0.4;
    const nervousScore = nervousTicsAnalysis.score * 0.3;

    const totalScore = Math.round(smileScore + eyeContactScore + nervousScore);
    
    let level = '';
    if (totalScore > 80) level = 'excellent';
    else if (totalScore > 65) level = 'good';
    else if (totalScore > 50) level = 'moderate';
    else level = 'poor';

    return {
      score: totalScore,
      level: level,
      breakdown: {
        smile: Math.round(smileScore),
        eyeContact: Math.round(eyeContactScore),
        composure: Math.round(nervousScore)
      }
    };
  }

  // Get default engagement values
  getDefaultEngagement() {
    return {
      smile: {
        isSmiling: false,
        isGenuine: false,
        intensity: 0,
        feedback: 'No face detected',
        status: 'unknown',
        score: 0
      },
      eyeContact: {
        isLookingAtCamera: false,
        percentage: 0,
        faceAngle: 0,
        eyeDirection: { horizontal: 0, vertical: 0 },
        feedback: 'No face detected',
        status: 'unknown',
        score: 0
      },
      nervousTics: {
        tics: {},
        totalCount: 0,
        severity: 'none',
        feedback: 'No face detected',
        score: 100
      },
      overallEngagement: {
        score: 0,
        level: 'unknown',
        breakdown: { smile: 0, eyeContact: 0, composure: 0 }
      },
      timestamp: Date.now()
    };
  }

  // Reset analysis data for new session
  resetSession() {
    this.previousLandmarks = null;
    this.blinkHistory = [];
    this.headMovements = [];
    this.eyeContactHistory = [];
    this.smileHistory = [];
    this.faceBoxHistory = [];
    this.positionHistory = [];
    this.nervousTics = {
      eyeBlinking: 0,
      headShaking: 0,
      faceTouching: 0,
      lipBiting: 0
    };
    this.baselineEstablished = false;
    this.lastBlinkTime = 0;
    this.postureBaseline = null;
    this.postureEma = null;
  }
}

// Create singleton instance
const facialAnalyzer = new FacialAnalyzer();

export default facialAnalyzer; 