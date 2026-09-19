import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { clsx } from 'clsx'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  BookOpen,
  Building2,
  Check,
  Coins,
  Copy,
  Database,
  Download,
  Ellipsis,
  FileSpreadsheet,
  FolderOpen,
  History,
  Gem,
  Globe,
  Layers,
  Plus,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { useStore, flushPersist, getBackup } from '@/store'
import { Topbar } from '@/components/Topbar'
import { Button, ColorSwatches, Confirm, Empty, Field, Input, Select, Textarea } from '@/components/ui'
import { AvatarPhoto, AvatarPicker, traderInitials } from '@/components/Avatar'
import { exportFile, importFile, isDesktop, listBackups, restoreBackup, type JournalBackup } from '@/lib/storage'
import { csvToTrades, dedupeTrades, tradesToCsv } from '@/lib/csv'
import { useImportCSV, type ImportBroker, BROKER_FILE_ACCEPT } from '@/lib/import'
import { fmtDate, fmtMoney, todayKey } from '@/lib/format'
import { accountEquity, netCashflow, netTradingPnl, signedCashflow } from '@/lib/capital'
import { parseJournalText } from '@/lib/persist'
import { LanguageSwitch } from '@/components/LanguageSwitch'
import { useT } from '@/lib/useI18n'
import { accountTypeHint, accountTypeLabel, marketBlurb, marketLabel } from '@/lib/i18n'
import {
  ACCOUNT_COLORS,
  ACCOUNT_TYPES,
  MARKETS,
  defaultFeesForMarket,
  togglePreferredMarket,
  type AccountColor,
  type AccountType,
  type CashflowKind,
  type Currency,
  type Market,
  type PlaybookSetup,
  type TradeFormMode,
  type WeekStart,
} from '@/types'

type Section = 'accounts' | 'mesa' | 'playbook' | 'data' | 'advanced'

const RISK_PRESETS = [0.25, 0.5, 1, 1.5, 2]
const DAILY_PRESETS = [1, 2, 3, 5]

const MARKET_ICON: Record<Market, typeof Globe> = {
  Forex: Globe,
  Índices: BarChart3,
  Futuros: Activity,
  Acciones: Building2,
  Crypto: Coins,
  'Materias primas': Gem,
  Opciones: Layers,
  Otros: Ellipsis,
}

