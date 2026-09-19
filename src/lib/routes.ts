import type { Page } from '@/store'

export const APP_PAGES: Page[] = [
  'dashboard',
  'trades',
  'calendar',
  'analytics',
  'journal',
  'settings',
]

export function pathForPage(page: Page): string {
  return `/${page}`
}

export function pageFromPath(pathname: string): Page | null {
  const segment = pathname.replace(/^\/+|\/+$/g, '').split('/')[0] ?? ''
  if ((APP_PAGES as string[]).includes(segment)) return segment as Page
  return null
}
