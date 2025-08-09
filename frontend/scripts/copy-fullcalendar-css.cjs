const fs = require('fs');
const path = require('path');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function copyIfExists(src, dest) {
  if (fs.existsSync(src)) {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    return true;
  }
  return false;
}

const root = path.resolve(__dirname, '..');
const nodeModules = path.join(root, 'node_modules');
const targets = [
  {
    src: path.join(nodeModules, '@fullcalendar', 'core', 'dist', 'index.css'),
    dest: path.join(root, 'public', 'vendor', 'fullcalendar', 'core', 'index.css'),
  },
  {
    src: path.join(nodeModules, '@fullcalendar', 'daygrid', 'dist', 'index.css'),
    dest: path.join(root, 'public', 'vendor', 'fullcalendar', 'daygrid', 'index.css'),
  },
];

let copied = 0;
for (const t of targets) {
  if (copyIfExists(t.src, t.dest)) copied++;
}

if (copied === 0) {
  console.warn('[copy-fullcalendar-css] No FullCalendar CSS files found to copy.');
} else {
  console.log(`[copy-fullcalendar-css] Copied ${copied} FullCalendar CSS file(s) to public/vendor.`);
}


