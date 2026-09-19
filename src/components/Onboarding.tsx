import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { clsx } from 'clsx'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Building2,
  Check,
  Coins,
  Ellipsis,
  Gem,
  Globe,
  Layers,
  Lock,
} from 'lucide-react'
import { useStore } from '@/store'
import { BrandMark } from '@/components/BrandMark'
import { LanguageSwitch } from '@/components/LanguageSwitch'
import { useT, useLocale } from '@/lib/useI18n'
import { accountTypeLabel, marketBlurb, marketLabel } from '@/lib/i18n'
import { fmtMoney } from '@/lib/format'
import { looksLikeDemoDesk } from '@/lib/demo'
import {
  ACCOUNT_TYPES,
  COLOR_BY_ACCOUNT_TYPE,
  MARKETS,
  defaultFeesForMarket,
  normalizePreferredMarkets,
  togglePreferredMarket,
  type AccountType,
  type Currency,
  type Market,
  type WeekStart,
} from '@/types'

type Step = 'welcome' | 'profile' | 'markets' | 'desk' | 'start' | 'assemble'

type StartPath = 'keep' | 'blank' | 'demo'
const FLOW = ['profile', 'markets', 'desk', 'start'] as const
type FlowStep = (typeof FLOW)[number]

const MARKET_ICONS: Record<Market, typeof Globe> = {
  Forex: Globe,
  Índices: BarChart3,
  Futuros: Activity,
  Acciones: Building2,
  Crypto: Coins,
  'Materias primas': Gem,
  Opciones: Layers,
  Otros: Ellipsis,
}

const BALANCE_PRESETS = [5000, 10000, 25000, 50000, 100000]
const RISK_PRESETS = [0.25, 0.5, 1, 1.5, 2]
const ASSEMBLE_KEYS = ['on.assemble.profile', 'on.assemble.markets', 'on.assemble.account', 'on.assemble.rules'] as const
const ACCT_NAME_KEYS = {
  live: 'on.acct.live',
  demo: 'on.acct.demo',
  prop: 'on.acct.prop',
  paper: 'on.acct.paper',
} as const

function parseAmt(raw: string) {
  return Number(String(raw).replace(/\s/g, '').replace(',', '.')) || 0
}

