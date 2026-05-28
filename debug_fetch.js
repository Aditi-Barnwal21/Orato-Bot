const SAMBANOVA_API_KEY = '73241304-840c-475b-b6ba-3a5a8b4fed6f';
const SAMBANOVA_URL = 'https://api.sambanova.ai/v1/chat/completions';

async function testFetch() {
    try {
        console.log('Testing fetch to:', SAMBANOVA_URL);
        const resp = await fetch(SAMBANOVA_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${SAMBANOVA_API_KEY}`
            },
            body: JSON.stringify({
                model: 'Meta-Llama-3.1-70B-Instruct',
                messages: [{ role: 'user', content: 'say hello' }],
                temperature: 0.1
            })
        });
        console.log('Status:', resp.status);
        const text = await resp.text();
        console.log('Response:', text);
    } catch (err) {
        console.error('Fetch failed with error:', err);
        if (err.cause) {
            console.error('Error cause:', err.cause);
        }
    }
}

testFetch();
