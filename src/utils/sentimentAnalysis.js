// Note: avoid importing tfjs directly to prevent runtime kernel mismatches

// Enhanced sentiment and presentation analysis
class SentimentAnalyzer {
  constructor() {
    this.model = null;
    this.vocabulary = null;
    this.maxLength = 100;
    // Separate single-word and multi-word fillers to prevent double-counting
    this.singleWordFillers = [
      'um', 'uh', 'like', 'basically', 'actually', 'literally',
      'well', 'so', 'right', 'okay', 'ok', 'yeah', 'yep', 'hmm', 'erm', 'ah', 'oh',
      'sorta', 'kinda'
    ];
    this.multiWordFillers = [
      'you know', 'sort of', 'kind of', 'i mean', 'you see', 'i guess', 'i think',
      'i suppose', 'i believe', 'ya know', 'y\'know', 'you know what', 'thing is',
      'the thing is', 'what i mean is', 'what i\'m saying is', 'if you know what i mean',
      'and stuff', 'and things', 'and everything', 'and all that', 'and so on',
      'or whatever', 'or something', 'or anything', 'or whatever it is',
      'i don\'t know', 'i dunno', 'i\'m not sure', 'i guess so', 'i suppose so'
    ];
    // Combined list for backward compat
    this.fillerWords = [...this.singleWordFillers, ...this.multiWordFillers];
    this.audioContext = null;
    this.analyzer = null;
    this.dataArray = null;
    this.lastSpeechTime = 0;
    this.speechSegments = [];
    this.pauseDurations = [];
    this.paceHistory = []; // Track recent speaking pace
    this.debugMode = true; // Enable debugging
    // Cumulative filler tracking across entire session
    this.cumulativeFillerCount = 0;
    this.cumulativeWordCount = 0;
    this.cumulativeFillerWords = [];
  }

