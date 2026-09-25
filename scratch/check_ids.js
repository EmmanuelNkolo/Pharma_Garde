const c = require('fs').readFileSync('js/delegue.js','utf-8');
const html = require('fs').readFileSync('delegue.html','utf-8');

// Extract all $('id') calls
const ids = new Set();
const regex = /\$\('([^']+)'\)/g;
let match;
while ((match = regex.exec(c)) !== null) {
  ids.add(match[1]);
}

// Check each ID exists in HTML
const missing = [];
ids.forEach(id => {
  if (!html.includes('id="' + id + '"')) {
    missing.push(id);
  }
});

if (missing.length) {
  console.log('Missing IDs in HTML:', missing.join(', '));
} else {
  console.log('All IDs found in HTML');
}
