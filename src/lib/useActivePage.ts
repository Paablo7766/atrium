import { useLocation } from 'react-router-dom'
import { useStore, type Page } from '@/store'
import { pageFromPath } from '@/lib/routes'

/** Página visible según la ruta actual (evita desfase store/URL al cambiar de sección). */
export function useActivePage(): Page {
  const pathname = useLocation().pathname
  const fallback = useStore((s) => s.page)
  return pageFromPath(pathname) ?? fallback
}
