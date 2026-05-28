const SAMBANOVA_API_KEY = '73241304-840c-475b-b6ba-3a5a8b4fed6f';
const SAMBANOVA_URL = 'https://api.sambanova.ai/v1/chat/completions';
const SAMBANOVA_MODEL = 'Meta-Llama-3.1-70B-Instruct';

async function testSambaNova() {
    try {
        console.log('Starting SambaNova API test...');
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000);

        const resp = await fetch(SAMBANOVA_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SAMBANOVA_API_KEY}`
            },
            body: JSON.stringify({
                model: SAMBANOVA_MODEL,
                messages: [{ role: 'user', content: 'say hello' }],
                temperature: 0.1
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!resp.ok) {
            const errText = await resp.text();
            console.error('SambaNova API error:', resp.status, errText);
            return;
        }

        const data = await resp.json();
        console.log('Success! Response:', data?.choices?.[0]?.message?.content);
    } catch (err) {
        console.error('Fetch error details:', {
            message: err.message,
            name: err.name,
            cause: err.cause,
            stack: err.stack
        });
        if (err.cause) {
            console.error('Deep Cause:', err.cause);
        }
    }
}

testSambaNova();