  // Initialize with a simple sentiment model and audio analysis
  async initialize() {
    try {
      // For demo purposes, we'll create a simple sentiment scoring system
      // In a real application, you would load a pre-trained model
      this.vocabulary = this.createBasicVocabulary();
      this.model = this.createSimpleModel();
      
      // Initialize audio analysis
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        this.initializeAudioAnalysis();
      }
      
      // Test filler word detection
      this.testFillerWordDetection();
      
      console.log('Sentiment analyzer initialized');
    } catch (error) {
      console.error('Error initializing sentiment analyzer:', error);
    }
  }

  // Initialize audio analysis for volume and tone detection
  async initializeAudioAnalysis() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyzer = this.audioContext.createAnalyser();
      this.analyzer.fftSize = 256;
      const bufferLength = this.analyzer.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
    } catch (error) {
      console.error('Error initializing audio analysis:', error);
    }
  }

  // Connect audio stream to analyzer
  connectAudioStream(stream) {
    if (this.audioContext && this.analyzer) {
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.analyzer);
    }
  }

  // Get current volume level — focus on speech-frequency bins only
  getVolumeLevel() {
    if (!this.analyzer || !this.dataArray) return 0;
    
    this.analyzer.getByteFrequencyData(this.dataArray);
    // Only average speech-relevant frequency bins (indices 2-30).
    // Most speech energy is concentrated here; higher bins are near-zero
    // and drag the average down, causing perpetual "too soft" readings.
    const startBin = 2;
    const endBin = Math.min(30, this.dataArray.length);
    let sum = 0;
    for (let i = startBin; i < endBin; i++) {
      sum += this.dataArray[i];
    }
    return sum / (endBin - startBin);
  }

  // Analyze volume feedback — thresholds tuned for speech-frequency bin averaging
  analyzeVolume(volumeLevel) {
    if (volumeLevel < 5) {
      return { status: 'too_soft', message: 'Speak louder - your voice is too soft', level: volumeLevel };
    } else if (volumeLevel > 160) {
      return { status: 'too_loud', message: 'Lower your voice - you\'re speaking too loudly', level: volumeLevel };
    } else if (volumeLevel >= 25 && volumeLevel <= 120) {
      return { status: 'just_right', message: 'Perfect volume level!', level: volumeLevel };
    } else {
      return { status: 'moderate', message: 'Good volume level', level: volumeLevel };
    }
  }

  // Detect tone based on frequency analysis and text patterns
  detectTone(text, volumeLevel, frequencyData) {
    const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
    let toneScore = {
      confident: 0,
      neutral: 0,
      monotone: 0,
      enthusiastic: 0,
      anxious: 0
    };

    // Baseline: speaking at all is somewhat confident; neutral gets a base score
    // so that when no strong signals are present, we default to neutral
    toneScore.neutral = 2;
    if (words.length > 5) toneScore.confident += 1;

    // Text-based tone indicators (expanded confident list)
    const confidentWords = ['will', 'can', 'know', 'believe', 'certain', 'sure', 'definitely', 'absolutely',
      'clearly', 'must', 'indeed', 'exactly', 'precisely', 'always', 'never', 'important'];
    const enthusiasticWords = ['great', 'amazing', 'excited', 'wonderful', 'fantastic', 'love', 'awesome',
      'excellent', 'brilliant', 'incredible', 'thrilled', 'passionate'];
    const anxiousWords = ['maybe', 'perhaps', 'might', 'possibly', 'nervous', 'worried', 'unsure',
      'afraid', 'scared', 'anxious'];
    const fillerCount = this.countFillerWords(text);

    words.forEach(word => {
      if (confidentWords.includes(word)) toneScore.confident += 1;
      if (enthusiasticWords.includes(word)) toneScore.enthusiastic += 1;
      if (anxiousWords.includes(word)) toneScore.anxious += 1;
    });

    // Volume-based tone analysis — only penalize at very low levels
    if (volumeLevel > 80) {
      toneScore.enthusiastic += 1;
      toneScore.confident += 1;
    } else if (volumeLevel < 10) {
      // Only flag anxiety at extremely low volume
      toneScore.anxious += 1;
    }

    // Filler words indicate anxiety — mild penalty only at high rates
    if (words.length > 0 && fillerCount > words.length * 0.15) {
      toneScore.anxious += 1;
    }

    // Frequency analysis for monotone detection
    if (frequencyData) {
      const variability = this.calculateFrequencyVariability(frequencyData);
      if (variability < 5) {
        toneScore.monotone += 2;
      } else if (variability > 30) {
        toneScore.enthusiastic += 1;
      }
    }

    // Determine dominant tone — exclude neutral from "winning" unless nothing else scores
    const nonNeutralScores = { confident: toneScore.confident, monotone: toneScore.monotone,
      enthusiastic: toneScore.enthusiastic, anxious: toneScore.anxious };
    const maxNonNeutral = Math.max(...Object.values(nonNeutralScores));

    let maxTone;
    if (maxNonNeutral >= toneScore.neutral) {
      // A real tone signal exists
      maxTone = Object.keys(nonNeutralScores).reduce((a, b) =>
        nonNeutralScores[a] > nonNeutralScores[b] ? a : b
      );
    } else {
      maxTone = 'neutral';
    }

    return {
      dominantTone: maxTone,
      scores: toneScore,
      confidence: Math.min(100, Math.max(20, toneScore[maxTone] * 15 + 20))
    };
  }

  // Calculate frequency variability for monotone detection
  calculateFrequencyVariability(frequencyData) {
    if (!frequencyData || frequencyData.length === 0) return 0;
    
    const mean = frequencyData.reduce((a, b) => a + b, 0) / frequencyData.length;
    const variance = frequencyData.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / frequencyData.length;
    return Math.sqrt(variance);
  }

  // Count filler words in text — prevents double-counting multi-word fillers
  countFillerWords(text) {
    if (!text || text.trim().length === 0) return 0;
    
    // Clean and normalize text
    const cleanText = text.toLowerCase()
      .replace(/[^\w\s']/g, ' ') // Remove punctuation but keep apostrophes and spaces
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
    
    const words = cleanText.split(' ');
    let fillerCount = 0;
    const detectedFillers = [];
    // Track which word indices are already consumed by a multi-word filler
    const consumed = new Set();
    
    // Check for multi-word fillers FIRST (longest match wins, prevents double-counting)
    // Sort by word count descending so longer phrases match first
    const sortedMulti = [...this.multiWordFillers].sort((a, b) =>
      b.split(' ').length - a.split(' ').length
    );
    
    for (const phrase of sortedMulti) {
      const phraseWords = phrase.split(' ');
      const phraseLen = phraseWords.length;
      for (let i = 0; i <= words.length - phraseLen; i++) {
        // Skip if any index already consumed
        let alreadyUsed = false;
        for (let j = 0; j < phraseLen; j++) {
          if (consumed.has(i + j)) { alreadyUsed = true; break; }
        }
        if (alreadyUsed) continue;
        
        const candidate = words.slice(i, i + phraseLen).join(' ');
        if (candidate === phrase) {
          fillerCount++;
          detectedFillers.push(phrase);
          for (let j = 0; j < phraseLen; j++) consumed.add(i + j);
        }
      }
    }
    
    // Check for single-word fillers (skip already consumed indices)
    for (let i = 0; i < words.length; i++) {
      if (consumed.has(i)) continue;
      if (this.singleWordFillers.includes(words[i])) {
        fillerCount++;
        detectedFillers.push(words[i]);
        consumed.add(i);
      }
    }
    
    // Debug logging
    if (this.debugMode && detectedFillers.length > 0) {
      console.log('Filler words detected:', detectedFillers);
      console.log('Total filler count:', fillerCount);
      console.log('Original text:', text);
      console.log('Clean text:', cleanText);
    }
    
    return fillerCount;
  }

  // Detect filler words and pauses — with cumulative session tracking
  detectFillersAndPauses(text, timestamp) {
    if (!text || text.trim().length === 0) {
      return {
        fillerCount: this.cumulativeFillerCount,
        fillerPercentage: this.cumulativeWordCount > 0
          ? Math.round((this.cumulativeFillerCount / this.cumulativeWordCount) * 1000) / 10
          : 0,
        fillerWords: this.cumulativeFillerWords,
        feedback: 'No speech detected yet',
        avgPauseDuration: 0
      };
    }
    
    // Count fillers in THIS chunk using the improved countFillerWords
    const chunkFillerCount = this.countFillerWords(text);
    
    // Clean text to count words
    const cleanText = text.toLowerCase()
      .replace(/[^\w\s']/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const words = cleanText.split(' ').filter(w => w.length > 0);
    
    // Detect which fillers are in this chunk for display
    const chunkDetectedFillers = this._extractFillerList(cleanText);
    
    // Accumulate into session totals
    this.cumulativeFillerCount += chunkFillerCount;
    this.cumulativeWordCount += words.length;
    this.cumulativeFillerWords.push(...chunkDetectedFillers);
    
    // Track speech timing for pause detection
    if (this.lastSpeechTime > 0) {
      const pauseDuration = timestamp - this.lastSpeechTime;
      if (pauseDuration > 2000) { // 2+ second pause
        this.pauseDurations.push(pauseDuration);
      }
    }
    this.lastSpeechTime = timestamp;

    // Calculate filler word percentage from SESSION totals
    const fillerPercentage = this.cumulativeWordCount > 0
      ? (this.cumulativeFillerCount / this.cumulativeWordCount) * 100
      : 0;
    
    let feedback = '';
    if (fillerPercentage > 15) {
      feedback = 'Too many filler words - try to pause instead of saying "um" or "uh"';
    } else if (fillerPercentage > 8) {
      feedback = 'Some filler words detected - try to reduce them';
    } else if (this.cumulativeFillerCount === 0) {
      feedback = 'Great! No filler words detected';
    } else if (fillerPercentage < 3) {
      feedback = 'Great! Very few filler words';
    } else {
      feedback = 'Good control of filler words';
    }

    // Debug logging
    if (this.debugMode && chunkDetectedFillers.length > 0) {
      console.log('=== Filler Word Analysis ===');
      console.log('Chunk text:', text);
      console.log('Chunk fillers:', chunkDetectedFillers);
      console.log('Session total fillers:', this.cumulativeFillerCount);
      console.log('Session total words:', this.cumulativeWordCount);
      console.log('Session filler %:', fillerPercentage.toFixed(1) + '%');
      console.log('===========================');
    }

    return {
      fillerCount: this.cumulativeFillerCount,
      fillerPercentage: Math.round(fillerPercentage * 10) / 10,
      fillerWords: this.cumulativeFillerWords,
      feedback: feedback,
      avgPauseDuration: this.pauseDurations.length > 0 ? 
        this.pauseDurations.reduce((a, b) => a + b, 0) / this.pauseDurations.length : 0
    };
  }

  // Helper: extract the list of filler words found in text (for display)
  _extractFillerList(cleanText) {
    const words = cleanText.split(' ').filter(w => w.length > 0);
    const detected = [];
    const consumed = new Set();
    
    const sortedMulti = [...this.multiWordFillers].sort((a, b) =>
      b.split(' ').length - a.split(' ').length
    );
    
    for (const phrase of sortedMulti) {
      const phraseWords = phrase.split(' ');
      const phraseLen = phraseWords.length;
      for (let i = 0; i <= words.length - phraseLen; i++) {
        let alreadyUsed = false;
        for (let j = 0; j < phraseLen; j++) {
          if (consumed.has(i + j)) { alreadyUsed = true; break; }
        }
        if (alreadyUsed) continue;
        if (words.slice(i, i + phraseLen).join(' ') === phrase) {
          detected.push(phrase);
          for (let j = 0; j < phraseLen; j++) consumed.add(i + j);
        }
      }
    }
    
    for (let i = 0; i < words.length; i++) {
      if (consumed.has(i)) continue;
      if (this.singleWordFillers.includes(words[i])) {
        detected.push(words[i]);
        consumed.add(i);
      }
    }
    
    return detected;
  }

  // Analyze speaking pace - Uses rolling window for responsive WPM
  analyzeSpeakingPace(words, timeSpan, isNewSegment = false) {
    if (timeSpan <= 0) return { wpm: 0, feedback: 'Start speaking to analyze pace', status: 'unknown' };
    
    // If it's a new segment, add it to history to calculate rolling WPM
    if (isNewSegment) {
      this.paceHistory.push({ words, time: Date.now() });
      // Keep only the last 15 seconds of speaking history
      const cutoff = Date.now() - 15000;
      this.paceHistory = this.paceHistory.filter(item => item.time > cutoff);
    }
    
    let wordsPerMinute = 0;
    
    if (this.paceHistory.length > 1) {
      // Calculate WPM over the rolling window
      const recentWords = this.paceHistory.reduce((sum, item) => sum + item.words, 0);
      const timeDiffMs = this.paceHistory[this.paceHistory.length - 1].time - this.paceHistory[0].time;
      // Add a small buffer to avoid division by zero or inflated WPM on rapid events
      const rollingTimeSpan = Math.max(timeDiffMs, 2000); 
      wordsPerMinute = Math.round((recentWords / (rollingTimeSpan / 1000)) * 60);
    } else {
      // Fallback to overall session pace if history is too short
      wordsPerMinute = Math.round((words / (timeSpan / 1000)) * 60);
    }
    
    // Prevent erratic jumps by capping WPM to reasonable human limits
    wordsPerMinute = Math.min(wordsPerMinute, 300);

    let feedback = '';
    let status = '';
    
    if (wordsPerMinute < 100) {
      feedback = 'Speaking slowly - try to increase your pace slightly';
      status = 'too_slow';
    } else if (wordsPerMinute > 180) {
      feedback = 'Speaking quickly - slow down to improve clarity';
      status = 'too_fast';
    } else if (wordsPerMinute >= 120 && wordsPerMinute <= 160) {
      feedback = 'Perfect speaking pace!';
      status = 'ideal';
    } else {
      feedback = 'Good speaking pace';
      status = 'good';
    }

    return {
      wpm: wordsPerMinute,
      feedback: feedback,
      status: status
    };
  }

  // Create a basic vocabulary for sentiment analysis
  createBasicVocabulary() {
    const positiveWords = [
      'good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic', 'awesome',
      'love', 'like', 'enjoy', 'happy', 'pleased', 'satisfied', 'perfect',
      'brilliant', 'outstanding', 'superb', 'magnificent', 'delightful',
      'confident', 'strong', 'powerful', 'clear', 'effective', 'successful'
    ];

    const negativeWords = [
      'bad', 'terrible', 'awful', 'horrible', 'hate', 'dislike', 'sad',
      'angry', 'frustrated', 'disappointed', 'upset', 'worried', 'nervous',
      'scared', 'afraid', 'weak', 'confused', 'unclear', 'difficult',
      'problem', 'issue', 'error', 'wrong', 'failed', 'failure'
    ];

    const neutralWords = [
      'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
      'with', 'by', 'from', 'about', 'into', 'through', 'during', 'before',
      'after', 'above', 'below', 'up', 'down', 'out', 'off', 'over', 'under'
    ];

    return {
      positive: positiveWords,
      negative: negativeWords,
      neutral: neutralWords
    };
  }

  // Create a simple sentiment model
  createSimpleModel() {
    return {
      predict: (text) => {
        const words = text.toLowerCase().split(/\s+/);
        let positiveScore = 0;
        let negativeScore = 0;
        let neutralScore = 0;

        words.forEach(word => {
          if (this.vocabulary.positive.includes(word)) {
            positiveScore += 1;
          } else if (this.vocabulary.negative.includes(word)) {
            negativeScore += 1;
          } else {
            neutralScore += 0.1;
          }
        });

        const total = positiveScore + negativeScore + neutralScore;
        if (total === 0) return { sentiment: 'neutral', confidence: 0.5 };

        const normalizedPositive = positiveScore / total;
        const normalizedNegative = negativeScore / total;

        if (normalizedPositive > normalizedNegative) {
          return {
            sentiment: 'positive',
            confidence: Math.min(0.95, 0.5 + normalizedPositive)
          };
        } else if (normalizedNegative > normalizedPositive) {
          return {
            sentiment: 'negative',
            confidence: Math.min(0.95, 0.5 + normalizedNegative)
          };
        } else {
          return {
            sentiment: 'neutral',
            confidence: 0.5
          };
        }
      }
    };
  }

  // Analyze sentiment of given text
  analyzeSentiment(text) {
    if (!this.model || !text.trim()) {
      return { sentiment: 'neutral', confidence: 0.5, score: 0.5 };
    }

    const result = this.model.predict(text);
    
    // Convert to numerical score (0-1 scale)
    let score = 0.5; // neutral
    if (result.sentiment === 'positive') {
      score = 0.5 + (result.confidence - 0.5);
    } else if (result.sentiment === 'negative') {
      score = 0.5 - (result.confidence - 0.5);
    }

    return {
      sentiment: result.sentiment,
      confidence: result.confidence,
      score: Math.max(0, Math.min(1, score))
    };
  }

  // Get speaking confidence based on text analysis
  getSpeakingConfidence(text, emotionData = {}) {
    const sentimentResult = this.analyzeSentiment(text);
    
    // Base confidence from sentiment
    let confidence = sentimentResult.score * 100;
    
    // Adjust based on text length (longer speech might indicate more confidence)
    const wordCount = text.trim().split(/\s+/).length;
    if (wordCount > 20) {
      confidence += 10;
    } else if (wordCount < 5) {
      confidence -= 10;
    }
    
    // Adjust based on emotion if provided
    if (emotionData.happy) {
      confidence += emotionData.happy * 20;
    }
    if (emotionData.sad || emotionData.fearful) {
      confidence -= (emotionData.sad + emotionData.fearful) * 15;
    }
    if (emotionData.angry) {
      confidence -= emotionData.angry * 10;
    }
    
    return Math.max(0, Math.min(100, confidence));
  }

  // Enhanced speaking patterns analysis
  analyzeSpeakingPatterns(speechData) {
    if (!speechData || speechData.length === 0) {
      return {
        avgSentiment: 'neutral',
        sentimentTrend: 'stable',
        confidenceScore: 50,
        wordCount: 0,
        speakingRate: 0,
        fillerWordCount: 0,
        fillerPercentage: 0,
        avgPauseDuration: 0,
        toneAnalysis: { dominantTone: 'neutral', confidence: 50 }
      };
    }

    let totalWords = 0;
    let totalFillers = 0;
    let sentimentScores = [];
    let timespan = 0;

    speechData.forEach((entry, index) => {
      const sentiment = this.analyzeSentiment(entry.text);
      sentimentScores.push(sentiment.score);
      
      const words = entry.text.trim().split(/\s+/);
      totalWords += words.length;
      totalFillers += this.countFillerWords(entry.text);
      
      if (index === speechData.length - 1 && speechData.length > 1) {
        timespan = entry.timestamp - speechData[0].timestamp;
      }
    });

    const avgSentiment = sentimentScores.reduce((a, b) => a + b, 0) / sentimentScores.length;
    
    // Determine trend
    let trend = 'stable';
    if (sentimentScores.length > 2) {
      const firstHalf = sentimentScores.slice(0, Math.floor(sentimentScores.length / 2));
      const secondHalf = sentimentScores.slice(Math.floor(sentimentScores.length / 2));
      
      const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
      
      if (secondAvg > firstAvg + 0.1) {
        trend = 'improving';
      } else if (secondAvg < firstAvg - 0.1) {
        trend = 'declining';
      }
    }

    // Analyze overall tone from all speech
    const allText = speechData.map(entry => entry.text).join(' ');
    const toneAnalysis = this.detectTone(allText, 100, null); // Default volume for analysis

    return {
      avgSentiment: avgSentiment > 0.6 ? 'positive' : avgSentiment < 0.4 ? 'negative' : 'neutral',
      sentimentTrend: trend,
      confidenceScore: Math.round(avgSentiment * 100),
      wordCount: totalWords,
      speakingRate: timespan > 0 ? Math.round((totalWords / (timespan / 1000)) * 60) : 0,
      fillerWordCount: totalFillers,
      fillerPercentage: totalWords > 0 ? Math.round((totalFillers / totalWords) * 1000) / 10 : 0,
      avgPauseDuration: this.pauseDurations.length > 0 ? 
        Math.round(this.pauseDurations.reduce((a, b) => a + b, 0) / this.pauseDurations.length) : 0,
      toneAnalysis: toneAnalysis
    };
  }

  // Reset session data
  resetSession() {
    this.speechSegments = [];
    this.pauseDurations = [];
    this.paceHistory = [];
    this.lastSpeechTime = 0;
    // Reset cumulative filler tracking
    this.cumulativeFillerCount = 0;
    this.cumulativeWordCount = 0;
    this.cumulativeFillerWords = [];
  }

  // Test filler word detection with sample text
  testFillerWordDetection() {
    console.log('=== Testing Filler Word Detection ===');
    
    const testTexts = [
      'um hello there',
      'well you know what i mean',
      'i think um the thing is basically',
      'so like um yeah you know',
      'i don\'t know um i guess so',
      'hello world this is a test',
      'um uh like you know basically actually'
    ];
    
    testTexts.forEach((text, index) => {
      console.log(`Test ${index + 1}: "${text}"`);
      const result = this.detectFillersAndPauses(text, Date.now());
      console.log(`Result: ${result.fillerCount} fillers, ${result.fillerPercentage}%`);
      console.log(`Detected: [${result.fillerWords.join(', ')}]`);
      console.log('---');
    });
    
    console.log('=== End Test ===');
  }
}

// Create singleton instance
const sentimentAnalyzer = new SentimentAnalyzer();

export default sentimentAnalyzer; 