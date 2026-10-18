const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const code = scripts.join('\n\n');
fs.writeFileSync('tmp_parse_check.js', code);
console.log('Extracted script count:', scripts.length);
