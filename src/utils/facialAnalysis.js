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

    // Compare current box to baseline
    let slouchScore = 0; // higher means more slouching
    if (this.postureBaseline) {
      const deltaY = yCenter - this.postureBaseline.yCenter; // positive means lower in frame
      const heightRatio = height / this.postureBaseline.height; // >1 means closer/leaning in
      // Only count significant vertical drops (>15px, was 10)
      if (deltaY > 15) slouchScore += Math.min(20, (deltaY - 15) * 0.5);
      if (heightRatio > 1.10) slouchScore += Math.min(25, (heightRatio - 1.10) * 120);
      if (tilt > 12) slouchScore += Math.min(10, (tilt - 12) * 0.7);

      // Pitch proxy: compare eyes->mouth distance and nose->chin to face height
      // Only compute pitchRisk AFTER baseline is established
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
      // Reduced multipliers (120 and 150 instead of 220 and 300)
      const pitchRisk = Math.max(0, (0.20 - normEyesToMouth) * 120) + Math.max(0, (normNoseToChin - 0.20) * 150);
      slouchScore += Math.min(25, pitchRisk);
    }

    let uprightScore = Math.max(0, 100 - Math.round(slouchScore));
    // Smooth with EMA to avoid jitter; start at 80 (benefit of the doubt)
    const alpha = 0.15;
    if (this.postureEma === null) this.postureEma = 80;
    this.postureEma = Math.round(alpha * uprightScore + (1 - alpha) * this.postureEma);
    uprightScore = this.postureEma;

    let label = 'upright';
    let status = 'excellent';
    let feedback = 'Good upright posture.';
    if (uprightScore < 65) {
      label = 'slouching';
      status = 'moderate';
      feedback = 'Sit up straight and level your head.';
    }
    if (uprightScore < 45) {
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

  // Analyze eye contact quality — uses iris position within eye bounds + nose-based pose
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

    // Normalize direction by inter-eye distance to make thresholds device-independent
    const interEyeDx = rightEyeCenter.x - leftEyeCenter.x;
    const interEyeDy = rightEyeCenter.y - leftEyeCenter.y;
    const interEyeDist = Math.max(1, Math.sqrt(interEyeDx * interEyeDx + interEyeDy * interEyeDy));

    // If face is too small (very low inter-eye pixels), return last stable value
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

    // --- Iris-based gaze estimation ---
    // For each eye, find the iris center (innermost landmark points 1-2-4-5 for face-api 6-point eye)
    // The iris is approximated as the geometric center of the 6 eye landmarks.
    // Gaze = how far the iris center is from the eye bounding-box center, normalized by eye width.
    const leftEyeBounds = this._getEyeBounds(leftEye);
    const rightEyeBounds = this._getEyeBounds(rightEye);

    // Iris offset: 0 = perfectly centered (looking at camera), 1 = at edge
    const leftIrisOffsetX = leftEyeBounds.width > 0
      ? (leftEyeCenter.x - leftEyeBounds.cx) / (leftEyeBounds.width / 2) : 0;
    const rightIrisOffsetX = rightEyeBounds.width > 0
      ? (rightEyeCenter.x - rightEyeBounds.cx) / (rightEyeBounds.width / 2) : 0;
    const leftIrisOffsetY = leftEyeBounds.height > 0
      ? (leftEyeCenter.y - leftEyeBounds.cy) / (leftEyeBounds.height / 2) : 0;
    const rightIrisOffsetY = rightEyeBounds.height > 0
      ? (rightEyeCenter.y - rightEyeBounds.cy) / (rightEyeBounds.height / 2) : 0;

    const avgIrisH = (Math.abs(leftIrisOffsetX) + Math.abs(rightIrisOffsetX)) / 2;
    const avgIrisV = (Math.abs(leftIrisOffsetY) + Math.abs(rightIrisOffsetY)) / 2;

    // --- Nose-based pose estimation (original method) ---
    const eyeCenter = {
      x: (leftEyeCenter.x + rightEyeCenter.x) / 2,
      y: (leftEyeCenter.y + rightEyeCenter.y) / 2
    };
    const noseHorizontal = (noseCenter.x - eyeCenter.x) / interEyeDist;
    const noseVertical = (noseCenter.y - eyeCenter.y) / interEyeDist;

    // --- Blend both signals for robust detection ---
    // Iris-based is more direct but noisy; nose-based captures head pose.
    // Use generous thresholds since both need to agree something is off.
    const isIrisLooking = avgIrisH < 0.35 && avgIrisV < 0.40;
    const isNoseLooking = Math.abs(noseHorizontal) < 0.45 && Math.abs(noseVertical) < 0.40;
    const isFaceLevel = Math.abs(faceAngle) < 25;

    // Looking at camera if face is level AND at least one gaze method agrees
    const isLookingAtCamera = isFaceLevel && (isIrisLooking || isNoseLooking);

    // Calculate eye contact percentage based on recent history
    const recentEyeContact = this.eyeContactHistory.slice(-14);
    const windowWithCurrent = [...recentEyeContact, isLookingAtCamera];
    let eyeContactPercentage;
    if (windowWithCurrent.length >= 4) {
      eyeContactPercentage = (windowWithCurrent.filter(ec => ec).length / windowWithCurrent.length) * 100;
    } else {
      // Warm-up baseline — generous to avoid low scores early on
      eyeContactPercentage = isLookingAtCamera ? 75 : 55;
    }
    // Low-pass filter the percentage with last value for stability
    const alpha = 0.3;
    eyeContactPercentage = alpha * eyeContactPercentage + (1 - alpha) * (this.lastEyeContactPercent ?? 60);

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
      eyeDirection: { horizontal: Math.round(noseHorizontal * 100) / 100, vertical: Math.round(noseVertical * 100) / 100 },
      feedback: feedback,
      status: status,
      score: Math.round(eyeContactPercentage)
    };
    this.lastEyeContactPercent = result.percentage;
    return result;
  }

  // Helper: get bounding box of an eye landmark array
  _getEyeBounds(eyeLandmarks) {
    const xs = eyeLandmarks.map(p => p.x);
    const ys = eyeLandmarks.map(p => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      width: maxX - minX,
      height: maxY - minY
    };
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

  // Detect nervous tics and fidgeting
  detectNervousTics(landmarks, expressions, timestamp) {
    const tics = {
      excessiveBlinking: this.detectExcessiveBlinking(landmarks, timestamp),
      headShaking: this.detectHeadShaking(landmarks),
      nervousExpressions: this.detectNervousExpressions(expressions),
      fidgeting: this.detectFidgeting(landmarks),
      lipBiting: this.detectLipBiting(landmarks)
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
      score: Math.max(0, 100 - (totalTics * 20))
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
    const mouth = landmarks.getMouth();
    const nose = landmarks.getNose();
    const center = {
      x: (mouth[0].x + mouth[6].x + nose[0].x) / 3,
      y: (mouth[0].y + mouth[6].y + nose[0].y) / 3
    };

    if (!this.fidgetHistory) this.fidgetHistory = [];
    this.fidgetHistory.push(center);
    if (this.fidgetHistory.length > 30) this.fidgetHistory.shift();
    if (this.fidgetHistory.length < 30) return { detected: false, level: 0 };

    const avgX = this.fidgetHistory.reduce((sum, h) => sum + h.x, 0) / this.fidgetHistory.length;
    const avgY = this.fidgetHistory.reduce((sum, h) => sum + h.y, 0) / this.fidgetHistory.length;

    // Calculate variance
    const varianceX = this.fidgetHistory.reduce((sum, h) => sum + Math.pow(h.x - avgX, 2), 0) / this.fidgetHistory.length;
    const varianceY = this.fidgetHistory.reduce((sum, h) => sum + Math.pow(h.y - avgY, 2), 0) / this.fidgetHistory.length;
    const variance = varianceX + varianceY;
    
    // Fidgeting if variance is high (constant small movements)
    // Increased from 200 to 1200 to avoid triggering on normal head movements
    const isFidgeting = variance > 1200;
    
    return {
      detected: isFidgeting,
      level: Math.min(100, Math.round((variance / 1200) * 100))
    };
  }

  // Detect lip biting (heuristic)
  detectLipBiting(landmarks) {
    const mouth = landmarks.getMouth();
    // Inner mouth points for face-api.js: 
    // Upper lip inner bottom: 62, Lower lip inner top: 66
    // Since getMouth returns an array of 20 points, the inner lip starts at index 12.
    // Index 14 is upper inner lip bottom, index 18 is lower inner lip top.
    const upperLipBottom = mouth[14].y;
    const lowerLipTop = mouth[18].y;
    
    // Normal closed mouth has upperLipBottom <= lowerLipTop.
    // If lowerLipTop < upperLipBottom by a significant margin, lips might be folded inwards.
    const isBiting = (upperLipBottom - lowerLipTop) > 3;
    
    return {
      detected: isBiting,
      level: isBiting ? 100 : 0
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
    const smileScore = smileAnalysis.score * 0.3; // 30% weight
    const eyeContactScore = eyeContactAnalysis.score * 0.45; // 45% weight
    const nervousScore = nervousTicsAnalysis.score * 0.25; // 25% weight (higher means LESS nervous)

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
    this.fidgetHistory = [];
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
    this.speechError = false;
  }
}

// Create singleton instance
const facialAnalyzer = new FacialAnalyzer();

export default facialAnalyzer; 