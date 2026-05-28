// Note: avoid importing tfjs directly to prevent runtime kernel mismatches

// Enhanced sentiment and presentation analysis
class SentimentAnalyzer {
  constructor() {
    this.model = null;
    this.vocabulary = null;
    this.maxLength = 100;
    this.fillerWords = [
      'um', 'uh', 'like', 'you know', 'basically', 'actually', 'literally', 'sort of', 'kind of',
      'well', 'so', 'right', 'okay', 'ok', 'yeah', 'yep', 'hmm', 'erm', 'ah', 'oh',
      'i mean', 'you see', 'i guess', 'i think', 'i suppose', 'i believe',
      'sorta', 'kinda', 'ya know', 'y\'know', 'you know what', 'thing is',
      'the thing is', 'what i mean is', 'what i\'m saying is', 'if you know what i mean',
      'and stuff', 'and things', 'and everything', 'and all that', 'and so on',
      'or whatever', 'or something', 'or anything', 'or whatever it is',
      'i don\'t know', 'i dunno', 'i\'m not sure', 'i guess so', 'i suppose so'
    ];
    this.audioContext = null;
    this.analyzer = null;
    this.dataArray = null;
    this.lastSpeechTime = 0;
    this.speechSegments = [];
    this.pauseDurations = [];
    this.debugMode = true; // Enable debugging
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

  // Get current volume level
  getVolumeLevel() {
    if (!this.analyzer || !this.dataArray) return 0;
    
    this.analyzer.getByteFrequencyData(this.dataArray);
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i];
    }
    return sum / this.dataArray.length;
  }

  // Analyze volume feedback
  analyzeVolume(volumeLevel) {
    if (volumeLevel < 20) {
      return { status: 'too_soft', message: 'Speak louder - your voice is too soft', level: volumeLevel };
    } else if (volumeLevel > 180) {
      return { status: 'too_loud', message: 'Lower your voice - you\'re speaking too loudly', level: volumeLevel };
    } else if (volumeLevel >= 80 && volumeLevel <= 140) {
      return { status: 'just_right', message: 'Perfect volume level!', level: volumeLevel };
    } else {
      return { status: 'moderate', message: 'Good volume level', level: volumeLevel };
    }
  }

  // Detect tone based on frequency analysis and text patterns
  detectTone(text, volumeLevel, frequencyData) {
    const words = text.toLowerCase().split(/\s+/);
    let toneScore = {
      confident: 0,
      monotone: 0,
      enthusiastic: 0,
      anxious: 0
    };

    // Text-based tone indicators
    const confidentWords = ['will', 'can', 'know', 'believe', 'certain', 'sure', 'definitely', 'absolutely'];
    const enthusiasticWords = ['great', 'amazing', 'excited', 'wonderful', 'fantastic', 'love', 'awesome'];
    const anxiousWords = ['maybe', 'perhaps', 'might', 'possibly', 'nervous', 'worried', 'unsure'];
    const fillerCount = this.countFillerWords(text);

    words.forEach(word => {
      if (confidentWords.includes(word)) toneScore.confident += 1;
      if (enthusiasticWords.includes(word)) toneScore.enthusiastic += 1;
      if (anxiousWords.includes(word)) toneScore.anxious += 1;
    });

    // Volume-based tone analysis
    if (volumeLevel > 120) {
      toneScore.enthusiastic += 2;
      toneScore.confident += 1;
    } else if (volumeLevel < 40) {
      toneScore.anxious += 2;
      toneScore.monotone += 1;
    }

    // Filler words indicate anxiety
    if (fillerCount > words.length * 0.1) {
      toneScore.anxious += 3;
    }

    // Frequency analysis for monotone detection
    if (frequencyData) {
      const variability = this.calculateFrequencyVariability(frequencyData);
      if (variability < 10) {
        toneScore.monotone += 3;
      } else if (variability > 30) {
        toneScore.enthusiastic += 2;
      }
    }

    // Determine dominant tone
    const maxTone = Object.keys(toneScore).reduce((a, b) => 
      toneScore[a] > toneScore[b] ? a : b
    );

    return {
      dominantTone: maxTone,
      scores: toneScore,
      confidence: Math.min(100, Math.max(20, toneScore[maxTone] * 20))
    };
  }

  // Calculate frequency variability for monotone detection
  calculateFrequencyVariability(frequencyData) {
    if (!frequencyData || frequencyData.length === 0) return 0;
    
    const mean = frequencyData.reduce((a, b) => a + b, 0) / frequencyData.length;
    const variance = frequencyData.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / frequencyData.length;
    return Math.sqrt(variance);
  }

  // Count filler words in text
  countFillerWords(text) {
    if (!text || text.trim().length === 0) return 0;
    
    // Clean and normalize text
    const cleanText = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation but keep spaces
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
    
    const words = cleanText.split(' ');
    let fillerCount = 0;
    const detectedFillers = [];
    
    // Check for single word fillers
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (this.fillerWords.includes(word)) {
        fillerCount++;
        detectedFillers.push(word);
      }
    }
    
    // Check for multi-word fillers
    for (let i = 0; i < words.length - 1; i++) {
      const twoWordPhrase = `${words[i]} ${words[i + 1]}`;
      if (this.fillerWords.includes(twoWordPhrase)) {
        fillerCount++;
        detectedFillers.push(twoWordPhrase);
      }
    }
    
    // Check for three-word fillers
    for (let i = 0; i < words.length - 2; i++) {
      const threeWordPhrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      if (this.fillerWords.includes(threeWordPhrase)) {
        fillerCount++;
        detectedFillers.push(threeWordPhrase);
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

  // Detect filler words and pauses
  detectFillersAndPauses(text, timestamp) {
    if (!text || text.trim().length === 0) {
      return {
        fillerCount: 0,
        fillerPercentage: 0,
        fillerWords: [],
        feedback: 'No speech detected yet',
        avgPauseDuration: 0
      };
    }
    
    // Clean and normalize text
    const cleanText = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    const words = cleanText.split(' ');
    const detectedFillers = [];
    
    // Check for single word fillers
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (this.fillerWords.includes(word)) {
        detectedFillers.push(word);
      }
    }
    
    // Check for multi-word fillers
    for (let i = 0; i < words.length - 1; i++) {
      const twoWordPhrase = `${words[i]} ${words[i + 1]}`;
      if (this.fillerWords.includes(twoWordPhrase)) {
        detectedFillers.push(twoWordPhrase);
      }
    }
    
    // Check for three-word fillers
    for (let i = 0; i < words.length - 2; i++) {
      const threeWordPhrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      if (this.fillerWords.includes(threeWordPhrase)) {
        detectedFillers.push(threeWordPhrase);
      }
    }
    
    // Track speech timing for pause detection
    if (this.lastSpeechTime > 0) {
      const pauseDuration = timestamp - this.lastSpeechTime;
      if (pauseDuration > 2000) { // 2+ second pause
        this.pauseDurations.push(pauseDuration);
      }
    }
    this.lastSpeechTime = timestamp;

    // Calculate filler word percentage
    const fillerCount = detectedFillers.length;
    const fillerPercentage = words.length > 0 ? (fillerCount / words.length) * 100 : 0;
    
    let feedback = '';
    if (fillerPercentage > 15) {
      feedback = 'Too many filler words - try to pause instead of saying "um" or "uh"';
    } else if (fillerPercentage > 8) {
      feedback = 'Some filler words detected - try to reduce them';
    } else if (fillerPercentage < 3) {
      feedback = 'Great! Very few filler words';
    } else {
      feedback = 'Good control of filler words';
    }

    // Debug logging
    if (this.debugMode) {
      console.log('=== Filler Word Analysis ===');
      console.log('Original text:', text);
      console.log('Clean text:', cleanText);
      console.log('Total words:', words.length);
      console.log('Detected fillers:', detectedFillers);
      console.log('Filler count:', fillerCount);
      console.log('Filler percentage:', fillerPercentage.toFixed(1) + '%');
      console.log('Feedback:', feedback);
      console.log('===========================');
    }

    return {
      fillerCount: fillerCount,
      fillerPercentage: Math.round(fillerPercentage * 10) / 10,
      fillerWords: detectedFillers,
      feedback: feedback,
      avgPauseDuration: this.pauseDurations.length > 0 ? 
        this.pauseDurations.reduce((a, b) => a + b, 0) / this.pauseDurations.length : 0
    };
  }

  // Analyze speaking pace
  analyzeSpeakingPace(words, timeSpan) {
    if (timeSpan <= 0) return { wpm: 0, feedback: 'Start speaking to analyze pace', status: 'unknown' };
    
    const wordsPerMinute = Math.round((words / (timeSpan / 1000)) * 60);
    
    let feedback = '';
    let status = '';
    
    if (wordsPerMinute < 120) {
      feedback = 'Speaking too slowly - try to increase your pace slightly';
      status = 'too_slow';
    } else if (wordsPerMinute > 200) {
      feedback = 'Speaking too fast - slow down to improve clarity';
      status = 'too_fast';
    } else if (wordsPerMinute >= 140 && wordsPerMinute <= 180) {
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
    this.lastSpeechTime = 0;
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