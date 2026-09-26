import assert from 'node:assert/strict'
import test from 'node:test'
import { backendInvocation } from './backend.mjs'

test('Windows uses the Scripts Python executable without invoking a shell', () => {
  const invocation = backendInvocation('serve', { platform: 'win32', projectRoot: 'E:\\My Projects\\InteLiDar', env: {}, exists: () => true })
  assert.equal(invocation.command, 'E:\\My Projects\\InteLiDar\\backend\\.venv\\Scripts\\python.exe')
  assert.deepEqual(invocation.args, ['-m', 'uvicorn', 'app.main:app', '--reload', '--host', '127.0.0.1', '--port', '8000'])
  assert.equal(invocation.options.cwd, 'E:\\My Projects\\InteLiDar\\backend')
  assert.equal(invocation.options.shell, false)
  assert.equal(invocation.options.windowsHide, true)
  assert.equal(invocation.options.stdio, 'inherit')
})

test('POSIX uses the bin Python executable and passes pytest arguments literally', () => {
  const invocation = backendInvocation('test', { platform: 'linux', projectRoot: '/projects/room', env: {}, exists: () => true, extraArgs: ['-q', 'tests/test_api.py'] })
  assert.equal(invocation.command, '/projects/room/backend/.venv/bin/python')
  assert.deepEqual(invocation.args, ['-m', 'pytest', '-q', 'tests/test_api.py'])
  assert.equal(invocation.options.cwd, '/projects/room/backend')
})

test('an explicit Python executable overrides the project virtual environment', () => {
  let checked
  const invocation = backendInvocation('test', {
    platform: 'win32', projectRoot: 'E:\\Projects\\InteLiDar',
    env: { INTELIDAR_PYTHON: 'C:\\Python Runtime\\python.exe' },
    exists: (path) => { checked = path; return true },
  })
  assert.equal(invocation.command, 'C:\\Python Runtime\\python.exe')
  assert.equal(checked, invocation.command)
})

test('missing Python points to virtual environment setup and the override', () => {
  assert.throws(() => backendInvocation('test', { platform: 'win32', projectRoot: 'E:\\Projects\\InteLiDar', env: {}, exists: () => false }), /backend.*\.venv.*INTELIDAR_PYTHON/s)
})

test('unknown launcher modes fail with usage instead of starting Python', () => {
  assert.throws(() => backendInvocation('deploy', { exists: () => true }), /serve.*test/i)
})
