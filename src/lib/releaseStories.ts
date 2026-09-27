import type { AppLocale } from '@/types'
import { parseChangelogItem, type ChangelogItemKind, type ChangelogRelease } from '@/lib/changelog'

export type ReleaseVisualId = 'unlock' | 'logos' | 'dashboard' | 'calendar' | 'feedback' | 'update'

export type ReleaseStory = {
  kind: ChangelogItemKind
  title: string
  body: string
  visual?: ReleaseVisualId
}

type StoriesByLocale = Record<AppLocale, ReleaseStory[]>

const STORIES: Record<string, StoriesByLocale> = {
  '1.2.0-beta.3': {
    es: [
      {
        kind: 'improve',
        title: 'El aviso de actualización se cierra bien',
        body: 'Pulsa Entendido y sigues en el diario. La versión nueva se instala al cerrar Atrium, o reinicia cuando quieras.',
        visual: 'update',
      },
    ],
    en: [
      {
        kind: 'improve',
        title: 'The update notice closes properly',
        body: 'Tap Got it and keep using the journal. The new version installs when you quit Atrium, or restart whenever you like.',
        visual: 'update',
      },
    ],
  },
  '1.2.0-beta.2': {
    es: [
      {
        kind: 'new',
        title: 'La actualización se instala sola',
        body: 'Pulsa actualizar. Atrium se cierra, instala la versión nueva y se abre de nuevo. No hace falta el asistente de Windows.',
        visual: 'update',
      },
      {
        kind: 'improve',
        title: 'Las novedades se entienden de un vistazo',
        body: 'El aviso usa el mismo card que el historial. Solo ves lo de esta versión, escrito para quien usa el diario, con una imagen de cada cambio.',
      },
    ],
    en: [
      {
        kind: 'new',
        title: 'Updates install themselves',
        body: 'Tap update. Atrium quits, installs the new version, and opens again. No Windows installer wizard.',
        visual: 'update',
      },
      {
        kind: 'improve',
        title: 'What’s new is easy to scan',
        body: 'The notice uses the same card as the history. You only see this version, written for the journal, with a picture for each change.',
      },
    ],
  },
  '1.2.0-beta.1': {
    es: [
      {
        kind: 'new',
        title: 'Entras al diario en un solo paso',
        body: 'La contraseña se pide en la misma pantalla de bienvenida. Abres Atrium y pasas al día, sin un bloqueo extra.',
        visual: 'unlock',
      },
      {
        kind: 'improve',
        title: 'Los logos de cada activo se ven bien',
        body: 'NVDA, AAPL o el par que operes: el icono queda nítido. Si una consulta falla, se reintenta; ya no se queda el hueco en blanco.',
        visual: 'logos',
      },
      {
        kind: 'improve',
        title: 'El resumen queda más ordenado',
        body: 'La tabla de operaciones recientes y el ranking de estrategias ocupan la misma altura. Se lee de un vistazo.',
        visual: 'dashboard',
      },
    ],
    en: [
      {
        kind: 'new',
        title: 'You open the journal in one step',
        body: 'Your password is asked on the welcome screen. You open Atrium and get to the day — no extra lock screen.',
        visual: 'unlock',
      },
      {
        kind: 'improve',
        title: 'Asset logos stay sharp',
        body: 'NVDA, AAPL, or the pair you trade: the icon stays crisp. If a lookup fails, Atrium retries instead of leaving a blank circle.',
        visual: 'logos',
      },
      {
        kind: 'improve',
        title: 'The overview lines up',
        body: 'The recent trades table and the strategy ranking now share the same height. Easier to scan in one look.',
        visual: 'dashboard',
      },
    ],
  },
  '1.1.3': {
    es: [
      {
        kind: 'fix',
        title: 'Tras instalar en Windows, Atrium abre con normalidad',
        body: 'La app encuentra todo lo que necesita al actualizarse. No deberías verte en una pantalla vacía después de instalar.',
      },
    ],
    en: [
      {
        kind: 'fix',
        title: 'After installing on Windows, Atrium opens as usual',
        body: 'The app finds what it needs when it updates. You should not land on a blank screen after install.',
      },
    ],
  },
  '1.1.2': {
    es: [
      {
        kind: 'fix',
        title: 'Crear el diario es más fiable',
        body: 'Si algo quedó a medias al configurar la contraseña, ya no te quedas fuera. Puedes continuar y entrar.',
      },
    ],
    en: [
      {
        kind: 'fix',
        title: 'Creating the journal is more reliable',
        body: 'If setup was interrupted while choosing a password, you are no longer stuck. You can continue and get in.',
      },
    ],
  },
  '1.1.1': {
    es: [
      {
        kind: 'fix',
        title: 'La primera vez, el diario se crea bien',
        body: 'Pones tu contraseña y el diario queda listo. Si no coincide, el aviso es claro: no se confunde con un fallo interno.',
      },
    ],
    en: [
      {
        kind: 'fix',
        title: 'The journal is created cleanly the first time',
        body: 'You set a password and the journal is ready. If it does not match, the message is clear — not a vague internal error.',
      },
    ],
  },
  '1.1.0': {
    es: [
      {
        kind: 'new',
        title: 'Envía una idea o un error desde Atrium',
        body: 'En Ajustes puedes escribirnos. Si quieres, adjuntas una captura. No hace falta cuenta.',
        visual: 'feedback',
      },
      {
        kind: 'new',
        title: 'También en el navegador',
        body: 'Puedes abrir el diario en la web. Los datos van cifrados en el propio navegador.',
      },
      {
        kind: 'improve',
        title: 'Calendario más claro',
        body: 'Ves el P&L del mes, cada día de un vistazo y el detalle al pulsar una celda.',
        visual: 'calendar',
      },
    ],
    en: [
      {
        kind: 'new',
        title: 'Send an idea or a bug from Atrium',
        body: 'From Settings you can write to us. Attach a screenshot if you want. No account needed.',
        visual: 'feedback',
      },
      {
        kind: 'new',
        title: 'Also in the browser',
        body: 'You can open the journal on the web. Data stays encrypted in the browser.',
      },
      {
        kind: 'improve',
        title: 'A clearer calendar',
        body: 'See the month P&L, each day at a glance, and the detail when you tap a cell.',
        visual: 'calendar',
      },
    ],
  },
  '1.0.0': {
    es: [
      {
        kind: 'other',
        title: 'Primera versión pública',
        body: 'El diario con el que registrar operaciones, revisar el mes y cuidar el proceso.',
      },
    ],
    en: [
      {
        kind: 'other',
        title: 'First public release',
        body: 'The journal to log trades, review the month, and stay on process.',
      },
    ],
  },
}

export function storiesForRelease(version: string, locale: AppLocale): ReleaseStory[] {
  return STORIES[version]?.[locale] ?? STORIES[version]?.es ?? []
}

/** Product copy for a release: curated stories, or changelog lines if we have no story yet. */
export function displayHighlights(release: ChangelogRelease, locale: AppLocale): ReleaseStory[] {
  const stories = storiesForRelease(release.version, locale)
  if (stories.length) return stories
  return release.items.map((raw) => {
    const parsed = parseChangelogItem(raw)
    return { kind: parsed.kind, title: parsed.text, body: '' }
  })
}
