import { useRef, useState, type DragEvent } from 'react'
import { clsx } from 'clsx'
import { Camera, ImagePlus } from 'lucide-react'
import { fileToAvatar } from '@/lib/avatar'
import { useT } from '@/lib/useI18n'

export function traderInitials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

export function AvatarPhoto({
  src,
  initials,
  size = 40,
  radius = 'full',
  className,
}: {
  src?: string
  initials?: string
  size?: number
  radius?: 'full' | '2xl'
  className?: string
}) {
  const label = initials?.slice(0, 2) || 'TR'
  return (
    <span
      className={clsx(
        'relative overflow-hidden bg-accent/15 text-accent font-semibold flex items-center justify-center shrink-0 select-none',
        radius === 'full' ? 'rounded-full' : 'rounded-2xl',
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.32)) }}
    >
      {src ? <img src={src} alt="" className="absolute inset-0 w-full h-full object-cover" /> : label}
    </span>
  )
}

export function AvatarPicker({
  src,
  initials,
  onChange,
  onError,
}: {
  src?: string
  initials?: string
  onChange: (next: string | undefined) => void
  onError: (message: string) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [over, setOver] = useState(false)
  const t = useT()

  const apply = async (file?: File) => {
    if (!file || busy) return
    setBusy(true)
    try {
      onChange(await fileToAvatar(file))
    } catch (e) {
      onError(e instanceof Error ? e.message : t('avatar.fail'))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    void apply(e.dataTransfer.files[0])
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        disabled={busy}
        className={clsx(
          'group relative shrink-0 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
          over && 'ring-2 ring-accent/50',
        )}
        aria-label={src ? t('avatar.changeAria') : t('avatar.addAria')}
      >
        <AvatarPhoto src={src} initials={initials} size={72} radius="2xl" className="border border-accent/20" />
        <span
          className={clsx(
            'absolute inset-0 rounded-2xl bg-black/55 flex items-center justify-center transition-opacity',
            busy ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100',
          )}
        >
          {busy ? (
            <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
          ) : (
            <Camera size={18} className="text-white" />
          )}
        </span>
      </button>
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{t('avatar.title')}</div>
        <p className="text-[12px] text-muted mt-0.5 leading-relaxed">{t('avatar.hint')}</p>
        <div className="flex items-center gap-2 mt-2.5">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-xl text-[12px] font-semibold bg-surface-3 border border-border-2 hover:border-border-3 transition-colors"
          >
            <ImagePlus size={14} />
            {src ? t('avatar.change') : t('avatar.add')}
          </button>
          {src && (
            <button
              type="button"
              onClick={() => onChange(undefined)}
              disabled={busy}
              className="h-8 px-3 rounded-xl text-[12px] font-semibold text-muted hover:text-loss hover:bg-loss/10 transition-colors"
            >
              {t('avatar.remove')}
            </button>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => void apply(e.target.files?.[0])}
      />
    </div>
  )
}
