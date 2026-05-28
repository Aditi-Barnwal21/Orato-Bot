# Public Speaking Simulator

A comprehensive web application that helps users practice and improve their public speaking skills through real-time AI-powered analysis of facial expressions, voice patterns, and speech sentiment.

## 🎯 Features

### Core Functionality
- **Real-time Video Analysis**: Uses face-api.js for facial expression and emotion detection
- **Voice Recognition**: Web Speech API integration for live speech-to-text transcription
- **Sentiment Analysis**: TensorFlow.js-powered sentiment analysis of spoken content
- **Eye Contact Tracking**: Monitors eye contact percentage with the camera
- **Confidence Scoring**: Real-time confidence level calculation based on multiple factors
- **Session Analytics**: Comprehensive session reports with detailed metrics
 - **Body Language Assessment (MVP‑lite, optional)**: Posture recognition (slouching vs upright) and hand gesture balance (too much, too little, balanced) inferred from camera framing and facial landmark dynamics

### User Interface
- **Modern React SPA**: Clean, responsive single-page application
- **Real-time Feedback**: Live emotion detection and confidence scoring
- **Session Dashboard**: Overview of past sessions and performance metrics
- **Mobile Responsive**: Works on desktop, tablet, and mobile devices
 - **AI Mock Interview**: Generate personalized technical/behavioral/stress questions and get scored feedback (Technical Accuracy, Communication, Confidence)

## 🚀 Getting Started

### Prerequisites
- Node.js (v14 or higher)
- Modern web browser with WebRTC support
- Camera and microphone access

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd public-speaking-simulator
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment variables**
   Create a `.env` file at the project root with:
   ```
   GROQ_API_KEY=YOUR_GROQ_KEY
   PORT=5050
   ```

4. **Start the development servers**
   ```bash
   npm run server   # backend on http://localhost:5050
   npm start        # frontend on http://localhost:3000
   ```

4. **Open your browser**
   Navigate to `http://localhost:3000`

## 🛠️ Technical Stack

### Frontend
- **React 18**: Modern React with hooks and functional components
- **HTML5/CSS3**: Semantic markup with modern CSS features
- **JavaScript (ES6+)**: Modern JavaScript with async/await

### AI/ML Libraries
- **face-api.js**: Facial recognition and emotion detection
- **TensorFlow.js**: Machine learning and sentiment analysis
- **Web Speech API**: Browser-native speech recognition
- **WebRTC**: Real-time video and audio capture

## 📁 Project Structure

```
src/
├── components/           # React components
│   ├── App.js           # Main application component
│   ├── Header.js        # Navigation header
│   ├── Dashboard.js     # Session overview and results
│   ├── Simulator.js     # Main simulation interface
│   ├── MockInterview.js # AI-powered mock interview
│   └── *.css           # Component-specific styles
├── utils/
│   └── sentimentAnalysis.js  # Sentiment analysis utilities
├── index.js            # Application entry point
├── index.css           # Global styles
└── App.css            # Main app styles
```

## 🎭 How It Works

### 1. Session Initialization
- User grants camera and microphone permissions
- AI models are loaded (face-api.js weights from CDN)
- Sentiment analyzer is initialized

### 2. Real-time Analysis
- **Facial Expression Detection**: Detects 7 basic emotions (happy, sad, angry, fearful, disgusted, surprised, neutral)
- **Eye Contact Calculation**: Tracks facial landmarks to estimate eye contact percentage
- **Speech Recognition**: Converts speech to text in real-time
- **Sentiment Analysis**: Analyzes speech content for positive/negative sentiment
- **Confidence Scoring**: Combines facial expressions and speech sentiment
 - **Body Language (MVP‑lite, optional)**:
   - Posture estimation: Uses face position/size, head tilt, and vertical alignment drift to approximate slouching vs upright when seated in front of the camera
   - Hand gesture balance: Heuristics based on frequent partial occlusions near the face bounding box and rapid landmark movement near frame edges to flag too much vs too little gesturing

