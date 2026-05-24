import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from './api'
import { MODEL_PRESETS } from './presets'

const ENV_STORAGE_KEY = 'openclaw-env-names'
const APP_CONFIG_KEY = 'openclaw-app-config'
const CONFIG_PRESETS_KEY = 'openclaw-config-presets'

const DEFAULT_ENV_NAMES = Object.values(MODEL_PRESETS).map(p => p.env_key).filter(Boolean)

function mergeEnvNames(saved) {
  return [...new Set([...DEFAULT_ENV_NAMES, ...(saved || [])])].sort()
}

// Save helpers — they update state AND persist to file via useEffect
let _pendingSave = null
let _saveTimer = null
function scheduleSave(getData) {
  _pendingSave = getData
  if (_saveTimer) clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => {
    if (_pendingSave) {
      const data = _pendingSave()
      // Save to file API, fall back to localStorage
      api.saveModelConfig(data).catch(() => {
        try { localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(data.appConfig || { providers: {} })) } catch {}
        try { localStorage.setItem(ENV_STORAGE_KEY, JSON.stringify(data.envNames || [])) } catch {}
        try { localStorage.setItem(CONFIG_PRESETS_KEY, JSON.stringify(data.configPresets || [])) } catch {}
      })
      // Also save to localStorage for Edge direct access
      try { localStorage.setItem(APP_CONFIG_KEY, JSON.stringify(data.appConfig || { providers: {} })) } catch {}
      try { localStorage.setItem(ENV_STORAGE_KEY, JSON.stringify(data.envNames || [])) } catch {}
      try { localStorage.setItem(CONFIG_PRESETS_KEY, JSON.stringify(data.configPresets || [])) } catch {}
      _pendingSave = null
    }
  }, 300)
}

function makeKey(name) { return name.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_|_$/g, '') }

function fmtContext(n) { return n >= 1000 ? `${Math.round(n/1000)}K` : String(n) }

