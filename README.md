# OpenClaw Model Config

OpenClaw 模型配置桌面工具，用于可视化管理 `~/.openclaw/openclaw.json` 中的模型提供商、模型列表、默认模型，并支持 Gateway 启停与配置导入。

## 功能概览

- 管理 OpenClaw 配置文件（`~/.openclaw/openclaw.json`）
- 添加 / 编辑 / 删除模型提供商与模型
- 从预设快速添加常见 Provider（OpenAI、Anthropic 等）
- 本地配置备份与恢复
- 一键导入配置到 OpenClaw （多模型）
- 启动 / 停止 OpenClaw Gateway，查看运行日志
- 应用配置持久化到 `~/.openclawModelConfig/config.json`

## 技术架构

```
┌─────────────────────────────────────────┐
│  Electron 主进程 (electron-main.js)      │
│  - 系统托盘、窗口管理                      │
│  - 打包模式下内嵌启动 Express 后端         │
└─────────────────┬───────────────────────┘
                  │
     开发模式      │  打包模式
     localhost:5173│  localhost:3001
                  ▼
┌─────────────────────────────────────────┐
│  前端 React + Vite                       │
│  - 开发：Vite Dev Server (5173)          │
│  - 生产：dist/ 静态资源                   │
└─────────────────┬───────────────────────┘
                  │ /api/*
                  ▼
┌─────────────────────────────────────────┐
│  后端 Express (server.js, 3001)          │
│  - 读写 openclaw.json                    │
│  - Gateway 进程管理                        │
└─────────────────────────────────────────┘
```

| 组件 | 说明 |
|------|------|
| 前端 | React 18 + Vite 5 |
| 后端 | Express 4（读写本地配置文件） |
| 桌面壳 | Electron 28.3.3 |
| 打包 | electron-builder 26 |

---

## 环境要求

- **Node.js** 18+
- **npm** 9+
- **Windows** x64（当前打包目标）
- 已安装 **OpenClaw CLI**（Gateway 功能需要，`openclaw` 命令在 PATH 中可用）

---

## 快速开始（开发模式）

### 1. 安装依赖

```bash
npm install
```

