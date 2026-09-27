import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FOLDER_BACKUP_FILENAME, FOLDER_BACKUP_TMP_FILENAME } from '@/lib/db/backupFormat'
import { setupMasterPassword, resetWebCryptoForTests } from '@/lib/crypto/keyManagerWeb'
import {
  _resetWebFolderBackupForTests,
  _setWebFolderBackupStateForTests,
  getWebFolderBackupStatus,
  writeWebFolderBackupAtomic,
} from '@/lib/db/web/folderBackup'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() {
    return this.data.size
  }
  clear() {
    this.data.clear()
  }
  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null
  }
  key(index: number) {
    return [...this.data.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
  setItem(key: string, value: string) {
    this.data.set(key, String(value))
  }
}

type FileEntry = { content: string; lastModified: number }

function createMockFileHandle(
  name: string,
  files: Map<string, FileEntry>,
  moveFails: boolean,
): FileSystemFileHandle {
  return {
    kind: 'file',
    name,
    createWritable: async () => {
      let buffer = ''
      return {
        write: async (data: string) => {
          buffer += data
        },
        close: async () => {
          files.set(name, { content: buffer, lastModified: Date.now() })
        },
      }
    },
    getFile: async () => {
      const entry = files.get(name) ?? { content: '', lastModified: 0 }
      return new File([entry.content], name, { lastModified: entry.lastModified })
    },
    move: async (newName: string) => {
      if (moveFails) throw new Error('move blocked by sync client')
      const entry = files.get(name)
      if (!entry) throw new Error('missing tmp')
      files.delete(name)
      files.set(newName, entry)
    },
  } as unknown as FileSystemFileHandle
}

function createMockDirectory(opts: {
  permission?: PermissionState
  moveFails?: boolean
  initialBackup?: string
  permissionState?: { current: PermissionState }
}) {
  const files = new Map<string, FileEntry>()
  if (opts.initialBackup) {
    files.set(FOLDER_BACKUP_FILENAME, { content: opts.initialBackup, lastModified: 1 })
  }
  const moveFails = !!opts.moveFails
  const permissionState = opts.permissionState ?? { current: opts.permission ?? 'granted' }
  const dir = {
    kind: 'directory' as const,
    name: 'Atrium',
    queryPermission: async () => permissionState.current,
    requestPermission: async () => {
      permissionState.current = 'granted'
      return 'granted' as PermissionState
    },
    getDirectoryHandle: async (name: string) => {
      if (name !== 'Atrium') throw new Error('unexpected dir')
      return dir
    },
    getFileHandle: async (name: string, options?: { create?: boolean }) => {
      if (!files.has(name) && !options?.create) {
        throw new DOMException('NotFound', 'NotFoundError')
      }
      if (!files.has(name)) files.set(name, { content: '', lastModified: 0 })
      return createMockFileHandle(name, files, moveFails)
    },
    removeEntry: async (name: string) => {
      files.delete(name)
    },
  } as unknown as FileSystemDirectoryHandle
  return { dir, files, permissionState }
}

describe('writeWebFolderBackupAtomic', () => {
  it('escribe el temporal y sustituye el backup final', async () => {
    const { dir, files } = createMockDirectory({})
    const raw = '{"magic":"atrium-backup"}'
    const result = await writeWebFolderBackupAtomic(dir, raw)
    expect(result.ok).toBe(true)
    expect(files.has(FOLDER_BACKUP_TMP_FILENAME)).toBe(false)
    expect(files.get(FOLDER_BACKUP_FILENAME)?.content).toBe(raw)
  })

  it('si move falla, no corrompe el backup existente', async () => {
    const previous = '{"magic":"atrium-backup","version":1}'
    const { dir, files } = createMockDirectory({ initialBackup: previous, moveFails: true })
    const result = await writeWebFolderBackupAtomic(dir, '{"magic":"atrium-backup","version":2}')
    expect(result.ok).toBe(false)
    expect(files.get(FOLDER_BACKUP_FILENAME)?.content).toBe(previous)
    expect(files.has(FOLDER_BACKUP_TMP_FILENAME)).toBe(false)
  })
})

describe('web folder backup permissions', () => {
  beforeEach(async () => {
    vi.stubGlobal('localStorage', new MemoryStorage())
    vi.stubGlobal('window', { showDirectoryPicker: vi.fn() })
    await _resetWebFolderBackupForTests()
    await resetWebCryptoForTests()
    const setup = await setupMasterPassword('ClaveWebTest1')
    expect(setup.ok).toBe(true)
  })

  afterEach(async () => {
    await _resetWebFolderBackupForTests()
    await resetWebCryptoForTests()
    vi.unstubAllGlobals()
  })

  it('marca needsFolderPermission cuando el permiso se perdió al reabrir', async () => {
    const permissionState = { current: 'granted' as PermissionState }
    const { dir } = createMockDirectory({ permissionState })
    _setWebFolderBackupStateForTests(dir, true)
    permissionState.current = 'prompt'

    const status = await getWebFolderBackupStatus()
    expect(status.enabled).toBe(true)
    expect(status.needsFolderPermission).toBe(true)
  })
})
