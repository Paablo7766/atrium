import { describe, expect, it } from 'vitest'
import { compareSemver } from './changelog'
import {
  canDismissUpdateModal,
  computeUpdateOffer,
  emptyUpdaterStatus,
  isPrereleaseVersion,
  nsisUpdateInstallOptions,
  shouldNotifyForVersion,
  shouldShowUpdateModal,
  summarizeReleaseNotes,
} from './desktopUpdater'

describe('isPrereleaseVersion', () => {
  it('detecta sufijos semver', () => {
    expect(isPrereleaseVersion('1.2.0')).toBe(false)
    expect(isPrereleaseVersion('1.2.0-beta.1')).toBe(true)
  })
})

describe('shouldNotifyForVersion', () => {
  const compare = compareSemver

  it('en canal estable ignora betas y solo avisa de estables más nuevas', () => {
    expect(shouldNotifyForVersion({ current: '1.1.0', candidate: '1.2.0-beta.1', allowPrerelease: false, compare })).toBe(false)
    expect(shouldNotifyForVersion({ current: '1.1.0', candidate: '1.2.0', allowPrerelease: false, compare })).toBe(true)
    expect(shouldNotifyForVersion({ current: '1.2.0', candidate: '1.2.0', allowPrerelease: false, compare })).toBe(false)
  })

  it('en canal beta avisa de pre-releases más nuevas', () => {
    expect(shouldNotifyForVersion({ current: '1.1.0', candidate: '1.2.0-beta.1', allowPrerelease: true, compare })).toBe(true)
    expect(shouldNotifyForVersion({ current: '1.2.0-beta.1', candidate: '1.2.0-beta.2', allowPrerelease: true, compare })).toBe(true)
    expect(shouldNotifyForVersion({ current: '1.2.0-beta.1', candidate: '1.2.0', allowPrerelease: true, compare })).toBe(true)
    expect(shouldNotifyForVersion({ current: '1.2.0-beta.2', candidate: '1.2.0-beta.1', allowPrerelease: true, compare })).toBe(false)
  })
})

describe('computeUpdateOffer', () => {
  it('oculta el aviso si pospuso esa versión en esta sesión', () => {
    expect(
      computeUpdateOffer({ state: 'available', availableVersion: '1.2.0', dismissedVersion: '1.2.0' }),
    ).toBe(false)
  })

  it('vuelve a ofrecer si aparece otra versión o ya está descargando', () => {
    expect(
      computeUpdateOffer({ state: 'available', availableVersion: '1.2.1', dismissedVersion: '1.2.0' }),
    ).toBe(true)
    expect(
      computeUpdateOffer({ state: 'downloading', availableVersion: '1.2.0', dismissedVersion: '1.2.0' }),
    ).toBe(true)
    expect(
      computeUpdateOffer({ state: 'downloaded', availableVersion: '1.2.0', dismissedVersion: null }),
    ).toBe(true)
    expect(
      computeUpdateOffer({ state: 'restarting', availableVersion: '1.2.0', dismissedVersion: '1.2.0' }),
    ).toBe(true)
  })

  it('no deja posponer una vez descargada: se instala y se reabre sola', () => {
    expect(
      computeUpdateOffer({ state: 'downloaded', availableVersion: '1.2.0-beta.1', dismissedVersion: '1.2.0-beta.1' }),
    ).toBe(true)
  })
})

describe('canDismissUpdateModal', () => {
  it('solo se puede cerrar antes de empezar a aplicar la actualización', () => {
    expect(canDismissUpdateModal('available')).toBe(true)
    expect(canDismissUpdateModal('error')).toBe(true)
    expect(canDismissUpdateModal('downloading')).toBe(false)
    expect(canDismissUpdateModal('downloaded')).toBe(false)
    expect(canDismissUpdateModal('restarting')).toBe(false)
  })
})

describe('nsisUpdateInstallOptions', () => {
  it('instala en silencio y relanza para no mostrar el asistente NSIS', () => {
    expect(nsisUpdateInstallOptions()).toEqual({ isSilent: true, isForceRunAfter: true })
  })
})

describe('summarizeReleaseNotes', () => {
  it('prioriza viñetas y limpia el prefijo de tipo', () => {
    expect(
      summarizeReleaseNotes(`# 1.2.0\n\n- [Nuevo] Feedback\n- [Mejora] Calendario\n\nExtra`),
    ).toEqual(['Feedback', 'Calendario'])
  })

  it('si no hay viñetas, usa las primeras líneas útiles', () => {
    expect(summarizeReleaseNotes('Primera línea\nSegunda línea')).toEqual(['Primera línea', 'Segunda línea'])
    expect(summarizeReleaseNotes('   ')).toEqual([])
  })

  it('convierte notas HTML de GitHub en texto plano', () => {
    expect(
      summarizeReleaseNotes(
        '<h2>Correcciones críticas</h2><ul><li>Creación fiable de <code>journal.db</code> cifrado</li><li>Aviso de actualización visible</li></ul>',
      ),
    ).toEqual(['Creación fiable de journal.db cifrado', 'Aviso de actualización visible'])
  })
})

describe('shouldShowUpdateModal', () => {
  const base = {
    supported: true,
    offer: true,
    state: 'available' as const,
    tutorialActive: false,
    feedbackOpen: false,
    whatsNewVisible: false,
  }

  it('solo muestra el modal interno cuando hay oferta y no hay otros overlays', () => {
    expect(shouldShowUpdateModal(base)).toBe(true)
    expect(shouldShowUpdateModal({ ...base, supported: false })).toBe(false)
    expect(shouldShowUpdateModal({ ...base, offer: false })).toBe(false)
    expect(shouldShowUpdateModal({ ...base, tutorialActive: true })).toBe(false)
    expect(shouldShowUpdateModal({ ...base, feedbackOpen: true })).toBe(false)
    expect(shouldShowUpdateModal({ ...base, whatsNewVisible: true })).toBe(false)
    expect(shouldShowUpdateModal({ ...base, tradeModalOpen: true })).toBe(false)
    expect(shouldShowUpdateModal({ ...base, state: 'idle' })).toBe(false)
    expect(shouldShowUpdateModal({ ...base, state: 'downloaded' })).toBe(true)
    expect(shouldShowUpdateModal({ ...base, state: 'restarting' })).toBe(true)
  })
})

describe('emptyUpdaterStatus', () => {
  it('arranca en canal estable y sin oferta', () => {
    expect(emptyUpdaterStatus('1.1.0')).toMatchObject({
      supported: false,
      currentVersion: '1.1.0',
      allowPrerelease: false,
      offer: false,
    })
  })
})
