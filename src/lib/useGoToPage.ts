import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Page } from '@/store'
import { pathForPage } from '@/lib/routes'

/** Navegación entre secciones: la URL es la fuente de verdad; el store se sincroniza en App. */
export function useGoToPage() {
  const navigate = useNavigate()
  return useCallback((page: Page) => navigate(pathForPage(page)), [navigate])
}
