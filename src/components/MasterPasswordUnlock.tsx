import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { AlertTriangle, Lock, ShieldAlert } from 'lucide-react'
import { BrandMark } from '@/components/BrandMark'
import { Button } from '@/components/ui'
import { unlockWithPassword } from '@/lib/crypto/keyManager'
import { isDesktop } from '@/lib/db/client'
import { useStore } from '@/store'
import { useT } from '@/lib/useI18n'

export function MasterPasswordUnlock() {
  const unlockDatabase = useStore((s) => s.unlockDatabase)
  const toast = useStore((s) => s.toast)
  const t = useT()
  const [password, setPassword] = useState('')
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

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void submit()
    }
  }

  return (
    <div className="h-full relative overflow-hidden bg-bg text-text flex flex-col items-center justify-center px-8">
      <div className="drag-region absolute inset-x-0 top-0 h-12 z-30" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(700px 380px at 50% 20%, rgba(74,222,128,0.06), transparent 58%)' }}
      />

      <div className="relative z-10 w-full max-w-md">
        <div className="flex items-center gap-3 mb-8">
          <BrandMark size={28} />
          <span className="text-[13px] font-semibold tracking-tight">Atrium</span>
        </div>

        <div className="w-12 h-12 rounded-2xl bg-accent/10 border border-accent/20 flex items-center justify-center mb-5">
          <Lock size={22} className="text-accent" />
        </div>

        <h1 className="text-[28px] font-semibold tracking-tight leading-tight">{t('crypto.unlockTitle')}</h1>
        <p className="text-[14px] text-muted mt-3 leading-relaxed">{t('crypto.unlockCopy')}</p>

        <div className="mt-8">
          <label htmlFor="master-password" className="text-[12px] text-muted">
            {t('crypto.passwordLabel')}
          </label>
          <input
            id="master-password"
            ref={inputRef}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={onKey}
            placeholder="••••••••"
            className="mt-2 w-full bg-transparent border-0 border-b border-border-2 text-[20px] py-2.5 outline-none focus:border-accent placeholder:text-dim/40 transition-colors no-drag"
          />
        </div>

        <Button variant="primary" className="mt-8 w-full" disabled={busy || !password.trim()} onClick={() => void submit()}>
          {busy ? t('crypto.unlocking') : t('crypto.unlock')}
        </Button>

        <div className="mt-8 rounded-xl border border-loss/20 bg-loss/5 p-4 flex gap-3">
          <ShieldAlert size={18} className="text-loss shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-loss">{t('crypto.lostTitle')}</p>
            <p className="text-[12px] text-muted mt-1.5 leading-relaxed">
              {t(isDesktop() ? 'crypto.lostBody' : 'crypto.noRecovery')}
            </p>
          </div>
        </div>

        <p className="mt-6 flex items-start gap-2 text-[11px] text-dim leading-relaxed">
          <AlertTriangle size={12} className="shrink-0 mt-0.5" />
          {t('crypto.noRecovery')}
        </p>
      </div>
    </div>
  )
}
