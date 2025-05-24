# Test Electron with a simple HTML page

Write-Host "Testing Electron with test page..." -ForegroundColor Green

# Build TypeScript
Write-Host "Building TypeScript..." -ForegroundColor Yellow
npx tsc

if ($LASTEXITCODE -ne 0) {
    Write-Host "TypeScript compilation failed" -ForegroundColor Red
    exit 1
}

# Create a temporary main.js that loads the test page
$testMainJs = @'
const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../test.html'));
  mainWindow.webContents.openDevTools();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
'@

# Save the test main.js
$testMainJs | Out-File -FilePath "dist/test-main.js" -Encoding UTF8

# Run Electron with the test main
Write-Host "Starting Electron with test page..." -ForegroundColor Cyan
npx electron dist/test-main.js 