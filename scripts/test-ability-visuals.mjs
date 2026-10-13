import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { JSDOM } from 'jsdom'

const directory = await mkdtemp(join(tmpdir(), 'world6-visual-renderer-'))
test.after(() => rm(directory, { recursive: true, force: true }))
await symlink(resolve('node_modules'), join(directory, 'node_modules'), 'dir')
for (const file of ['abilityVisuals.ts', 'AbilityVisualEffect.tsx']) {
  const source = (await readFile('src/' + file, 'utf8')).replace("import './abilityVisuals.css'", '')
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText
    .replace(/(from\s+['"]\.\/[^'"]+)(['"])/g, (_, prefix, quote) => prefix + '.mjs' + quote)
  await writeFile(join(directory, file.replace(/\.tsx?$/, '.mjs')), js)
}
const { default: AbilityVisualEffect } = await import(pathToFileURL(join(directory, 'AbilityVisualEffect.mjs')))
const { abilityVisualFamilies, abilityVisualPhases } = await import(pathToFileURL(join(directory, 'abilityVisuals.mjs')))
const props = { familyId: 'fire', start: Object.freeze({ x: 3, y: 4 }), end: Object.freeze({ x: 20, y: 10 }), radius: 2 }
const render = patch => renderToStaticMarkup(React.createElement('svg', null, React.createElement(AbilityVisualEffect, { ...props, ...patch })))
const dom = new JSDOM()
test.after(() => dom.window.close())
const documentOf = markup => { dom.window.document.body.innerHTML = markup; return dom.window.document }

test('Все 20 эффектов поддерживают пять стадий и четыре пространственные формы без нечисловой геометрии', () => {
  assert.equal(abilityVisualFamilies.length, 20)
  for (const family of abilityVisualFamilies) for (const phase of abilityVisualPhases) for (const shape of ['point', 'sphere', 'beam', 'cone']) {
    const markup = render({ familyId: family.id, phase: phase.id, shape, coneAngleDeg: 75 })
    assert(!/(?:NaN|Infinity)/.test(markup), `${family.id}/${phase.id}/${shape}`)
    const doc = documentOf(markup), group = doc.querySelector('[data-vfx-family]')
    assert.equal(group?.getAttribute('data-vfx-family'), family.id)
    assert.equal(group?.getAttribute('data-vfx-phase'), phase.id)
    assert.equal(group?.getAttribute('pointer-events'), 'none')
    assert.equal(group?.getAttribute('aria-hidden'), 'true')
    assert(doc.querySelector('.w6-vfx-glyph'))
    assert(doc.querySelectorAll('.w6-vfx-particle').length <= 12)
  }
})

test('У семейств разные геометрические силуэты; частицы ограничены при любых настройках', () => {
  const silhouettes = abilityVisualFamilies.map(family => documentOf(render({ familyId: family.id })).querySelector('.w6-vfx-glyph').innerHTML)
  assert.equal(new Set(silhouettes).size, 20)
  for (const intensity of [-100, .25, 2, 1e30, NaN, Infinity]) {
    const doc = documentOf(render({ intensity, scale: 1e30, radius: Infinity, durationMs: NaN }))
    const count = doc.querySelectorAll('.w6-vfx-particle').length
    assert(count >= 4 && count <= 12)
    assert(!/(?:NaN|Infinity)/.test(doc.querySelector('svg').outerHTML))
  }
})

test('Без анимации и некорректные координаты не создают SVG эффекта', () => {
  for (const patch of [{ familyId: 'none' }, { familyId: 'unknown' }, { start: { x: NaN, y: 0 } }, { end: { x: 0, y: Infinity } }]) {
    assert.equal(documentOf(render(patch)).querySelector('[data-vfx-family]'), null)
  }
})

test('Пауза и сокращение движения передаются; управляемый полёт использует заданную координату', () => {
  const doc = documentOf(render({ phase: 'travel', progress: .25, paused: true, reducedMotion: true }))
  const root = doc.querySelector('[data-vfx-family]')
  assert(root.classList.contains('w6-vfx-paused'))
  assert(root.classList.contains('w6-vfx-reduced'))
  assert.equal(doc.querySelector('.w6-vfx-traveller'), null)
  assert.equal([...root.children].at(-1).getAttribute('transform'), 'translate(7.25 5.5)')
  assert.deepEqual(props.start, { x: 3, y: 4 })
  assert.deepEqual(props.end, { x: 20, y: 10 })
})

test('Масштаб картинки не меняет визуальную границу радиуса сферы или луча', () => {
  for (const scale of [.25, 1, 4]) {
    const sphere = documentOf(render({ shape: 'sphere', scale }))
    assert.equal(sphere.querySelector('.w6-vfx-area').getAttribute('r'), '2')
    const beam = documentOf(render({ shape: 'beam', scale }))
    assert.match(beam.querySelector('.w6-vfx-area').getAttribute('d'), /^M0 -2H.*M0 2H/)
  }
})

test('Два эффекта в одной сцене создают независимые идентификаторы градиентов', () => {
  const markup = renderToStaticMarkup(React.createElement('svg', null,
    React.createElement(AbilityVisualEffect, props),
    React.createElement(AbilityVisualEffect, { ...props, familyId: 'water' })))
  const gradients = [...documentOf(markup).querySelectorAll('radialGradient')].map(node => node.id)
  assert.equal(gradients.length, 2)
  assert.equal(new Set(gradients).size, 2)
})
