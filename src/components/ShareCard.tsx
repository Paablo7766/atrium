import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Download, Share2 } from 'lucide-react'
import { useStore } from '@/store'
import { Button, Modal } from '@/components/ui'
import logoUrl from '@/assets/logo.png'
import {
  SHARE_H,
  SHARE_THEMES,
  SHARE_W,
  type ShareTheme,
  buildShareModel,
  canvasToPngBlob,
  downloadBlob,
  renderShareCard,
} from '@/lib/shareCard'
import { useT } from '@/lib/useI18n'

let logoImg: HTMLImageElement | null = null
function loadLogo() {
  if (logoImg?.complete && logoImg.naturalWidth) return Promise.resolve(logoImg)
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      logoImg = img
      resolve(img)
    }
    img.onerror = () => reject(new Error('logo'))
    img.src = logoUrl
  })
}

const THEME_STORAGE_KEY = 'atrium-share-theme'

function loadSavedTheme(): ShareTheme {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY)
    if (v && SHARE_THEMES.some((t) => t.id === v)) return v as ShareTheme
  } catch {
    /* ignore */
  }
  return 'orbit'
}

export function ShareCardModal() {
  const target = useStore((s) => s.shareTarget)
  const close = useStore((s) => s.closeShareCard)
  const trades = useStore((s) => s.trades)
  const settings = useStore((s) => s.settings)
  const cashflows = useStore((s) => s.cashflows)
  const toast = useStore((s) => s.toast)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [busy, setBusy] = useState<'png' | 'copy' | null>(null)
  const [theme, setTheme] = useState<ShareTheme>(loadSavedTheme)
  const t = useT()

  const model = useMemo(() => {
    if (!target) return null
    return buildShareModel(target, { trades, settings, cashflows })
  }, [target, trades, settings, cashflows])

  const selectTheme = (id: ShareTheme) => {
    setTheme(id)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, id)
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    if (!target || !model) return
    let cancelled = false
    const draw = async () => {
      const canvas = canvasRef.current
      if (!canvas) return
      try {
        await document.fonts.ready
        const logo = await loadLogo().catch(() => null)
        if (cancelled) return
        renderShareCard(canvas, model, logo, theme)
      } catch {
        if (!cancelled && canvas) renderShareCard(canvas, model, null, theme)
      }
    }
    void draw()
    return () => {
      cancelled = true
    }
  }, [target, model, theme])

  const exportPng = async (mode: 'png' | 'copy') => {
    const canvas = canvasRef.current
    if (!canvas || !model) return
    setBusy(mode)
    try {
      const blob = await canvasToPngBlob(canvas)
      if (mode === 'copy') {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
        toast(t('share.copied'), 'success')
      } else {
        const suffix = theme === 'orbit' ? '' : `-${theme}`
        const base = model.filename.replace(/\.png$/i, '')
        downloadBlob(blob, `${base}${suffix}.png`)
        toast(t('share.pngOk'), 'success')
      }
    } catch {
      toast(mode === 'copy' ? t('share.copyFail') : t('share.downloadFail'), 'error')
    } finally {
      setBusy(null)
    }
  }

  const previewBg = theme === 'folio' ? 'bg-[#f4f4f5]' : 'bg-[#08080a]'

  return (
    <Modal
      open={!!target}
      onClose={close}
      title={t('share.title')}
      subtitle={t('share.subtitle')}
      width="max-w-[980px]"
      glow={model && model.pnl < 0 ? 'loss' : 'gain'}
      footer={
        <div className="flex items-center justify-between w-full gap-3">
          <p className="text-[12px] text-dim hidden sm:block">PNG 1600×900</p>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="ghost" onClick={close}>
              {t('common.close')}
            </Button>
            <Button variant="outline" disabled={!model || !!busy} onClick={() => void exportPng('copy')}>
              <Copy size={14} /> {busy === 'copy' ? t('share.copying') : t('share.copy')}
            </Button>
            <Button variant="primary" disabled={!model || !!busy} onClick={() => void exportPng('png')}>
              <Download size={14} /> {busy === 'png' ? t('share.exporting') : t('share.downloadPng')}
            </Button>
          </div>
        </div>
      }
    >
      {target && !model ? (
        <p className="text-sm text-muted py-10 text-center">{t('an.empty')}</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {SHARE_THEMES.map((item) => {
              const active = theme === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => selectTheme(item.id)}
                  className={[
                    'px-3.5 py-1.5 rounded-lg text-[12.5px] font-medium tracking-wide transition-colors border',
                    active
                      ? 'bg-surface-4 text-text border-border-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]'
                      : 'bg-transparent text-muted border-border hover:text-text hover:bg-surface-3',
                  ].join(' ')}
                >
                  {t(item.labelKey)}
                </button>
              )
            })}
          </div>

          <div
            className={`relative rounded-2xl overflow-hidden border border-border-2 ${previewBg} shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_24px_80px_-24px_rgba(0,0,0,0.85)]`}
          >
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-px"
              style={{
                background:
                  model && model.pnl < 0
                    ? 'linear-gradient(90deg, transparent, rgba(248,113,113,0.5), rgba(90,140,255,0.35), transparent)'
                    : 'linear-gradient(90deg, transparent, rgba(74,222,128,0.5), rgba(90,140,255,0.35), transparent)',
              }}
            />
            <canvas
              ref={canvasRef}
              width={SHARE_W}
              height={SHARE_H}
              className="block w-full h-auto"
              style={{ aspectRatio: `${SHARE_W} / ${SHARE_H}` }}
            />
          </div>
        </div>
      )}
    </Modal>
  )
}

export function ShareButton({
  onClick,
  title,
  compact,
}: {
  onClick: () => void
  title?: string
  compact?: boolean
}) {
  const t = useT()
  const label = title ?? t('share.share')
  if (compact) {
    return (
      <button
        type="button"
        title={label}
        onClick={onClick}
        className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover:text-text hover:bg-surface-4 transition-colors"
      >
        <Share2 size={13} />
      </button>
    )
  }
  return (
    <Button variant="outline" size="sm" onClick={onClick} title={label}>
      <Share2 size={14} /> {label}
    </Button>
  )
}
