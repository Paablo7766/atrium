import { describe, expect, it } from 'vitest'
import { buildLitestreamConfig, yamlPath } from './config'

describe('buildLitestreamConfig', () => {
  it('genera YAML con rutas normalizadas', () => {
    const yaml = buildLitestreamConfig('C:\\Users\\me\\journal.db', 'C:\\Users\\me\\backups\\litestream')
    expect(yaml).toContain('path: C:/Users/me/journal.db')
    expect(yaml).toContain('path: C:/Users/me/backups/litestream')
    expect(yaml).toContain('type: file')
    expect(yaml).toContain('sync-interval: 1s')
  })

  it('yamlPath convierte backslashes', () => {
    expect(yamlPath('a\\b\\c')).toBe('a/b/c')
  })
})