function parseAmt(raw: string) {
  const n = Number(String(raw).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : NaN
}

function fmtBytes(n: number) {
  if (n < 10_000) return `${n} B`
  if (n < 1_000_000) return `${Math.round(n / 1024)} KB`
  return `${(n / 1_048_576).toFixed(1)} MB`
}

function backupWhen(mtime: number) {
  return fmtDate(new Date(mtime).toISOString(), 'dd MMM yyyy · HH:mm')
}

export function SettingsPage() {
  const settings = useStore((s) => s.settings)
  const accounts = useStore((s) => s.accounts)
  const updateSettings = useStore((s) => s.updateSettings)
  const switchAccount = useStore((s) => s.switchAccount)
  const createAccount = useStore((s) => s.createAccount)
  const updateAccount = useStore((s) => s.updateAccount)
  const deleteAccount = useStore((s) => s.deleteAccount)
  const duplicateAccount = useStore((s) => s.duplicateAccount)
  const trades = useStore((s) => s.trades)
  const notes = useStore((s) => s.notes)
  const cashflows = useStore((s) => s.cashflows)
  const importData = useStore((s) => s.importData)
  const loadDemo = useStore((s) => s.loadDemo)
  const clearAll = useStore((s) => s.clearAll)
  const toast = useStore((s) => s.toast)
  const startTutorial = useStore((s) => s.startTutorial)
  const addCashflow = useStore((s) => s.addCashflow)
  const deleteCashflow = useStore((s) => s.deleteCashflow)
  const upsertSetup = useStore((s) => s.upsertSetup)
  const deleteSetup = useStore((s) => s.deleteSetup)
  const retryLoad = useStore((s) => s.retryLoad)
  const t = useT()
  const locale = settings.locale ?? 'es'

  const NAV: { id: Section; label: string; hint: string; icon: typeof Building2 }[] = [
    { id: 'accounts', label: t('set.nav.accounts'), hint: t('set.nav.accountsHint'), icon: Building2 },
    { id: 'mesa', label: t('set.nav.mesa'), hint: t('set.nav.mesaHint'), icon: SlidersHorizontal },
    { id: 'playbook', label: t('set.nav.playbook'), hint: t('set.nav.playbookHint'), icon: BookOpen },
    { id: 'data', label: t('set.nav.data'), hint: t('set.nav.dataHint'), icon: Database },
    { id: 'advanced', label: t('set.nav.advanced'), hint: t('set.nav.advancedHint'), icon: ShieldAlert },
  ]

  const [section, setSection] = useState<Section>('accounts')
  const [confirmClear, setConfirmClear] = useState(false)
  const [confirmDemo, setConfirmDemo] = useState(false)
  const [confirmDeleteAcc, setConfirmDeleteAcc] = useState(false)
  const [restoreId, setRestoreId] = useState<string | null>(null)
  const [backups, setBackups] = useState<JournalBackup[]>([])
  const [dataPath, setDataPath] = useState('')
  const [copied, setCopied] = useState(false)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({
    name: '',
    broker: '',
    type: 'live' as AccountType,
    currency: 'USD' as Currency,
    startingBalance: '10000',
  })
  const [brokerImport, setBrokerImport] = useState<ImportBroker>('AUTO')
  const {
    busy: brokerImportBusy,
    fileInputRef: brokerFileRef,
    pickAndImport,
    onFileInputChange,
  } = useImportCSV({ navigateToDashboard: true, defaultBroker: brokerImport })
  const scroller = useRef<HTMLDivElement>(null)

  const active = useMemo(
    () => accounts.find((a) => a.id === settings.activeAccountId) ?? accounts[0],
    [accounts, settings.activeAccountId],
  )

  const cashNet = useMemo(() => netCashflow(cashflows), [cashflows])
  const tradingPnl = useMemo(() => netTradingPnl(trades), [trades])
  const equity = useMemo(
    () => accountEquity(settings.startingBalance, trades, cashflows),
    [settings.startingBalance, trades, cashflows],
  )
  const riskMoney = equity * (settings.riskPerTrade / 100)
  const dailyPct = settings.startingBalance > 0 && settings.dailyLossLimit > 0 ? (settings.dailyLossLimit / settings.startingBalance) * 100 : 0
  const typicalFees = defaultFeesForMarket(settings.defaultMarket)
  const preferred = settings.preferredMarkets?.length ? settings.preferredMarkets : [settings.defaultMarket]

  useEffect(() => {
    if (isDesktop()) window.api!.dataPath().then(setDataPath)
    else setDataPath(t('set.browserStorage'))
  }, [])

  useEffect(() => {
    if (section !== 'data' || !isDesktop()) return
    void listBackups().then(setBackups)
  }, [section])

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [section])

  useEffect(() => {
    if (!creating) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCreating(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [creating])

  const exportJson = async () => {
    const data = getBackup()
    const ok = await exportFile(JSON.stringify(data, null, 2), `atrium-backup-${new Date().toISOString().slice(0, 10)}.json`, [
      { name: 'JSON', extensions: ['json'] },
    ])
    if (ok) toast(t('set.backupOk'), 'success')
  }

  const exportCsv = async () => {
    const ok = await exportFile(tradesToCsv(trades), `operaciones-${new Date().toISOString().slice(0, 10)}.csv`, [{ name: 'CSV', extensions: ['csv'] }])
    if (ok) toast(t('set.csvOk', { n: trades.length }), 'success')
  }

  const importJson = async (mode: 'replace' | 'merge') => {
    const file = await importFile([{ name: 'JSON', extensions: ['json'] }])
    if (!file) return
    const parsed = parseJournalText(file.content)
    if (!parsed.ok) {
      toast(parsed.error, 'error')
      return
    }
    const applied = importData(parsed.data, mode)
    if (!applied.ok) {
      toast(applied.error, 'error')
      return
    }
    const skipped = [
      applied.skippedTrades ? t('set.skippedTrades', { n: applied.skippedTrades }) : '',
      applied.skippedNotes ? t('set.skippedNotes', { n: applied.skippedNotes }) : '',
    ].filter(Boolean)
    toast(
      `${mode === 'replace' ? t('set.restored') : t('set.merged')}${skipped.length ? ` · ${skipped.join(', ')}` : ''}`,
      skipped.length ? 'info' : 'success',
    )
  }

  const importCsv = async () => {
    const file = await importFile([{ name: 'CSV', extensions: ['csv', 'txt'] }])
    if (!file) return
    const { trades: parsed, errors, skippedDuplicates: inFile } = csvToTrades(file.content)
    const { trades: unique, skipped: already } = dedupeTrades(parsed, trades)
    const skippedDupes = inFile + already
    if (!unique.length) {
      toast(
        skippedDupes
          ? skippedDupes === 1
            ? t('set.alreadyThere1', { account: settings.accountName })
            : t('set.alreadyThereN', { n: skippedDupes, account: settings.accountName })
          : (errors[0] ?? t('set.noValidTrades')),
        skippedDupes ? 'info' : 'error',
      )
      return
    }
    const applied = importData({ version: 1, trades: unique, notes: [], settings }, 'merge')
    if (!applied.ok) {
      toast(applied.error, 'error')
      return
    }
    const extra = [
      skippedDupes ? t('set.alreadyN', { n: skippedDupes }) : '',
      errors.length ? t('set.rowsSkipped', { n: errors.length }) : '',
    ].filter(Boolean)
    toast(`${t('set.importedIn', { n: unique.length, account: settings.accountName })}${extra.length ? ` · ${extra.join(', ')}` : ''}`, extra.length ? 'info' : 'success')
  }

  const copyPath = async () => {
    if (!dataPath) return
    try {
      await navigator.clipboard.writeText(dataPath)
      setCopied(true)
      toast(t('set.pathCopied'), 'success')
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      toast(t('set.copyFail'), 'error')
    }
  }

  const submitNewAccount = () => {
    const name = draft.name.trim()
    if (!name) {
      toast(t('set.nameAccount'), 'error')
      return
    }
    createAccount({
      name,
      broker: draft.broker,
      type: draft.type,
      currency: draft.currency,
      startingBalance: parseAmt(draft.startingBalance) || 0,
    })
    setCreating(false)
    setDraft({ name: '', broker: '', type: 'live', currency: settings.currency, startingBalance: '10000' })
    toast(t('set.accountCreated', { name }), 'success')
  }

  const initials = traderInitials(settings.traderName)

  const counts: Partial<Record<Section, number>> = {
    accounts: accounts.length,
    playbook: settings.playbook?.length ?? 0,
  }

  return (
    <>
      <Topbar title={t('set.title')} subtitle={settings.accountName} />

      <div className="page-stage">
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-6 overflow-hidden">
          <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0 shrink-0 animate-rise">
            <div className="hidden lg:block px-3 mb-3">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-dim">{t('set.kicker')}</div>
              <p className="text-[11px] text-muted mt-1 leading-relaxed">{t('set.localOnly')}</p>
            </div>
            {NAV.map((item) => {
              const Icon = item.icon
              const on = section === item.id
              const count = counts[item.id]
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={clsx(
                    'relative flex items-center gap-2.5 min-h-11 px-3 rounded-xl text-left transition-all',
                    on ? 'bg-surface-3 text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]' : 'text-muted hover:text-text hover:bg-surface-2',
                  )}
                >
                  {on && <span className="absolute left-1 top-2.5 bottom-2.5 w-0.5 rounded-full bg-accent" />}
                  <Icon size={15} className={on ? 'text-accent' : 'text-dim'} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="text-[13px] font-medium">{item.label}</span>
                      {count !== undefined && count > 0 && (
                        <span className={clsx('num text-[10px] px-1.5 rounded-full', on ? 'bg-black/10 text-text' : 'bg-surface-4 text-dim')}>{count}</span>
                      )}
                    </span>
                    <span className="hidden lg:block text-[11px] text-dim mt-0.5">{item.hint}</span>
                  </span>
                </button>
              )
            })}
          </nav>

          <div ref={scroller} className="min-h-0 overflow-y-auto pr-1">
            <div key={section} className="max-w-2xl flex flex-col gap-4 pb-10 animate-rise">
              {section === 'mesa' && (
                <>
                  <Panel title={t('set.language')} subtitle={t('set.languageSub')}>
                    <LanguageSwitch value={locale} onChange={(next) => updateSettings({ locale: next })} />
                    <p className="text-[12px] text-dim mt-3 leading-relaxed">{t('set.languageHint')}</p>
                  </Panel>
                  <Panel>
                    <div className="relative overflow-hidden">
                      <div className="pointer-events-none absolute -top-20 -left-12 w-64 h-64 rounded-full bg-accent/10 blur-3xl animate-glow-breathe" />
                      <div className="relative">
                        <AvatarPicker
                          src={settings.avatar}
                          initials={initials}
                          onChange={(avatar) => updateSettings({ avatar })}
                          onError={(message) => toast(message, 'error')}
                        />
                      </div>
                      <div className="relative mt-6">
                        <Field label={t('set.yourName')} hint={t('set.yourNameHint')}>
                          <Input
                            value={settings.traderName === 'Trader' ? '' : settings.traderName}
                            onChange={(e) => updateSettings({ traderName: e.target.value || 'Trader' })}
                            placeholder={t('set.yourNamePh')}
                          />
                        </Field>
                      </div>
                    </div>
                  </Panel>

                  <Panel title={t('set.howYouLog')} subtitle={t('set.howYouLogSub')}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Choice
                        active={settings.tradeFormMode === 'simple'}
                        title={t('set.mode.simple')}
                        body={t('set.mode.simpleBody')}
                        onClick={() => updateSettings({ tradeFormMode: 'simple' as TradeFormMode })}
                      />
                      <Choice
                        active={settings.tradeFormMode === 'premium'}
                        title={t('set.mode.premium')}
                        body={t('set.mode.premiumBody')}
                        onClick={() => updateSettings({ tradeFormMode: 'premium' as TradeFormMode })}
                      />
                    </div>
                  </Panel>

                  <Panel title={t('set.markets')} subtitle={t('set.marketsSub')}>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {MARKETS.map((m) => {
                        const selected = preferred.includes(m)
                        const Meta = MARKET_ICON[m]
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              const next = togglePreferredMarket(preferred, m)
                              const defaultMarket = next.includes(settings.defaultMarket) ? settings.defaultMarket : next[0]
                              updateSettings({ preferredMarkets: next, defaultMarket })
                            }}
                            className={clsx(
                              'text-left rounded-2xl border px-3 py-3 transition-all',
                              selected ? 'border-accent/35 bg-accent/[0.07]' : 'border-border bg-surface-2/40 hover:border-border-2',
                            )}
                          >
                            <Meta size={15} className={selected ? 'text-accent' : 'text-dim'} />
                            <div className="text-[13px] font-semibold mt-2 leading-none">{marketLabel(locale, m)}</div>
                            <div className="text-[11px] text-dim mt-1.5">{marketBlurb(locale, m)}</div>
                          </button>
                        )
                      })}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
                      <Field label={t('set.defaultMarket')}>
                        <Select
                          value={settings.defaultMarket}
                          onChange={(v) => {
                            const market = v as Market
                            updateSettings({
                              defaultMarket: market,
                              preferredMarkets: preferred.includes(market) ? preferred : [market, ...preferred],
                            })
                          }}
                          options={preferred.map((m) => ({ value: m, label: marketLabel(locale, m) }))}
                        />
                      </Field>
                      <Field
                        label={t('set.defaultFees')}
                        hint={
                          settings.defaultFees !== typicalFees
                            ? t('set.feesHint', { market: marketLabel(locale, settings.defaultMarket), fees: typicalFees })
                            : undefined
                        }
                      >
                        <div className="flex gap-2">
                          <NumField value={settings.defaultFees} onChange={(n) => updateSettings({ defaultFees: n })} />
                          {settings.defaultFees !== typicalFees && (
                            <Button variant="ghost" size="sm" className="shrink-0" onClick={() => updateSettings({ defaultFees: typicalFees })}>
                              {t('set.useFees', { n: typicalFees })}
                            </Button>
                          )}
                        </div>
                      </Field>
                    </div>
                  </Panel>

                  <Panel title={t('set.calendar')} subtitle={t('set.calendarSub')}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Choice active={settings.weekStartsOn === 1} title={t('set.monday')} body={t('set.weekIso')} onClick={() => updateSettings({ weekStartsOn: 1 as WeekStart })} />
                      <Choice active={settings.weekStartsOn === 0} title={t('set.sunday')} body={t('set.weekUs')} onClick={() => updateSettings({ weekStartsOn: 0 as WeekStart })} />
                    </div>
                  </Panel>

                  <QuietRow
                    title={t('set.tutorial')}
                    body={t('set.tutorialBody')}
                    action={
                      <Button variant="outline" size="sm" onClick={() => startTutorial()}>
                        {t('set.tutorialAgain')}
                      </Button>
                    }
                  />
                </>
              )}

              {section === 'accounts' && active && (
                <>
                  <Panel
                    title={t('set.accounts')}
                    subtitle={t('set.accountsSub')}
                    action={
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          setCreating(true)
                          setDraft({ name: '', broker: '', type: 'live', currency: settings.currency, startingBalance: '10000' })
                        }}
                      >
                        <Plus size={14} strokeWidth={2.5} /> {t('set.newAccount')}
                      </Button>
                    }
                  >
                    <div className="flex flex-col gap-2">
                      {accounts.map((a) => {
                        const selected = a.id === settings.activeAccountId
                        const accTrades = selected ? trades : a.trades
                        const accFlows = selected ? cashflows : a.cashflows
                        const count = accTrades.length
                        const accEquity = accountEquity(a.startingBalance, accTrades, accFlows)
                        return (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => {
                              if (!selected) {
                                switchAccount(a.id)
                                toast(t('nav.accountToast', { name: a.name }), 'info')
                              }
                            }}
                            className={clsx(
                              'relative w-full text-left rounded-2xl border pl-4 pr-3.5 py-3.5 transition-all flex items-center gap-3',
                              selected ? 'bg-surface-3 border-border-2' : 'bg-surface-2/40 border-border hover:border-border-2',
                            )}
                          >
                            <span className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full" style={{ background: colorSwatch(a.color) }} />
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorSwatch(a.color) }} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[13px] font-semibold truncate">{a.name}</span>
                                {selected && (
                                  <span className="text-[10px] font-semibold uppercase tracking-wider text-accent bg-accent/10 px-1.5 py-0.5 rounded-md">
                                    {t('set.activeAccount')}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-dim mt-1 truncate">
                                {accountTypeLabel(locale, a.type)}
                                {a.broker ? ` · ${a.broker}` : ''} · {count} ops
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div className="num text-[13px] font-semibold">{fmtMoney(accEquity, a.currency)}</div>
                              <div className="text-[10px] text-dim uppercase tracking-wider mt-0.5">{a.currency}</div>
                            </div>
                          </button>
                        )
                      })}
                    </div>

                    {creating && (
                      <form
                        className="mt-4 rounded-2xl border border-accent/20 bg-accent/[0.04] p-4 animate-insight"
                        onSubmit={(e) => {
                          e.preventDefault()
                          submitNewAccount()
                        }}
                      >
                        <div className="text-[13px] font-semibold mb-3">{t('set.newAccount')}</div>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label={t('set.name')} className="col-span-2">
                            <Input autoFocus value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder={t('set.accountPh')} />
                          </Field>
                          <Field label={t('set.type')}>
                            <Select
                              value={draft.type}
                              onChange={(v) => setDraft((d) => ({ ...d, type: v as AccountType }))}
                              options={ACCOUNT_TYPES.map((x) => ({ value: x.value, label: accountTypeLabel(locale, x.value) }))}
                            />
                          </Field>
                          <Field label={t('set.broker')}>
                            <Input value={draft.broker} onChange={(e) => setDraft((d) => ({ ...d, broker: e.target.value }))} placeholder={t('common.optional')} />
                          </Field>
                          <Field label={t('set.currency')}>
                            <Select
                              value={draft.currency}
                              onChange={(v) => setDraft((d) => ({ ...d, currency: v as Currency }))}
                              options={[
                                { value: 'USD', label: 'USD' },
                                { value: 'EUR', label: 'EUR' },
                                { value: 'GBP', label: 'GBP' },
                              ]}
                            />
                          </Field>
                          <Field label={t('set.startingCapital')}>
                            <Input mono inputMode="decimal" value={draft.startingBalance} onChange={(e) => setDraft((d) => ({ ...d, startingBalance: e.target.value }))} />
                          </Field>
                        </div>
                        <div className="flex justify-end gap-2 mt-4">
                          <Button type="button" variant="ghost" size="sm" onClick={() => setCreating(false)}>
                            {t('common.cancel')}
                          </Button>
                          <Button type="submit" variant="primary" size="sm">
                            Crear y cambiar
                          </Button>
                        </div>
                      </form>
                    )}
                  </Panel>

                  <Panel>
                    <div className="flex items-start justify-between gap-3 mb-6">
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted">Cuenta activa</div>
                        <h3 className="text-[18px] font-semibold tracking-tight mt-1">{active.name}</h3>
                        <p className="text-[12px] text-muted mt-1">Estos valores solo aplican a esta cuenta.</p>
                      </div>
                      <div className="h-8 flex items-center">
                        <ColorSwatches value={active.color} onChange={(c) => updateAccount(active.id, { color: c })} offset="#0e0e10" />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
                      <HeroStat label={t('dash.equity')} value={fmtMoney(equity, settings.currency)} />
                      <HeroStat label={t('set.initial')} value={fmtMoney(settings.startingBalance, settings.currency)} />
                      <HeroStat label={t('set.moves')} value={fmtMoney(cashNet, settings.currency, { sign: true })} tone={cashNet} />
                      <HeroStat label={t('set.closedPnl')} value={fmtMoney(tradingPnl, settings.currency, { sign: true })} tone={tradingPnl} />
                    </div>

                    <Block label={t('set.identity')}>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label={t('set.name')}>
                          <Input value={settings.accountName} onChange={(e) => updateSettings({ accountName: e.target.value })} />
                        </Field>
                        <Field label={t('set.broker')}>
                          <Input value={active.broker} onChange={(e) => updateAccount(active.id, { broker: e.target.value })} placeholder="IBKR, FTMO, IC Markets…" />
                        </Field>
                        <Field label={t('set.type')} className="col-span-2">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {ACCOUNT_TYPES.map((x) => (
                              <Choice
                                key={x.value}
                                compact
                                active={active.type === x.value}
                                title={accountTypeLabel(locale, x.value)}
                                body={accountTypeHint(locale, x.value)}
                                onClick={() => updateAccount(active.id, { type: x.value })}
                              />
                            ))}
                          </div>
                        </Field>
                      </div>
                    </Block>

                    <Block label={t('set.capital')}>
                      <div className="grid grid-cols-2 gap-3">
                        <Field label={t('set.startingCapital')} hint={t('set.startingHint')}>
                          <NumField value={settings.startingBalance} onChange={(n) => updateSettings({ startingBalance: n })} />
                        </Field>
                        <Field label={t('set.currency')}>
                          <Select
                            value={settings.currency}
                            onChange={(v) => updateSettings({ currency: v as Currency })}
                            options={[
                              { value: 'USD', label: t('set.usd') },
                              { value: 'EUR', label: t('set.eur') },
                              { value: 'GBP', label: t('set.gbp') },
                            ]}
                          />
                        </Field>
                      </div>
                    </Block>

                    <Block label={t('an.risk')}>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field
                          label={t('set.riskPer')}
                          hint={settings.riskPerTrade > 0 ? t('set.riskOn', { n: fmtMoney(riskMoney, settings.currency) }) : t('set.riskOff')}
                        >
                          <NumField suffix="%" value={settings.riskPerTrade} onChange={(n) => updateSettings({ riskPerTrade: n })} />
                          <PresetRow
                            values={RISK_PRESETS}
                            current={settings.riskPerTrade}
                            format={(v) => `${v}%`}
                            onPick={(v) => updateSettings({ riskPerTrade: v })}
                          />
                        </Field>
                        <Field
                          label={t('set.dailyLimit')}
                          hint={
                            settings.dailyLossLimit > 0
                              ? `${fmtNumPct(dailyPct)}`
                              : t('set.dailyOff')
                          }
                        >
                          <NumField value={settings.dailyLossLimit} onChange={(n) => updateSettings({ dailyLossLimit: Math.max(0, n) })} />
                          <PresetRow
                            values={DAILY_PRESETS}
                            current={dailyPct}
                            format={(v) => `${v}%`}
                            onPick={(v) => updateSettings({ dailyLossLimit: Math.round(settings.startingBalance * (v / 100)) })}
                          />
                          {settings.dailyLossLimit > 0 && (
                            <button type="button" className="text-[11px] text-dim hover:text-text mt-2" onClick={() => updateSettings({ dailyLossLimit: 0 })}>
                              {t('set.disable')}
                            </button>
                          )}
                        </Field>
                      </div>
                    </Block>
                  </Panel>

                  <CashLedger
                    currency={settings.currency}
                    cashflows={cashflows}
                    onAdd={(input) => {
                      addCashflow(input)
                      toast(input.kind === 'deposit' ? t('set.depositOk') : t('set.withdrawOk'), 'success')
                    }}
                    onDelete={(id) => {
                      deleteCashflow(id)
                      toast(t('set.cashDeleted'), 'info')
                    }}
                  />

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        if (duplicateAccount(active.id)) toast(t('set.accountCopied'), 'success')
                      }}
                    >
                      <Copy size={14} /> {t('set.duplicate')}
                    </Button>
                    <Button variant="danger" size="sm" disabled={accounts.length <= 1} onClick={() => setConfirmDeleteAcc(true)}>
                      <Trash2 size={14} /> Eliminar cuenta
                    </Button>
                  </div>
                </>
              )}

              {section === 'playbook' && (
                <PlaybookPanel
                  setups={settings.playbook ?? []}
                  onSave={(input) => {
                    upsertSetup(input)
                    toast(t('set.setupSaved'), 'success')
                  }}
                  onDelete={(id) => {
                    deleteSetup(id)
                    toast(t('set.setupUnlinked'), 'info')
                  }}
                />
              )}

              {section === 'data' && (
                <>
                  <Panel title={t('set.location')} subtitle={t('set.locationSub')}>
                    <div className="rounded-2xl bg-surface-2 border border-border px-4 py-4 flex items-start gap-3">
                      <div className="w-10 h-10 rounded-xl bg-surface-3 border border-border-2 flex items-center justify-center shrink-0">
                        <Database size={16} className="text-muted" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13px] font-semibold">Archivo de datos</div>
                        <div className="text-[11px] text-dim mono break-all mt-1 leading-relaxed">{dataPath || '…'}</div>
                        <div className="text-[12px] text-muted mt-2">
                          {accounts.length} {accounts.length === 1 ? 'cuenta' : 'cuentas'} · esta: {trades.length} ops · {notes.length} notas
                        </div>
                        <div className="text-[11px] text-dim mt-1.5 leading-relaxed">
                          Copia inmediata en journal-data.json.bak y hasta 10 copias en la carpeta backups.
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" title={t('set.copyPath')} onClick={() => void copyPath()}>
                          {copied ? <Check size={15} className="text-accent" /> : <Copy size={15} />}
                        </Button>
                        {isDesktop() && (
                          <Button variant="ghost" size="icon" title={t('set.openFolder')} onClick={() => window.api!.openDataFolder()}>
                            <FolderOpen size={15} />
                          </Button>
                        )}
                      </div>
                    </div>
                  </Panel>

                  {isDesktop() && (
                    <Panel title={t('set.autoBackups')} subtitle={t('set.autoBackupsSub')}>
                      {backups.length ? (
                        <ul className="flex flex-col gap-1.5">
                          {backups.map((b) => (
                            <li
                              key={b.id}
                              className="flex items-center gap-3 rounded-2xl border border-border bg-surface-2/40 px-3.5 py-3"
                            >
                              <History size={15} className="text-dim shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="text-[13px] font-medium truncate">
                                  {b.kind === 'immediate' ? t('set.immediate') : backupWhen(b.mtime)}
                                </div>
                                <div className="text-[11px] text-dim mt-0.5">
                                  {b.kind === 'immediate' ? backupWhen(b.mtime) : t('set.backupsFolder')} · {fmtBytes(b.bytes)}
                                </div>
                              </div>
                              <Button variant="outline" size="sm" onClick={() => setRestoreId(b.id)}>
                                Restaurar
                              </Button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-[13px] text-muted leading-relaxed">
                          Aún no hay copias. Se crea un .bak en cada guardado y una copia fechada como mucho cada 10 minutos.
                        </p>
                      )}
                    </Panel>
                  )}

                  <Panel title={t('set.export')} subtitle={t('set.exportSub')}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <ActionCard
                        icon={<Download size={16} />}
                        title={t('set.backupTitle')}
                        body={t('set.backupBody')}
                        action={
                          <Button variant="secondary" size="sm" onClick={() => void exportJson()}>
                            {t('set.export')} JSON
                          </Button>
                        }
                      />
                      <ActionCard
                        icon={<FileSpreadsheet size={16} />}
                        title={t('set.csvTitle')}
                        body={t('set.csvBody')}
                        action={
                          <Button variant="secondary" size="sm" onClick={() => void exportCsv()} disabled={!trades.length}>
                            {t('set.export')} CSV
                          </Button>
                        }
                      />
                    </div>
                  </Panel>

                  <Panel title={t('set.import')} subtitle={t('set.importSub')}>
                    <div className="flex flex-col gap-3">
                      <ActionCard
                        icon={<Upload size={16} />}
                        title={t('set.mergeJson')}
                        body={t('set.mergeJsonBody')}
                        action={
                          <Button variant="outline" size="sm" onClick={() => void importJson('merge')}>
                            {t('set.mergeJson')}
                          </Button>
                        }
                      />
                      <ActionCard
                        icon={<Upload size={16} />}
                        title={t('set.replaceBackup')}
                        body={t('set.replaceBackupBody')}
                        action={
                          <Button variant="outline" size="sm" onClick={() => void importJson('replace')}>
                            {t('set.replace')}
                          </Button>
                        }
                      />
                      <ActionCard
                        icon={<FileSpreadsheet size={16} />}
                        title={t('set.csvThis')}
                        body={t('set.csvThisBody')}
                        action={
                          <Button variant="outline" size="sm" onClick={() => void importCsv()}>
                            {t('set.import')} CSV
                          </Button>
                        }
                      />
                      <ActionCard
                        icon={<Upload size={16} />}
                        title={t('set.brokerCsv')}
                        body={t('set.brokerCsvBody')}
                        action={
                          <div className="flex flex-col items-stretch gap-2 min-w-[12rem]">
                            <Select
                              value={brokerImport}
                              onChange={(v) => setBrokerImport(v as ImportBroker)}
                              size="sm"
                              options={[
                                { value: 'AUTO', label: t('set.brokerAuto') },
                                { value: 'XTB', label: 'XTB' },
                                { value: 'INTERACTIVE_BROKERS', label: 'Interactive Brokers' },
                                { value: 'DEGIRO', label: 'DEGIRO' },
                                { value: 'FOMO', label: 'Fomo' },
                                { value: 'AXIOM', label: 'Axiom' },
                              ]}
                            />
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={brokerImportBusy}
                              onClick={() => void pickAndImport(brokerImport)}
                            >
                              {brokerImportBusy ? '…' : t('set.importBrokerCsv')}
                            </Button>
                            <input
                              ref={brokerFileRef}
                              type="file"
                              accept={BROKER_FILE_ACCEPT}
                              className="hidden"
                              onChange={(e) => onFileInputChange(e, brokerImport)}
                            />
                          </div>
                        }
                      />
                    </div>
                    <p className="text-[11px] text-dim leading-relaxed mt-4">
                      Columnas mínimas: <span className="mono">symbol, direction, entryDate, exitDate, entryPrice, exitPrice, quantity</span>
                      . Opcionales: mercado, multiplicador, comisiones, stop, estrategia, etiquetas y P&L. Si el P&L no cuadra con los precios, se guarda como resultado manual.
                      {' '}CSV de bróker: el motor normaliza fills → operaciones (FIFO) y actualiza el dashboard.
                    </p>
                  </Panel>
                </>
              )}

              {section === 'advanced' && (
                <Panel title={t('set.advanced')} subtitle={t('set.advancedSub')}>
                  <div className="flex flex-col gap-3">
                    <DangerRow
                      icon={<Sparkles size={16} className="text-accent" />}
                      title={t('set.loadSample')}
                      body={t('set.loadSampleBody')}
                      action={
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => (trades.length || notes.length || cashflows.length ? setConfirmDemo(true) : loadDemo())}
                        >
                          {t('set.loadSample')}
                        </Button>
                      }
                    />
                    <DangerRow
                      icon={<Sparkles size={16} className="text-violet" />}
                      title={t('set.repeatOn')}
                      body={t('set.repeatOnBody')}
                      action={
                        <Button variant="outline" size="sm" onClick={() => updateSettings({ onboardingCompleted: false })}>
                          {t('set.openOnboarding')}
                        </Button>
                      }
                    />
                    <DangerRow
                      icon={<Trash2 size={16} className="text-loss" />}
                      title={t('set.emptyAccount')}
                      body={t('set.emptyAccountBody')}
                      action={
                        <Button variant="danger" size="sm" onClick={() => setConfirmClear(true)} disabled={!trades.length && !notes.length && !cashflows.length}>
                          {t('set.emptyNow')}
                        </Button>
                      }
                      danger
                    />
                  </div>
                  <p className="text-[11px] text-dim text-center pt-5">Atrium Journal · v1.0.0 · Los datos se guardan únicamente en tu equipo.</p>
                </Panel>
              )}
            </div>
          </div>
        </div>
      </div>

      <Confirm
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          clearAll()
          toast(`«${settings.accountName}» vaciada`, 'info')
        }}
        title={t('set.emptyTitle')}
        message={t('set.emptyMsg')}
        confirmLabel={t('set.emptyConfirm')}
      />
      <Confirm
        open={confirmDemo}
        onClose={() => setConfirmDemo(false)}
        onConfirm={() => {
          loadDemo()
          toast(t('set.sampleOk'), 'success')
        }}
        title={t('set.sampleTitle')}
        message={t('set.sampleMsg')}
        confirmLabel={t('set.replace')}
      />
      <Confirm
        open={confirmDeleteAcc}
        onClose={() => setConfirmDeleteAcc(false)}
        onConfirm={() => {
          const name = settings.accountName
          const ok = deleteAccount(settings.activeAccountId)
          toast(ok ? t('set.accountDeleted', { name }) : t('set.lastAccount'), ok ? 'info' : 'error')
        }}
        title={t('set.deleteAccount')}
        message={t('set.deleteAccountMsg', { name: settings.accountName })}
        confirmLabel={t('set.deleteAccountConfirm')}
      />
      <Confirm
        open={!!restoreId}
        onClose={() => setRestoreId(null)}
        onConfirm={() => {
          const id = restoreId
          if (!id) return
          void (async () => {
            try {
              flushPersist()
            } catch {
              /* ignore */
            }
            const result = await restoreBackup(id)
            if (!result.ok) {
              toast(result.error, 'error')
              return
            }
            await retryLoad()
            const next = await listBackups()
            setBackups(next)
            toast(t('set.restoreOk'), 'success')
          })()
        }}
        title={t('err.restoreTitle')}
        message={t('set.restoreMsg')}
        confirmLabel={t('set.restore')}
      />
    </>
  )
}

