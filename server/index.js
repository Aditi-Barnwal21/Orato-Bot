const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const https = require('https');

// Load env from the project root directory
const envPath = path.join(__dirname, '..', '.env');
console.log('Loading .env from:', envPath);
dotenv.config({ path: envPath });

// Enable SSL error logging for diagnostics
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';  // Temporary - for debugging only

const app = express();
const port = process.env.SERVER_PORT || 5050;

app.use(cors());
app.use(express.json({ limit: '2mb' }));

const SAMBANOVA_API_KEY = process.env.SAMBANOVA_API_KEY || '';
const SAMBANOVA_MODEL = process.env.SAMBANOVA_MODEL || 'Meta-Llama-3.1-70B-Instruct';
const SAMBANOVA_URL = 'https://api.sambanova.ai/v1/chat/completions';

if (!SAMBANOVA_API_KEY) {
	console.warn('Warning: SAMBANOVA_API_KEY is not set. API calls will fail.');
}

async function callSambaNova(messages, temperature = 0.6, retries = 3) {
	for (let attempt = 1; attempt <= retries; attempt++) {
		try {
			console.log(`[Attempt ${attempt}/${retries}] Calling SambaNova API...`);
			console.log('API URL:', SAMBANOVA_URL);
			console.log('API Key present:', !!SAMBANOVA_API_KEY, `(${SAMBANOVA_API_KEY?.length} chars)`);
			
			const url = new URL(SAMBANOVA_URL);
			const postData = JSON.stringify({ 
				model: SAMBANOVA_MODEL, 
				messages, 
				temperature
			});

			return await new Promise((resolve, reject) => {
				const req = https.request(
					{
						hostname: url.hostname,
						port: 443,
						path: url.pathname + url.search,
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'Authorization': `Bearer ${SAMBANOVA_API_KEY}`,
							'Content-Length': Buffer.byteLength(postData)
						},
						timeout: 30000
					},
					(res) => {
						let data = '';
						res.on('data', chunk => { data += chunk; });
						res.on('end', () => {
							if (res.statusCode !== 200) {
								console.error(`API returned ${res.statusCode}: ${data}`);
								reject(new Error(`API returned ${res.statusCode}`));
							} else {
								try {
									const json = JSON.parse(data);
									const content = json?.choices?.[0]?.message?.content || '';
									resolve(content);
								} catch (e) {
									reject(new Error(`Failed to parse response: ${e.message}`));
								}
							}
						});
					}
				);

				req.on('error', (err) => {
					console.error(`[Attempt ${attempt}/${retries}] HTTPS request error:`, {
						code: err.code,
						errno: err.errno,
						message: err.message
					});
					reject(err);
				});

				req.on('timeout', () => {
					console.error('[Timeout] API request exceeded 30 seconds');
					req.destroy();
					reject(new Error('Request timeout'));
				});

				req.write(postData);
				req.end();
			});
		} catch (err) {
			console.error(`[Attempt ${attempt}/${retries}] Error:`, {
				message: err.message,
				code: err.code
			});
			
			if (attempt === retries) {
				console.error('All retries exhausted');
				throw err;
			}
			
			const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
			console.log(`Retrying in ${delayMs}ms...`);
			await new Promise(resolve => setTimeout(resolve, delayMs));
		}
	}
}

function buildQuestionPrompt(profileText, numQuestions = 6) {
	return `You are an expert interview question designer.
Given the candidate profile below, generate ${numQuestions} interview questions across three categories: Technical, Behavioral, and Stress.

Rules:
- Output JSON ONLY, matching this schema strictly:
{
  "questions": [
    { "id": "q1", "type": "technical|behavioral|stress", "question": "..." }
  ]
}
- Make questions concise and specific to the candidate background.
- Ensure a balanced mix across the three categories.

Candidate profile:
"""
${profileText}
"""`;
}

function buildEvaluationPrompt(question, answer) {
	return `You are an expert interviewer and communication coach.
Evaluate the candidate's answer to the question below.
Return JSON ONLY with this schema:
{
  "technicalAccuracy": { "score": 0-100, "rationale": "..." },
  "clarity": { "score": 0-100, "rationale": "..." },
  "overallFeedback": "2-4 sentences synthesizing strengths and areas to improve",
  "improvementTips": ["tip1", "tip2", "tip3"]
}

Question: "${question}"
Answer: "${answer}"`;
}

