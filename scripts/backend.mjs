import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url))

/** Resolve paths and arguments separately so startup works on Windows and POSIX. */
export function backendInvocation(mode, {
  platform = process.platform,
  projectRoot = repositoryRoot,
  env = process.env,
  exists = existsSync,
  extraArgs = [],
} = {}) {
  if (mode !== 'serve' && mode !== 'test') throw new Error('Usage: node scripts/backend.mjs <serve|test> [additional arguments]')
  const paths = platform === 'win32' ? path.win32 : path.posix
  const backend = paths.join(projectRoot, 'backend')
  const defaultPython = paths.join(backend, '.venv', ...(platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']))
  const override = env.INTELIDAR_PYTHON?.trim()
  const command = override ? paths.resolve(projectRoot, override) : defaultPython
  if (!exists(command)) {
    throw new Error(`Python executable not found: ${command}\nCreate backend/.venv with Python 3.11+ and install backend dependencies (see docs/getting-started.md), or set INTELIDAR_PYTHON to an existing Python executable path.`)
  }
  const args = mode === 'serve'
    ? ['-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', '8000', ...extraArgs]
    : ['-m', 'pytest', ...extraArgs]
  return { command, args, options: { cwd: backend, env, stdio: 'inherit', shell: false, windowsHide: true } }
}

function main() {
  let invocation
  try { invocation = backendInvocation(process.argv[2], { extraArgs: process.argv.slice(3) }) }
  catch (error) {
    console.error(error.message)
    process.exitCode = 1
    return
  }
  const child = spawn(invocation.command, invocation.args, invocation.options)
  const forwardInterrupt = () => child.kill('SIGINT')
  const forwardTerminate = () => child.kill('SIGTERM')
  process.once('SIGINT', forwardInterrupt)
  process.once('SIGTERM', forwardTerminate)
  child.once('error', (error) => {
    console.error(`Could not start the backend with ${invocation.command}: ${error.message}`)
    process.exitCode = 1
  })
  child.once('close', (code, signal) => {
    process.removeListener('SIGINT', forwardInterrupt)
    process.removeListener('SIGTERM', forwardTerminate)
    process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 1)
  })
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) main()
