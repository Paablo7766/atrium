import { clsx } from 'clsx'
import { CheckCircle2, AlertCircle, Info } from 'lucide-react'
import { useStore } from '@/store'

export function Toasts() {
  const toasts = useStore((s) => s.toasts)
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-5 right-5 z-[60] flex flex-col gap-2">
      {toasts.map((t) => {
        const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? AlertCircle : Info
        return (
          <div
            key={t.id}
            className={clsx(
              'glass border rounded-xl px-4 py-3 text-sm flex items-center gap-2.5 shadow-2xl animate-slide-up min-w-64',
              t.kind === 'success' && 'border-accent/30 text-text',
              t.kind === 'error' && 'border-loss/30 text-text',
              (!t.kind || t.kind === 'info') && 'border-border-2 text-text',
            )}
          >
            <Icon size={16} className={clsx(t.kind === 'success' ? 'text-accent' : t.kind === 'error' ? 'text-loss' : 'text-sky')} />
            {t.message}
          </div>
        )
      })}
    </div>
  )
}
