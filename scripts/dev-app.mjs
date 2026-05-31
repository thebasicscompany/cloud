#!/usr/bin/env node
// One-command dev launcher for the desktop app.
//
//   pnpm dev:electron
//
// Starts the Next dev renderer (localhost:3000, Doppler-injected so Supabase
// auth is real), waits until it's actually serving, then opens the Electron app
// pointed at it. Closing the app — or Ctrl+C — tears BOTH down (no stray dev
// server left running). This replaces the old two-step "start server, then
// start app" dance.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import http from 'node:http'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const webDir = join(root, 'web')
const desktopDir = join(root, 'desktop')
const APP_URL = 'http://localhost:3000'

const children = []
let shuttingDown = false

function killChild(child) {
  if (!child || child.killed) return
  if (process.platform === 'win32') {
    // Kill the whole tree — next dev spawns workers the parent kill won't reach.
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', shell: true })
    } catch {
      /* ignore */
    }
  } else {
    try {
      child.kill('SIGTERM')
    } catch {
      /* ignore */
    }
  }
}

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const c of children) killChild(c)
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

// 1) Next dev renderer.
console.log('[dev:electron] starting web dev server (localhost:3000)…')
const web = spawn('doppler', ['run', '--project', 'electron_app', '--config', 'dev', '--', 'pnpm', 'dev'], {
  cwd: webDir,
  stdio: 'inherit',
  shell: true,
})
children.push(web)
web.on('exit', () => {
  if (!shuttingDown) console.log('[dev:electron] web server stopped — shutting down')
  shutdown(0)
})

// 2) Poll until it serves, then launch Electron.
function ping() {
  return new Promise((resolve) => {
    const req = http.get(`${APP_URL}/auth/v2/login`, (res) => {
      res.resume()
      resolve(res.statusCode === 200)
    })
    req.on('error', () => resolve(false))
    req.setTimeout(3000, () => {
      req.destroy()
      resolve(false)
    })
  })
}

async function waitThenLaunchApp() {
  for (let i = 0; i < 60 && !shuttingDown; i++) {
    if (await ping()) {
      console.log('[dev:electron] web up — opening the app')
      const electron = spawn('npx', ['electron', '.'], {
        cwd: desktopDir,
        stdio: 'inherit',
        shell: true,
        env: { ...process.env, BASICS_APP_URL: APP_URL },
      })
      children.push(electron)
      electron.on('exit', () => {
        console.log('[dev:electron] app closed — stopping the dev server')
        shutdown(0)
      })
      return
    }
    await new Promise((r) => setTimeout(r, 2000))
  }
  if (!shuttingDown) {
    console.error('[dev:electron] web server never came up — aborting')
    shutdown(1)
  }
}

waitThenLaunchApp()
