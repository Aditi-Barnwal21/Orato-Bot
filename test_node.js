const fs = require('fs');
try {
    fs.writeFileSync('test_executed.txt', 'Node is working at ' + new Date().toISOString());
    console.log('File written successfully');
} catch (e) {
    console.error('Error writing file:', e);
}