> 若 `npm install electron` 报 `EBUSY` 文件占用，见下方 [常见问题](#常见问题)。

### 2. 准备 Electron 运行时

项目使用 `temp-electron/` 目录存放 Electron 可执行文件（版本 28.3.3）。若该目录不存在，可从 [Electron Releases](https://github.com/electron/electron/releases/tag/v28.3.3) 下载 `electron-v28.3.3-win32-x64.zip` 并解压到 `temp-electron/`。

### 3. 启动开发环境

**方式 A：浏览器开发（仅前端 + API）**

```bash
npm run dev
```

- 前端：http://localhost:5173
- API：http://localhost:3001

**方式 B：Electron 桌面开发**

```bash
npm run electron-dev
```

同时启动 Vite、API 服务器和 Electron 窗口。

---

## 部署与使用

### 方式一：桌面应用（推荐）

1. 下载或自行打包 `release/OpenClaw-Model-Config-1.0.0-win-x64.zip`
2. 解压到任意目录
3. 运行 `OpenClaw Model Config.exe`

> **注意**：关闭窗口不会退出程序，而是最小化到**系统托盘**。请查看任务栏右下角托盘图标，双击或右键选择「显示窗口」。彻底退出请右键托盘图标 →「退出」。

### 方式二：Web 模式（仅 API + 静态页面）

```bash
npm run build    # 构建前端到 dist/
npm start        # 启动 server.js，监听 3001
```

浏览器访问 http://localhost:3001

### 配置文件路径

| 文件 | 路径 |
|------|------|
| OpenClaw 主配置 | `~/.openclaw/openclaw.json` |
| 应用本地配置 | `~/.openclawModelConfig/config.json` |
| 配置备份 | `~/.openclawModelConfig/backups/` |

---

## 打包说明

### 一键打包（目录 + ZIP）

```bash
npm run pack
```

执行流程：

1. `vite build` — 构建前端到 `dist/`
2. `electron-builder --win dir` — 输出到 `release/win-unpacked/`
3. 自动生成 `release/OpenClaw-Model-Config-1.0.0-win-x64.zip`

### 其他打包命令

| 命令 | 说明 |
|------|------|
| `npm run zip` | 仅将已有的 `release/win-unpacked/` 压缩为 zip |
| `npm run pack:portable` | 单文件 portable exe（需下载 NSIS，见常见问题） |
| `npm run pack:installer` | NSIS 安装包（需下载 NSIS） |

### 打包产物

```
release/
├── win-unpacked/                          # 可运行目录
│   └── OpenClaw Model Config.exe          # 主程序
└── OpenClaw-Model-Config-1.0.0-win-x64.zip  # 分发压缩包
```

分发时请将 **整个 `win-unpacked` 目录**（或 zip 解压后的全部文件）一起提供，不能只复制 exe 单文件。

---

## 打包问题排查记录

以下是本项目在 Windows 上打包过程中遇到的实际问题及处理方式，供后续维护参考。

### 问题 1：打包后 exe 打不开 / 窗口空白

**现象**：双击 exe 无反应，或窗口显示无法连接。

**原因**：

- `electron-main.js` 写死了 `http://localhost:5173`（Vite 开发服务器地址）
- 打包后没有 Vite 进程，也没有启动 Express 后端

**修复**：

```javascript
// electron-main.js
```javascript
// electron-main.js
import { startServer } from './server.js'

const isDev = !app.isPackaged
const APP_URL = isDev ? 'http://localhost:5173' : 'http://localhost:3001'

app.whenReady().then(async () => {
  if (!isDev) {
    try {
      await startServer()
    } catch (err) {
      dialog.showErrorBox(启动失败, `后端服务启动失败：${err.message}`)
      app.quit()
      return
    }
  }
  createTray()
  createWindow()
})
```

`server.js` 导出 `startServer()` 函数供 Electron 主进程调用，打包模式下内嵌启动 Express 后端。


---

### 问题 2：以为程序没启动（实际在托盘）

**现象**：双击 exe 后任务栏没有窗口。

**原因**：应用设计为「关闭/最小化到托盘」，窗口默认可能被隐藏。

**处理**：检查系统托盘（任务栏右下角），双击图标或右键 →「显示窗口」。

---

### 问题 3：`npm install electron` 报 EBUSY

**现象**：

```
EBUSY: resource busy or locked, rename '...\node_modules\electron\dist\...'
```

**原因**：Electron 的 `default_app.asar` 被其他进程占用（常见于 Electron 仍在运行，或 IDE 索引 asar 文件）。

**处理**：

1. 关闭所有 Electron / 本应用进程
2. 结束占用 node 的进程后重试
3. 若仍失败，删除 `node_modules/electron` 后重装
4. **本项目 workaround**：使用 `temp-electron/` 目录 + 环境变量 `ELECTRON_OVERRIDE_DIST_PATH`，通过 `pack.js` 调用 `npx electron-builder`，无需在 `node_modules` 中完整安装 electron

---

### 问题 4：图标尺寸不满足要求

**现象**：

```
image icon.png must be at least 256x256
```

**原因**：electron-builder 要求 Windows 图标至少 256×256，原 `icon.png` 为 64×64。

**处理**：生成 `build-icon.png`（256×256），并在 `package.json` 的 `build.win.icon` 中引用。

> **NSIS 安装包注意**：NSIS 要求图标为 `.ico` 格式。使用 PowerShell 将 PNG 转为 ICO：
> ```powershell
> Add-Type -AssemblyName System.Drawing
> $bmp = New-Object System.Drawing.Bitmap("build-icon.png")
> $icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
> $fs = New-Object System.IO.FileStream("build-icon.ico", [System.IO.FileMode]::Create)
> $icon.Save($fs); $fs.Close(); $icon.Dispose(); $bmp.Dispose()
> ```
> 然后在 `package.json` 中将 NSIS 相关图标引用改为 `.ico`。

PowerShell 扩图示例：

```powershell
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("icon.png")
$bmp = New-Object System.Drawing.Bitmap 256,256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.DrawImage($img, 0, 0, 256, 256)
$bmp.Save("build-icon.png", [System.Drawing.Imaging.ImageFormat]::Png)
```

---

### 问题 5：winCodeSign 解压符号链接失败

**现象**：

```
ERROR: Cannot create symbolic link : 客户端没有所需的特权
```

**原因**：electron-builder 解压 winCodeSign 工具时需要创建符号链接，Windows 默认无权限。

**处理**：在 `package.json` 的 `build.win` 中设置：

```json
"signAndEditExecutable": false
```

本地开发/内部分发可关闭代码签名。正式发布建议开启 Windows 开发者模式或以管理员身份运行打包。

---

### 问题 6：portable / installer 打包失败（NSIS 下载超时）

**现象**：

```
dial tcp ... connectex: A connection attempt failed
```

**原因**：`portable` 和 `nsis` 目标需要额外下载 NSIS 工具，国内网络环境无法直接访问 GitHub Releases。

**处理**：

1. 从 [electron-builder-binaries releases](https://github.com/electron-userland/electron-builder-binaries/releases/tag/nsis-3.0.4.1) 下载 `nsis-3.0.4.1.7z`（需要挂代理或 VPN）
2. 运行缓存脚本：`node scripts/setup-nsis-cache.cjs <下载的.7z文件>`
3. 脚本会自动计算 FNV-1a hash 并将文件放入 electron-builder 缓存
4. 重新执行打包：`node pack.js nsis` 或 `node pack.js portable`

**备用方案**：使用 `dir` 目标（`npm run pack`），输出 `win-unpacked` 目录 + zip，不依赖 NSIS。

---

## 项目结构

```
openclaw-model-config-app/
├── electron-main.js      # Electron 主进程
├── server.js             # Express API + 静态资源服务
├── pack.js               # 打包脚本
├── scripts/
│   ├── setup-nsis-cache.cjs  # NSIS 缓存辅助脚本
│   └── zip-release.ps1   # 生成 zip 压缩包
├── src/
│   ├── App.jsx           # 主界面
│   ├── App.jsx           # 主界面
│   ├── api.js            # 前端 API 封装
│   ├── main.jsx          # React 入口
│   ├── index.css         # 全局样式
│   └── presets.js        # 模型预设
├── dist/                 # Vite 构建输出
├── temp-electron/        # Electron 运行时（本地）
├── release/              # 打包产物（gitignore）
├── icon.png              # 托盘/界面图标
├── build-icon.png        # 打包用 256×256 图标
├── build-icon.ico        # NSIS 安装包图标
└── package.json
```

---

## 常用命令速查

| 命令 | 作用 |
|------|------|
| `npm run dev` | 开发模式（Vite + API） |
| `npm run electron-dev` | Electron 桌面开发 |
| `npm run build` | 仅构建前端 |
| `npm start` | 生产模式启动 API + 静态页 |
| `npm run pack` | 打包 exe + zip |
| `npm run zip` | 仅压缩已有 win-unpacked |

---

## 许可证

本项目为 OpenClaw 生态配套工具，具体许可证请参考仓库说明。