function Panel({
  title,
  subtitle,
  action,
  children,
}: {
  title?: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="card px-5 py-5 lg:px-6 lg:py-6">
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 mb-5">
          <div className="min-w-0">
            {title && <h3 className="text-[13px] font-semibold tracking-tight">{title}</h3>}
            {subtitle && <p className="text-xs text-muted mt-1 leading-relaxed">{subtitle}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      {children}
    </section>
  )
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mt-7 pt-6 border-t border-border">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-dim mb-4">{label}</div>
      {children}
    </div>
  )
}

function HeroStat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const color = tone === undefined ? 'text-text' : tone > 0 ? 'text-accent' : tone < 0 ? 'text-loss' : 'text-muted'
  return (
    <div className="rounded-2xl bg-surface-2/70 border border-border px-3.5 py-3.5">
      <div className="text-[11px] font-medium text-muted">{label}</div>
      <div className={clsx('num text-[15px] font-semibold tracking-tight mt-1.5 leading-none', color)}>{value}</div>
    </div>
  )
}

function Choice({
  active,
  title,
  body,
  onClick,
  compact,
}: {
  active: boolean
  title: string
  body?: string
  onClick: () => void
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'text-left rounded-2xl border transition-all',
        compact ? 'px-3 py-2.5' : 'px-4 py-3.5',
        active ? 'border-accent/40 bg-accent/[0.07]' : 'border-border bg-surface-2/40 hover:border-border-2',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={clsx('font-semibold', compact ? 'text-[12px]' : 'text-[13px]')}>{title}</span>
        <span
          className={clsx(
            'w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-colors',
            active ? 'bg-accent text-black' : 'border border-border-3',
          )}
        >
          {active && <Check size={10} strokeWidth={3} />}
        </span>
      </div>
      {body && <p className={clsx('text-muted leading-relaxed', compact ? 'text-[10px] mt-1' : 'text-[12px] mt-1.5')}>{body}</p>}
    </button>
  )
}

