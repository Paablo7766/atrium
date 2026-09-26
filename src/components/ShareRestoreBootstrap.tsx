import { useEffect } from 'react'
import { useStore } from '@/store'
import { useGoToPage } from '@/lib/useGoToPage'
import { isDesktop } from '@/lib/db/client'
import { consumeSharedBackupImport, stashPendingRestore } from '@/lib/web/shareImport'

/** Tras Compartir → Atrium, lleva al usuario a Ajustes con la copia lista para restaurar. */
export function ShareRestoreBootstrap() {
  const goToPage = useGoToPage()
  const loaded = useStore((s) => s.loaded)
  const dbLocked = useStore((s) => s.dbLocked)

  useEffect(() => {
    if (isDesktop()) return
    void (async () => {
      const raw = await consumeSharedBackupImport()
      if (!raw) return
      stashPendingRestore(raw)
      if (loaded && !dbLocked) goToPage('settings')
    })()
  }, [loaded, dbLocked, goToPage])

  return null
}
