console.log('Node Version:', process.version);
console.log('Fetch type:', typeof fetch);
if (typeof fetch === 'function') {
    fetch('https://google.com').then(r => console.log('Google fetch status:', r.status)).catch(e => console.log('Google fetch failed:', e.message));
}
