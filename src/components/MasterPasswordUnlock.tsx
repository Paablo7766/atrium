import { forwardRef, useEffect, useRef, useState, type ReactNode } from 'react'
import { clsx } from 'clsx'
import { ArrowRight, Eye, EyeOff, Lock } from 'lucide-react'
import { BrandMark } from '@/components/BrandMark'
import { unlockWithPassword } from '@/lib/crypto/keyManager'
import { isDesktop } from '@/lib/db/client'
import { useStore } from '@/store'
import { useT } from '@/lib/useI18n'

const EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]'

export function MasterPasswordUnlock() {
  const unlockDatabase = useStore((s) => s.unlockDatabase)
  const toast = useStore((s) => s.toast)
  const locale = useStore((s) => s.settings.locale ?? 'es')
  const updateSettings = useStore((s) => s.updateSettings)
  const t = useT()
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => inputRef.current?.focus(), 200)
    return () => window.clearTimeout(timer)
  }, [])

  const submit = async () => {
    if (busy || !password.trim()) return
    setBusy(true)
    try {
      const result = await unlockWithPassword(password)
      if (!result.ok) {
        toast(result.error, 'error')
        return
      }
      await unlockDatabase()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative z-10 h-full flex flex-col bg-bg text-text overflow-hidden">
      <div className="absolute inset-0 grain opacity-[0.045] mix-blend-overlay pointer-events-none z-50" />

      <header
        className={clsx(
          'drag-region absolute inset-x-0 top-0 z-40 h-14 pl-6 lg:pl-10 flex items-center justify-between',
          isDesktop() ? 'pr-[156px]' : 'pr-6 lg:pr-10',
          'animate-fade-in',
        )}
      >
        <div className="flex items-center gap-2.5">
          <BrandMark size={20} />
          <span className="text-[13.5px] font-semibold tracking-[-0.01em]">Atrium</span>
        </div>
        <div
          className="relative grid grid-cols-2 p-0.5 rounded-full border border-white/[0.08] bg-white/[0.02] text-[10.5px] font-semibold tracking-[0.1em] no-drag"
          role="radiogroup"
          aria-label="Language"
          onClick={(e) => e.stopPropagation()}
        >
          <span
            aria-hidden
            className="absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-2px)] rounded-full bg-white/[0.09] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ transform: `translateX(${locale === 'en' ? 100 : 0}%)` }}
          />
          {(['es', 'en'] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={locale === l}
              onClick={() => updateSettings({ locale: l })}
              className={clsx(
                'relative w-9 h-6 uppercase transition-colors duration-300',
                locale === l ? 'text-text' : 'text-dim hover:text-muted',
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </header>

      <main className="relative h-full overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <section className="relative flex flex-col items-center text-center px-6 pt-[clamp(140px,21vh,220px)] pb-16">
          <div className="relative w-full flex flex-col items-center">
            <Horizon className="animate-horizon-rise" />

            <div
              className={clsx(
                'relative inline-flex items-center gap-2 h-8 pl-1.5 pr-3.5 rounded-full border border-white/[0.1] bg-white/[0.04] backdrop-blur-md',
                'shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_30px_-14px_rgba(0,0,0,0.9)] text-[12px] font-medium text-text-2 animate-fade-up',
              )}
              style={{ animationDelay: '420ms' }}
            >
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/[0.08] text-text">
                <Lock size={11} strokeWidth={2.2} />
              </span>
              {t('on.step.security')}
            </div>

            <h1
              className="relative mt-[clamp(14px,2.8vh,28px)] text-[clamp(30px,min(5vw,5.6vh),48px)] leading-[1.05] font-semibold tracking-[-0.045em] bg-clip-text text-transparent bg-[linear-gradient(180deg,#ffffff_30%,#c8c8cf_100%)] animate-fade-up"
              style={{ animationDelay: '520ms' }}
            >
              {t('crypto.unlockTitle')}
            </h1>
            <p
              className="relative mt-[clamp(10px,2vh,18px)] max-w-[420px] text-[15px] short:text-[14px] leading-[1.6] text-muted animate-fade-up"
              style={{ animationDelay: '620ms' }}
            >
              {t('crypto.unlockCopy')}
            </p>

            <form
              className="relative mt-[clamp(24px,4.4vh,40px)] w-full max-w-[380px] flex flex-col gap-3 animate-fade-up"
              style={{ animationDelay: '740ms' }}
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
            >
              <label htmlFor="master-password" className="sr-only">
                {t('crypto.passwordLabel')}
              </label>
              <TextBox
                ref={inputRef}
                id="master-password"
                value={password}
                onChange={setPassword}
                placeholder={t('crypto.passwordLabel')}
                password={!show}
                autoComplete="current-password"
                trailing={
                  <button
                    type="button"
                    onClick={() => setShow((v) => !v)}
                    className="h-full px-3.5 text-dim hover:text-text transition-colors no-drag"
                    aria-label={show ? t('on.pw.hide') : t('on.pw.show')}
                  >
                    {show ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                }
              />
              <UnlockButton disabled={busy || !password.trim()}>
                {busy ? t('crypto.unlocking') : t('crypto.unlock')}
              </UnlockButton>
            </form>

            <p
              className="relative mt-6 max-w-[380px] text-[12px] leading-relaxed text-dim animate-fade-up"
              style={{ animationDelay: '860ms' }}
            >
              <span className="text-muted">{t('crypto.lostTitle')}</span>{' '}
              {t(isDesktop() ? 'crypto.lostBody' : 'crypto.noRecovery')}
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}

function Horizon({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-[-344px] -ml-[800px] w-[1600px] h-[780px] overflow-hidden"
      style={{ maskImage: 'radial-gradient(ellipse 540px 380px at 50% 260px, black 30%, transparent 92%)' }}
    >
      <div className={clsx('absolute inset-0', className)}>
        <div
          className="absolute left-1/2 top-[260px] -ml-[520px] -mt-[270px] w-[1040px] h-[540px] rounded-full animate-horizon-pulse"
          style={{ background: 'radial-gradient(closest-side, rgba(228,228,235,0.17), rgba(228,228,235,0.05) 50%, transparent 78%)' }}
        />
        <div
          className="absolute left-1/2 top-[260px] -ml-[300px] -mt-[70px] w-[600px] h-[140px] rounded-full blur-[24px]"
          style={{ background: 'radial-gradient(closest-side, rgba(255,255,255,0.42), transparent)' }}
        />
        <div
          className="absolute left-1/2 top-[260px] -ml-[600px] w-[1200px] h-[1200px] rounded-full bg-bg"
          style={{
            boxShadow:
              '0 0 0 1px rgba(255,255,255,0.06), 0 -10px 44px rgba(235,235,245,0.32), 0 -2px 12px rgba(255,255,255,0.45), inset 0 1.5px 0 rgba(255,255,255,0.9), inset 0 30px 70px -34px rgba(235,235,245,0.32)',
          }}
        />
        <div
          className="absolute left-1/2 top-[259px] -ml-[110px] w-[220px] h-[2px] rounded-full blur-[1px]"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.95), transparent)' }}
        />
      </div>
    </div>
  )
}

const TextBox = forwardRef<
  HTMLInputElement,
  {
    id?: string
    value: string
    onChange: (v: string) => void
    placeholder?: string
    password?: boolean
    autoComplete?: string
    trailing?: ReactNode
  }
>(function TextBox({ id, value, onChange, placeholder, password, autoComplete, trailing }, ref) {
  return (
    <div
      className={clsx(
        'flex items-center h-12 rounded-[12px] border border-white/[0.1] bg-white/[0.03] backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
        'transition-[border-color,background-color,box-shadow] duration-300',
        'hover:border-white/[0.16] focus-within:border-white/[0.3] focus-within:bg-white/[0.05] focus-within:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_4px_rgba(255,255,255,0.04)]',
      )}
    >
      <input
        id={id}
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={password ? 'password' : 'text'}
        autoComplete={autoComplete}
        className="flex-1 min-w-0 h-full bg-transparent pl-4 text-[14px] text-left outline-none placeholder:text-dim no-drag"
      />
      {trailing}
    </div>
  )
})

function UnlockButton({ children, disabled }: { children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className={clsx(
        'group relative inline-flex items-center justify-center gap-2.5 h-12 w-full rounded-[12px] overflow-hidden text-[13.5px] font-semibold text-bg no-drag',
        'bg-[linear-gradient(180deg,#ffffff_0%,#d4d4d8_100%)]',
        'shadow-[inset_0_1px_0_#fff,inset_0_-1px_0_rgba(0,0,0,0.14),0_0_0_1px_rgba(255,255,255,0.14),0_12px_40px_-12px_rgba(255,255,255,0.45)]',
        'transition-[box-shadow,transform,filter,opacity] duration-300 enabled:hover:brightness-[1.04] enabled:hover:shadow-[inset_0_1px_0_#fff,inset_0_-1px_0_rgba(0,0,0,0.14),0_0_0_1px_rgba(255,255,255,0.22),0_16px_56px_-10px_rgba(255,255,255,0.6)] enabled:active:scale-[0.985]',
        'disabled:opacity-40 disabled:shadow-none',
      )}
    >
      {children}
      <ArrowRight size={15} strokeWidth={2.2} className={clsx('transition-transform duration-500 group-enabled:group-hover:translate-x-0.5', EASE)} />
    </button>
  )
}