function parseJSON(text) {
	try {
		const clean = text.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
		return JSON.parse(clean);
	} catch (e) {
		const match = text.match(/\{[\s\S]*\}/);
		return match ? JSON.parse(match[0]) : null;
	}
}

app.post('/api/generate-questions', async (req, res) => {
	const { profileText, numQuestions } = req.body || {};
	try {
		if (!profileText || typeof profileText !== 'string') {
			return res.status(400).json({ error: 'profileText is required' });
		}

		const prompt = buildQuestionPrompt(profileText, Math.max(3, Math.min(12, Number(numQuestions) || 6)));
		const text = await callSambaNova([
			{ role: 'system', content: 'Respond with strict JSON only. No prose.' },
			{ role: 'user', content: prompt }
		], 0.6);

		const json = parseJSON(text) || { questions: [] };

		const questions = Array.isArray(json.questions) ? json.questions.map((q, idx) => ({
			id: q.id || `q${idx + 1}`,
			type: ['technical', 'behavioral', 'stress'].includes((q.type || '').toLowerCase()) ? q.type.toLowerCase() : 'technical',
			question: q.question || ''
		})).filter(q => q.question) : [];

		return res.json({ questions });
	} catch (err) {
		console.error('generate-questions error:', err.message);
		
		// Fallback questions so the UI doesn't crash on Rate Limit
		const topic = (profileText || '').toLowerCase();
		let specificSkill = 'your field';
		if (topic.includes('react')) specificSkill = 'React';
		else if (topic.includes('python')) specificSkill = 'Python';
		else if (topic.includes('java')) specificSkill = 'Java';
		else if (topic.includes('design')) specificSkill = 'Design';
		else if (topic.includes('marketing')) specificSkill = 'Marketing';
		else if (topic.includes('data')) specificSkill = 'Data Analysis';
		else if (topic.includes('node')) specificSkill = 'Node.js';
		
		const fallbackBank = [
			{ id: 'q1', type: 'behavioral', question: `Tell me about a time you had to overcome a significant challenge in ${specificSkill}.` },
			{ id: 'q2', type: 'technical', question: `How do you approach solving a complex problem in ${specificSkill} when you do not have all the necessary information?` },
			{ id: 'q3', type: 'behavioral', question: 'Describe a situation where you had to work with a difficult team member on a project. How did you handle it?' },
			{ id: 'q4', type: 'stress', question: 'If you realized you made a critical mistake right before a major deadline, what steps would you take?' },
			{ id: 'q5', type: 'technical', question: `Explain a recent technical concept or tool related to ${specificSkill} that you learned, to someone with no background in it.` },
			{ id: 'q6', type: 'behavioral', question: `Where do you see your career progressing in the next five years regarding ${specificSkill}?` },
			{ id: 'q7', type: 'technical', question: `Describe a time when you had to optimize a process or system in ${specificSkill}. What was your approach?` },
			{ id: 'q8', type: 'behavioral', question: 'Tell me about a time you strongly disagreed with your manager. How did you resolve it?' },
			{ id: 'q9', type: 'stress', question: `How do you prioritize tasks when you have multiple urgent deadlines in ${specificSkill}?` },
			{ id: 'q10', type: 'technical', question: `What is the most complex project you have built or managed in ${specificSkill}?` },
			{ id: 'q11', type: 'behavioral', question: 'Tell me about a time you took a leadership role in a project unexpectedly.' },
			{ id: 'q12', type: 'stress', question: 'Describe a time when a project you were working on completely failed. What did you learn?' }
		];
		
		// Shuffle and pick 6 questions
		const shuffled = fallbackBank.sort(() => 0.5 - Math.random());
		const fallbackQuestions = shuffled.slice(0, 6);
		
		console.log('Returning randomized fallback questions due to API error.');
		return res.json({ questions: fallbackQuestions, isFallback: true });
	}
});

