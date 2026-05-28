const https = require('https');

async function testDiagnostic() {
    try {
        const response = await fetch('http://localhost:5050/api/diagnose');
        const data = await response.json();
        console.log('Diagnostic Results:');
        console.log(JSON.stringify(data, null, 2));
    } catch (err) {
        console.error('Error testing diagnostic endpoint:', err.message);
    }
}

testDiagnostic();