function QuietRow({ title, body, action }: { title: string; body: string; action: ReactNode }) {
  return (
    <div className="card px-5 py-4 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <div className="text-[13px] font-medium">{title}</div>
        <p className="text-[12px] text-dim mt-0.5">{body}</p>
      </div>
      {action}
    </div>
  )
}

function ActionCard({
  icon,
  title,
  body,
  action,
}: {
  icon: ReactNode
  title: string
  body: string
  action: ReactNode
}) {
  return (
    <div className="rounded-2xl border border-border bg-surface-2/40 px-4 py-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-xl bg-surface-3 border border-border-2 flex items-center justify-center text-muted shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold">{title}</div>
        <p className="text-[12px] text-muted mt-1 leading-relaxed">{body}</p>
        <div className="mt-3">{action}</div>
      </div>
    </div>
  )
}

function DangerRow({
  icon,
  title,
  body,
  action,
  danger,
}: {
  icon: ReactNode
  title: string
  body: string
  action: ReactNode
  danger?: boolean
}) {
  return (
    <div className={clsx('rounded-2xl border p-4 flex items-start gap-3', danger ? 'border-loss/20 bg-loss/5' : 'border-border bg-surface-2')}>
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold">{title}</div>
        <p className="text-xs text-muted mt-1 leading-relaxed">{body}</p>
        <div className="mt-3">{action}</div>
      </div>
    </div>
  )
}

