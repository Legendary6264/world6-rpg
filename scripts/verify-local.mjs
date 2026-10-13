import { spawn, spawnSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { finished } from 'node:stream/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { randomUUID } from 'node:crypto'

const checks = [
  ['verification', ['run', 'test:verification']],
  ['rules', ['test']],
  ['ui', ['run', 'test:ui']],
  ['server', ['run', 'test:server']],
  ['lint', ['run', 'lint']],
  ['build', ['run', 'build']],
]

function gitMetadata(root) {
  const git = args => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
    return result.status === 0 ? result.stdout.trim() : null
  }
  const status = git(['status', '--porcelain'])
  return {
    head: git(['rev-parse', 'HEAD']),
    branch: git(['branch', '--show-current']),
    dirty: status === null ? null : status.length > 0,
  }
}

async function runCheck(root, npmCli, args, logPath, needsTestSummary) {
  const log = createWriteStream(logPath, { flags: 'wx' })
  const logFinished = finished(log)
  // Observe write errors immediately, including while a child is still running.
  logFinished.catch(() => {})
  const started = Date.now()
  const child = spawn(process.execPath, [npmCli, ...args], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0' },
  })
  child.stdout.pipe(log, { end: false })
  child.stderr.pipe(log, { end: false })
  let launchError = null
  child.once('error', error => { launchError = error.message })
  const result = await new Promise(resolveResult => {
    child.once('close', (exitCode, signal) => resolveResult({ exitCode, signal }))
  })
  if (launchError) log.write(`\nНе удалось запустить проверку: ${launchError}\n`)
  log.end()
  await logFinished
  let testSummary = null, reportComplete = true
  if (needsTestSummary) {
    const output = await readFile(logPath, 'utf8'), counters = {}
    for (const name of ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
      const matches = [...output.matchAll(new RegExp('^# ' + name + ' (\\d+)\\s*$', 'gm'))]
      counters[name] = matches.length ? Number(matches[matches.length - 1][1]) : null
    }
    reportComplete = counters.tests !== null && counters.tests > 0 && counters.pass === counters.tests &&
      counters.fail === 0 && counters.cancelled === 0 && counters.skipped === 0 && counters.todo === 0
    testSummary = { ...counters, ...(output.match(/Проверено: (\d+) сценариев\./) ? { ruleScenarios: Number(output.match(/Проверено: (\d+) сценариев\./)[1]) } : {}) }
  }
  return {
    ...result,
    passed: result.exitCode === 0 && result.signal === null && launchError === null && reportComplete,
    durationMs: Date.now() - started,
    ...(needsTestSummary ? { reportComplete, testSummary } : {}),
    ...(launchError ? { launchError } : {}),
  }
}

export async function verifyLocal({ root, outputDirectory, npmCli, onProgress = () => {} }) {
  if (!npmCli) throw new Error('Запусти проверку через npm run verify:local.')
  // Refuse an existing directory so a repeat run never replaces earlier evidence.
  await mkdir(outputDirectory, { recursive: false })
  const summary = {
    schemaVersion: 1,
    scope: 'automated-local-checks',
    releaseReadiness: 'not-assessed',
    startedAt: new Date().toISOString(),
    nodeVersion: process.version,
    source: gitMetadata(root),
    checks: [],
    passed: false,
    limitations: [
      'Не подтверждает полноту восстановленного исходного кода.',
      'Не заменяет игру в браузере, телефонный экран и реальный WebGL/3D.',
      'Не проверяет рабочие облачные вход, письма, микрофон и инфраструктуру.',
    ],
  }
  for (const [name, args] of checks) {
    const log = `${name}.log`
    onProgress(`Проверка: ${name}`)
    const result = await runCheck(root, npmCli, args, join(outputDirectory, log), ['verification', 'rules', 'ui', 'server'].includes(name))
    summary.checks.push({ name, command: ['npm', ...args].join(' '), log, ...result })
    onProgress(`${result.passed ? 'OK' : 'ОШИБКА'}: ${name}`)
  }
  summary.finishedAt = new Date().toISOString()
  summary.passed = summary.checks.every(check => check.passed)
  await writeFile(join(outputDirectory, 'summary.json'), JSON.stringify(summary, null, 2) + '\n', { flag: 'wx' })
  return summary
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2)
    if (args.length && (args.length !== 2 || args[0] !== '--output-dir' || !args[1])) {
      throw new Error('Использование: npm run verify:local -- [--output-dir новый-каталог]')
    }
    const root = process.cwd()
    const parent = resolve(root, '.verification')
    if (!args.length) await mkdir(parent, { recursive: true })
    const outputDirectory = args.length
      ? resolve(root, args[1])
      : join(parent, `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`)
    const summary = await verifyLocal({ root, outputDirectory, npmCli: process.env.npm_execpath, onProgress: console.log })
    console.log(`Автоматические проверки: ${summary.passed ? 'пройдены' : 'есть ошибки'}. Отчёт: ${outputDirectory}`)
    console.log('Готовность продукта к выпуску этим запуском не подтверждается.')
    process.exitCode = summary.passed ? 0 : 1
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
