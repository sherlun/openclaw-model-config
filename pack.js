import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.dirname(fileURLToPath(import.meta.url))
const electronDist = path.join(root, 'temp-electron')

function run(cmd, args) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      ELECTRON_OVERRIDE_DIST_PATH: electronDist,
    },
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

run('npm', ['run', 'build'])

const target = process.argv[2] || 'dir'
run('npx', ['--yes', 'electron-builder@25.1.8', '--win', target])

if (target === 'dir') {
  run('npm', ['run', 'zip'])
}
