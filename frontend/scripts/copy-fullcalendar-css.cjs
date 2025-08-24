const fs = require('fs');
const path = require('path');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');

// Ensure public directory exists for any future static assets
ensureDir(publicDir);

console.log('[copy-fullcalendar-css] Public directory ensured. FullCalendar CSS is now imported directly in JavaScript.');