app.post('/api/evaluate-answer', async (req, res) => {
	const { question, answer, modalities } = req.body || {};
	try {
		if (!question || !answer) return res.status(400).json({ error: 'question and answer are required' });

		const prompt = buildEvaluationPrompt(question, answer);
		const text = await callSambaNova([
			{ role: 'system', content: 'Respond with strict JSON only. No prose.' },
			{ role: 'user', content: prompt }
		], 0.3);

		const json = parseJSON(text) || {};

		const voice = modalities?.voice || {};
		const facial = modalities?.facial || {};

		const base = json?.scores || json;
		
		let rawTech = base?.technicalAccuracy?.score ?? base?.technicalAccuracy ?? base?.technical_accuracy ?? base?.technical ?? 0;
		if (typeof rawTech === 'object') rawTech = rawTech.score || 0;
		
		let rawClarity = base?.clarity?.score ?? base?.clarity ?? base?.communication?.score ?? base?.communication ?? 0;
		if (typeof rawClarity === 'object') rawClarity = rawClarity.score || 0;

		const technical = Math.max(0, Math.min(100, Number(rawTech) || 0));
		const clarity = Math.max(0, Math.min(100, Number(rawClarity) || 0));

		const voiceConfidence = Math.min(100, Math.max(0, (voice.toneConfidence || 50)));
		const postureScore = Math.min(100, Math.max(0, (facial.postureScore || 50)));
		const eyeContact = Math.min(100, Math.max(0, (facial.eyeContact || 50)));
		const confidence = Math.round(0.5 * voiceConfidence + 0.25 * postureScore + 0.25 * eyeContact);

		return res.json({
			scores: { technicalAccuracy: technical, clarity, confidence },
			feedback: {
				overall: json?.overallFeedback || 'Good effort. Keep improving structure and specifics.',
				tips: Array.isArray(json?.improvementTips) ? json.improvementTips : []
			}
		});
	} catch (err) {
		console.error('evaluate-answer error:', err.message);
		// Return a generic fallback evaluation so the UI doesn't break
		const voice = modalities?.voice || {};
		const facial = modalities?.facial || {};
		
		const technicalScore = Math.min(100, Math.max(50, 70 + (answer.length > 50 ? 15 : 0)));
		const clarityScore = Math.min(100, Math.max(0, 100 - (voice.fillerCount || 0) * 5));
		const confidenceScore = Math.min(100, Math.max(0, Math.round(0.5 * (voice.toneConfidence || 60) + 0.25 * (facial.postureScore || 60) + 0.25 * (facial.eyeContact || 60))));

		return res.json({
			scores: { technicalAccuracy: technicalScore, clarity: clarityScore, confidence: confidenceScore },
			feedback: {
				overall: `(Fallback Evaluation - API Rate Limited). You spoke ${answer.trim().split(/\s+/).length} words. ${voice.fillerCount > 3 ? 'Try to reduce your filler words.' : 'Good clarity.'} ${facial.eyeContact < 50 ? 'Make sure to maintain eye contact with the camera.' : 'Great eye contact.'}`,
				tips: ["Use the STAR method", "Provide specific metrics"]
			}
		});
	}
});

app.get('/api/health', (req, res) => {
	res.json({ ok: true, port, model: SAMBANOVA_MODEL });
});

app.get('/api/diagnose', async (req, res) => {
	const diagnosis = {
		timestamp: new Date().toISOString(),
		apiKeySet: !!SAMBANOVA_API_KEY,
		apiKeyLength: SAMBANOVA_API_KEY?.length || 0,
		apiUrl: SAMBANOVA_URL,
		model: SAMBANOVA_MODEL,
		nodeVersion: process.version,
		testResult: null,
		error: null
	};

	try {
		console.log('Running diagnostic test...');
		const testMessages = [
			{ role: 'system', content: 'You are a helpful assistant.' },
			{ role: 'user', content: 'Say "diagnostic test successful"' }
		];
		
		const result = await callSambaNova(testMessages, 0.1, 1);
		diagnosis.testResult = result.substring(0, 50) + '...';
	} catch (err) {
		diagnosis.error = {
			message: err.message,
			name: err.name,
			code: err.cause?.code,
			errno: err.cause?.errno
		};
	}

	res.json(diagnosis);
});

// Serve frontend build if it exists (production)
try {
	const buildDir = path.join(__dirname, '..', 'build');
	app.use(express.static(buildDir));
	app.get('*', (req, res) => {
		res.sendFile(path.join(buildDir, 'index.html'));
	});
} catch (_) { }

app.listen(port, () => {
	console.log(`Server running on http://localhost:${port}`);
	console.log(`Using SambaNova model: ${SAMBANOVA_MODEL}`);
	console.log(`API Key length: ${SAMBANOVA_API_KEY?.length || 0}`);
});
