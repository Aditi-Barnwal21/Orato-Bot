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
	try {
		const { profileText, numQuestions } = req.body || {};
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
		return res.status(500).json({ error: 'Failed to generate questions' });
	}
});

app.post('/api/evaluate-answer', async (req, res) => {
	try {
		const { question, answer, modalities } = req.body || {};
		if (!question || !answer) return res.status(400).json({ error: 'question and answer are required' });

		const prompt = buildEvaluationPrompt(question, answer);
		const text = await callSambaNova([
			{ role: 'system', content: 'Respond with strict JSON only. No prose.' },
			{ role: 'user', content: prompt }
		], 0.3);

		const json = parseJSON(text) || {};

		const voice = modalities?.voice || {};
		const facial = modalities?.facial || {};

		const technical = Math.max(0, Math.min(100, Number(json?.technicalAccuracy?.score) || 0));
		const clarity = Math.max(0, Math.min(100, Number(json?.clarity?.score) || 0));

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
		return res.status(500).json({ error: 'Failed to evaluate answer' });
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
