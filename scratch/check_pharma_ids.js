const c = require('fs').readFileSync('js/pharmacien.js','utf-8');
const html = require('fs').readFileSync('pharmacien.html','utf-8');

// Extract all getElementById and $() calls
const ids = new Set();
// Pattern: $('id') or $('#id')
const regex1 = /\$\(['"]#?([^'"]+)['"]\)/g;
let match;
while ((match = regex1.exec(c)) !== null) {
  ids.add(match[1]);
}

// Check each ID exists in HTML
const missing = [];
ids.forEach(id => {
  // Skip dynamic IDs and special selectors
  if (id.includes('.') || id.includes(' ') || id.includes(':') || id.includes('[') || id.startsWith('#')) return;
  if (!html.includes('id="' + id + '"')) {
    missing.push(id);
  }
});

if (missing.length) {
  console.log('Missing IDs in pharmacien.html:', missing.join(', '));
} else {
  console.log('All pharmacien IDs found in HTML');
}
