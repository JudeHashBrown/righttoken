import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const componentPath = resolve(dirname(fileURLToPath(import.meta.url)), '../AppSidebar.vue')
const componentSource = readFileSync(componentPath, 'utf8')

describe('AppSidebar custom SVG styles', () => {
  it('does not override uploaded SVG fill or stroke colors', () => {
    expect(componentSource).toContain('.sidebar-svg-icon {')
    expect(componentSource).toContain('color: currentColor;')
    expect(componentSource).toContain('display: block;')
    expect(componentSource).not.toContain('stroke: currentColor;')
    expect(componentSource).not.toContain('fill: none;')
  })

  it('places user operations in the personal account section and preserves a simple-mode entry', () => {
    const personalSection = componentSource.slice(
      componentSource.indexOf('const personalNavItems'),
      componentSource.indexOf('// Custom menu items filtered by visibility')
    )
    const adminSection = componentSource.slice(
      componentSource.indexOf('const adminNavItems'),
      componentSource.indexOf('// Filter based on simple mode', componentSource.indexOf('const adminNavItems'))
    )

    expect(personalSection).toContain('appendUserOperationsAfterProfile')
    expect(adminSection).toContain('const withOperations = appendUserOperationsAfterProfile')
    expect(adminSection).toContain("path: '/user-operations'")
  })
})