function NumField({ value, onChange, suffix }: { value: number; onChange: (n: number) => void; suffix?: string }) {
  const [text, setText] = useState(stringify(value))
  const focused = useRef(false)

  useEffect(() => {
    if (!focused.current) setText(stringify(value))
  }, [value])

  return (
    <div className="relative">
      <Input
        mono
        inputMode="decimal"
        value={text}
        onFocus={() => {
          focused.current = true
        }}
        onChange={(e) => {
          const raw = e.target.value
          setText(raw)
          if (raw.trim() === '') return
          const n = parseAmt(raw)
          if (Number.isFinite(n)) onChange(n)
        }}
        onBlur={() => {
          focused.current = false
          const n = parseAmt(text)
          const next = Number.isFinite(n) ? n : 0
          onChange(next)
          setText(stringify(next))
        }}
        className={suffix ? 'pr-9' : undefined}
      />
      {suffix && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-dim pointer-events-none">{suffix}</span>}
    </div>
  )
}

function PresetRow({
  values,
  current,
  format,
  onPick,
}: {
  values: number[]
  current: number
  format: (v: number) => string
  onPick: (v: number) => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {values.map((v) => {
        const on = Math.abs(current - v) < 0.001
        return (
          <button
            key={v}
            type="button"
            onClick={() => onPick(v)}
            className={clsx(
              'h-7 px-2.5 rounded-lg text-[11px] font-semibold transition-colors',
              on ? 'bg-text text-black' : 'bg-surface-3 text-muted hover:text-text',
            )}
          >
            {format(v)}
          </button>
        )
      })}
    </div>
  )
}

function CashLedger({
  currency,
  cashflows,
  onAdd,
  onDelete,
}: {
  currency: Currency
  cashflows: { id: string; date: string; kind: CashflowKind; amount: number; note: string }[]
  onAdd: (input: { kind: CashflowKind; amount: number; date: string; note?: string }) => void
  onDelete: (id: string) => void
}) {
  const t = useT()
  const [kind, setKind] = useState<CashflowKind>('deposit')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayKey)
  const [note, setNote] = useState('')
  const net = cashflows.reduce((s, c) => s + signedCashflow(c), 0)
  const sorted = [...cashflows].sort((a, b) => b.date.localeCompare(a.date))

  const submit = () => {
    const n = parseAmt(amount)
    if (!Number.isFinite(n) || n <= 0 || !date) return
    onAdd({ kind, amount: n, date: `${date}T12:00:00`, note })
    setAmount('')
    setNote('')
  }

  return (
    <Panel title={t('set.cashflows')} subtitle={t('set.cashflowsSub')}>
      <div className="flex items-center justify-between text-[13px] mb-4">
        <span className="text-muted">{t('set.moves')}</span>
        <span className={clsx('num font-semibold', net >= 0 ? 'text-accent' : 'text-loss')}>{fmtMoney(net, currency, { sign: true })}</span>
      </div>
      <form
        className="rounded-2xl border border-border bg-surface-2/40 p-3 mb-4"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <div className="grid grid-cols-2 gap-2 mb-2">
          <button
            type="button"
            onClick={() => setKind('deposit')}
            className={clsx(
              'h-9 rounded-xl text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 border transition-all',
              kind === 'deposit' ? 'bg-accent/10 border-accent/30 text-accent' : 'border-border text-muted hover:text-text',
            )}
          >
            <ArrowUpRight size={14} /> {t('set.deposit')}
          </button>
          <button
            type="button"
            onClick={() => setKind('withdrawal')}
            className={clsx(
              'h-9 rounded-xl text-[12px] font-semibold inline-flex items-center justify-center gap-1.5 border transition-all',
              kind === 'withdrawal' ? 'bg-loss/10 border-loss/30 text-loss' : 'border-border text-muted hover:text-text',
            )}
          >
            <ArrowDownRight size={14} /> {t('set.withdraw')}
          </button>
        </div>
        <div className="grid grid-cols-[1fr_1fr] sm:grid-cols-[7rem_1fr_1fr_auto] gap-2">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input mono inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={t('set.amount')} />
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('set.noteOpt')} className="col-span-2 sm:col-span-1" />
          <Button type="submit" variant="primary" size="sm" disabled={!amount.trim()} className="col-span-2 sm:col-span-1">
            <Plus size={14} /> {t('modal.register')}
          </Button>
        </div>
      </form>
      {sorted.length ? (
        <div className="flex flex-col gap-1">
          {sorted.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 hover:bg-surface-2/60 transition-colors">
              <span
                className={clsx(
                  'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                  c.kind === 'deposit' ? 'bg-accent/10 text-accent' : 'bg-loss/10 text-loss',
                )}
              >
                {c.kind === 'deposit' ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium truncate">
                  {c.kind === 'deposit' ? t('set.deposit') : t('set.withdraw')}
                  {c.note ? <span className="text-muted font-normal"> · {c.note}</span> : null}
                </div>
                <div className="text-[11px] text-dim mt-0.5">{fmtDate(c.date, 'd MMM yyyy')}</div>
              </div>
              <div className={clsx('num text-[13px] font-semibold', c.kind === 'deposit' ? 'text-accent' : 'text-loss')}>
                {fmtMoney(signedCashflow(c), currency, { sign: true })}
              </div>
              <button type="button" className="text-dim hover:text-loss p-1 rounded-lg hover:bg-loss/10" onClick={() => onDelete(c.id)} aria-label={t('common.delete')}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[12px] text-dim px-1">{t('set.cashflowsSub')}</p>
      )}
    </Panel>
  )
}

function PlaybookPanel({
  setups,
  onSave,
  onDelete,
}: {
  setups: PlaybookSetup[]
  onSave: (input: { id?: string; name: string; notes?: string; checklist: { id?: string; label: string }[] }) => void
  onDelete: (id: string) => void
}) {
  const t = useT()
  const blank = { id: undefined as string | undefined, name: '', notes: '', checklist: [''] }
  const [draft, setDraft] = useState(blank)
  const [open, setOpen] = useState(false)
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const editing = !!draft.id
  const nameRef = useRef<HTMLInputElement>(null)

  const startNew = () => {
    setDraft(blank)
    setOpen(true)
    window.setTimeout(() => nameRef.current?.focus(), 50)
  }

  const startEdit = (s: PlaybookSetup) => {
    setDraft({
      id: s.id,
      name: s.name,
      notes: s.notes,
      checklist: s.checklist.length ? s.checklist.map((c) => c.label) : [''],
    })
    setOpen(true)
    window.setTimeout(() => nameRef.current?.focus(), 50)
  }

  const save = () => {
    if (!draft.name.trim()) return
    onSave({
      id: draft.id,
      name: draft.name,
      notes: draft.notes,
      checklist: draft.checklist.map((label) => ({ label: label.trim() })).filter((c) => c.label),
    })
    setDraft(blank)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        setDraft(blank)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <Panel
        title={t('set.playbook')}
        subtitle={t('set.playbookSub')}
        action={
          <Button variant="primary" size="sm" onClick={startNew}>
            <Plus size={14} strokeWidth={2.5} /> {t('set.newSetup')}
          </Button>
        }
      >
        {open && (
          <form
            className="rounded-2xl border border-accent/20 bg-accent/[0.04] p-4 mb-4 animate-insight"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <div className="text-[13px] font-semibold mb-3">{editing ? t('set.editSetup') : t('set.newSetup')}</div>
            <div className="flex flex-col gap-3">
              <Field label={t('set.name')}>
                <Input
                  ref={nameRef}
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                  placeholder={t('set.setupPh')}
                />
              </Field>
              <Field label={t('set.notes')} hint={t('set.notesHint')}>
                <Textarea value={draft.notes} onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))} placeholder={t('common.optional')} className="min-h-16" />
              </Field>
              <Field label={t('set.checklist')} hint={t('set.checklistHint')}>
                <div className="flex flex-col gap-1.5">
                  {draft.checklist.map((line, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        value={line}
                        onChange={(e) =>
                          setDraft((d) => {
                            const checklist = [...d.checklist]
                            checklist[i] = e.target.value
                            return { ...d, checklist }
                          })
                        }
                        onKeyDown={(e) => {
                          if (e.key !== 'Enter') return
                          e.preventDefault()
                          setDraft((d) => {
                            const checklist = [...d.checklist]
                            checklist.splice(i + 1, 0, '')
                            return { ...d, checklist }
                          })
                        }}
                        placeholder={`Punto ${i + 1}`}
                      />
                      {draft.checklist.length > 1 && (
                        <button
                          type="button"
                          className="text-dim hover:text-loss px-1"
                          onClick={() => setDraft((d) => ({ ...d, checklist: d.checklist.filter((_, j) => j !== i) }))}
                          aria-label={t('set.removeItem')}
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  ))}
                  <Button type="button" variant="ghost" size="sm" onClick={() => setDraft((d) => ({ ...d, checklist: [...d.checklist, ''] }))}>
                    <Plus size={14} /> {t('set.checklist')}
                  </Button>
                </div>
              </Field>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft(blank)
                  setOpen(false)
                }}
              >
                {t('common.cancel')}
              </Button>
              <Button type="submit" variant="primary" size="sm" disabled={!draft.name.trim()}>
                {editing ? t('set.saveChanges') : t('set.createSetup')}
              </Button>
            </div>
          </form>
        )}

        {setups.length ? (
          <div className="flex flex-col gap-2">
            {setups.map((s) => (
              <div key={s.id} className="rounded-2xl border border-border px-4 py-3.5 hover:border-border-2 transition-colors">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="text-[14px] font-semibold">{s.name}</div>
                      {s.checklist.length > 0 && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-dim bg-surface-3 px-1.5 py-0.5 rounded-md">
                          {s.checklist.length} {s.checklist.length === 1 ? 'punto' : 'puntos'}
                        </span>
                      )}
                    </div>
                    {s.notes ? <p className="text-[12px] text-muted mt-1 leading-relaxed">{s.notes}</p> : null}
                    {s.checklist.length > 0 && (
                      <ul className="mt-2 text-[12px] text-dim space-y-1">
                        {s.checklist.map((c) => (
                          <li key={c.id} className="flex items-start gap-2">
                            <span className="mt-1.5 w-1 h-1 rounded-full bg-border-3 shrink-0" />
                            <span>{c.label}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(s)}>
                      Editar
                    </Button>
                    <Button variant="ghost" size="sm" className="text-loss hover:bg-loss/10" onClick={() => setConfirmId(s.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          !open && (
            <Empty
              icon={<BookOpen size={18} />}
              title={t('set.noSetups')}
              description={t('set.noSetupsHint')}
              action={
                <Button variant="primary" size="sm" onClick={startNew}>
                  <Plus size={14} /> {t('set.createSetup')}
                </Button>
              }
            />
          )
        )}
      </Panel>
      <Confirm
        open={!!confirmId}
        onClose={() => setConfirmId(null)}
        onConfirm={() => {
          if (confirmId) onDelete(confirmId)
        }}
        title={t('set.deleteSetup')}
        message={t('set.deleteSetupMsg')}
        confirmLabel={t('common.delete')}
      />
    </>
  )
}

function stringify(n: number) {
  if (!Number.isFinite(n)) return '0'
  return String(n)
}

function fmtNumPct(n: number) {
  if (!Number.isFinite(n) || n <= 0) return '—'
  const d = n >= 10 ? 0 : n >= 1 ? 1 : 2
  return `${n.toFixed(d)}%`
}

function colorSwatch(color: AccountColor) {
  return ACCOUNT_COLORS.find((c) => c.value === color)?.swatch ?? '#4ade80'
}
