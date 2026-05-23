import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

app.commandLine.appendSwitch('disable-gpu')
app.commandLine.appendSwitch('disable-gpu-sandbox')
app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('in-process-gpu')

let mainWindow = null
let tray = null
let isQuitting = false

function createTray() {
  // Use local icon file, fallback to generated icon
  const iconPath = path.join(__dirname, 'icon.png')
  let icon
  if (fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath)
  } else {
    // Fallback: generate a 32x32 diamond icon
    icon = nativeImage.createEmpty()
    // Create a simple blue-purple gradient square as tray icon
    const size = 32
    const buf = Buffer.alloc(size * size * 4)
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4
        const cx = x - size / 2, cy = y - size / 2
        // Diamond shape: |cx| + |cy| <= r
        const inDiamond = Math.abs(cx) + Math.abs(cy) <= size / 2 - 2
        buf[i] = inDiamond ? 99 : 11     // R
        buf[i + 1] = inDiamond ? 102 : 13 // G
        buf[i + 2] = inDiamond ? 241 : 20 // B
        buf[i + 3] = inDiamond ? 255 : 0  // A
      }
    }
    icon = nativeImage.createFromBuffer(buf, { width: size, height: size })
  }

  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  tray.setToolTip('OpenClaw Model Config')

  const contextMenu = Menu.buildFromTemplate([
    { label: '显示窗口', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    { type: 'separator' },
    { label: '退出', click: () => { isQuitting = true; app.quit() } }
  ])

  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus() })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    title: 'OpenClaw Model Config',
    backgroundColor: '#0f1117',
    center: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  mainWindow.loadURL('http://localhost:5173')

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  // Minimize to tray instead of taskbar
  mainWindow.on('minimize', (e) => {
    e.preventDefault()
    mainWindow.hide()
  })

  // Close to tray instead of quitting
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(() => {
  createTray()
  createWindow()
})

app.on('before-quit', () => { isQuitting = true })
app.on('window-all-closed', () => { /* don't quit — handled by tray menu */ })
app.on('activate', () => { mainWindow?.show(); mainWindow?.focus() })