export default function App() {
  const [appConfig, setAppConfig] = useState({ providers: {} })
  const [currentProvider, setCurrentProvider] = useState(null)
  const [selectedModel, setSelectedModel] = useState(null)
  const [toasts, setToasts] = useState([])
  const [modal, setModal] = useState(null)
  const [dialogState, setDialogState] = useState(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [gatewayRunning, setGatewayRunning] = useState(false)
  const [gatewayLog, setGatewayLog] = useState('')
  const [envNames, setEnvNames] = useState([...DEFAULT_ENV_NAMES].sort())
  const [selectedEnv, setSelectedEnv] = useState('')
  const [configPresets, setConfigPresets] = useState([])
  const [showConfigMode, setShowConfigMode] = useState(false)
  const [pickedModels, setPickedModels] = useState({})
  const [showImportDialog, setShowImportDialog] = useState(false)
  const logRef = useRef(null)
  const sseRef = useRef(null)

  const showPrompt = (title, hint = '') => new Promise(resolve => { setDialogState({ type: 'prompt', title, hint, resolve }) })
  const showConfirm = (message) => new Promise(resolve => { setDialogState({ type: 'confirm', message, resolve }) })

  const toast = useCallback((msg, type='info') => {
    const id = Date.now(); setToasts(t => [...t, { id, msg, type }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3000)
  }, [])

  // Load saved config: try file API first, fall back to localStorage
  useEffect(() => {
    api.loadModelConfig().then(data => {
      if (data.appConfig) setAppConfig(data.appConfig)
      if (data.envNames) setEnvNames(mergeEnvNames(data.envNames))
      if (data.configPresets) setConfigPresets(data.configPresets)
    }).catch(() => {
      // Fallback to localStorage
      try {
        const cfg = JSON.parse(localStorage.getItem(APP_CONFIG_KEY) || '{"providers":{}}')
        setAppConfig(cfg)
      } catch {}
      try {
        const names = JSON.parse(localStorage.getItem(ENV_STORAGE_KEY) || '[]')
        setEnvNames(mergeEnvNames(names))
      } catch {}
      try {
        const presets = JSON.parse(localStorage.getItem(CONFIG_PRESETS_KEY) || '[]')
        setConfigPresets(presets)
      } catch {}
    })
  }, [])

  const connectSSE = useCallback(() => {
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null }
    const es = new EventSource('/api/gateway/stream')
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data)
        if (d.type === 'output') setGatewayLog(l => l + d.text)
        else if (d.type === 'exit') { setGatewayLog(l => l + '\n--- Gateway 已退出 (code=' + d.code + ') ---\n'); setGatewayRunning(false); es.close(); sseRef.current = null }
        else if (d.type === 'error') { setGatewayLog(l => l + '[错误] ' + d.text + '\n'); setGatewayRunning(false); es.close(); sseRef.current = null }
        else if (d.type === 'connected' && d.running) setGatewayRunning(true)
      } catch {}
    }
    es.onerror = () => { setGatewayRunning(false) }
    sseRef.current = es
  }, [])

  useEffect(() => {
    let timer
    const check = async () => {
      try {
        const s = await api.gatewayStatus()
        if (s.running) {
          setGatewayRunning(true)
          if (!sseRef.current || sseRef.current.readyState === EventSource.CLOSED) connectSSE()
        } else {
          setGatewayRunning(false)
          if (sseRef.current) { sseRef.current.close(); sseRef.current = null }
        }
      } catch {}
    }
    check()
    timer = setInterval(check, 15000)
    return () => { clearInterval(timer); if (sseRef.current) { sseRef.current.close(); sseRef.current = null } }
  }, [connectSSE])

  const persist = (cfg) => { setAppConfig({ ...cfg }); scheduleSave(() => ({ appConfig: cfg, envNames, configPresets })) }
  const providers = Object.keys(appConfig.providers || {})
  const selectProvider = (key) => { setCurrentProvider(key); setSelectedModel(null); setSelectedEnv('') }

  const handleAddPreset = (name) => {
    const preset = MODEL_PRESETS[name]
    if (!preset) return
    const pk = makeKey(name)
    const models = preset.models.map(m => ({
      id: m.id, name: m.name, contextWindow: m.contextWindow,
      maxTokens: m.maxTokens, input: m.input || ['text'],
      cost: m.cost || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      ...(m.reasoning ? { reasoning: true } : {})
    }))
    const next = { ...appConfig }
    if (!next.providers) next.providers = {}
    next.providers[pk] = { api: preset.api, apiKey: '', baseUrl: preset.baseUrl, models }
    persist(next)
    setCurrentProvider(pk); setDropdownOpen(false)
    toast('已添加 ' + name + '，请在右侧填入 API Key', 'success')
  }

  const handleAddCustom = async () => {
    const name = await showPrompt('平台名称', '如: MyProvider')
    if (!name) return
    const baseUrl = await showPrompt('API Base URL')
    if (!baseUrl) return
    const apiKey = await showPrompt('API Key')
    if (!apiKey) return
    const pk = makeKey(name)
    const next = { ...appConfig }
    if (!next.providers) next.providers = {}
    next.providers[pk] = { api: 'openai-completions', apiKey, baseUrl, models: [] }
    persist(next); setCurrentProvider(pk)
    toast('已添加自定义平台: ' + name, 'success')
  }

  const handleRemoveProvider = async () => {
    if (!currentProvider) return
    if (!await showConfirm('确定要删除 ' + currentProvider + ' 吗？')) return
    const next = { ...appConfig }; delete next.providers[currentProvider]
    persist(next); setCurrentProvider(null); toast('已删除平台', 'info')
  }

  const handleSaveProvider = () => {
    if (!currentProvider) return
    const keyEl = document.getElementById('input-provider-key')
    const urlEl = document.getElementById('input-base-url')
    const apiEl = document.getElementById('input-api-key')
    if (!keyEl || !urlEl || !apiEl) return
    const newKey = keyEl.value.trim()
    if (!newKey) { toast('Provider Key 不能为空', 'error'); return }
    const next = { ...appConfig }
    if (!next.providers) next.providers = {}
    if (newKey !== currentProvider) { next.providers[newKey] = next.providers[currentProvider]; delete next.providers[currentProvider] }
    next.providers[newKey].baseUrl = urlEl.value.trim()
    next.providers[newKey].apiKey = apiEl.value.trim()
    persist(next); if (newKey !== currentProvider) setCurrentProvider(newKey)
    toast('保存成功（仅本地）', 'success')
  }

  const handleAddModel = () => { if (currentProvider) setModal({ type: 'model', isNew: true, providerKey: currentProvider }) }
  const handleEditModel = () => {
    if (!selectedModel || !currentProvider) return
    const prov = appConfig.providers[currentProvider]
    const existing = prov?.models.find(m => m.id === selectedModel) || {}
    setModal({ type: 'model', isNew: false, providerKey: currentProvider, modelId: selectedModel, existing })
  }

  const handleRemoveModel = async () => {
    if (!selectedModel || !currentProvider) return
    if (!await showConfirm('确定要删除模型 ' + selectedModel + ' 吗？')) return
    const next = { ...appConfig }; const prov = next.providers[currentProvider]
    if (prov) prov.models = prov.models.filter(m => m.id !== selectedModel)
    persist(next); setSelectedModel(null); toast('模型已删除', 'info')
  }

  const handleSaveModel = (modelData) => {
    const { providerKey, modelId, isNew } = modal
    const next = { ...appConfig }; const prov = next.providers[providerKey]
    if (!prov) return
    if (isNew) prov.models.push(modelData)
    else { const idx = prov.models.findIndex(m => m.id === modelId); if (idx !== -1) Object.assign(prov.models[idx], modelData) }
    persist(next); setModal(null); toast(isNew ? '模型已添加' : '模型已更新', 'success')
  }

  const addEnvName = () => {
    const inp = document.getElementById('input-new-env'); const name = inp?.value.trim().toUpperCase()
    if (!name) return
    const updated = [...new Set([...envNames, name])].sort()
    setEnvNames(updated); inp.value = ''; scheduleSave(() => ({ appConfig, envNames: updated, configPresets })); toast('已添加  ' + name, 'success')
  }

  const removeEnvName = (name) => {
    const updated = envNames.filter(n => n !== name)
    setEnvNames(updated); if (selectedEnv === name) setSelectedEnv(''); scheduleSave(() => ({ appConfig, envNames: updated, configPresets })); toast('已移除: ' + name, 'info')
  }

  const handleEnvSelect = async (e) => {
    const name = e.target.value; setSelectedEnv(name)
    if (name) { const { value } = await api.lookupEnv(name); const inp = document.getElementById('input-api-key'); if (inp) inp.value = value }
  }

  const togglePickModel = (providerKey, modelId) => {
    setPickedModels(prev => { const next = { ...prev }; const k = providerKey + '/' + modelId; if (next[k]) delete next[k]; else next[k] = { providerKey, modelId }; return next })
  }

  const handleSaveConfigPreset = async () => {
    const picked = Object.values(pickedModels)
    if (picked.length === 0) { toast('请至少选择一个模型', 'error'); return }
    const name = await showPrompt('配置名称', '如: 我的常用模型')
    if (!name) return
    const preset = { name, models: picked, createdAt: new Date().toISOString() }
    const updated = [preset, ...configPresets.filter(p => p.name !== name)]
    setConfigPresets(updated); scheduleSave(() => ({ appConfig, envNames, configPresets: updated })); toast('配置已保存:  ' + name, 'success')
  }

  const handleDeleteConfigPreset = (name) => {
    const updated = configPresets.filter(p => p.name !== name)
    setConfigPresets(updated); scheduleSave(() => ({ appConfig, envNames, configPresets: updated })); toast('已删除配置:  ' + name, 'info')
  }

  const handleImportToOpenClaw = () => {
    if (configPresets.length === 0) { toast('请先在配置模式中保存配置', 'error'); return }
    setShowImportDialog(true)
  }

  const doImportToOpenClaw = async (preset) => {
    if (!await showConfirm('确定要将 "' + preset.name + '" 导入到 OpenClaw 吗？（将替换 models.providers，不影响其他配置）')) return
    const providers = {}
    for (const { providerKey, modelId } of preset.models) {
      const srcProv = appConfig.providers[providerKey]
      if (!srcProv) continue
      const srcModel = srcProv.models?.find(m => m.id === modelId)
      if (!srcModel) continue
      if (!providers[providerKey]) { providers[providerKey] = { api: srcProv.api, baseUrl: srcProv.baseUrl, apiKey: srcProv.apiKey, models: [] } }
      providers[providerKey].models.push({ ...srcModel })
    }
    const result = await api.importToOpenClaw(providers)
    if (result.ok) { toast('已导入 ' + result.count + ' 个平台到 OpenClaw', 'success'); setShowImportDialog(false) }
    else toast('导入失败', 'error')
  }

  const handleBackup = async () => { try { const { path } = await api.createBackup(); toast(path ? '备份完成: ' + path : '备份失败', path ? 'success' : 'error') } catch { toast('备份失败', 'error') } }
  const handleRestore = () => { setModal({ type: 'restore' }) }
  const handleDoRestore = async (path) => {
    if (!await showConfirm('确定要从备份恢复吗？')) return
    await api.restoreBackup(path); setModal(null); toast('配置已恢复', 'success')
  }

  const handleLaunchGateway = () => {
    setGatewayLog(l => l + '正在启动 Gateway ...\n'); setGatewayRunning(true)
    api.launchGateway().then(() => connectSSE()).catch(e => { setGatewayLog(l => l + '启动失败: ' + e.message + '\n'); setGatewayRunning(false) })
  }

  const handleStopGateway = async () => {
    setGatewayLog(l => l + '正在停止 Gateway ...\n')
    try { await api.stopGateway(); setGatewayRunning(false); setGatewayLog(l => l + 'Gateway 已停止\n') }
    catch (e) { setGatewayLog(l => l + '停止异常: ' + e.message + '\n') }
  }

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight }, [gatewayLog])

  const provider = currentProvider ? appConfig.providers?.[currentProvider] : null
  const models = provider?.models || []


  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header"><h2>模型平台</h2><span className="badge">{providers.length}</span></div>
        <div className="sidebar-list">{providers.map(key => <div key={key} className={'sidebar-item' + (key === currentProvider ? ' active' : '')} onClick={() => selectProvider(key)}><span className="item-dot" />{key}</div>)}</div>
        <div className="sidebar-actions">
          <div className="dropdown-wrapper">
            <button className="btn btn-primary btn-full" onClick={() => setDropdownOpen(!dropdownOpen)}><span>+ 添加预设平台</span><span className="chevron">▼</span></button>
            <div className={'dropdown-menu' + (dropdownOpen ? ' open' : '')}>{Object.keys(MODEL_PRESETS).map(name => <div key={name} className="dropdown-item" onClick={() => handleAddPreset(name)}>{name}</div>)}</div>
          </div>
          <button className="btn btn-ghost btn-full" onClick={handleAddCustom}>+ 自定义添加</button>
          <button className="btn btn-ghost btn-full btn-danger" onClick={handleRemoveProvider} disabled={!currentProvider}>删除选中平台</button>
        </div>
        <div style={{ padding: '8px', borderTop: '1px solid var(--border-subtle)' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>环境变量列表</div>
          <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
            <input id="input-new-env" className="input" placeholder="API_KEY_NAME" style={{ flex: 1, fontSize: '11px', padding: '5px 8px' }} onKeyDown={e => { if (e.key === 'Enter') addEnvName() }} />
            <button className="btn btn-primary btn-sm" onClick={addEnvName} style={{ whiteSpace: 'nowrap' }}>+</button>
          </div>
          <div style={{ maxHeight: '80px', overflowY: 'auto' }}>{envNames.length === 0 ? <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', padding: '4px 0' }}>暂无，请添加</div> : envNames.map(name => <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '3px 6px', borderRadius: 'var(--radius-sm)', fontSize: '11px', color: 'var(--text-secondary)' }}><span style={{ fontFamily: 'var(--font-mono)', fontSize: '10.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{name}</span><button className="btn-icon" title="删除" onClick={() => removeEnvName(name)} style={{ fontSize: '10px', width: '22px', height: '22px', flexShrink: 0 }}>×</button></div>)}</div>
        </div>
        <div className="sidebar-footer">
          <button className="btn btn-outline btn-full btn-sm" onClick={handleBackup}>备份配置</button>
          <button className="btn btn-outline btn-full btn-sm" onClick={handleRestore}>恢复配置</button>
          <button className="btn btn-accent btn-full btn-sm" onClick={() => setShowConfigMode(true)}>配置模式</button>
          <button className="btn btn-accent btn-full btn-sm" onClick={handleImportToOpenClaw}>导入到 OpenClaw</button>
        </div>
      </aside>
      <main className="content">
        {!currentProvider ? (
          <div className="empty-state">
            <div className="empty-icon">◆</div>
            <h1>欢迎使用 OpenClaw 模型配置</h1>
            <p className="empty-desc">一站式管理你的 AI 模型平台，支持 DeepSeek、Zhipu、Qwen、OpenAI 等主流平台</p>
            <div className="empty-steps">
              {[["1","添加平台","从左侧菜单选择预设平台一键添加，或自定义接入任意 OpenAI 兼容 API"],
                ["2","管理模型","查看、编辑、增删各平台的模型配置，设置上下文窗口和最大 Token"],
                ["3","配置模式","从已添加的模型中挑选组合，保存为配置预设"],
                ["4","导入 OpenClaw","选择配置预设，一键导入到 OpenClaw"]].map(([n, title, desc]) => (
                <div key={n} className="step"><span className="step-num">{n}</span><div><strong>{title}</strong><p>{desc}</p></div></div>
              ))}
            </div>
          </div>
        ) : (
          <div className="config-panel" key={currentProvider}>
            <div className="config-header">
              <div className="config-header-left">
                <span className="field-label-sm">Provider Key</span>
                <input id="input-provider-key" className="input-inline" defaultValue={currentProvider} />
              </div>
              <div className="config-header-right">
                <button className="btn btn-primary" onClick={handleSaveProvider}>保存（仅本地）</button>
              </div>
            </div>
            <div className="config-body">
              <div className="form-row">
                <div className="form-group flex-2">
                  <span className="field-label">Base URL</span>
                  <input id="input-base-url" className="input" defaultValue={provider?.baseUrl || ""} />
                </div>
                <div className="form-group flex-1">
                  <span className="field-label">API</span>
                  <input className="input" defaultValue="openai-completions" readOnly />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group flex-2">
                  <span className="field-label">API Key</span>
                  <div className="input-with-btn">
                    <input id="input-api-key" className="input" type="password" defaultValue={provider?.apiKey || ""} />
                    <button className="btn-icon" title="显示/隐藏" onClick={() => { document.getElementById("input-api-key").type = document.getElementById("input-api-key").type === "password" ? "text" : "password" }}>👁</button>
                  </div>
                </div>
                <div className="form-group flex-1">
                  <span className="field-label">环境变量</span>
                  <select className="input select" value={selectedEnv} onChange={handleEnvSelect}>
                    <option value="">-- 选择 --</option>
                    {envNames.map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="models-section">
              <div className="models-header">
                <h3>模型列表</h3>
                <div className="models-actions">
                  <button className="btn btn-primary btn-sm" onClick={handleAddModel}>+ 添加模型</button>
                  <button className="btn btn-ghost btn-sm" onClick={handleEditModel} disabled={!selectedModel}>编辑</button>
                  <button className="btn btn-ghost btn-sm btn-danger" onClick={handleRemoveModel} disabled={!selectedModel}>删除</button>
                </div>
              </div>
              <div className="models-table-wrapper">
                <table className="models-table">
                  <thead><tr><th></th><th>Model ID</th><th>显示名称</th><th>上下文窗口</th><th>最大 Token</th><th>输入 $/1M</th><th>输出 $/1M</th><th>特性</th></tr></thead>
                  <tbody>
                    {models.length === 0 ? (
                      <tr><td colSpan="8" className="no-models">暂无模型，点击 + 添加模型 开始</td></tr>
                    ) : models.map(m => (
                      <tr key={m.id} className={m.id === selectedModel ? "selected" : ""} onClick={() => setSelectedModel(m.id)}>
                        <td className="col-radio"><input type="radio" name="model-select" checked={m.id === selectedModel} onChange={() => setSelectedModel(m.id)} /></td>
                        <td className="col-id" title={m.id}>{m.id}</td>
                        <td>{m.name}</td>
                        <td>{fmtContext(m.contextWindow)}</td>
                        <td>{m.maxTokens}</td>
                        <td>{(m.cost?.input || 0) === 0 ? '-' : '$' + (m.cost.input).toFixed(4)}</td>
                        <td>{(m.cost?.output || 0) === 0 ? '-' : '$' + (m.cost.output).toFixed(4)}</td>
                        <td>{m.reasoning ? <span className="col-tag">推理</span> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        <div className="gateway-panel">
          <div className="gateway-header">
            <div className="gateway-title">
              <span className={"gateway-dot" + (gatewayRunning ? " running" : "")} />
              <span>Gateway {gatewayRunning ? "运行中" : "未启动"}</span>
            </div>
            <div className="gateway-controls">
              <button className="btn btn-accent btn-sm" onClick={handleLaunchGateway} disabled={gatewayRunning}>启动 Gateway</button>
              <button className="btn btn-ghost btn-sm" onClick={handleStopGateway} disabled={!gatewayRunning}>停止</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setGatewayLog("")}>清空日志</button>
            </div>
          </div>
          <pre className="gateway-log" ref={logRef}>{gatewayLog}</pre>
        </div>
      </main>
      {showConfigMode && <div className="modal-overlay" onClick={() => { setShowConfigMode(false); setPickedModels({}) }}><div className="modal" style={{ width: "640px", maxHeight: "85vh" }} onClick={e => e.stopPropagation()}><div className="modal-header"><h2>配置模式</h2><button className="modal-close" onClick={() => { setShowConfigMode(false); setPickedModels({}) }}>×</button></div><div className="modal-body" style={{ maxHeight: "50vh", overflowY: "auto" }}>{providers.length === 0 ? <p style={{ color: "var(--text-tertiary)" }}>暂无已添加的平台</p> : providers.map(pk => { const prov = appConfig.providers?.[pk]; const pms = prov?.models || []; return <div key={pk} style={{ marginBottom: "14px" }}><div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "6px" }}>{pk}</div>{pms.length === 0 ? <p style={{ fontSize: "11px", color: "var(--text-tertiary)", paddingLeft: "8px" }}>该平台暂无模型</p> : pms.map(m => { const k = pk + "/" + m.id; const checked = !!pickedModels[k]; return <label key={m.id} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "5px 8px", borderRadius: "var(--radius-sm)", cursor: "pointer", fontSize: "12px", color: "var(--text-secondary)" }} onMouseEnter={e => e.currentTarget.style.background = "var(--bg-hover)"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}><input type="checkbox" checked={checked} onChange={() => togglePickModel(pk, m.id)} style={{ accentColor: "var(--accent)", cursor: "pointer" }} /><span style={{ fontFamily: "var(--font-mono)", fontSize: "11px", flex: 1 }}>{m.id}</span><span style={{ fontSize: "10.5px", color: "var(--text-tertiary)" }}>{m.name}</span>{m.reasoning ? <span className="col-tag">推理</span> : null}</label> })}</div> })}</div><div className="modal-footer" style={{ justifyContent: "space-between" }}><span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>已选 {Object.keys(pickedModels).length} 个模型</span><div style={{ display: "flex", gap: "6px" }}><button className="btn btn-primary btn-sm" onClick={handleSaveConfigPreset}>保存配置</button><button className="btn btn-ghost btn-sm" onClick={() => { setShowConfigMode(false); setPickedModels({}) }}>关闭</button></div></div><div style={{ borderTop: "1px solid var(--border-subtle)", padding: "14px 20px 18px" }}><div style={{ fontSize: "12px", fontWeight: 600, marginBottom: "8px", color: "var(--text-secondary)" }}>已保存的配置</div>{configPresets.length === 0 ? <p style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>暂无</p> : configPresets.map(p => <div key={p.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 8px", borderRadius: "var(--radius-sm)", fontSize: "11.5px", color: "var(--text-secondary)" }}><span style={{ flex: 1 }}><strong style={{ color: "var(--text-primary)" }}>{p.name}</strong><span style={{ color: "var(--text-tertiary)", marginLeft: "8px" }}>{p.models.length} 个模型</span></span><button className="btn btn-ghost btn-sm btn-danger" style={{ padding: "3px 8px", fontSize: "10.5px" }} onClick={() => handleDeleteConfigPreset(p.name)}>删除</button></div>)}</div></div></div>}
      {showImportDialog && <div className="modal-overlay" onClick={() => setShowImportDialog(false)}><div className="modal" style={{ width: "500px" }} onClick={e => e.stopPropagation()}><div className="modal-header"><h2>导入到 OpenClaw</h2><button className="modal-close" onClick={() => setShowImportDialog(false)}>×</button></div><div className="modal-body" style={{ maxHeight: "50vh", overflowY: "auto" }}><p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "12px" }}>选择一个配置预设导入到 OpenClaw：</p>{configPresets.map(p => <div key={p.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", marginBottom: "6px" }}><div><div style={{ fontSize: "12px", fontWeight: 600, color: "var(--text-primary)" }}>{p.name}</div><div style={{ fontSize: "10.5px", color: "var(--text-tertiary)", marginTop: "2px" }}>{p.models.length} 个模型</div></div><button className="btn btn-accent btn-sm" onClick={() => doImportToOpenClaw(p)}>导入</button></div>)}</div></div></div>}
      {dialogState && <div className="modal-overlay" onClick={() => { dialogState.resolve(dialogState.type === "confirm" ? false : ""); setDialogState(null) }}><div className="modal" onClick={e => e.stopPropagation()}>{dialogState.type === "confirm" ? <><div className="modal-header"><h2>确认</h2></div><div className="modal-body"><p style={{ color: "var(--text-secondary)", lineHeight: 1.6 }}>{dialogState.message}</p></div><div className="modal-footer"><button className="btn btn-ghost" onClick={() => { dialogState.resolve(false); setDialogState(null) }}>取消</button><button className="btn btn-primary" onClick={() => { dialogState.resolve(true); setDialogState(null) }}>确定</button></div></> : dialogState.type === "prompt" ? <PromptDialog title={dialogState.title} hint={dialogState.hint} onSubmit={val => { dialogState.resolve(val); setDialogState(null) }} onCancel={() => { dialogState.resolve(""); setDialogState(null) }} /> : null}</div></div>}
      {modal && <div className="modal-overlay" onClick={() => setModal(null)}><div className="modal" onClick={e => e.stopPropagation()}>{modal.type === "model" ? <ModelForm modal={modal} onSave={handleSaveModel} onClose={() => setModal(null)} /> : modal.type === "restore" ? <RestoreDialog onRestore={handleDoRestore} onClose={() => setModal(null)} /> : null}</div></div>}
      <div className="toast-container">{toasts.map(t => <div key={t.id} className={"toast " + t.type}>{t.msg}</div>)}</div>
    </div>
  )
}

function PromptDialog({ title, hint, onSubmit, onCancel }) {
  const ref = useRef(null)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <><div className="modal-header"><h2>{title}</h2><button className="modal-close" onClick={onCancel}>×</button></div><div className="modal-body"><input className="input" defaultValue="" ref={ref} onKeyDown={e => { if (e.key === 'Enter') onSubmit(e.target.value); if (e.key === 'Escape') onCancel() }} placeholder={hint || '请输入...'} style={{ width: '100%' }} />{hint ? <p style={{ color: 'var(--text-tertiary)', fontSize: '11px', marginTop: '4px' }}>{hint}</p> : null}</div><div className="modal-footer"><button className="btn btn-ghost" onClick={onCancel}>取消</button><button className="btn btn-primary" onClick={() => { const val = ref.current?.value || ''; onSubmit(val) }}>确定</button></div></>
  )
}

function ModelForm({ modal, onSave, onClose }) {
  const { isNew, existing = {} } = modal
  const idRef = useRef(null)
  const cost = existing.cost || { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
  useEffect(() => { idRef.current?.focus() }, [])
  return (
    <form onSubmit={e => { e.preventDefault(); const fd = new FormData(e.target); const id = fd.get('id').trim(); if (!id) return; onSave({ id, name: fd.get('name').trim() || id, contextWindow: parseInt(fd.get('context')) || 128000, maxTokens: parseInt(fd.get('tokens')) || 8192, input: ['text'], cost: { input: parseFloat(fd.get('costInput')) || 0, output: parseFloat(fd.get('costOutput')) || 0, cacheRead: parseFloat(fd.get('costCacheRead')) || 0, cacheWrite: parseFloat(fd.get('costCacheWrite')) || 0 }, ...(fd.get('reasoning') ? { reasoning: true } : {}) }) }}>
      <div className="modal-header"><h2>{isNew ? '添加模型' : '编辑模型'}</h2><button type="button" className="modal-close" onClick={onClose}>×</button></div>
      <div className="modal-body"><div className="form-group"><span className="field-label">Model ID</span><input name="id" className="input" defaultValue={existing.id || ''} ref={idRef} /></div><div className="form-group"><span className="field-label">显示名称</span><input name="name" className="input" defaultValue={existing.name || ''} /></div><div className="form-row"><div className="form-group flex-1"><span className="field-label">上下文窗口</span><input name="context" type="number" className="input" defaultValue={existing.contextWindow || 128000} /></div><div className="form-group flex-1"><span className="field-label">最大 Token</span><input name="tokens" type="number" className="input" defaultValue={existing.maxTokens || 8192} /></div></div>
      <div className="form-group"><span className="field-label" style={{marginBottom:'6px'}}>Token 价格 ($/1M tokens)</span>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px 10px'}}>
          <div><span className="field-label" style={{fontSize:'10px'}}>输入价格</span><input name="costInput" type="number" step="0.01" min="0" className="input" defaultValue={cost.input} placeholder="0" /></div>
          <div><span className="field-label" style={{fontSize:'10px'}}>输出价格</span><input name="costOutput" type="number" step="0.01" min="0" className="input" defaultValue={cost.output} placeholder="0" /></div>
          <div><span className="field-label" style={{fontSize:'10px'}}>缓存读取价格</span><input name="costCacheRead" type="number" step="0.01" min="0" className="input" defaultValue={cost.cacheRead} placeholder="0" /></div>
          <div><span className="field-label" style={{fontSize:'10px'}}>缓存写入价格</span><input name="costCacheWrite" type="number" step="0.01" min="0" className="input" defaultValue={cost.cacheWrite} placeholder="0" /></div>
        </div>
      </div><label className="checkbox-group"><input type="checkbox" name="reasoning" defaultChecked={!!existing.reasoning} /><span>推理模型 (reasoning)</span></label></div>
      <div className="modal-footer"><button type="button" className="btn btn-ghost" onClick={onClose}>取消</button><button type="submit" className="btn btn-primary">保存</button></div>
    </form>
  )
}

function RestoreDialog({ onRestore, onClose }) {
  const [backups, setBackups] = useState([])
  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  useEffect(() => { api.listBackups().then(setBackups).catch(() => {}) }, [])

  const handlePreview = async (bp) => {
    setPreviewLoading(true)
    const result = await api.getBackupContent(bp)
    setPreview(result.ok ? result.content : { error: result.error })
    setPreviewLoading(false)
  }

  return (
    <><div className="modal-header"><h2>选择要恢复的备份</h2><button className="modal-close" onClick={onClose}>×</button></div>
    <div className="modal-body" style={{ maxHeight: 480, overflowY: 'auto' }}>
      {backups.length === 0 ? <p style={{ color: 'var(--text-tertiary)' }}>无可用备份</p> : backups.map(bp => {
        const fname = bp.split(/[\\/]/).pop()
        return <div key={bp} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', borderRadius: 'var(--radius-sm)', marginBottom: '4px' }}>
          <span style={{ flex: 1, fontSize: '12px', fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fname}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => handlePreview(bp)}>预览</button>
          <button className="btn btn-accent btn-sm" onClick={() => onRestore(bp)}>恢复</button>
        </div>
      })}
      {previewLoading && <p style={{ color: 'var(--text-tertiary)', fontSize: '12px', padding: '12px 0' }}>加载中...</p>}
      {preview && !previewLoading && (
        <div style={{ marginTop: '12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-subtle)', fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>备份内容预览</div>
          <pre style={{ margin: 0, padding: '12px', fontSize: '11px', fontFamily: 'var(--font-mono)', lineHeight: 1.5, maxHeight: '300px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: 'var(--text-secondary)', background: 'var(--bg-primary)' }}>{JSON.stringify(preview, null, 2)}</pre>
        </div>
      )}
    </div></>
  )
}