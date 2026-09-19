import { useEffect, useMemo, useRef, useState } from 'react'
import { clsx } from 'clsx'
import { NotebookPen, Plus, Trash2 } from 'lucide-react'
import { useStore } from '@/store'
import { Topbar } from '@/components/Topbar'
import { Button, Confirm, Empty, Field, Input, Pnl, Textarea } from '@/components/ui'
import { dailyPnl } from '@/lib/stats'
import { capitalize, fmtDate, fmtMoney, todayKey, uid } from '@/lib/format'
import type { JournalEntry } from '@/types'
import { useT, useLocale } from '@/lib/useI18n'
import type { MessageKey } from '@/lib/i18n'

const MOODS: { v: 1 | 2 | 3 | 4 | 5; key: MessageKey }[] = [
  { v: 1, key: 'journal.mood.1' },
  { v: 2, key: 'journal.mood.2' },
  { v: 3, key: 'journal.mood.3' },
  { v: 4, key: 'journal.mood.4' },
  { v: 5, key: 'journal.mood.5' },
]

export function Journal() {
  const notes = useStore((s) => s.notes)
  const trades = useStore((s) => s.trades)
  const settings = useStore((s) => s.settings)
  const upsertNote = useStore((s) => s.upsertNote)
  const deleteNote = useStore((s) => s.deleteNote)
  const toast = useStore((s) => s.toast)
  const t = useT()
  const locale = useLocale()
  const defaultTitle = (date: string) =>
    capitalize(fmtDate(date, locale === 'en' ? 'EEEE, MMMM d' : "EEEE d 'de' MMMM"))

  const sorted = useMemo(() => [...notes].sort((a, b) => b.date.localeCompare(a.date)), [notes])
  const [activeId, setActiveId] = useState<string | null>(sorted[0]?.id ?? null)
  const [draft, setDraft] = useState<(Omit<JournalEntry, 'updatedAt'> & { id: string }) | null>(null)
  const [confirmDel, setConfirmDel] = useState(false)
  const [q, setQ] = useState('')

  const daily = useMemo(() => dailyPnl(trades), [trades])

  const active = useMemo(() => notes.find((n) => n.id === activeId) ?? null, [notes, activeId])

  useEffect(() => {
    if (!activeId) return
    const n = notes.find((x) => x.id === activeId)
    if (!n) return
    setDraft((current) => {
      if (current?.id === n.id) return current
      return { id: n.id, date: n.date, mood: n.mood, title: n.title, content: n.content }
    })
  }, [activeId])

  const list = useMemo(() => {
    if (!q.trim()) return sorted
    const s = q.toLowerCase()
    return sorted.filter((n) => n.title.toLowerCase().includes(s) || n.content.toLowerCase().includes(s))
  }, [sorted, q])

  const save = (silent = false) => {
    if (!draft) return
    if (!draft.title.trim() && !draft.content.trim()) {
      if (!silent) toast(t('journal.needText'), 'error')
      return false
    }
    const saved = upsertNote({
      ...draft,
      id: draft.id,
      title: draft.title.trim() || defaultTitle(draft.date),
    })
    if (!silent) toast(t('journal.saved'), 'success')
    if (activeId !== saved.id) setActiveId(saved.id)
    return true
  }

  const dirty = useMemo(() => {
    if (!draft) return false
    if (!active) return !!(draft.title || draft.content)
    return draft.title !== active.title || draft.content !== active.content || draft.mood !== active.mood || draft.date !== active.date
  }, [draft, active])

  const draftRef = useRef(draft)
  const dirtyRef = useRef(dirty)
  useEffect(() => {
    draftRef.current = draft
    dirtyRef.current = dirty
  }, [draft, dirty])

  useEffect(() => {
    if (!dirty || !draft) return
    if (!draft.title.trim() && !draft.content.trim()) return
    const t = window.setTimeout(() => save(true), 700)
    return () => window.clearTimeout(t)
  }, [dirty, draft])

  useEffect(() => {
    return () => {
      const d = draftRef.current
      if (!dirtyRef.current || !d) return
      if (!d.title.trim() && !d.content.trim()) return
      useStore.getState().upsertNote({
        ...d,
        id: d.id || uid(),
        title: d.title.trim() || capitalize(fmtDate(d.date, locale === 'en' ? 'EEEE, MMMM d' : "EEEE d 'de' MMMM")),
      })
    }
  }, [])

  const selectNote = (id: string) => {
    if (dirty) save(true)
    setActiveId(id)
  }

  const startNew = () => {
    if (dirty) save(true)
    const id = uid()
    setActiveId(id)
    setDraft({ id, date: todayKey(), mood: 3, title: '', content: '' })
  }

  const dayAgg = draft ? daily.get(draft.date) : undefined

  return (
    <>
      <Topbar
        title={t('journal.title')}
        subtitle={notes.length ? (notes.length === 1 ? t('journal.entry1') : t('journal.entriesN', { n: notes.length })) : t('journal.empty')}
      />

      <div className="page-stage animate-fade-in">
        <div className="flex-1 min-h-0 grid grid-cols-[minmax(260px,320px)_1fr] gap-5">
        {/* Lista */}
        <div className="card flex flex-col min-h-0 overflow-hidden">
          <div className="p-3 border-b border-border flex items-center gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('journal.search')} className="flex-1" />
            <Button variant="primary" size="sm" onClick={startNew} className="shrink-0">
              <Plus size={14} strokeWidth={2.5} /> {t('journal.newShort')}
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
            {list.length ? (
              list.map((n) => {
                const agg = daily.get(n.date)
                const isActive = n.id === activeId
                return (
                  <button
                    key={n.id}
                    onClick={() => selectNote(n.id)}
                    className={clsx('text-left rounded-xl px-3.5 py-3 transition-colors border', isActive ? 'bg-surface-3 border-border-2' : 'border-transparent hover:bg-surface-2')}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-muted num">{capitalize(fmtDate(n.date, 'EEE d MMM yyyy'))}</span>
                      <MoodDots value={n.mood} />
                    </div>
                    <div className="text-[13px] font-semibold mt-1 truncate">{n.title || t('journal.untitled')}</div>
                    <div className="text-xs text-dim mt-0.5 line-clamp-2 leading-relaxed">{n.content}</div>
                    {agg && (
                      <Pnl value={agg.pnl} className="text-[11px] font-semibold mt-1.5 block">
                        {fmtMoney(agg.pnl, settings.currency, { sign: true })} · {t('journal.ops', { n: agg.count })}
                      </Pnl>
                    )}
                  </button>
                )
              })
            ) : (
              <Empty title={notes.length ? t('journal.noResults') : t('journal.emptyList')} description={notes.length ? undefined : t('journal.emptyListHint')} />
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="card flex flex-col min-h-0 overflow-hidden">
          {draft ? (
            <>
              <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
                <Field label={t('journal.date')} className="w-44">
                  <Input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
                </Field>
                <Field label={t('journal.mood')} className="flex-1">
                  <div className="flex items-center gap-3 h-9.5">
                    <div className="inline-flex items-center gap-0.5 p-1 rounded-xl bg-surface-2 border border-border">
                      {MOODS.map((m) => (
                        <button
                          key={m.v}
                          type="button"
                          title={t(m.key)}
                          onClick={() => setDraft({ ...draft, mood: m.v })}
                          className={clsx(
                            'h-7 min-w-7 px-2 rounded-lg text-[11px] font-semibold transition-colors',
                            draft.mood === m.v ? 'bg-text text-black' : 'text-muted hover:text-text',
                          )}
                        >
                          {m.v}
                        </button>
                      ))}
                    </div>
                    <span className="text-xs text-muted">{t(MOODS.find((m) => m.v === draft.mood)?.key ?? 'journal.mood.3')}</span>
                  </div>
                </Field>
                {dayAgg && (
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-wider text-dim font-semibold">{t('journal.dayPnl')}</div>
                    <Pnl value={dayAgg.pnl} className="text-lg font-semibold">
                      {fmtMoney(dayAgg.pnl, settings.currency, { sign: true })}
                    </Pnl>
                    <div className="text-[11px] text-muted num">
                      {t('journal.ops', { n: dayAgg.count })} · {dayAgg.wins}W / {dayAgg.losses}L
                    </div>
                    <div className="text-[10px] text-dim mt-0.5">{t('journal.closeHint')}</div>
                  </div>
                )}
              </div>

              <div className="flex-1 min-h-0 flex flex-col px-5 py-4 gap-3">
                <input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder={t('journal.sessionTitle')}
                  className="bg-transparent text-xl font-semibold tracking-tight placeholder:text-dim focus:outline-none"
                />
                <Textarea
                  value={draft.content}
                  onChange={(e) => setDraft({ ...draft, content: e.target.value })}
                  placeholder={t('journal.bodyLong')}
                  className="flex-1 resize-none bg-transparent border-0 focus:ring-0 px-0 text-[14px] leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-between px-5 py-3 border-t border-border bg-surface/60">
                <div className="text-xs text-dim">{active ? t('journal.lastEdit', { when: fmtDate(active.updatedAt, 'dd MMM yyyy · HH:mm') }) : t('journal.unsaved')}</div>
                <div className="flex items-center gap-2">
                  {active && (
                    <Button variant="ghost" size="sm" className="text-loss hover:bg-loss/10" onClick={() => setConfirmDel(true)}>
                      <Trash2 size={14} /> {t('common.delete')}
                    </Button>
                  )}
                  <Button variant="primary" size="sm" onClick={() => save()} disabled={!dirty}>
                    {t('common.save')}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <Empty
              icon={<NotebookPen size={20} />}
              title={t('journal.pick')}
              description={t('journal.pickHint')}
              action={
                <Button variant="primary" onClick={startNew}>
                  <Plus size={14} /> {t('journal.new')}
                </Button>
              }
            />
          )}
        </div>
        </div>
      </div>

      <Confirm
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        onConfirm={() => {
          if (active) {
            deleteNote(active.id)
            setActiveId(null)
            setDraft(null)
            toast(t('journal.deleted'), 'info')
          }
        }}
        title={t('journal.deleteTitle')}
        message={t('journal.deleteMsg')}
      />
    </>
  )
}

function MoodDots({ value }: { value: number }) {
  const t = useT()
  return (
    <span className="inline-flex items-center gap-[3px]" title={t(MOODS.find((m) => m.v === value)?.key ?? 'journal.mood.3')}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={clsx('w-1.5 h-1.5 rounded-full', i <= value ? 'bg-text' : 'bg-surface-4')} />
      ))}
    </span>
  )
}
