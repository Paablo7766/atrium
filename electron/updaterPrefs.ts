export type UpdaterPrefs = {
  allowPrerelease: boolean
}

export function parseUpdaterPrefs(raw: unknown): UpdaterPrefs {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return { allowPrerelease: obj.allowPrerelease === true }
}

export function serializeUpdaterPrefs(prefs: UpdaterPrefs): string {
  return JSON.stringify({ allowPrerelease: prefs.allowPrerelease === true }, null, 2)
}
