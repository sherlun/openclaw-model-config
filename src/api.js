const BASE = '/api'

async function get(path) {
  const r = await fetch(`${BASE}${path}`)
  return r.json()
}

async function post(path, body = {}) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return r.json()
}

export const api = {
  loadModelConfig: () => get('/model-config'),
  saveModelConfig: (data) => post('/model-config', data),
  loadOpenClawConfig: () => get('/config'),
  importToOpenClaw: (providers) => post('/import-to-openclaw', { providers }),
  loadConfig: () => get('/config'),
  saveConfig: (config) => post('/config', config),
  getConfigPath: () => get('/config-path'),
  createBackup: () => post('/backup'),
  listBackups: () => get('/backups'),
  restoreBackup: (path) => post('/restore', { path }),
  getBackupContent: (path) => get(`/backup-content?path=${encodeURIComponent(path)}`),
  scanEnvKeys: () => get('/env'),
  addProvider: (config, name, preset, apiKey) => post('/provider/add', { config, name, preset, apiKey }),
  updateProvider: (config, oldKey, newKey, baseUrl, apiKey) => post('/provider/update', { config, oldKey, newKey, baseUrl, apiKey }),
  removeProvider: (config, key) => post('/provider/remove', { config, key }),
  addModel: (config, providerKey, model) => post('/model/add', { config, providerKey, model }),
  updateModel: (config, providerKey, modelId, data) => post('/model/update', { config, providerKey, modelId, data }),
  removeModel: (config, providerKey, modelId) => post('/model/remove', { config, providerKey, modelId }),
  setDefaultModel: (config, modelRef) => post('/model/default', { config, modelRef }),
  gatewayStatus: () => get('/gateway/status'),
  launchGateway: () => post('/gateway/launch'),
  stopGateway: () => post('/gateway/stop'),
  lookupEnv: (name) => get(`/env/${encodeURIComponent(name)}`),
}
