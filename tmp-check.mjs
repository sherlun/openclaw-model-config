import fs from 'fs'
const lines = fs.readFileSync('D:/Program/OpenClawHub/openclaw-model-config-app/src/App.jsx', 'utf-8').split('\n')
console.log('=== Lines 232-250 ===')
for (let i = 231; i < Math.min(250, lines.length); i++) {
  console.log((i+1) + ': ' + lines[i])
}