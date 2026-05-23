import express from 'express'
import cors from 'cors'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { execSync, spawn } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json')
const MODEL_CONFIG_DIR = path.join(os.homedir(), '.openclawModelConfig')
const MODEL_CONFIG_PATH = path.join(MODEL_CONFIG_DIR, 'config.json')
const EMPTY_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }

const app = express()
app.use(cors())
app.use(express.json())

// ── Config I/O ────────────────────────────────────────────

function loadConfig() {
  try { return fs.existsSync(OPENCLAW_CONFIG_PATH) ? JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8')) : {} }
  catch { return {} }
}

function saveConfig(config) {
  fs.mkdirSync(path.dirname(OPENCLAW_CONFIG_PATH), { recursive: true })
  backupOpenClawConfig()
  fs.writeFileSync(OPENCLAW_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8')
}

function loadModelConfig() {
  try {
    return fs.existsSync(MODEL_CONFIG_PATH)
      ? JSON.parse(fs.readFileSync(MODEL_CONFIG_PATH, 'utf-8'))
      : { appConfig: { providers: {} }, envNames: [], configPresets: [] }
  } catch { return { appConfig: { providers: {} }, envNames: [], configPresets: [] } }
}

function saveModelConfig(data) {
  fs.mkdirSync(MODEL_CONFIG_DIR, { recursive: true })
  fs.writeFileSync(MODEL_CONFIG_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

function backupOpenClawConfig() {
  if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) return null
  const backupDir = path.join(path.dirname(OPENCLAW_CONFIG_PATH), 'backups')
  fs.mkdirSync(backupDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_')
  const bp = path.join(backupDir, 'openclaw_' + ts + '.json')
  fs.copyFileSync(OPENCLAW_CONFIG_PATH, bp)
  return bp
}

function backupModelConfig() {
  if (!fs.existsSync(MODEL_CONFIG_PATH)) return null
  const backupDir = path.join(MODEL_CONFIG_DIR, 'backups')
  fs.mkdirSync(backupDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19).replace('T', '_')
  const bp = path.join(backupDir, 'config_' + ts + '.json')
  fs.copyFileSync(MODEL_CONFIG_PATH, bp)
  return bp
}

function listBackups() {
  const d = path.join(MODEL_CONFIG_DIR, 'backups')
  if (!fs.existsSync(d)) return []
  return fs.readdirSync(d).filter(f => f.endsWith('.json')).sort().reverse().map(f => path.join(d, f))
}

function restoreBackup(bp) { fs.copyFileSync(bp, MODEL_CONFIG_PATH) }

function makeKey(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '')
}

// ── API Routes ────────────────────────────────────────────

app.get('/api/config', (_req, res) => res.json(loadConfig()))
app.post('/api/config', (req, res) => { saveConfig(req.body); res.json({ ok: true }) })
app.get('/api/config-path', (_req, res) => res.json({ path: OPENCLAW_CONFIG_PATH }))

app.post('/api/backup', (_req, res) => { const bp = backupModelConfig(); res.json({ ok: true, path: bp }) })
app.get('/api/backups', (_req, res) => res.json(listBackups()))
app.post('/api/restore', (req, res) => { restoreBackup(req.body.path); res.json({ ok: true }) })

app.get('/api/backup-content', (req, res) => {
  const bp = req.query.path
  if (!bp || !fs.existsSync(bp)) return res.json({ ok: false, error: 'not found' })
  try {
    const content = JSON.parse(fs.readFileSync(bp, 'utf-8'))
    res.json({ ok: true, content })
  } catch (e) {
    res.json({ ok: false, error: e.message })
  }
})

app.get('/api/env/:name', (req, res) => { res.json({ value: process.env[req.params.name] || '' }) })

app.post('/api/provider/add', (req, res) => {
  const { config, name, preset, apiKey } = req.body
  const key = makeKey(name)
  const models = preset.models.map(m => ({
    id: m.id, name: m.name, contextWindow: m.contextWindow,
    maxTokens: m.maxTokens, input: m.input || ['text'],
    cost: JSON.parse(JSON.stringify(EMPTY_COST)),
    ...(m.reasoning ? { reasoning: true } : {})
  }))
  const provider = { api: preset.api, apiKey, baseUrl: preset.baseUrl, models }
  const newConfig = { ...config }
  if (!newConfig.models) newConfig.models = { mode: 'merge', providers: {} }
  if (!newConfig.models.providers) newConfig.models.providers = {}
  newConfig.models.providers[key] = provider
  saveConfig(newConfig)
  res.json({ config: newConfig, key })
})

app.post('/api/provider/update', (req, res) => {
  const { config, oldKey, newKey, baseUrl, apiKey } = req.body
  const c = { ...config }
  try {
    if (oldKey !== newKey) { c.models.providers[newKey] = c.models.providers[oldKey]; delete c.models.providers[oldKey] }
    c.models.providers[newKey].baseUrl = baseUrl
    c.models.providers[newKey].apiKey = apiKey
  } catch {}
  saveConfig(c)
  res.json({ config: c })
})

app.post('/api/provider/remove', (req, res) => {
  const c = { ...config || loadConfig() }
  try { delete c.models.providers[req.body.key] } catch {}
  saveConfig(c)
  res.json({ config: c })
})

app.post('/api/model/add', (req, res) => {
  const c = { ...req.body.config }
  const prov = c.models?.providers?.[req.body.providerKey]
  if (prov) { prov.models.push(req.body.model); saveConfig(c) }
  res.json({ config: c })
})

app.post('/api/model/update', (req, res) => {
  const c = { ...req.body.config }
  const prov = c.models?.providers?.[req.body.providerKey]
  if (prov) {
    const idx = prov.models.findIndex(m => m.id === req.body.modelId)
    if (idx !== -1) Object.assign(prov.models[idx], req.body.data)
    saveConfig(c)
  }
  res.json({ config: c })
})

app.post('/api/model/remove', (req, res) => {
  const c = { ...req.body.config }
  const prov = c.models?.providers?.[req.body.providerKey]
  if (prov) { prov.models = prov.models.filter(m => m.id !== req.body.modelId); saveConfig(c) }
  res.json({ config: c })
})


app.post('/api/import-to-openclaw', (req, res) => {
  const { providers } = req.body
  if (!providers || Object.keys(providers).length === 0) {
    return res.json({ ok: false, error: 'no providers' })
  }
  const cfg = loadConfig()
  if (!cfg.models) cfg.models = { mode: 'merge', providers: {} }
  if (!cfg.models.providers) cfg.models.providers = {}
  // Overwrite: replace entire providers config
  cfg.models.providers = providers
  saveConfig(cfg)
  res.json({ ok: true, count: Object.keys(providers).length })
})

app.post('/api/model/default', (req, res) => {
  const c = { ...req.body.config }
  if (!c.agents) c.agents = { defaults: {} }
  if (!c.agents.defaults.model) c.agents.defaults.model = {}
  c.agents.defaults.model.primary = req.body.modelRef
  saveConfig(c)
  res.json({ config: c })
})


const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '')

// ── External Gateway Log Tailing ──────────────────────────

let extLogWatcher = null
let extLogPosition = 0
let extLogPath = null

function parseLogPath(statusOutput) {
  const m = statusOutput.match(/File logs:\s*(.+)/)
  if (m) return m[1].replace(/^~/, os.homedir())
  return null
}

function startExternalLogTail(logPath) {
  stopExternalLogTail()
  extLogPath = logPath
  extLogPosition = 0
  const check = () => {
    try {
      const stat = fs.statSync(logPath)
      if (stat.size > extLogPosition) {
        const fd = fs.openSync(logPath, 'r')
        const buf = Buffer.alloc(Math.min(stat.size - extLogPosition, 65536))
        fs.readSync(fd, buf, 0, buf.length, extLogPosition)
        fs.closeSync(fd)
        extLogPosition = stat.size
        const text = stripAnsi(buf.toString('utf-8'))
        gwBuffer.push(text)
        broadcast({ type: 'output', text })
      }
    } catch {}
  }
  check() // initial read
  extLogWatcher = setInterval(check, 2000)
}

function stopExternalLogTail() {
  if (extLogWatcher) { clearInterval(extLogWatcher); extLogWatcher = null; extLogPath = null }
}

function detectExternalGateway() {
  try {
    const out = execSync('openclaw gateway status', { timeout: 5000, windowsHide: true, encoding: 'utf-8' })
    if (out.includes('Listening') || out.includes('Connectivity probe: ok')) {
      const logPath = parseLogPath(out)
      if (logPath && logPath !== extLogPath) startExternalLogTail(logPath)
      return true
    }
    stopExternalLogTail()
    return false
  } catch { stopExternalLogTail(); return false }
}


// ── Gateway with SSE ──────────────────────────────────────

let gwProc = null
let gwClients = []
let gwBuffer = []

function broadcast(data) {
  const msg = 'data: ' + JSON.stringify(data) + '\n\n'
  gwClients = gwClients.filter(c => {
    try { c.write(msg); return true }
    catch { return false }
  })
}

app.get('/api/gateway/status', (_req, res) => {
  const internalRunning = gwProc !== null && gwProc.exitCode === null
  const externalRunning = !internalRunning && detectExternalGateway()
  const running = internalRunning || externalRunning
  const log = internalRunning ? gwBuffer.join('') : (externalRunning ? 'Gateway 已在运行中（外部启动）\n' : '')
  res.json({ running, log, external: externalRunning })
})


app.get('/api/gateway/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  })
  const internalRunning = gwProc !== null && gwProc.exitCode === null
  const externalRunning = !internalRunning && detectExternalGateway()
  const running = internalRunning || externalRunning
  res.write('data: ' + JSON.stringify({ type: 'connected', running }) + '\n\n')
  // Replay buffered output
  for (const line of gwBuffer) {
    res.write('data: ' + JSON.stringify({ type: 'output', text: line }) + '\n\n')
  }
  gwClients.push(res)
  req.on('close', () => { gwClients = gwClients.filter(c => c !== res) })
  // Periodic health check for external gateways
  if (externalRunning) {
    const check = setInterval(() => {
      if (!detectExternalGateway()) {
        broadcast({ type: 'exit', code: 0 })
        stopExternalLogTail()
        clearInterval(check)
      }
    }, 10000)
    req.on('close', () => clearInterval(check))
  }
})

app.post('/api/gateway/launch', async (_req, res) => {
  // Stop any existing gateway
  try { execSync('openclaw gateway stop', { timeout: 10000, windowsHide: true }) } catch {}
  if (gwProc) { try { gwProc.kill() } catch {}; gwProc = null }
  await new Promise(r => setTimeout(r, 1000))

  gwBuffer = []
  
  // Ensure gateway.mode exists
  const cfg = loadConfig()
  if (!cfg.gateway) cfg.gateway = {}
  if (!cfg.gateway.mode) { cfg.gateway.mode = 'local'; saveConfig(cfg) }

  gwProc = spawn('cmd', ['/c', 'chcp 65001 >nul && openclaw gateway run --force'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' }
  })

  const stripAnsi = (s) => s.replace(/\x1b\[[0-9;]*m/g, '')

  gwProc.stdout.on('data', (d) => {
    const text = stripAnsi(d.toString())
    gwBuffer.push(text)
    broadcast({ type: 'output', text })
  })
  gwProc.stderr.on('data', (d) => {
    const text = stripAnsi(d.toString())
    gwBuffer.push(text)
    broadcast({ type: 'output', text })
  })
  gwProc.on('close', (code) => {
    broadcast({ type: 'exit', code })
    gwProc = null
  })
  gwProc.on('error', (e) => {
    broadcast({ type: 'error', text: e.message })
    gwProc = null
  })

  res.json({ pid: gwProc.pid })
})

app.post('/api/gateway/stop', (_req, res) => {
  if (gwProc) { try { gwProc.kill() } catch {}; gwProc = null }
  try {
    const out = execSync('openclaw gateway stop', { timeout: 15000, windowsHide: true, encoding: 'utf-8' })
    res.json({ ok: true, output: out })
  } catch (e) { res.json({ ok: false, output: e.message }) }
})

// ── Model Config Persistence ─────────────────────

app.get('/api/model-config', (_req, res) => {
  res.json(loadModelConfig())
})

app.post('/api/model-config', (req, res) => {
  try {
    saveModelConfig(req.body)
    res.json({ ok: true })
  } catch (e) {
    res.json({ ok: false, error: e.message })
  }
})

// ── Serve static in production ────────────────────────────

const DIST = path.join(__dirname, 'dist')
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST))
  app.get('*', (_req, res) => res.sendFile(path.join(DIST, 'index.html')))
}

const PORT = 3001

export function startServer(port = PORT) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      console.log('API server running on http://localhost:' + port)
      resolve(server)
    })
    server.on('error', reject)
  })
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('server.js')) {
  startServer()
}
