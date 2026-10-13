import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { verifyLocal } from './verify-local.mjs'

async function fixture(t, fail = '', withoutSummary = '') {
  const root = await mkdtemp(join(tmpdir(), 'grani-verification-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const npmCli = join(root, 'fake-npm.cjs')
  await writeFile(npmCli, `
    const fs = require('node:fs')
    const step = process.argv.slice(2).join(' ')
    fs.appendFileSync('order.txt', step + '\\n')
    console.log('stdout: ' + step)
    console.error('stderr: ' + step)
    if (step !== ${JSON.stringify(withoutSummary)}) {
      console.log('# tests 1\\n# pass 1\\n# fail 0\\n# cancelled 0\\n# skipped 0\\n# todo 0')
    }
    if (step === ${JSON.stringify(fail)}) process.exitCode = 7
  `)
  return { root, npmCli, outputDirectory: join(root, 'result') }
}

test('Ошибка UI не скрывает следующие проверки и даёт отрицательный общий результат', async t => {
  const config = await fixture(t, 'run test:ui')
  const summary = await verifyLocal(config)
  assert.equal(summary.passed, false)
  assert.equal(summary.releaseReadiness, 'not-assessed')
  assert.deepEqual(summary.checks.map(check => check.passed), [true, true, false, true, true, true])
  assert.equal(summary.checks[2].exitCode, 7)
  assert.deepEqual((await readFile(join(config.root, 'order.txt'), 'utf8')).trim().split('\n'), [
    'run test:verification', 'test', 'run test:ui', 'run test:server', 'run lint', 'run build',
  ])
  const saved = JSON.parse(await readFile(join(config.outputDirectory, 'summary.json'), 'utf8'))
  assert.deepEqual(saved, summary)
  const log = await readFile(join(config.outputDirectory, 'ui.log'), 'utf8')
  assert.match(log, /stdout: run test:ui/)
  assert.match(log, /stderr: run test:ui/)
})

test('Успешные локальные команды не объявляют сайт готовым к выпуску', async t => {
  const config = await fixture(t)
  const summary = await verifyLocal(config)
  assert.equal(summary.passed, true)
  assert.equal(summary.checks.length, 6)
  assert.equal(summary.releaseReadiness, 'not-assessed')
  assert(summary.limitations.some(text => text.includes('WebGL')))
  for (const check of summary.checks) {
    assert.equal(check.exitCode, 0)
    assert.match(await readFile(join(config.outputDirectory, check.log), 'utf8'), /stdout:/)
  }
})

test('Повторный запуск не перезаписывает ранее сохранённый отчёт', async t => {
  const config = await fixture(t)
  await mkdir(config.outputDirectory)
  const path = join(config.outputDirectory, 'summary.json')
  await writeFile(path, 'previous evidence')
  await assert.rejects(verifyLocal(config), { code: 'EEXIST' })
  assert.equal(await readFile(path, 'utf8'), 'previous evidence')
  await assert.rejects(readFile(join(config.root, 'order.txt')), { code: 'ENOENT' })
})

test('Отсутствующий инструмент не выдаёт успешную проверку', async t => {
  const config = await fixture(t)
  const summary = await verifyLocal({ ...config, npmCli: join(config.root, 'missing.cjs') })
  assert.equal(summary.passed, false)
  assert(summary.checks.every(check => !check.passed))
  assert.match(await readFile(join(config.outputDirectory, 'build.log'), 'utf8'), /MODULE_NOT_FOUND/)
})

test('Команда возвращает ненулевой код после провала одной проверки', async t => {
  const config = await fixture(t, 'run test:server')
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL('./verify-local.mjs', import.meta.url)), '--output-dir', config.outputDirectory,
  ], { cwd: config.root, env: { ...process.env, npm_execpath: config.npmCli }, encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stdout, /ОШИБКА: server/)
  assert.match(result.stdout, /OK: build/)
  assert.equal(JSON.parse(await readFile(join(config.outputDirectory, 'summary.json'), 'utf8')).passed, false)
})

test('Код завершения 0 без итогового отчёта тестов не считается успехом', async t => {
  const config = await fixture(t, '', 'run test:ui')
  const summary = await verifyLocal(config)
  assert.equal(summary.checks[2].exitCode, 0)
  assert.equal(summary.checks[2].reportComplete, false)
  assert.equal(summary.checks[2].passed, false)
  assert.equal(summary.passed, false)
  assert.equal(summary.checks.at(-1).passed, true)
})
