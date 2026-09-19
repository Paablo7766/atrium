import { useEffect, useLayoutEffect, useState } from 'react'
import { clsx } from 'clsx'
import { ArrowRight } from 'lucide-react'
import { useStore, type Page } from '@/store'
import { useT } from '@/lib/useI18n'
import type { MessageKey } from '@/lib/i18n'

type Step = {
  title: MessageKey
  body: MessageKey
  page: Page
  selector?: string
  kbd?: string
}

const STEPS: Step[] = [
  { page: 'dashboard', title: 'tour.0.title', body: 'tour.0.body' },
  { page: 'dashboard', selector: '[data-tour="new-trade"]', title: 'tour.1.title', body: 'tour.1.body', kbd: 'Ctrl+N' },
  { page: 'dashboard', selector: '[data-tour="stage"]', title: 'tour.2.title', body: 'tour.2.body', kbd: '1' },
  { page: 'trades', selector: '[data-tour="stage"]', title: 'tour.3.title', body: 'tour.3.body', kbd: '2' },
  { page: 'calendar', selector: '[data-tour="stage"]', title: 'tour.4.title', body: 'tour.4.body', kbd: '3' },
  { page: 'analytics', selector: '[data-tour="stage"]', title: 'tour.5.title', body: 'tour.5.body', kbd: '4 · 5 · 6' },
]

const PAD = 8

export function Tour() {
  const active = useStore((s) => s.tutorialActive)
  const completed = useStore((s) => s.settings.tutorialCompleted)
  const startTutorial = useStore((s) => s.startTutorial)
  const finishTutorial = useStore((s) => s.finishTutorial)
  const setPage = useStore((s) => s.setPage)
  const t = useT()

  const [index, setIndex] = useState(0)
  const [hole, setHole] = useState<DOMRect | null>(null)

  const step = STEPS[index]
  const last = index === STEPS.length - 1

  const close = () => {
    setPage('dashboard')
    finishTutorial()
  }

  useEffect(() => {
    if (!completed && !active) startTutorial()
  }, [completed, active, startTutorial])

  useEffect(() => {
    if (active) setIndex(0)
  }, [active])

  useEffect(() => {
    if (!active || !step) return
    setPage(step.page)
  }, [active, index, step, setPage])

  const measure = () => {
    if (!step?.selector) {
      setHole(null)
      return
    }
    const el = document.querySelector(step.selector) as HTMLElement | null
    if (!el) {
      setHole(null)
      return
    }
    setHole(el.getBoundingClientRect())
  }

  useLayoutEffect(() => {
    if (!active) return
    const id = window.requestAnimationFrame(() => measure())
    const t = window.setTimeout(measure, 160)
    return () => {
      window.cancelAnimationFrame(id)
      window.clearTimeout(t)
    }
  }, [active, index, step?.selector, step?.page])

  useEffect(() => {
    if (!active) return
    const onWin = () => measure()
    window.addEventListener('resize', onWin)
    window.addEventListener('scroll', onWin, true)
    return () => {
      window.removeEventListener('resize', onWin)
      window.removeEventListener('scroll', onWin, true)
    }
  }, [active, index, step?.selector])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setPage('dashboard')
        finishTutorial()
        return
      }
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault()
        e.stopPropagation()
        if (last) {
          setPage('dashboard')
          finishTutorial()
        } else setIndex((i) => i + 1)
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        e.stopPropagation()
        if (index > 0) setIndex((i) => i - 1)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active, index, last, finishTutorial, setPage])

  if (!active || !step) return null

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800
  const hx = hole ? hole.left - PAD : 0
  const hy = hole ? hole.top - PAD : 0
  const hw = hole ? hole.width + PAD * 2 : 0
  const hh = hole ? hole.height + PAD * 2 : 0

  return (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal aria-label={t('tour.aria')}>
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />

      <svg className="absolute inset-0 w-full h-full pointer-events-none" width={vw} height={vh}>
        <defs>
          <mask id="atrium-tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {hole && <rect x={hx} y={hy} width={hw} height={hh} rx="18" fill="black" />}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(8,8,9,0.62)" mask="url(#atrium-tour-mask)" />
        {hole && (
          <rect
            x={hx}
            y={hy}
            width={hw}
            height={hh}
            rx="18"
            fill="none"
            stroke="rgba(74,222,128,0.45)"
            strokeWidth="1"
          />
        )}
      </svg>

      <div className="absolute left-1/2 bottom-7 -translate-x-1/2 w-[min(480px,calc(100%-40px))] z-10 animate-onboard-rise">
        <div className="rounded-[24px] border border-white/[0.08] bg-[#101012]/92 backdrop-blur-xl px-5 pt-4 pb-4 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.85)]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={clsx(
                    'h-[3px] rounded-full transition-all duration-300',
                    i === index ? 'w-5 bg-accent' : i < index ? 'w-2 bg-accent/40' : 'w-2 bg-white/12',
                  )}
                />
              ))}
            </div>
            <span className="num text-[11px] text-dim tracking-wide">
              {String(index + 1).padStart(2, '0')}
              <span className="text-white/20"> / {String(STEPS.length).padStart(2, '0')}</span>
            </span>
          </div>

          <div key={index} className="animate-fade-in">
            <h2 className="text-[18px] font-semibold tracking-tight">{t(step.title)}</h2>
            <p className="text-[13px] text-muted mt-1.5 leading-relaxed">{t(step.body)}</p>
            {step.kbd && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {step.kbd.split('·').map((k) => (
                  <kbd
                    key={k}
                    className="inline-flex items-center h-6 px-2 rounded-md border border-white/10 bg-white/[0.04] text-[11px] font-medium text-text-2 mono"
                  >
                    {k.trim()}
                  </kbd>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 mt-5">
            <button type="button" onClick={close} className="text-[12px] text-dim hover:text-muted transition-colors">
              {t('tour.skip')}
            </button>
            <div className="flex items-center gap-1.5">
              {index > 0 && (
                <button
                  type="button"
                  onClick={() => setIndex((i) => i - 1)}
                  className="h-9 px-3.5 rounded-full text-[12px] font-medium text-muted hover:text-text hover:bg-white/[0.04] transition-colors"
                >
                  {t('common.back')}
                </button>
              )}
              <button
                type="button"
                onClick={() => (last ? close() : setIndex((i) => i + 1))}
                className="h-9 px-4 rounded-full bg-accent text-black text-[12px] font-semibold inline-flex items-center gap-1.5 hover:bg-[#5ce392] active:scale-[0.98] transition-all"
              >
                {last ? t('tour.start') : t('tour.next')}
                {!last && <ArrowRight size={13} strokeWidth={2.5} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