export function Onboarding() {
  const completeOnboarding = useStore((s) => s.completeOnboarding)
  const updateSettings = useStore((s) => s.updateSettings)
  const settings = useStore((s) => s.settings)
  const t = useT()
  const locale = useLocale()
  const nameByType = (ty: AccountType) => t(ACCT_NAME_KEYS[ty])
  const accounts = useStore((s) => s.accounts)
  const existingTrades = useStore((s) => s.trades)
  const existingNotes = useStore((s) => s.notes)
  const existingFlows = useStore((s) => s.cashflows)
  const active = accounts.find((a) => a.id === settings.activeAccountId) ?? accounts[0]
  const historyCount = existingTrades.length + existingNotes.length + existingFlows.length
  const hasHistory = historyCount > 0
  const demoDesk = !!settings.demoData || looksLikeDemoDesk(existingNotes)

  const [step, setStep] = useState<Step>('welcome')
  const [traderName, setTraderName] = useState(() => (settings.traderName && settings.traderName !== 'Trader' ? settings.traderName : ''))
  const [markets, setMarkets] = useState<Market[]>(() =>
    normalizePreferredMarkets(settings.preferredMarkets, settings.defaultMarket || 'Futuros'),
  )
  const [type, setType] = useState<AccountType>(active?.type ?? 'live')
  const [accountName, setAccountName] = useState(() => {
    const n = settings.accountName || active?.name || ''
    return n && n !== 'Cuenta principal' ? n : nameByType(active?.type ?? 'live')
  })
  const [broker] = useState(active?.broker ?? '')
  const [currency, setCurrency] = useState<Currency>(settings.currency)
  const [balance, setBalance] = useState(String(settings.startingBalance || 10000))
  const [risk, setRisk] = useState(String(settings.riskPerTrade || 1))
  const [dailyLimitOn, setDailyLimitOn] = useState(() => {
    const fresh = !settings.traderName || settings.traderName === 'Trader'
    return fresh ? true : settings.dailyLossLimit > 0
  })
  const [dailyPct, setDailyPct] = useState(() => {
    if (settings.startingBalance > 0 && settings.dailyLossLimit > 0) {
      const pct = (settings.dailyLossLimit / settings.startingBalance) * 100
      return String(Math.round(pct * 1000) / 1000)
    }
    return '2'
  })
  const [fees, setFees] = useState(String(settings.defaultFees || defaultFeesForMarket((settings.preferredMarkets?.[0] || settings.defaultMarket) || 'Futuros')))
  const [weekStartsOn] = useState<WeekStart>(settings.weekStartsOn)
  const [path, setPath] = useState<StartPath>(() => (hasHistory && !demoDesk ? 'keep' : 'blank'))
  const [assembleTick, setAssembleTick] = useState(0)
  const nameRef = useRef<HTMLInputElement>(null)
  const committed = useRef(false)
  const feesTouched = useRef(settings.defaultFees > 0)

  const flowIndex = FLOW.indexOf(step as FlowStep)
  const startingBalance = parseAmt(balance)
  const riskPerTrade = parseAmt(risk)
  const dailyLossLimit = dailyLimitOn ? Math.round(startingBalance * (parseAmt(dailyPct) / 100)) : 0
  const defaultFees = parseAmt(fees)
  const riskMoney = startingBalance * (riskPerTrade / 100)
  const firstName = traderName.trim().split(' ')[0] || 'Trader'
  const primary = markets[0] ?? 'Futuros'

  const canNext = useMemo(() => {
    if (step === 'profile') return traderName.trim().length >= 2
    if (step === 'markets') return markets.length >= 1
    if (step === 'desk') return startingBalance > 0 && riskPerTrade > 0 && (!dailyLimitOn || parseAmt(dailyPct) > 0)
    return true
  }, [step, traderName, markets, startingBalance, riskPerTrade, dailyLimitOn, dailyPct])

  useEffect(() => {
    if (step === 'profile') {
      const t = window.setTimeout(() => nameRef.current?.focus(), 240)
      return () => window.clearTimeout(t)
    }
  }, [step])

  useEffect(() => {
    if (step !== 'assemble' || committed.current) return
    setAssembleTick(0)
    const timers = ASSEMBLE_KEYS.map((_, i) => window.setTimeout(() => setAssembleTick(i + 1), 160 + i * 220))
    const done = window.setTimeout(() => {
      if (committed.current) return
      committed.current = true
      completeOnboarding({
        traderName: traderName.trim() || 'Trader',
        accountName: accountName.trim() || nameByType(type),
        broker,
        type,
        color: COLOR_BY_ACCOUNT_TYPE[type],
        currency,
        startingBalance: startingBalance || 10000,
        riskPerTrade: riskPerTrade || 1,
        dailyLossLimit,
        defaultMarket: primary,
        preferredMarkets: markets,
        defaultFees,
        weekStartsOn,
        tradeFormMode: settings.tradeFormMode || 'simple',
        loadDemo: path === 'demo',
        clearHistory: path === 'blank',
      })
    }, 160 + ASSEMBLE_KEYS.length * 220 + 420)
    return () => {
      timers.forEach(clearTimeout)
      window.clearTimeout(done)
    }
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  const goNext = () => {
    if (step === 'welcome') return setStep('profile')
    if (step === 'start') return setStep('assemble')
    const i = FLOW.indexOf(step as FlowStep)
    if (i >= 0 && i < FLOW.length - 1) setStep(FLOW[i + 1])
  }

  const goBack = () => {
    if (step === 'profile') return setStep('welcome')
    const i = FLOW.indexOf(step as FlowStep)
    if (i > 0) setStep(FLOW[i - 1])
  }

  const skipWithDemo = () => {
    setTraderName((n) => n.trim() || 'Trader')
    setPath('demo')
    setType('demo')
    setAccountName('Cuenta de ejemplo')
    setBalance('25000')
    setStep('assemble')
  }

  const onKey = (e: KeyboardEvent) => {
    if (step === 'assemble' || step === 'welcome') return
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
      e.preventDefault()
      if (canNext) goNext()
    }
  }

  const pickType = (next: AccountType) => {
    setType(next)
    setAccountName(nameByType(next))
  }

  const pickMarket = (m: Market) => {
    setMarkets((prev) => {
      const next = togglePreferredMarket(prev, m)
      if (!feesTouched.current) setFees(String(defaultFeesForMarket(next[0])))
      return next
    })
  }

  const setPrimary = (m: Market) => {
    setMarkets((prev) => {
      if (!prev.includes(m)) return prev
      const next = [m, ...prev.filter((x) => x !== m)]
      if (!feesTouched.current) setFees(String(defaultFeesForMarket(m)))
      return next
    })
  }

  return (
    <div className="h-full relative overflow-hidden bg-bg text-text" onKeyDown={onKey}>
      <div className="drag-region absolute inset-x-0 top-0 h-12 z-30" />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(900px 480px at 50% -8%, rgba(74,222,128,0.07), transparent 58%)' }}
      />

      {step === 'welcome' ? (
        <Welcome
          onStart={() => setStep('profile')}
          onDemo={skipWithDemo}
          locale={settings.locale ?? 'es'}
          onLocale={(locale) => updateSettings({ locale })}
        />
      ) : step === 'assemble' ? (
        <Assemble name={firstName} done={assembleTick} demo={path === 'demo'} />
      ) : (
        <div className="relative z-10 h-full flex flex-col">
          <header className="h-12 shrink-0 px-7 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <BrandMark size={22} />
              <span className="text-[13px] font-semibold tracking-tight">Atrium</span>
            </div>
            <div className="flex items-center gap-1.5" aria-label={`Paso ${flowIndex + 1} de ${FLOW.length}`}>
              {FLOW.map((id, i) => (
                <span
                  key={id}
                  className={clsx('h-[3px] rounded-full transition-all duration-500', i <= flowIndex ? 'w-7 bg-accent' : 'w-3 bg-border-3')}
                />
              ))}
            </div>
          </header>

          <div className="flex-1 min-h-0 overflow-y-auto">
            <div key={step} className="min-h-full flex flex-col px-6 py-8 sm:px-10 animate-onboard-rise">
              <div className="w-full max-w-[540px] mx-auto flex-1">
                {step === 'profile' && (
                  <StepFrame title={t('on.nameTitle')} copy={t('on.nameCopy')}>
                    <input
                      ref={nameRef}
                      value={traderName}
                      onChange={(e) => setTraderName(e.target.value)}
                      placeholder="Alex Rivera"
                      maxLength={48}
                      className="w-full bg-transparent border-0 border-b border-border-2 text-[32px] leading-tight font-semibold tracking-tight py-3 outline-none focus:border-accent placeholder:text-dim/40 transition-colors"
                    />
                    <p className="text-[13px] text-dim mt-5 h-5">{traderName.trim().length >= 2 ? t('on.nameOk', { name: firstName }) : t('on.nameMin')}</p>
                  </StepFrame>
                )}

                {step === 'markets' && (
                  <StepFrame
                    title={t('on.marketsTitle')}
                    copy={t('on.marketsCopy')}
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {MARKETS.map((m) => {
                        const Icon = MARKET_ICONS[m]
                        const on = markets.includes(m)
                        const isPrimary = primary === m && on
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => pickMarket(m)}
                            className={clsx(
                              'flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors border',
                              on ? 'bg-surface-2 border-accent/40' : 'bg-transparent border-border hover:border-border-3 hover:bg-surface-2/50',
                            )}
                          >
                            <span
                              className={clsx(
                                'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                                isPrimary ? 'bg-accent text-black' : on ? 'bg-accent/15 text-accent' : 'bg-surface-3 text-muted',
                              )}
                            >
                              <Icon size={15} />
                            </span>
                            <span className="flex-1 min-w-0">
                              <span className="block text-[13px] font-semibold leading-none">{marketLabel(locale, m)}</span>
                              <span className="block text-[11px] text-dim mt-1 truncate">{marketBlurb(locale, m)}</span>
                            </span>
                            <span
                              className={clsx(
                                'w-[18px] h-[18px] rounded-md border flex items-center justify-center shrink-0',
                                on ? 'border-accent bg-accent' : 'border-border-3',
                              )}
                            >
                              {on && <Check size={11} strokeWidth={3} className="text-black" />}
                            </span>
                          </button>
                        )
                      })}
                    </div>

                    {markets.length > 1 && (
                      <div className="mt-6">
                        <p className="text-[12px] text-muted mb-2.5">Principal al anotar</p>
                        <div className="flex flex-wrap gap-1.5">
                          {markets.map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => setPrimary(m)}
                              className={clsx(
                                'h-8 px-3 rounded-full text-[12px] font-semibold transition-colors',
                                m === primary ? 'bg-text text-black' : 'bg-surface-2 text-muted hover:text-text',
                              )}
                            >
                              {marketLabel(locale, m)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </StepFrame>
                )}

                {step === 'desk' && (
                  <StepFrame title={t('on.deskTitle')} copy={t('on.deskCopy')}>
                    <div className="flex flex-col gap-8">
                      <div>
                        <Label>{t('set.type')}</Label>
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {ACCOUNT_TYPES.map((x) => (
                            <button
                              key={x.value}
                              type="button"
                              onClick={() => pickType(x.value)}
                              className={clsx(
                                'h-9 px-3.5 rounded-full text-[13px] font-semibold transition-colors',
                                type === x.value ? 'bg-text text-black' : 'bg-surface-2 text-muted hover:text-text',
                              )}
                            >
                              {accountTypeLabel(locale, x.value)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-baseline justify-between gap-3">
                          <Label>{t('set.startingCapital')}</Label>
                          <div className="flex gap-1">
                            {(['USD', 'EUR', 'GBP'] as Currency[]).map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => setCurrency(c)}
                                className={clsx(
                                  'h-7 px-2.5 rounded-full text-[11px] font-semibold tracking-wide',
                                  currency === c ? 'bg-text text-black' : 'text-dim hover:text-text',
                                )}
                              >
                                {c}
                              </button>
                            ))}
                          </div>
                        </div>
                        <LineInput mono value={balance} onChange={setBalance} placeholder="10000" />
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {BALANCE_PRESETS.map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setBalance(String(n))}
                              className={clsx(
                                'h-7 px-2.5 rounded-full text-[11px] font-medium num',
                                startingBalance === n ? 'bg-accent/15 text-accent' : 'text-dim hover:text-text',
                              )}
                            >
                              {fmtMoney(n, currency, { compact: true, decimals: 0 })}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-baseline justify-between gap-4">
                          <Label>Riesgo por operación</Label>
                          <span className="num text-[13px] text-accent font-semibold">
                            {riskPerTrade || 0}% · {fmtMoney(riskMoney || 0, currency)}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-2.5">
                          {RISK_PRESETS.map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setRisk(String(n))}
                              className={clsx(
                                'h-8 px-3 rounded-full text-[13px] font-semibold num',
                                riskPerTrade === n ? 'bg-text text-black' : 'bg-surface-2 text-muted hover:text-text',
                              )}
                            >
                              {n}%
                            </button>
                          ))}
                        </div>
                        <div className="flex items-end gap-2 mt-3 max-w-[160px]">
                          <LineInput mono value={risk} onChange={setRisk} placeholder="1.25" />
                          <span className="text-[13px] text-dim pb-2">%</span>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center justify-between gap-3">
                          <Label>Tope de pérdida diaria</Label>
                          <button
                            type="button"
                            onClick={() => setDailyLimitOn((v) => !v)}
                            className={clsx(
                              'text-[11px] font-semibold px-2.5 h-6 rounded-full transition-colors',
                              dailyLimitOn ? 'bg-accent/15 text-accent' : 'text-dim hover:text-muted',
                            )}
                          >
                            {dailyLimitOn ? t('on.active') : t('on.inactive')}
                          </button>
                        </div>
                        {dailyLimitOn && (
                          <>
                            <div className="flex flex-wrap gap-1.5 mt-2.5">
                              {['1', '2', '3', '5'].map((p) => (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() => setDailyPct(p)}
                                  className={clsx(
                                    'h-8 px-3 rounded-full text-[13px] font-semibold',
                                    parseAmt(dailyPct) === Number(p) ? 'bg-text text-black' : 'bg-surface-2 text-muted hover:text-text',
                                  )}
                                >
                                  {p}%
                                </button>
                              ))}
                            </div>
                            <div className="flex items-end gap-2 mt-3 max-w-[160px]">
                              <LineInput mono value={dailyPct} onChange={setDailyPct} placeholder="2" />
                              <span className="text-[13px] text-dim pb-2">%</span>
                            </div>
                            <p className="text-[12px] text-dim mt-2">
                              Tope de sesión: <span className="num text-text">{fmtMoney(dailyLossLimit, currency)}</span>
                            </p>
                          </>
                        )}
                      </div>
                    </div>
                  </StepFrame>
                )}

                {step === 'start' && (
                  <StepFrame
                    title={locale === 'en' ? `Ready, ${firstName}.` : `Listo, ${firstName}.`}
                    copy={
                      demoDesk && hasHistory
                        ? t('on.keepCopy')
                        : hasHistory
                          ? t('on.keepCopy2')
                          : t('on.startCopy')
                    }
                  >
                    <div className="flex flex-col gap-2">
                      {hasHistory && !demoDesk && (
                        <PathCard
                          active={path === 'keep'}
                          onClick={() => setPath('keep')}
                          title={t('on.keepHistory')}
                          body={`${existingTrades.length} · ${settings.accountName}`}
                          mark={t('on.recommended')}
                        />
                      )}
                      <PathCard
                        active={path === 'blank'}
                        onClick={() => setPath('blank')}
                        title={t('on.blankBook')}
                        body={t('on.blankBody')}
                        mark={!hasHistory || demoDesk ? t('on.recommended') : undefined}
                      />
                      <PathCard
                        active={path === 'demo'}
                        onClick={() => setPath('demo')}
                        title={t('on.sampleData')}
                        body={t('on.sampleBody')}
                      />
                    </div>
                    <dl className="mt-8 divide-y divide-border border-y border-border">
                      {[
                        [t('on.row.trader'), traderName.trim()],
                        [t('on.row.account'), `${accountName.trim()} · ${accountTypeLabel(locale, type)}`],
                        [t('on.row.capital'), fmtMoney(startingBalance, currency)],
                        [t('on.row.risk'), `${riskPerTrade}% · ${fmtMoney(riskMoney, currency)}`],
                        [t('on.row.daily'), dailyLimitOn ? fmtMoney(dailyLossLimit, currency) : t('on.inactive')],
                        [
                          t('on.row.markets'),
                          markets.length > 1
                            ? `${marketLabel(locale, primary)} · ${markets.slice(1).map((m) => marketLabel(locale, m)).join(', ')}`
                            : marketLabel(locale, primary),
                        ],
                      ].map(([k, v]) => (
                        <div key={String(k)} className="flex items-baseline justify-between gap-6 py-2.5">
                          <dt className="text-[12px] text-dim">{k}</dt>
                          <dd className="text-[13px] font-medium text-right truncate">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </StepFrame>
                )}
              </div>

              <footer className="w-full max-w-[540px] mx-auto pt-8 pb-2 flex items-center justify-between gap-3 shrink-0">
                <button type="button" onClick={goBack} className="inline-flex items-center gap-2 h-10 px-1 text-[13px] text-muted hover:text-text transition-colors no-drag">
                  <ArrowLeft size={15} /> Atrás
                </button>
                <button
                  type="button"
                  disabled={!canNext}
                  onClick={goNext}
                  className="inline-flex items-center gap-2 h-11 px-5 rounded-full bg-accent text-black text-[13px] font-semibold hover:bg-[#5ce392] disabled:opacity-35 active:scale-[0.98] transition-all no-drag"
                >
                  {step === 'start' ? t('on.enter') : t('on.continue')}
                  <ArrowRight size={15} strokeWidth={2.4} />
                </button>
              </footer>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Welcome({
  onStart,
  onDemo,
  locale,
  onLocale,
}: {
  onStart: () => void
  onDemo: () => void
  locale: 'es' | 'en'
  onLocale: (locale: 'es' | 'en') => void
}) {
  const t = useT()
  const [skip, setSkip] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.key === 'Escape') {
        setSkip(true)
        return
      }
      if (e.key !== 'Enter') return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'INPUT') return
      e.preventDefault()
      setSkip(true)
      onStart()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onStart])

  const motion = (name: string) => (skip ? undefined : name)
  const at = (ms: number) => (skip ? undefined : { animationDelay: `${ms}ms` })

  return (
    <div className="relative z-10 h-full flex flex-col items-center px-8" onClick={() => setSkip(true)}>
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className={clsx(
            'absolute left-1/2 top-[44%] -translate-x-1/2 -translate-y-1/2 w-[560px] h-[560px] rounded-full bg-accent/[0.14] blur-[120px]',
            !skip && 'animate-pulse-glow',
          )}
        />
        <div className="absolute inset-0 grid-bg opacity-30" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center max-w-lg relative">
        <div className={motion('animate-intro-mark')} style={at(80)}>
          <BrandMark size={72} className="shadow-[0_20px_60px_-18px_rgba(74,222,128,0.45)]" />
        </div>
        <div
          className={clsx(
            'mt-8 text-[13px] sm:text-[14px] font-semibold uppercase text-text tracking-[0.28em]',
            motion('animate-intro-word'),
          )}
          style={at(380)}
        >
          Atrium
        </div>
        <div
          className={clsx('mt-7 h-px w-14 bg-accent origin-center', motion('animate-intro-line'))}
          style={at(820)}
        />

        <div className={clsx('mt-8', motion('animate-intro-kicker'))} style={at(1000)} onClick={(e) => e.stopPropagation()}>
          <LanguageSwitch value={locale} onChange={onLocale} size="sm" />
        </div>

        <h1
          className={clsx(
            'mt-8 text-[36px] sm:text-[42px] leading-[1.08] font-semibold tracking-[-0.045em] text-gradient',
            motion('animate-intro-kicker'),
          )}
          style={at(1400)}
        >
          {t('on.headline')}
        </h1>
        <p
          className={clsx('text-[15px] text-muted mt-5 leading-relaxed max-w-md', motion('animate-intro-kicker'))}
          style={at(1680)}
        >
          {t('on.body')}
        </p>
        <div
          className={clsx('flex flex-col items-center gap-3 mt-10 w-full', motion('animate-intro-kicker'))}
          style={at(1960)}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onStart}
            className="inline-flex items-center gap-2 h-12 px-7 rounded-full bg-accent text-black text-[14px] font-semibold hover:bg-[#5ce392] active:scale-[0.98] transition-all no-drag shadow-[0_8px_28px_-8px_rgba(74,222,128,0.55)]"
          >
            {t('on.start')}
            <ArrowRight size={16} strokeWidth={2.4} />
          </button>
          <button type="button" onClick={onDemo} className="h-10 px-3 text-[13px] text-muted hover:text-text transition-colors no-drag">
            {t('on.demo')}
          </button>
        </div>
      </div>
      <p className={clsx('relative flex items-center gap-2 text-[11px] text-dim pb-8', motion('animate-intro-kicker'))} style={at(2240)}>
        <Lock size={11} />
        {t('on.stayLocal')}
      </p>
    </div>
  )
}

function Assemble({ name, done, demo }: { name: string; done: number; demo: boolean }) {
  const t = useT()
  return (
    <div className="relative z-10 h-full flex flex-col items-center justify-center px-8">
      <div className="absolute w-64 h-64 rounded-full bg-accent/8 blur-[80px] pointer-events-none" />
      <BrandMark size={36} />
      <h2 className="text-[24px] font-semibold tracking-tight mt-10">{t('on.preparing', { name })}</h2>
      <p className="text-[13px] text-muted mt-2">{demo ? t('on.loadingDemo') : t('on.applying')}</p>
      <ul className="mt-10 w-full max-w-[220px] flex flex-col gap-3">
        {ASSEMBLE_KEYS.map((key, i) => {
          const on = done > i
          return (
            <li key={key} className={clsx('flex items-center gap-3 text-[14px] transition-colors duration-300', on ? 'text-text' : 'text-dim')}>
              <span className={clsx('w-5 h-5 rounded-full flex items-center justify-center border', on ? 'bg-accent border-accent text-black' : 'border-border-2')}>
                {on ? <Check size={11} strokeWidth={3} /> : <span className="w-1 h-1 rounded-full bg-dim" />}
              </span>
              {t(key)}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function StepFrame({ title, copy, children }: { title: string; copy: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="text-[28px] sm:text-[32px] font-semibold tracking-[-0.038em] leading-[1.12]">{title}</h2>
      <p className="text-[14px] text-muted mt-3 leading-relaxed">{copy}</p>
      <div className="mt-8">{children}</div>
    </div>
  )
}

function Label({ children }: { children: ReactNode }) {
  return <span className="text-[12px] text-muted">{children}</span>
}

function LineInput({
  value,
  onChange,
  placeholder,
  mono,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  mono?: boolean
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode={mono ? 'decimal' : undefined}
      className={clsx(
        'w-full bg-transparent border-0 border-b border-border-2 text-[18px] py-2 outline-none focus:border-accent placeholder:text-dim/40 transition-colors',
        mono && 'mono',
      )}
    />
  )
}

function PathCard({
  active,
  onClick,
  title,
  body,
  mark,
}: {
  active: boolean
  onClick: () => void
  title: string
  body: string
  mark?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'text-left rounded-xl px-4 py-3.5 transition-colors border',
        active ? 'bg-surface-2 border-accent/40' : 'bg-transparent border-border hover:border-border-3',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-[14px] font-semibold">{title}</span>
        {mark && <span className="text-[10px] font-semibold uppercase tracking-wider text-accent">{mark}</span>}
        {active && <Check size={14} className="text-accent ml-auto" />}
      </div>
      <p className="text-[12px] text-muted mt-1 leading-relaxed">{body}</p>
    </button>
  )
}
