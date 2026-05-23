import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Start API server
const server = spawn('node', ['server.js'], { cwd: __dirname, stdio: 'inherit', shell: true })
server.on('error', e => console.error('Server error:', e))

// Start Vite
const vite = spawn('npx', ['vite', '--host'], { cwd: __dirname, stdio: 'inherit', shell: true })
vite.on('error', e => console.error('Vite error:', e))

process.on('SIGINT', () => { server.kill(); vite.kill(); process.exit() })
