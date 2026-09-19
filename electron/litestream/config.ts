/** Generación de configuración Litestream (testeable sin Electron). */

export function yamlPath(p: string): string {
  return p.replace(/\\/g, '/')
}

export function buildLitestreamConfig(sourceDb: string, replicaPath: string): string {
  return [
    'dbs:',
    `  - path: ${yamlPath(sourceDb)}`,
    '    replica:',
    '      type: file',
    `      path: ${yamlPath(replicaPath)}`,
    '      sync-interval: 1s',
    '',
  ].join('\n')
}