### 3. Session Summary
- Duration and speaking statistics
- Average confidence and eye contact scores
- Dominant emotion and speech sentiment
- Speaking rate (words per minute)
- Total word count
 - Body language (optional): Overall posture score and gesture balance label

### 4. AI Mock Interview Flow
- Provide resume/skills in the Mock Interview screen
- Backend calls Groq to generate questions tailored to profile
- Answer each question; system blends AI evaluation with optional voice/facial heuristics
- End-of-session summary: Technical, Communication, Confidence + detailed feedback and tips

## 🔧 Key Components

### Simulator Component
The core component that handles:
- WebRTC video/audio capture
- Real-time face detection and analysis
- Speech recognition integration
- Live feedback display
- Session data collection
 - Optional body language heuristics (posture and gesture balance) without additional models

### Dashboard Component
### MockInterview Component
Handles:
- Profile input and Groq question generation
- Text answers (optional camera/mic enable)
- Evaluation: technical accuracy, clarity, confidence
- Summary report and retry option

Provides:
- Welcome interface
- Session results display
- Feature overview
- Performance metrics
 - Optional body language tiles (posture score, gesture balance) when enabled

### Sentiment Analyzer
Custom utility that:
- Analyzes speech sentiment using vocabulary-based approach
- Calculates speaking confidence scores
- Provides speaking pattern analysis
- Integrates with emotion data for enhanced accuracy

### Body Language Assessment (MVP‑lite)
- Purpose: Give a first‑pass indication of posture and hand gesture balance without adding new heavy models
- Method: Leverages existing face bounding box and landmarks plus simple motion/occlusion heuristics
- Outputs:
  - Posture: Upright vs Slouching with a simple percentage score
  - Gestures: Too little / Balanced / Too much
 - Notes: Designed to be optional and toggleable; accuracy improves with good lighting and a centered, upper‑body frame

## 🎨 Styling & UX

- **Modern Design**: Clean, professional interface with gradient backgrounds
- **Responsive Layout**: CSS Grid and Flexbox for adaptive layouts
- **Visual Feedback**: Color-coded emotion badges and progress bars
- **Smooth Animations**: CSS transitions for enhanced user experience
- **Accessibility**: Semantic HTML and keyboard navigation support

## 🔒 Privacy & Security

- **Local Processing**: All analysis happens in the browser
- **No Data Storage**: No personal data is sent to external servers
- **Camera/Mic Permissions**: Explicit user consent required
- **Session Data**: Only stored locally during session
 - **Optional Features**: Body language assessment can be turned off; no additional sensors or services are used

## 🚀 Deployment

### Build for Production
```bash
npm run build
```

### Deployment Options
- **Static Hosting**: Deploy to Netlify, Vercel, or GitHub Pages
- **Web Server**: Serve build folder with any web server
- **CDN**: Upload to AWS S3 + CloudFront

## 🔄 Future Enhancements

### Potential Features
- **Advanced ML Models**: Integration with more sophisticated sentiment analysis models
- **Session History**: Local storage for tracking progress over time
- **Practice Scenarios**: Guided practice sessions for different speaking contexts
- **Voice Analysis**: Pitch, tone, and pacing analysis
- **Export Reports**: PDF generation for session reports
- **Multi-language Support**: Support for different languages
 - **Full Body Landmarking**: Upgrade body language from heuristics to dedicated models (e.g., MediaPipe Pose/Hands) for accurate posture and gesture tracking

### Technical Improvements
- **Offline Support**: Service worker for offline functionality
- **Performance Optimization**: Model caching and lazy loading
- **Browser Compatibility**: Enhanced support for older browsers
- **Testing**: Unit and integration tests

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **face-api.js**: For providing excellent facial recognition capabilities
- **TensorFlow.js**: For machine learning in the browser
- **React Community**: For the amazing ecosystem and tools
- **Web Standards**: For WebRTC and Web Speech API

## 📞 Support

For support, questions, or feedback:
- Create an issue in the repository
- Check the documentation
- Review the FAQ section

---

**Happy Speaking! 🎤** 