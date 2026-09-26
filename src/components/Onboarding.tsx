import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  Building2,
  CalendarDays,
  Check,
  Coins,
  Ellipsis,
  Eye,
  EyeOff,
  Gem,
  Globe,
  Layers,
  LayoutDashboard,
  ListOrdered,
  Lock,
  KeyRound,
  Play,
  Shield,
  Sparkles,
} from 'lucide-react'
import { useStore, getBackup } from '@/store'
import { hasLegacyBrowserJournal, isDesktop, migrateLegacyBrowserToEncrypted } from '@/lib/db/client'
import { getCryptoStatus, setupMasterPassword, setupSecureStorageKey } from '@/lib/crypto/keyManager'
import { getWebCryptoMeta, hasStagedSaltOnly } from '@/lib/crypto/keyManagerWeb'
import { ensureCryptoSaltSynced, pushRemoteSalt } from '@/lib/syncSalt'
import { isCloudSyncActive, verifyMasterPasswordAgainstCloud } from '@/lib/tradeSync'
import { getWebKeyHex } from '@/lib/crypto/keyManagerWeb'
import { BrandMark } from '@/components/BrandMark'
import { useT, useLocale } from '@/lib/useI18n'
import { accountTypeLabel, marketBlurb, marketLabel, type MessageKey } from '@/lib/i18n'
import { fmtMoney, fmtNum, fmtPct, fmtR } from '@/lib/format'
import { looksLikeDemoDesk } from '@/lib/demo'
import { CLOUD_SYNC_FEATURE_ENABLED, writeCloudSyncPref } from '@/lib/cloudSyncPref'
import { isSupabaseConfigured } from '@/lib/supabase'
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

type Step = 'welcome' | 'profile' | 'markets' | 'desk' | 'risk' | 'security' | 'start' | 'assemble'

type StartPath = 'keep' | 'blank' | 'demo'
type CryptoChoice = 'password' | 'secure-storage'
const FLOW_DESKTOP = ['profile', 'markets', 'desk', 'risk', 'security', 'start'] as const
type FlowStep = (typeof FLOW_DESKTOP)[number]

function flowSteps(skipSecurity = false): readonly FlowStep[] {
  return skipSecurity ? FLOW_DESKTOP.filter((s) => s !== 'security') : FLOW_DESKTOP
}

const STEP_LABEL: Record<FlowStep, MessageKey> = {
  profile: 'on.step.profile',
  markets: 'on.step.markets',
  desk: 'on.step.desk',
  risk: 'on.step.risk',
  security: 'on.step.security',
  start: 'on.step.start',
}

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
const ASSEMBLE_KEYS_DESKTOP = [
  'on.assemble.profile',
  'on.assemble.markets',
  'on.assemble.account',
  'on.assemble.crypto',
  'on.assemble.rules',
] as const
type AssembleKey = (typeof ASSEMBLE_KEYS_DESKTOP)[number]
const ACCT_NAME_KEYS = {
  live: 'on.acct.live',
  demo: 'on.acct.demo',
  prop: 'on.acct.prop',
  paper: 'on.acct.paper',
} as const

function parseAmt(raw: string) {
  return Number(String(raw).replace(/\s/g, '').replace(',', '.')) || 0
}

export function Onboarding({
  legacyMigrationOnly = false,
  onLegacyMigrated,
}: {
  legacyMigrationOnly?: boolean
  onLegacyMigrated?: () => void
} = {}) {
  const completeOnboarding = useStore((s) => s.completeOnboarding)
  const updateSettings = useStore((s) => s.updateSettings)
  const toast = useStore((s) => s.toast)
  const settings = useStore((s) => s.settings)
  const t = useT()
  const locale = useLocale()
  const navigate = useNavigate()
  const cloudAvailable = CLOUD_SYNC_FEATURE_ENABLED && isSupabaseConfigured()
  const nameByType = (ty: AccountType) => t(ACCT_NAME_KEYS[ty])
  const accounts = useStore((s) => s.accounts)
  const existingTrades = useStore((s) => s.trades)
  const existingNotes = useStore((s) => s.notes)
  const existingFlows = useStore((s) => s.cashflows)
  const active = accounts.find((a) => a.id === settings.activeAccountId) ?? accounts[0]
  const historyCount = existingTrades.length + existingNotes.length + existingFlows.length
  const hasHistory = historyCount > 0
  const demoDesk = !!settings.demoData || looksLikeDemoDesk(existingNotes)

  const [step, setStep] = useState<Step>(() => (legacyMigrationOnly ? 'security' : 'welcome'))
  const [legacyMigrating, setLegacyMigrating] = useState(false)
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
  const onboardingFresh = !settings.traderName || settings.traderName === 'Trader'
  const [feesLater, setFeesLater] = useState(() => (onboardingFresh ? true : settings.defaultFees === 0))
  const [fees, setFees] = useState(() => {
    if (onboardingFresh && settings.defaultFees === 0) return '0'
    return String(settings.defaultFees || defaultFeesForMarket((settings.preferredMarkets?.[0] || settings.defaultMarket) || 'Futuros'))
  })
  const [weekStartsOn] = useState<WeekStart>(settings.weekStartsOn)
  const [path, setPath] = useState<StartPath>(() => (hasHistory && !demoDesk ? 'keep' : 'blank'))
  const [cryptoChoice, setCryptoChoice] = useState<CryptoChoice>(isDesktop() ? 'secure-storage' : 'password')
  const [masterPassword, setMasterPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [secureStorageAvailable, setSecureStorageAvailable] = useState(false)
  const [cryptoBusy, setCryptoBusy] = useState(false)
  const [cryptoAlreadyReady, setCryptoAlreadyReady] = useState(false)
  const [assembleTick, setAssembleTick] = useState(0)
  const [returningDevice, setReturningDevice] = useState(false)
  const FLOW = flowSteps(cryptoAlreadyReady && !legacyMigrationOnly)
  const nameRef = useRef<HTMLInputElement>(null)
  const committed = useRef(false)
  const navLock = useRef(false)
  const feesTouched = useRef(settings.defaultFees > 0 || onboardingFresh)

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
    if (step === 'desk') return startingBalance > 0
    if (step === 'risk') return riskPerTrade > 0 && (!dailyLimitOn || parseAmt(dailyPct) > 0)
    if (step === 'security') {
      if (cryptoChoice === 'password') {
        return masterPassword.length >= 8 && masterPassword === confirmPassword
      }
      return secureStorageAvailable
    }
    return true
  }, [step, traderName, markets, startingBalance, riskPerTrade, dailyLimitOn, dailyPct, cryptoChoice, masterPassword, confirmPassword, secureStorageAvailable])

  useEffect(() => {
    void (async () => {
      const status = await getCryptoStatus()
      const staged = await hasStagedSaltOnly()
      setSecureStorageAvailable(isDesktop() && status.secureStorageAvailable)
      if (status.configured && status.mode === 'password') setCryptoChoice('password')
      else if (!status.secureStorageAvailable || !isDesktop()) setCryptoChoice('password')
      setReturningDevice(staged)
      setCryptoAlreadyReady(status.configured && !staged)
    })()
  }, [])

  const finishLegacyMigration = async (): Promise<boolean> => {
    setLegacyMigrating(true)
    try {
      const migrated = await migrateLegacyBrowserToEncrypted(getBackup())
      if (!migrated.ok) {
        toast(migrated.error, 'error')
        return false
      }
      toast(t('crypto.legacyDone'), 'success')
      onLegacyMigrated?.()
      return true
    } finally {
      setLegacyMigrating(false)
    }
  }

  useEffect(() => {
    if (!legacyMigrationOnly) return
    void (async () => {
      const status = await getCryptoStatus()
      if (status.configured && getWebKeyHex()) {
        await finishLegacyMigration()
      }
    })()
  }, [legacyMigrationOnly]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step === 'profile') {
      const t = window.setTimeout(() => nameRef.current?.focus(), 240)
      return () => window.clearTimeout(t)
    }
  }, [step])

  useEffect(() => {
    if (step !== 'security') {
      setReturningDevice(false)
      return
    }
    void hasStagedSaltOnly().then(setReturningDevice)
  }, [step])

  useEffect(() => {
    if (step !== 'assemble' || committed.current) return
    const assembleKeys = ASSEMBLE_KEYS_DESKTOP
    setAssembleTick(0)
    const timers = assembleKeys.map((_, i) => window.setTimeout(() => setAssembleTick(i + 1), 160 + i * 220))
    const done = window.setTimeout(() => {
      void (async () => {
        if (committed.current) return
        const status = await getCryptoStatus()
        if (!status.configured) {
          const ok = await setupCrypto()
          if (!ok) return
        }
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
      })()
    }, 160 + assembleKeys.length * 220 + 420)
    return () => {
      timers.forEach(clearTimeout)
      window.clearTimeout(done)
    }
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  const setupCrypto = async (): Promise<boolean> => {
    const status = await getCryptoStatus()
    const staged = await hasStagedSaltOnly()
    if (status.configured && !staged) return true

    setCryptoBusy(true)
    try {
      if (isCloudSyncActive()) {
        const synced = await ensureCryptoSaltSynced()
        if (!synced.ok) {
          toast(synced.error, 'error')
          return false
        }
      }

      const stagedSalt = (await hasStagedSaltOnly()) ? getWebCryptoMeta()?.salt : undefined
      const syncVerify = isCloudSyncActive()
        ? (dbKeyHex: string) => verifyMasterPasswordAgainstCloud(dbKeyHex)
        : undefined

      const result =
        cryptoChoice === 'password'
          ? await setupMasterPassword(masterPassword, {
              saltHex: stagedSalt,
              verifyWithCloud: syncVerify,
            })
          : await setupSecureStorageKey()
      if (!result.ok) {
        toast(result.error, 'error')
        return false
      }

      if (cryptoChoice === 'password' && isCloudSyncActive()) {
        const meta = getWebCryptoMeta()
        if (meta?.salt) {
          const pushed = await pushRemoteSalt(meta.salt, meta.iterations)
          if (!pushed.ok) {
            toast(pushed.error, 'error')
            return false
          }
        }
      }

      return true
    } finally {
      setCryptoBusy(false)
    }
  }

  const goNext = async () => {
    if (navLock.current) return
    navLock.current = true
    try {
      if (step === 'welcome') {
        setStep('profile')
        return
      }
      if (step === 'security') {
        const ok = await setupCrypto()
        if (!ok) return
        if (legacyMigrationOnly) {
          await finishLegacyMigration()
          return
        }
        if (!isDesktop() && hasLegacyBrowserJournal()) {
          await finishLegacyMigration()
        }
      }
      if (step === 'start') {
        setStep('assemble')
        return
      }
      const i = FLOW.indexOf(step as FlowStep)
      if (i >= 0 && i < FLOW.length - 1) setStep(FLOW[i + 1])
    } finally {
      navLock.current = false
    }
  }

  const goBack = () => {
    if (step === 'profile') return setStep('welcome')
    const i = FLOW.indexOf(step as FlowStep)
    if (i > 0) setStep(FLOW[i - 1])
  }

  const skipWithDemo = async () => {
    if (legacyMigrationOnly) return
    setTraderName((n) => n.trim() || 'Trader')
    setPath('demo')
    setType('demo')
    setAccountName('Cuenta de ejemplo')
    setBalance('25000')
    const status = await getCryptoStatus()
    if (!status.configured) {
      if (isDesktop() && status.secureStorageAvailable) {
        setCryptoBusy(true)
        try {
          const result = await setupSecureStorageKey()
          if (!result.ok) {
            toast(result.error, 'error')
            return
          }
        } finally {
          setCryptoBusy(false)
        }
      } else {
        toast(t('crypto.demoNeedsPassword'), 'info')
        setCryptoChoice('password')
        setStep('security')
        return
      }
    }
    setStep('assemble')
  }

  const onKey = (e: KeyboardEvent) => {
    if (step === 'assemble' || step === 'welcome') return
    if (e.key === 'Enter' && (e.target as HTMLElement).tagName !== 'TEXTAREA') {
      e.preventDefault()
      if (canNext) void goNext()
    }
  }

  const pickType = (next: AccountType) => {
    setType(next)
    setAccountName(nameByType(next))
  }

  const pickMarket = (m: Market) => {
    setMarkets((prev) => {
      const next = togglePreferredMarket(prev, m)
      if (!feesTouched.current && !feesLater) setFees(String(defaultFeesForMarket(next[0])))
      return next
    })
  }

  const setPrimary = (m: Market) => {
    setMarkets((prev) => {
      if (!prev.includes(m)) return prev
      const next = [m, ...prev.filter((x) => x !== m)]
      if (!feesTouched.current && !feesLater) setFees(String(defaultFeesForMarket(m)))
      return next
    })
  }

  const stepLabels = FLOW.map((s) => t(STEP_LABEL[s]))
  const prevIndex = useRef(flowIndex)
  const dirRef = useRef<1 | -1>(1)
  if (prevIndex.current !== flowIndex) {
    dirRef.current = flowIndex > prevIndex.current ? 1 : -1
    prevIndex.current = flowIndex
  }
  const pathLabel = path === 'keep' ? t('on.keepHistory') : path === 'demo' ? t('on.sampleData') : t('on.blankBook')
  const pct = (n: number) => fmtPct(n, Number.isInteger(n) ? 0 : 2)
  const sheetRows: SheetRow[] = [
    {
      step: 'markets',
      label: t('on.row.markets'),
      value: markets.length > 1 ? `${marketLabel(locale, primary)} +${markets.length - 1}` : marketLabel(locale, primary),
    },
    { step: 'desk', label: t('on.row.capital'), value: fmtMoney(startingBalance, currency) },
    { step: 'risk', label: t('on.row.risk'), value: `${pct(riskPerTrade)} · ${fmtMoney(riskMoney, currency)}` },
    { step: 'risk', label: t('on.row.daily'), value: dailyLimitOn ? fmtMoney(dailyLossLimit, currency) : t('on.inactive') },
    { step: 'desk', label: t('on.fees'), value: feesLater ? t('on.feesLaterShort') : fmtMoney(defaultFees, currency) },
    { step: 'security', label: t('on.sheet.security'), value: cryptoChoice === 'password' ? t('on.sec.password') : t('on.sec.system') },
    { step: 'start', label: t('on.sheet.start'), value: pathLabel },
  ]
  const lossesToCap = dailyLimitOn && riskMoney > 0 ? Math.floor(dailyLossLimit / riskMoney) : null

  const passwordBlock = (
    <PasswordFields
      password={masterPassword}
      confirm={confirmPassword}
      onPassword={setMasterPassword}
      onConfirm={setConfirmPassword}
    />
  )
  const recoveryNote = (
    <div className="mt-7 short:mt-5 flex gap-3 rounded-[12px] border border-white/[0.06] bg-white/[0.02] px-4 py-3.5 short:py-3">
      <Lock size={14} className="text-amber shrink-0 mt-[3px]" />
      <p className="text-[12.5px] text-muted leading-relaxed">{t('crypto.noRecovery')}</p>
    </div>
  )

  return (
    <div className="h-full relative overflow-hidden bg-bg text-text" onKeyDown={onKey}>
      {legacyMigrationOnly && step === 'security' ? (
        <FlowShell
          footer={
            <>
              <span />
              <PrimaryButton disabled={!canNext || cryptoBusy || legacyMigrating} onClick={() => void goNext()}>
                {legacyMigrating ? t('crypto.legacyMigrating') : cryptoBusy ? t('crypto.settingUp') : t('on.continue')}
              </PrimaryButton>
            </>
          }
        >
          <StepHead eyebrow={t('on.step.security')} title={t('crypto.legacyTitle')} copy={t('crypto.legacyCopy')}>
            {passwordBlock}
            {recoveryNote}
          </StepHead>
        </FlowShell>
      ) : step === 'welcome' ? (
        <Welcome
          onStart={() => setStep('profile')}
          onExistingAccount={() => {
            writeCloudSyncPref(true)
            updateSettings({ cloudSyncEnabled: true })
            navigate('/login')
          }}
          cloudAvailable={cloudAvailable}
          onDemo={skipWithDemo}
          locale={settings.locale ?? 'es'}
          onLocale={(locale) => updateSettings({ locale })}
        />
      ) : step === 'assemble' ? (
        <Assemble name={firstName} done={assembleTick} demo={path === 'demo'} keys={ASSEMBLE_KEYS_DESKTOP} />
      ) : (
        <FlowShell
          steps={stepLabels}
          index={flowIndex}
          stepKey={step}
          dir={dirRef.current}
          aside={
            <AccountSheet
              name={traderName.trim()}
              accountName={accountName.trim() || nameByType(type)}
              typeLabel={accountTypeLabel(locale, type)}
              rows={sheetRows}
              current={step as FlowStep}
              flow={FLOW}
              lossesToCap={lossesToCap}
              showStreak={flowIndex >= FLOW.indexOf('risk')}
            />
          }
          footer={
            <>
              <button
                type="button"
                onClick={goBack}
                className="group inline-flex items-center gap-2 h-10 text-[13px] text-muted hover:text-text transition-colors duration-300 no-drag"
              >
                <ArrowLeft size={14} className="transition-transform duration-300 group-hover:-translate-x-0.5" />
                {t('on.back')}
              </button>
              <div className="flex items-center gap-4">
                <kbd className="hidden sm:inline-flex items-center h-5 px-1.5 rounded border border-border-2 bg-surface-2 text-[10px] font-sans text-dim">
                  ↵ Enter
                </kbd>
                <PrimaryButton disabled={!canNext || cryptoBusy} onClick={() => void goNext()}>
                  {step === 'start' ? t('on.enter') : cryptoBusy ? t('crypto.settingUp') : t('on.continue')}
                </PrimaryButton>
              </div>
            </>
          }
        >
          {step === 'profile' && (
            <StepHead eyebrow={t('on.step.profile')} index={flowIndex + 1} title={t('on.nameTitle')} copy={t('on.nameCopy')}>
              <div className="relative">
                <input
                  ref={nameRef}
                  value={traderName}
                  onChange={(e) => setTraderName(e.target.value)}
                  placeholder="Alex Rivera"
                  maxLength={48}
                  className="peer w-full bg-transparent border-0 text-[38px] xl:text-[44px] short:text-[34px] leading-tight font-medium tracking-[-0.04em] py-2 outline-none placeholder:text-white/[0.1]"
                />
                <span className="absolute inset-x-0 bottom-0 h-px bg-white/[0.1]" />
                <span className="absolute inset-x-0 bottom-0 h-px bg-text origin-left scale-x-0 peer-focus:scale-x-100 transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]" />
              </div>
              <p className="mt-4 h-5 text-[13px]">
                {traderName.trim().length >= 2 ? (
                  <span key="ok" className="inline-flex items-center gap-1.5 text-accent animate-fade-in">
                    <Check size={13} strokeWidth={2.6} />
                    {t('on.nameOk', { name: firstName })}
                  </span>
                ) : (
                  <span className="text-dim">{t('on.nameMin')}</span>
                )}
              </p>
            </StepHead>
          )}

          {step === 'markets' && (
            <StepHead eyebrow={t('on.step.markets')} index={flowIndex + 1} title={t('on.marketsTitle')} copy={t('on.marketsCopy')}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {MARKETS.map((m, i) => {
                  const Icon = MARKET_ICONS[m]
                  const on = markets.includes(m)
                  const isPrimary = primary === m && on
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => pickMarket(m)}
                      style={{ animationDelay: `${220 + i * 35}ms` }}
                      className={clsx(
                        'group flex items-center gap-3 rounded-[12px] px-3 py-2.5 short:py-2 text-left border transition-[border-color,background-color] duration-300 animate-fade-up',
                        on ? 'border-white/[0.2] bg-white/[0.045]' : 'border-white/[0.07] hover:border-white/[0.14] hover:bg-white/[0.02]',
                      )}
                    >
                      <span
                        className={clsx(
                          'w-8 h-8 rounded-[9px] flex items-center justify-center shrink-0 transition-colors duration-300',
                          isPrimary ? 'bg-text text-bg' : on ? 'bg-white/[0.1] text-text' : 'bg-white/[0.04] text-dim group-hover:text-muted',
                        )}
                      >
                        <Icon size={15} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2 text-[13px] font-medium leading-none">
                          {marketLabel(locale, m)}
                          {isPrimary && markets.length > 1 && (
                            <span className="text-[10px] font-medium text-accent animate-fade-in">{t('on.primaryBadge')}</span>
                          )}
                        </span>
                        <span className="block text-[11.5px] text-dim mt-1 truncate">{marketBlurb(locale, m)}</span>
                      </span>
                      <Checkbox on={on} />
                    </button>
                  )
                })}
              </div>

              {markets.length > 1 && (
                <div className="mt-7 animate-fade-up">
                  <FieldLabel>{t('on.primaryMarket')}</FieldLabel>
                  <div className="flex flex-wrap gap-1.5">
                    {markets.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setPrimary(m)}
                        className={clsx(
                          'h-8 px-3 rounded-[8px] text-[12.5px] font-medium border transition-colors duration-300',
                          m === primary ? 'bg-text text-bg border-transparent' : 'border-white/[0.08] text-muted hover:text-text hover:border-white/[0.16]',
                        )}
                      >
                        {marketLabel(locale, m)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </StepHead>
          )}

          {step === 'desk' && (
            <StepHead eyebrow={t('on.step.desk')} index={flowIndex + 1} title={t('on.deskTitle')} copy={t('on.deskCopy')}>
              <div className="flex flex-col gap-7 short:gap-5">
                <div>
                  <FieldLabel>{t('on.accountType')}</FieldLabel>
                  <Segmented
                    options={ACCOUNT_TYPES.map((x) => ({ value: x.value, label: accountTypeLabel(locale, x.value) }))}
                    value={type}
                    onChange={pickType}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_160px] gap-4">
                  <div>
                    <FieldLabel>{t('on.accountName')}</FieldLabel>
                    <TextBox value={accountName} onChange={setAccountName} placeholder={nameByType(type)} />
                  </div>
                  <div>
                    <FieldLabel>{t('on.currency')}</FieldLabel>
                    <Segmented
                      options={(['USD', 'EUR', 'GBP'] as Currency[]).map((c) => ({ value: c, label: c }))}
                      value={currency}
                      onChange={setCurrency}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_160px] gap-4">
                  <div>
                    <FieldLabel>{t('on.capital')}</FieldLabel>
                    <TextBox mono value={balance} onChange={setBalance} placeholder="10000" suffix={currency} />
                    <div className="flex flex-wrap gap-1 mt-2.5">
                      {BALANCE_PRESETS.map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setBalance(String(n))}
                          className={clsx(
                            'h-7 px-2.5 rounded-[7px] text-[11.5px] font-medium num transition-colors duration-300',
                            startingBalance === n ? 'bg-white/[0.1] text-text' : 'text-dim hover:text-muted hover:bg-white/[0.03]',
                          )}
                        >
                          {fmtMoney(n, currency, { compact: true, decimals: 0 })}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <FieldLabel>{t('on.fees')}</FieldLabel>
                    {feesLater ? (
                      <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.02] px-3.5 py-3">
                        <p className="text-[12.5px] text-muted leading-relaxed">{t('on.feesLaterBody')}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setFeesLater(false)
                            feesTouched.current = false
                            setFees(String(defaultFeesForMarket(primary)))
                          }}
                          className="mt-2.5 text-[12px] font-medium text-text underline decoration-border-3 underline-offset-4 hover:decoration-text transition-colors no-drag"
                        >
                          {t('on.feesSetNow')}
                        </button>
                      </div>
                    ) : (
                      <>
                        <TextBox
                          mono
                          value={fees}
                          onChange={(v) => {
                            feesTouched.current = true
                            setFees(v)
                          }}
                          placeholder="0"
                          suffix={currency}
                        />
                        <p className="mt-2.5 text-[11.5px] text-dim leading-snug">{t('on.feesHint')}</p>
                        <button
                          type="button"
                          onClick={() => {
                            setFeesLater(true)
                            feesTouched.current = true
                            setFees('0')
                          }}
                          className="mt-2 text-[12px] text-muted hover:text-text transition-colors no-drag"
                        >
                          {t('on.feesSetLater')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </StepHead>
          )}

          {step === 'risk' && (
            <StepHead eyebrow={t('on.step.risk')} index={flowIndex + 1} title={t('on.riskTitle')} copy={t('on.riskCopy')}>
              <div className="flex flex-col gap-8 short:gap-6">
                <div>
                  <FieldLabel aside={<span key={riskMoney} className="num text-text animate-ticker inline-block">{fmtMoney(riskMoney || 0, currency)}</span>}>
                    {t('on.riskPerTrade')}
                  </FieldLabel>
                  <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
                    <Segmented
                      options={RISK_PRESETS.map((n) => ({ value: n, label: `${fmtNum(n, n % 1 ? 2 : 0)}%` }))}
                      value={riskPerTrade}
                      onChange={(n) => setRisk(String(n))}
                    />
                    <TextBox mono value={risk} onChange={setRisk} placeholder="1" suffix="%" compact />
                  </div>
                  <p className="mt-2.5 text-[12px] text-dim">{t('on.riskHint', { amount: fmtMoney(riskMoney || 0, currency) })}</p>
                </div>

                <div>
                  <FieldLabel aside={<Switch on={dailyLimitOn} onChange={setDailyLimitOn} />}>{t('on.dailyLimit')}</FieldLabel>
                  <div
                    className={clsx(
                      'grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
                      dailyLimitOn ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
                        <Segmented
                          options={[1, 2, 3, 5].map((n) => ({ value: n, label: `${n}%` }))}
                          value={parseAmt(dailyPct)}
                          onChange={(n) => setDailyPct(String(n))}
                        />
                        <TextBox mono value={dailyPct} onChange={setDailyPct} placeholder="2" suffix="%" compact />
                      </div>
                      <p className="mt-2.5 text-[12px] text-dim">{t('on.dailyHint', { amount: fmtMoney(dailyLossLimit, currency) })}</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 rounded-[12px] border border-white/[0.06] bg-white/[0.02] px-4 py-3.5">
                  <Shield size={14} className="text-muted shrink-0 mt-[3px]" />
                  <p className="text-[12.5px] text-muted leading-relaxed">{t('on.riskNote')}</p>
                </div>
              </div>
            </StepHead>
          )}

          {step === 'security' && (
            <StepHead
              eyebrow={t('on.step.security')}
              index={flowIndex + 1}
              title={returningDevice ? t('crypto.returningTitle') : t('crypto.onTitle')}
              copy={returningDevice ? t('crypto.returningCopy') : t('crypto.onCopy')}
            >
              <div className="flex flex-col gap-2">
                {isDesktop() && (
                  <ChoiceCard
                    active={cryptoChoice === 'secure-storage'}
                    onClick={() => secureStorageAvailable && setCryptoChoice('secure-storage')}
                    disabled={!secureStorageAvailable}
                    icon={Shield}
                    title={t('crypto.systemKeyTitle')}
                    body={t('crypto.systemKeyBody')}
                    mark={secureStorageAvailable ? t('on.recommended') : undefined}
                  />
                )}
                <ChoiceCard
                  active={cryptoChoice === 'password'}
                  onClick={() => setCryptoChoice('password')}
                  icon={KeyRound}
                  title={t('crypto.passwordTitle')}
                  body={t('crypto.passwordBody')}
                />
              </div>

              <div
                className={clsx(
                  'grid transition-[grid-template-rows,opacity] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]',
                  cryptoChoice === 'password' ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                )}
              >
                <div className="overflow-hidden">
                  <div className="pt-7 short:pt-5">{passwordBlock}</div>
                </div>
              </div>

              {isDesktop() && !secureStorageAvailable && (
                <p className="mt-6 text-[12px] text-amber/90 leading-relaxed">{t('crypto.secureStorageUnavailable')}</p>
              )}
              {recoveryNote}
            </StepHead>
          )}

          {step === 'start' && (
            <StepHead
              eyebrow={t('on.step.start')}
              index={flowIndex + 1}
              title={t('on.ready', { name: firstName })}
              copy={demoDesk && hasHistory ? t('on.keepCopy') : hasHistory ? t('on.keepCopy2') : t('on.startCopy')}
            >
              <div className="flex flex-col gap-2">
                {hasHistory && !demoDesk && (
                  <ChoiceCard
                    active={path === 'keep'}
                    onClick={() => setPath('keep')}
                    title={t('on.keepHistory')}
                    body={`${existingTrades.length} · ${settings.accountName}`}
                    mark={t('on.recommended')}
                  />
                )}
                <ChoiceCard
                  active={path === 'blank'}
                  onClick={() => setPath('blank')}
                  title={t('on.blankBook')}
                  body={t('on.blankBody')}
                  mark={!hasHistory || demoDesk ? t('on.recommended') : undefined}
                />
                <ChoiceCard active={path === 'demo'} onClick={() => setPath('demo')} title={t('on.sampleData')} body={t('on.sampleBody')} />
              </div>
              <dl className="lg:hidden mt-8 divide-y divide-white/[0.05] border-y border-white/[0.05]">
                {[[t('on.row.trader'), traderName.trim()], ...sheetRows.map((r) => [r.label, r.value])].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-6 py-2.5">
                    <dt className="text-[12px] text-dim">{k}</dt>
                    <dd className="text-[13px] font-medium text-right truncate">{v}</dd>
                  </div>
                ))}
              </dl>
            </StepHead>
          )}
        </FlowShell>
      )}
    </div>
  )
}

function Welcome({
  onStart,
  onExistingAccount,
  cloudAvailable,
  onDemo,
  locale,
  onLocale,
}: {
  onStart: () => void
  onExistingAccount: () => void
  cloudAvailable: boolean
  onDemo: () => void
  locale: 'es' | 'en'
  onLocale: (locale: 'es' | 'en') => void
}) {
  const t = useT()
  const reduced = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  )
  const [skip, setSkip] = useState(reduced)
  const stageRef = useRef<HTMLElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)

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

  const onStageMove = (e: React.PointerEvent<HTMLElement>) => {
    const stage = stageRef.current
    if (reduced || !stage) return
    const r = stage.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    stage.style.setProperty('--ry', `${(px * 4).toFixed(2)}deg`)
    stage.style.setProperty('--rx', `${(-py * 3).toFixed(2)}deg`)
    stage.style.setProperty('--mx', `${e.clientX - r.left}px`)
    stage.style.setProperty('--my', `${e.clientY - r.top}px`)
    const card = cardRef.current?.getBoundingClientRect()
    if (card) {
      stage.style.setProperty('--cx', `${e.clientX - card.left}px`)
      stage.style.setProperty('--cy', `${e.clientY - card.top}px`)
    }
  }
  const onStageLeave = () => {
    stageRef.current?.style.setProperty('--rx', '0deg')
    stageRef.current?.style.setProperty('--ry', '0deg')
  }

  let wordIndex = 0
  const headline = [t('on.headline1'), t('on.headline2')]

  const facts = [t('on.fact.local'), t('on.fact.crypto'), t('on.fact.export')]

  return (
    <div className="relative z-10 h-full flex flex-col bg-bg overflow-hidden">
      <div className="absolute inset-0 grain opacity-[0.045] mix-blend-overlay pointer-events-none z-50" />

      <header
        className={clsx(
          'drag-region absolute inset-x-0 top-0 z-40 h-14 pl-6 lg:pl-10 flex items-center justify-between',
          isDesktop() ? 'pr-[156px]' : 'pr-6 lg:pr-10',
          motion('animate-fade-in'),
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
              onClick={() => onLocale(l)}
              className={clsx('relative w-9 h-6 uppercase transition-colors duration-300', locale === l ? 'text-text' : 'text-dim hover:text-muted')}
            >
              {l}
            </button>
          ))}
        </div>
      </header>

      <main
        ref={stageRef}
        onPointerMove={onStageMove}
        onPointerLeave={onStageLeave}
        className="relative h-full flex flex-col overflow-hidden"
      >
        <section className="relative z-20 shrink-0 flex flex-col items-center text-center px-6 pt-[clamp(140px,21vh,220px)]">
          <div className="relative w-full flex flex-col items-center">
            <Horizon className={motion('animate-horizon-rise')} style={at(0)} live={!reduced} />

            <div
              className={clsx(
                'relative inline-flex items-center gap-2 h-8 pl-1.5 pr-3.5 rounded-full border border-white/[0.1] bg-white/[0.04] backdrop-blur-md overflow-hidden',
                'shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_10px_30px_-14px_rgba(0,0,0,0.9)] text-[12px] font-medium text-text-2',
                motion('animate-fade-up'),
              )}
              style={at(520)}
            >
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white/[0.08] text-text">
                <Sparkles size={11} strokeWidth={2.2} />
              </span>
              {t('on.eyebrow')}
              {!reduced && (
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/[0.14] to-transparent animate-sheen [animation-delay:2.2s]"
                />
              )}
            </div>

            <h1
              className="relative mt-[clamp(14px,2.8vh,28px)] text-[clamp(34px,min(7vw,7.6vh),72px)] leading-[1.02] font-semibold tracking-[-0.045em]"
              aria-label={headline.join(' ')}
            >
              {headline.map((line, li) => (
                <span key={li} aria-hidden className="block">
                  {line.split(' ').map((word, wi) => {
                    const delay = 640 + wordIndex++ * 70
                    return (
                      <span key={wi} className="inline-block overflow-hidden align-bottom pb-[0.12em] -mb-[0.12em] mr-[0.22em] last:mr-0">
                        <span
                          className={clsx(
                            'inline-block bg-clip-text text-transparent',
                            li
                              ? 'bg-[linear-gradient(180deg,#d4d4d8_0%,#6b6b75_100%)]'
                              : 'bg-[linear-gradient(180deg,#ffffff_30%,#c8c8cf_100%)]',
                            motion('animate-word-up'),
                          )}
                          style={at(delay)}
                        >
                          {word}
                        </span>
                      </span>
                    )
                  })}
                </span>
              ))}
            </h1>

            <p
              className={clsx('relative mt-[clamp(10px,2.2vh,24px)] max-w-[500px] text-[15.5px] short:text-[14px] leading-[1.6] text-muted', motion('animate-fade-up'))}
              style={at(980)}
            >
              {t('on.lede')}
            </p>

            <div
              className={clsx('relative mt-[clamp(18px,3.6vh,36px)] flex flex-wrap items-center justify-center gap-3', motion('animate-fade-up'))}
              style={at(1100)}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={onStart}
                className={clsx(
                  'group relative inline-flex items-center gap-2.5 h-11 px-5 rounded-[11px] overflow-hidden text-[13.5px] font-semibold text-bg no-drag',
                  'bg-[linear-gradient(180deg,#ffffff_0%,#d4d4d8_100%)]',
                  'shadow-[inset_0_1px_0_#fff,inset_0_-1px_0_rgba(0,0,0,0.14),0_0_0_1px_rgba(255,255,255,0.14),0_12px_40px_-12px_rgba(255,255,255,0.45)]',
                  'transition-[box-shadow,transform,filter] duration-300 hover:brightness-[1.04] hover:shadow-[inset_0_1px_0_#fff,inset_0_-1px_0_rgba(0,0,0,0.14),0_0_0_1px_rgba(255,255,255,0.22),0_16px_56px_-10px_rgba(255,255,255,0.6)] active:scale-[0.985]',
                )}
              >
                {cloudAvailable ? t('on.newDevice') : t('on.start')}
                <ArrowRight size={15} strokeWidth={2.2} className="transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0.5" />
              </button>
              <button
                type="button"
                onClick={onDemo}
                className={clsx(
                  'group inline-flex items-center gap-2 h-11 px-5 rounded-[11px] text-[13.5px] font-medium text-text no-drag',
                  'border border-white/[0.12] bg-white/[0.03] backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]',
                  'transition-[background-color,border-color] duration-300 hover:bg-white/[0.06] hover:border-white/[0.2]',
                )}
              >
                <Play size={12} className="fill-current opacity-70 transition-opacity duration-300 group-hover:opacity-100" />
                {t('on.demo')}
              </button>
            </div>

            <div className={clsx('relative mt-[clamp(10px,2vh,20px)] [@media(max-height:620px)]:hidden', motion('animate-fade-up'))} style={at(1200)} onClick={(e) => e.stopPropagation()}>
              {cloudAvailable ? (
                <button
                  type="button"
                  onClick={onExistingAccount}
                  title={t('on.existingAccountHint')}
                  className="text-[12.5px] text-muted underline decoration-white/[0.15] underline-offset-4 hover:text-text hover:decoration-text transition-colors no-drag"
                >
                  {t('on.existingAccount')}
                </button>
              ) : (
                <p className="flex items-center gap-2 text-[12px] text-dim">
                  {t('on.setupTime')}
                  <kbd className="inline-flex items-center h-5 px-1.5 rounded border border-border-2 bg-surface-2 text-[10px] font-sans text-muted">
                    ↵ Enter
                  </kbd>
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="relative z-10 flex-1 min-h-[88px] mt-[clamp(28px,5vh,56px)]">
          <div
            aria-hidden
            className={clsx(
              'absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 w-[min(760px,85%)] h-[160px] rounded-full bg-white/[0.06] blur-[70px] pointer-events-none',
              !reduced && 'animate-horizon-pulse',
            )}
          />
          <div className="pointer-events-none absolute inset-x-0 -top-28 bottom-0 overflow-hidden pt-28 px-6 flex justify-center">
            <div aria-hidden className="absolute left-1/2 top-[76px] -translate-x-1/2 w-[440px] max-w-[80%] h-8 pointer-events-none">
              {PARTICLES.map(([x, y, d], i) => (
                <span
                  key={i}
                  className={clsx('absolute w-[3px] h-[3px] rounded-full bg-white/80', reduced ? 'opacity-30' : 'animate-twinkle')}
                  style={{ left: `${x}%`, top: y, animationDelay: `${d}ms` }}
                />
              ))}
            </div>

            <div className={clsx('pointer-events-auto relative w-full max-w-[940px] [perspective:2000px]', motion('animate-frame-in'))} style={at(820)}>
              <div
                ref={cardRef}
                className="transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)] origin-top"
                style={{ transform: 'perspective(2000px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))' }}
              >
                <AppFrame live={!reduced} />
              </div>
            </div>

            <div aria-hidden className="absolute inset-x-0 bottom-0 h-[45%] max-h-[190px] bg-gradient-to-t from-bg via-bg/80 to-transparent pointer-events-none" />
            <ul
              className={clsx('absolute inset-x-0 bottom-0 pb-5 short:pb-4 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 px-6 text-[11.5px] text-dim', motion('animate-fade-up'))}
              style={at(1500)}
            >
              {facts.map((f, i) => (
                <li key={f} className="flex items-center gap-5">
                  {i > 0 && <span aria-hidden className="w-1 h-1 rounded-full bg-white/[0.18]" />}
                  <span className="flex items-center gap-1.5">
                    <Check size={11} strokeWidth={2.6} className="text-muted" />
                    {f}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
    </div>
  )
}

const PARTICLES: [x: number, y: number, delay: number][] = [
  [4, 22, 0],
  [17, 6, 1400],
  [29, 26, 700],
  [42, 12, 2100],
  [55, 28, 300],
  [68, 4, 1700],
  [81, 20, 1000],
  [95, 10, 2500],
]

function Horizon({ className, style, live }: { className?: string; style?: React.CSSProperties; live: boolean }) {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-[-344px] -ml-[800px] w-[1600px] h-[780px] overflow-hidden"
      style={{ maskImage: 'radial-gradient(ellipse 540px 380px at 50% 260px, black 30%, transparent 92%)' }}
    >
      <div className={clsx('absolute inset-0', className)} style={style}>
        <div
          className={clsx('absolute left-1/2 top-[260px] -ml-[520px] -mt-[270px] w-[1040px] h-[540px] rounded-full', live && 'animate-horizon-pulse')}
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

const FRAME_NAV = [
  ['nav.dashboard', LayoutDashboard],
  ['nav.trades', ListOrdered],
  ['nav.calendar', CalendarDays],
  ['nav.analytics', BarChart3],
  ['nav.journal', BookOpen],
] as const

function AppFrame({ live }: { live: boolean }) {
  const t = useT()
  return (
    <div className="relative rounded-[22px] p-1.5 border border-white/[0.08] bg-white/[0.025] backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_-24px_80px_-36px_rgba(255,255,255,0.22),0_60px_120px_-40px_rgba(0,0,0,1)]">
      <div aria-hidden className="absolute inset-x-16 -top-px h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />
      <div className="relative rounded-[16px] border border-white/[0.06] bg-[#0b0b0d] overflow-hidden">
        <div className="h-10 flex items-center gap-4 px-4 border-b border-white/[0.05]">
          <span className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="w-2.5 h-2.5 rounded-full bg-white/[0.08]" />
            ))}
          </span>
          <span className="flex items-center gap-2 text-[11.5px] text-dim">
            <BrandMark size={13} />
            Atrium
            <span className="text-white/[0.15]">/</span>
            <span className="text-muted">{t('nav.dashboard')}</span>
          </span>
        </div>
        <div className="grid md:grid-cols-[180px_minmax(0,1fr)]">
          <nav className="hidden md:flex flex-col gap-0.5 p-3 border-r border-white/[0.05]">
            {FRAME_NAV.map(([key, Icon], i) => (
              <span
                key={key}
                className={clsx(
                  'flex items-center gap-2.5 h-8 px-2.5 rounded-[8px] text-[12px]',
                  i === 0 ? 'bg-white/[0.06] text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]' : 'text-dim',
                )}
              >
                <Icon size={13} />
                {t(key)}
              </span>
            ))}
          </nav>
          <LedgerPreview live={live} bare />
        </div>
      </div>
    </div>
  )
}

type PreviewTrade = { id: number; time: string; symbol: string; long: boolean; r: number; pnl: number }

const PREVIEW_SEED: PreviewTrade[] = [
  { id: 5, time: '11:48', symbol: 'NQ', long: true, r: 2.1, pnl: 1260 },
  { id: 4, time: '11:02', symbol: 'EURUSD', long: false, r: -1, pnl: -500 },
  { id: 3, time: '10:31', symbol: 'ES', long: true, r: 1.4, pnl: 705 },
  { id: 2, time: '09:58', symbol: 'CL', long: false, r: 0.8, pnl: 392.5 },
  { id: 1, time: '09:34', symbol: 'BTCUSD', long: true, r: -0.5, pnl: -248 },
]

const PREVIEW_POOL: Omit<PreviewTrade, 'id' | 'time'>[] = [
  { symbol: 'GC', long: true, r: 1.2, pnl: 540 },
  { symbol: 'NQ', long: false, r: -1, pnl: -450 },
  { symbol: 'GBPUSD', long: true, r: 1.8, pnl: 810 },
  { symbol: 'ES', long: true, r: 0.6, pnl: 300 },
  { symbol: 'CL', long: false, r: -0.4, pnl: -180 },
  { symbol: 'DAX', long: false, r: 2.4, pnl: 1080 },
  { symbol: 'AAPL', long: true, r: 0.9, pnl: 405 },
  { symbol: 'NQ', long: true, r: -1, pnl: -450 },
  { symbol: 'BTCUSD', long: false, r: 1.5, pnl: 675 },
  { symbol: 'EURUSD', long: true, r: -0.7, pnl: -315 },
]

const EQ_POINTS = 32
const EQ_STEPS = 4
const PREVIEW_BALANCE = 100000

function wiggle(seed: number) {
  return Math.sin(seed * 12.9898) * 0.5 + Math.sin(seed * 4.1414) * 0.5
}

function equityLeg(from: number, to: number, seed: number) {
  const d = to - from
  return [
    from + d * 0.3 + wiggle(seed) * 140,
    from + d * 0.15 + wiggle(seed + 1) * 160,
    from + d * 0.75 + wiggle(seed + 2) * 120,
    to,
  ]
}

function seedEquity() {
  const pts: number[] = []
  let eq = 0
  for (const tr of [...PREVIEW_SEED].reverse()) {
    pts.push(...equityLeg(eq, eq + tr.pnl, tr.id * 7))
    eq += tr.pnl
  }
  const lead = Array.from({ length: EQ_POINTS - pts.length }, (_, i) => wiggle(i + 100) * 60)
  return [...lead, ...pts]
}

function fmtClock(minutes: number) {
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function useTween(target: number, ms: number, enabled: boolean, delay = 0) {
  const [value, setValue] = useState(enabled ? 0 : target)
  const current = useRef(value)
  const mountedAt = useRef(performance.now())
  useEffect(() => {
    if (!enabled) {
      current.current = target
      setValue(target)
      return
    }
    let raf = 0
    const from = current.current
    const wait = Math.max(0, delay - (performance.now() - mountedAt.current))
    const timer = window.setTimeout(() => {
      const start = performance.now()
      const tick = (now: number) => {
        const p = Math.min(1, (now - start) / ms)
        const v = from + (target - from) * (1 - Math.pow(1 - p, 4))
        current.current = v
        setValue(v)
        if (p < 1) raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
    }, wait)
    return () => {
      window.clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [target, ms, enabled, delay])
  return value
}

function LedgerPreview({ live, bare }: { live: boolean; bare?: boolean }) {
  const t = useT()
  const [state, setState] = useState(() => ({
    trades: PREVIEW_SEED,
    all: PREVIEW_SEED as PreviewTrade[],
    series: seedEquity(),
    clock: 11 * 60 + 48,
    next: 0,
  }))

  useEffect(() => {
    if (!live) return
    let interval = 0
    const start = window.setTimeout(() => {
      interval = window.setInterval(() => {
        setState((s) => {
          const base = PREVIEW_POOL[s.next % PREVIEW_POOL.length]
          const clock = s.clock + 9 + ((s.next * 7) % 19)
          const trade: PreviewTrade = { ...base, id: 100 + s.next, time: fmtClock(clock) }
          const last = s.series[s.series.length - 1]
          const leg = equityLeg(last, last + trade.pnl, trade.id * 3)
          return {
            trades: [trade, ...s.trades].slice(0, 6),
            all: [trade, ...s.all],
            series: [...s.series, ...leg].slice(-EQ_POINTS),
            clock,
            next: s.next + 1,
          }
        })
      }, 3600)
    }, 3400)
    return () => {
      window.clearTimeout(start)
      window.clearInterval(interval)
    }
  }, [live])

  const total = state.all.reduce((a, tr) => a + tr.pnl, 0)
  const wins = state.all.filter((tr) => tr.pnl > 0)
  const grossWin = wins.reduce((a, tr) => a + tr.pnl, 0)
  const grossLoss = Math.abs(state.all.filter((tr) => tr.pnl < 0).reduce((a, tr) => a + tr.pnl, 0))
  const winRate = (wins.length / state.all.length) * 100
  const pf = grossLoss ? grossWin / grossLoss : 0
  const avgR = state.all.reduce((a, tr) => a + tr.r, 0) / state.all.length
  const shown = useTween(total, 1100, live, 900)

  const w = 460
  const h = 120
  const min = Math.min(...state.series)
  const max = Math.max(...state.series)
  const span = max - min || 1
  const plotW = w - 18
  const pts = state.series.map((v, i) => [(i / (EQ_POINTS - 1)) * plotW, h - 10 - ((v - min) / span) * (h - 26)] as const)
  const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const area = `${line} L${plotW} ${h} L0 ${h} Z`
  const [endX, endY] = pts[pts.length - 1]
  const morph = { transition: 'd 1.1s cubic-bezier(0.22, 1, 0.36, 1)' }

  const stats = [
    ['on.preview.winRate', fmtPct(winRate, 0)],
    ['on.preview.pf', fmtNum(pf, 2)],
    ['on.preview.avgR', fmtR(avgR)],
  ] as const

  return (
    <div
      className={clsx(
        'group/card relative overflow-hidden',
        !bare &&
          'rounded-[16px] border border-white/[0.08] bg-[#0f0f12] shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,0_50px_100px_-40px_rgba(0,0,0,0.95),0_0_0_1px_rgba(0,0,0,0.6)]',
      )}
    >
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-0 group-hover/card:opacity-100 transition-opacity duration-700"
        style={{ background: 'radial-gradient(420px circle at var(--cx, 50%) var(--cy, 0%), rgba(255,255,255,0.06), transparent 60%)' }}
      />
      {!bare && <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />}

      <div className="relative px-6 pt-5 pb-3 short:pt-4 flex items-start justify-between gap-6">
        <div>
          <p className="text-[12px] text-dim">{t('on.preview.account')}</p>
          <p
            className={clsx(
              'mt-1.5 text-[30px] short:text-[26px] font-medium tracking-[-0.035em] num leading-none transition-colors duration-500',
              shown < 0 ? 'text-loss' : 'text-text',
            )}
          >
            {fmtMoney(shown, 'USD', { sign: true, decimals: 2 })}
          </p>
        </div>
        <div className="text-right">
          <p className="flex items-center justify-end gap-2 text-[12px] text-dim">
            <span className="relative flex w-1.5 h-1.5">
              {live && <span className="absolute inset-0 rounded-full bg-accent animate-ping-soft" />}
              <span className="relative w-1.5 h-1.5 rounded-full bg-accent" />
            </span>
            {t('on.preview.period')}
          </p>
          <p className={clsx('mt-1.5 text-[13px] font-medium num', shown < 0 ? 'text-loss' : 'text-accent')}>
            {fmtPct(shown / (PREVIEW_BALANCE / 100), 2, { sign: true })}
          </p>
        </div>
      </div>

      <div className="relative h-[124px] short:h-[88px]">
        <svg viewBox={`0 0 ${w} ${h}`} className="absolute inset-0 w-full h-full" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="ledger-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4ade80" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#4ade80" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="ledger-stroke" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#4ade80" stopOpacity="0.15" />
              <stop offset="35%" stopColor="#4ade80" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#4ade80" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={w} y1={h * f} y2={h * f} stroke="rgba(255,255,255,0.04)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          ))}
          <path
            d={area}
            fill="url(#ledger-fill)"
            className={live ? 'animate-fade-in' : undefined}
            style={{ ...morph, d: `path('${area}')`, animationDelay: '1.2s', animationDuration: '1.2s' } as React.CSSProperties}
          />
          <path
            d={line}
            fill="none"
            stroke="url(#ledger-stroke)"
            strokeWidth="1.75"
            strokeLinejoin="round"
            strokeLinecap="round"
            pathLength={320}
            strokeDasharray={320}
            className={live ? 'animate-draw' : undefined}
            style={{ ...morph, d: `path('${line}')`, animationDelay: '700ms', animationDuration: '2s' } as React.CSSProperties}
          />
        </svg>
        <span
          aria-hidden
          className={clsx('absolute w-0 h-0', live && 'animate-fade-in')}
          style={{
            left: `${(endX / w) * 100}%`,
            top: `${(endY / h) * 100}%`,
            transition: 'top 1.1s cubic-bezier(0.22, 1, 0.36, 1)',
            animationDelay: '2.4s',
          }}
        >
          {live && <span className="absolute -left-[5px] -top-[5px] w-2.5 h-2.5 rounded-full bg-accent/60 animate-ping-soft" />}
          <span className="absolute -left-[3.5px] -top-[3.5px] w-[7px] h-[7px] rounded-full bg-accent shadow-[0_0_12px_2px_rgba(74,222,128,0.55)]" />
        </span>
      </div>

      <dl className="relative grid grid-cols-3 border-y border-white/[0.06]">
        {stats.map(([k, v], i) => (
          <div key={k} className={clsx('px-6 py-3.5 short:py-2.5', i > 0 && 'border-l border-white/[0.06]')}>
            <dt className="text-[11px] text-dim">{t(k)}</dt>
            <dd key={v} className={clsx('mt-1 text-[14px] font-medium num', live && 'animate-ticker')}>
              {v}
            </dd>
          </div>
        ))}
      </dl>

      <div className="relative [--row:36px] short:[--row:31px]">
        <div className="grid grid-cols-[56px_minmax(0,1fr)_64px_68px_104px] items-center px-6 h-9 short:h-8 text-[11px] text-dim">
          <span />
          <span>{t('on.preview.symbol')}</span>
          <span>{t('on.preview.side')}</span>
          <span className="text-right">R</span>
          <span className="text-right">{t('on.preview.result')}</span>
        </div>
        <div className="relative overflow-hidden" style={{ height: 'calc(var(--row) * 5)' }}>
          {state.trades.map((tr, i) => {
            const seeded = tr.id < 100
            return (
              <div
                key={tr.id}
                className="absolute inset-x-0 transition-[top,opacity] duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
                style={{ top: `calc(var(--row) * ${i})`, height: 'var(--row)', opacity: i >= 5 ? 0 : 1 }}
              >
                <div
                  className={clsx(
                    'h-full grid grid-cols-[56px_minmax(0,1fr)_64px_68px_104px] items-center px-6 border-t border-white/[0.04] text-[12.5px]',
                    live && (seeded ? 'animate-fade-up' : 'animate-row-in'),
                  )}
                  style={live && seeded ? { animationDelay: `${900 + (4 - (tr.id - 1)) * 90}ms` } : undefined}
                >
                  <span className="text-dim num">{tr.time}</span>
                  <span className="font-medium truncate">{tr.symbol}</span>
                  <span className="text-muted">{t(tr.long ? 'on.preview.long' : 'on.preview.short')}</span>
                  <span className="text-right num text-muted">{fmtR(tr.r)}</span>
                  <span className={clsx('text-right num font-medium', tr.pnl >= 0 ? 'text-accent' : 'text-loss')}>
                    {fmtMoney(tr.pnl, 'USD', { sign: true, decimals: 2 })}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <p className="relative px-6 py-3 short:py-2.5 border-t border-white/[0.05] text-[11px] text-dim flex items-center justify-between">
        <span>{t('on.preview.note')}</span>
        <span className="num">{t('on.preview.count', { n: state.all.length })}</span>
      </p>
    </div>
  )
}

const EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]'

function FlowShell({
  steps,
  index = 0,
  stepKey,
  dir = 1,
  aside,
  footer,
  children,
}: {
  steps?: string[]
  index?: number
  stepKey?: string
  dir?: 1 | -1
  aside?: ReactNode
  footer: ReactNode
  children: ReactNode
}) {
  const t = useT()
  return (
    <div className="relative z-10 h-full flex flex-col bg-bg">
      <div className="absolute inset-0 grain opacity-[0.045] mix-blend-overlay pointer-events-none z-50" />
      <header
        className={clsx(
          'drag-region relative h-12 shrink-0 pl-6 lg:pl-10 flex items-center gap-5 border-b border-white/[0.05]',
          isDesktop() ? 'pr-[156px]' : 'pr-6 lg:pr-10',
        )}
      >
        <div className="flex items-center gap-3">
          <BrandMark size={20} />
          <span className="text-[13px] font-semibold tracking-[-0.01em]">Atrium</span>
        </div>
        {steps && (
          <>
            <span className="h-3 w-px bg-border-2" />
            <ol className="hidden md:flex items-center gap-5 text-[12px]">
              {steps.map((label, i) => (
                <li
                  key={label}
                  className={clsx(
                    'flex items-center gap-2 transition-colors duration-500',
                    i === index ? 'text-text' : i < index ? 'text-muted' : 'text-dim',
                  )}
                >
                  <span
                    className={clsx(
                      'w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] num border transition-all duration-500',
                      i === index ? 'border-text' : i < index ? 'border-transparent bg-white/[0.1]' : 'border-white/[0.12]',
                    )}
                  >
                    {i < index ? <Check size={10} strokeWidth={3} /> : i + 1}
                  </span>
                  {label}
                </li>
              ))}
            </ol>
            <span className="md:hidden text-[12px] text-dim">{t('on.stepOf', { n: index + 1, total: steps.length })}</span>
            <span
              aria-hidden
              className={clsx('absolute left-0 -bottom-px h-px bg-accent transition-[width] duration-700', EASE)}
              style={{ width: `${((index + 1) / steps.length) * 100}%` }}
            />
          </>
        )}
      </header>

      <main className={clsx('relative flex-1 min-h-0 grid', aside && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,0.82fr)]')}>
        <section className="min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_bottom,transparent,black_28px,black_calc(100%-40px),transparent)]">
            <div className="min-h-full flex flex-col justify-center px-6 lg:px-10 xl:px-16 py-10 short:py-7">
              <div key={stepKey} className={clsx('w-full max-w-[540px]', dir === 1 ? 'animate-step-fwd' : 'animate-step-back')}>
                {children}
              </div>
            </div>
          </div>
          <footer className="shrink-0 h-[68px] border-t border-white/[0.05] px-6 lg:px-10 xl:px-16 flex items-center justify-between">
            {footer}
          </footer>
        </section>
        {aside && (
          <aside className="hidden lg:flex relative min-h-0 items-center justify-center border-l border-white/[0.05] bg-[#0a0a0c] px-10 xl:px-14 py-8 overflow-hidden">
            <div
              aria-hidden
              className="absolute inset-0 pointer-events-none"
              style={{
                backgroundImage: 'linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)',
                backgroundSize: '100% 40px',
                maskImage: 'radial-gradient(ellipse 70% 60% at 50% 50%, black, transparent)',
              }}
            />
            <div aria-hidden className="absolute w-[380px] h-[260px] rounded-full bg-accent/[0.05] blur-[110px] pointer-events-none animate-glow-breathe" />
            {aside}
          </aside>
        )}
      </main>
    </div>
  )
}

function StepHead({
  eyebrow,
  index,
  title,
  copy,
  children,
}: {
  eyebrow: string
  index?: number
  title: string
  copy: string
  children: ReactNode
}) {
  return (
    <div>
      <p className="flex items-center gap-2.5 text-[12px] text-dim animate-fade-up">
        {index && <span className="num text-muted">{String(index).padStart(2, '0')}</span>}
        {index && <span className="h-px w-6 bg-white/[0.15]" />}
        {eyebrow}
      </p>
      <h2
        className="mt-5 short:mt-4 text-[34px] xl:text-[40px] short:text-[30px] leading-[1.06] font-medium tracking-[-0.04em] animate-fade-up"
        style={{ animationDelay: '60ms' }}
      >
        {title}
      </h2>
      <p className="mt-3.5 text-[14.5px] text-muted leading-relaxed max-w-[450px] animate-fade-up" style={{ animationDelay: '120ms' }}>
        {copy}
      </p>
      <div className="mt-9 short:mt-7 animate-fade-up" style={{ animationDelay: '180ms' }}>
        {children}
      </div>
    </div>
  )
}

type SheetRow = { step: FlowStep; label: string; value: string }

function AccountSheet({
  name,
  accountName,
  typeLabel,
  rows,
  current,
  flow,
  lossesToCap,
  showStreak,
}: {
  name: string
  accountName: string
  typeLabel: string
  rows: SheetRow[]
  current: FlowStep
  flow: readonly FlowStep[]
  lossesToCap: number | null
  showStreak: boolean
}) {
  const t = useT()
  const currentIndex = flow.indexOf(current)
  const segments = lossesToCap === null ? 0 : Math.min(lossesToCap, 20)
  return (
    <div className="relative w-full max-w-[400px] animate-card-in [animation-delay:120ms]">
      <div className="relative rounded-[18px] border border-white/[0.08] bg-[#0f0f12] shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,0_50px_100px_-40px_rgba(0,0,0,0.95)] overflow-hidden">
        <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        <div className="px-6 pt-5 flex items-center justify-between">
          <span className="flex items-center gap-2 text-[11px] text-dim">
            <BrandMark size={16} />
            {t('on.sheet.title')}
          </span>
          <span key={typeLabel} className="text-[11px] px-2 py-0.5 rounded-[6px] border border-white/[0.1] text-muted animate-fade-in">
            {typeLabel}
          </span>
        </div>
        <div className="px-6 pt-6 pb-5 short:pt-4 short:pb-4">
          <p className={clsx('text-[26px] short:text-[23px] font-medium tracking-[-0.035em] truncate transition-colors duration-300', name ? 'text-text' : 'text-white/[0.14]')}>
            {name || t('on.sheet.namePlaceholder')}
            {current === 'profile' && <span className="inline-block w-[2px] h-[0.9em] ml-1 align-[-0.1em] bg-accent animate-glow-breathe [animation-duration:1.1s]" />}
          </p>
          <p className="mt-1 text-[13px] text-muted truncate">{accountName}</p>
        </div>
        <dl className="border-t border-white/[0.06] py-1.5">
          {rows.map((row) => {
            const i = flow.indexOf(row.step)
            const active = row.step === current
            return (
              <div
                key={row.label}
                className={clsx(
                  'relative flex items-baseline justify-between gap-6 px-6 py-2 short:py-[7px] transition-opacity duration-500',
                  i > currentIndex ? 'opacity-30' : 'opacity-100',
                )}
              >
                <span
                  aria-hidden
                  className={clsx('absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r bg-accent origin-center transition-transform duration-500', EASE, active ? 'scale-y-100' : 'scale-y-0')}
                />
                <dt className={clsx('text-[12px] transition-colors duration-500', active ? 'text-muted' : 'text-dim')}>{row.label}</dt>
                <dd key={row.value} className="text-[13px] font-medium text-right truncate num animate-ticker">
                  {row.value}
                </dd>
              </div>
            )
          })}
        </dl>
        <div
          className={clsx(
            'grid transition-[grid-template-rows,opacity] duration-700',
            EASE,
            showStreak ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
          )}
        >
          <div className="overflow-hidden">
            <div className="border-t border-white/[0.06] px-6 py-4 short:py-3.5">
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="text-dim">{t('on.sheet.streak')}</span>
                {lossesToCap !== null && <span className="num text-muted">{lossesToCap}R</span>}
              </div>
              {lossesToCap !== null ? (
                <>
                  <div className="mt-2.5 flex gap-1 h-1.5">
                    {Array.from({ length: Math.max(segments, 1) }, (_, i) => (
                      <span
                        key={`${segments}-${i}`}
                        className={clsx('flex-1 rounded-full animate-soft-pop', segments ? 'bg-loss/70' : 'bg-white/[0.08]')}
                        style={{ animationDelay: `${i * 35}ms` }}
                      />
                    ))}
                  </div>
                  <p className="mt-2.5 text-[11.5px] text-dim leading-relaxed">{t('on.sheet.streakHint', { n: lossesToCap })}</p>
                </>
              ) : (
                <p className="mt-2 text-[11.5px] text-dim leading-relaxed">{t('on.sheet.streakNone')}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PrimaryButton({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="group relative inline-flex items-center gap-3.5 h-11 pl-5 pr-2 rounded-[10px] bg-text text-bg text-[13.5px] font-semibold transition-[background-color,box-shadow,transform,opacity] duration-300 enabled:hover:bg-white enabled:hover:shadow-[0_10px_40px_-12px_rgba(255,255,255,0.35)] enabled:active:scale-[0.985] disabled:opacity-30 no-drag"
    >
      {children}
      <span className="relative inline-flex items-center justify-center h-7 w-7 rounded-[7px] bg-bg text-text overflow-hidden">
        <ArrowRight
          size={14}
          strokeWidth={2.2}
          className={clsx('absolute transition-transform duration-500 group-enabled:group-hover:translate-x-[190%]', EASE)}
        />
        <ArrowRight
          size={14}
          strokeWidth={2.2}
          className={clsx('absolute -translate-x-[190%] transition-transform duration-500 group-enabled:group-hover:translate-x-0', EASE)}
        />
      </span>
    </button>
  )
}

function FieldLabel({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-2.5 min-h-5">
      <span className="text-[12px] text-muted">{children}</span>
      {aside && <span className="text-[12px]">{aside}</span>}
    </div>
  )
}

function TextBox({
  value,
  onChange,
  placeholder,
  suffix,
  mono,
  password,
  compact,
  trailing,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  suffix?: string
  mono?: boolean
  password?: boolean
  compact?: boolean
  trailing?: ReactNode
}) {
  return (
    <div
      className={clsx(
        'flex items-center rounded-[10px] border border-white/[0.08] bg-white/[0.02] transition-[border-color,background-color,box-shadow] duration-300',
        'hover:border-white/[0.14] focus-within:border-white/[0.28] focus-within:bg-white/[0.035] focus-within:shadow-[0_0_0_4px_rgba(255,255,255,0.03)]',
        compact ? 'h-10' : 'h-11',
      )}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        type={password ? 'password' : 'text'}
        autoComplete={password ? 'new-password' : 'off'}
        inputMode={mono ? 'decimal' : undefined}
        className={clsx('flex-1 min-w-0 h-full bg-transparent px-3.5 text-[14px] outline-none placeholder:text-dim/60', mono && 'num')}
      />
      {suffix && <span className="pr-3.5 text-[12px] text-dim select-none">{suffix}</span>}
      {trailing}
    </div>
  )
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ReactNode }[]
  value: T
  onChange: (v: T) => void
}) {
  const idx = options.findIndex((o) => o.value === value)
  return (
    <div
      role="radiogroup"
      className="relative grid h-10 rounded-[10px] border border-white/[0.06] bg-white/[0.025] p-1"
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      <span
        aria-hidden
        className={clsx(
          'absolute top-1 bottom-1 left-1 rounded-[7px] bg-white/[0.09] shadow-[0_1px_0_0_rgba(255,255,255,0.07)_inset,0_1px_3px_rgba(0,0,0,0.5)] transition-[transform,opacity] duration-500',
          EASE,
          idx < 0 && 'opacity-0',
        )}
        style={{ width: `calc((100% - 8px) / ${options.length})`, transform: `translateX(${Math.max(idx, 0) * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={clsx(
            'relative z-10 px-2 text-[12.5px] font-medium truncate transition-colors duration-300 num',
            o.value === value ? 'text-text' : 'text-dim hover:text-muted',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={clsx('relative w-9 h-5 rounded-full transition-colors duration-300', on ? 'bg-accent' : 'bg-white/[0.12]')}
    >
      <span
        className={clsx(
          'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-transform duration-300',
          EASE,
          on && 'translate-x-4',
        )}
      />
    </button>
  )
}

function Checkbox({ on }: { on: boolean }) {
  return (
    <span
      className={clsx(
        'w-[18px] h-[18px] rounded-[6px] border flex items-center justify-center shrink-0 transition-colors duration-300',
        on ? 'border-text bg-text text-bg' : 'border-white/[0.18]',
      )}
    >
      <Check size={11} strokeWidth={3} className={clsx('transition-transform duration-300', EASE, on ? 'scale-100' : 'scale-0')} />
    </span>
  )
}

function Radio({ on }: { on: boolean }) {
  return (
    <span
      className={clsx(
        'mt-0.5 w-[18px] h-[18px] rounded-full border flex items-center justify-center shrink-0 transition-colors duration-300',
        on ? 'border-text' : 'border-white/[0.18]',
      )}
    >
      <span className={clsx('w-2 h-2 rounded-full bg-text transition-transform duration-300', EASE, on ? 'scale-100' : 'scale-0')} />
    </span>
  )
}

function ChoiceCard({
  active,
  onClick,
  disabled,
  icon: Icon,
  title,
  body,
  mark,
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  icon?: typeof Shield
  title: string
  body: string
  mark?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={clsx(
        'group w-full text-left rounded-[12px] border px-4 py-3.5 short:py-3 transition-[border-color,background-color] duration-300',
        active ? 'border-white/[0.2] bg-white/[0.045]' : 'border-white/[0.07] enabled:hover:border-white/[0.14] enabled:hover:bg-white/[0.02]',
        disabled && 'opacity-40 cursor-not-allowed',
      )}
    >
      <div className="flex items-start gap-3.5">
        {Icon && (
          <span
            className={clsx(
              'w-9 h-9 rounded-[9px] flex items-center justify-center shrink-0 transition-colors duration-300',
              active ? 'bg-text text-bg' : 'bg-white/[0.05] text-muted',
            )}
          >
            <Icon size={16} />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-medium">{title}</span>
            {mark && <span className="text-[10.5px] font-medium text-accent bg-accent/10 px-1.5 py-px rounded-[5px]">{mark}</span>}
          </div>
          <p className="text-[12.5px] text-muted mt-1 leading-relaxed">{body}</p>
        </div>
        <Radio on={active} />
      </div>
    </button>
  )
}

function passwordScore(pw: string) {
  if (!pw) return 0
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++
  return s
}

function PasswordFields({
  password,
  confirm,
  onPassword,
  onConfirm,
}: {
  password: string
  confirm: string
  onPassword: (v: string) => void
  onConfirm: (v: string) => void
}) {
  const t = useT()
  const [show, setShow] = useState(false)
  const score = passwordScore(password)
  const colors = ['bg-loss', 'bg-loss', 'bg-amber', 'bg-accent', 'bg-accent']
  const toggle = (
    <button
      type="button"
      onClick={() => setShow((v) => !v)}
      className="h-full px-3 text-dim hover:text-text transition-colors"
      aria-label={show ? t('on.pw.hide') : t('on.pw.show')}
    >
      {show ? <EyeOff size={15} /> : <Eye size={15} />}
    </button>
  )
  return (
    <div className="flex flex-col gap-5">
      <div>
        <FieldLabel aside={password && <span className="text-dim">{t(`on.pw.${score}` as MessageKey)}</span>}>{t('crypto.choosePassword')}</FieldLabel>
        <TextBox value={password} onChange={onPassword} placeholder="••••••••" password={!show} trailing={toggle} />
        <div className="mt-2.5 grid grid-cols-4 gap-1 h-1">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="rounded-full bg-white/[0.07] overflow-hidden">
              <span
                className={clsx('block h-full rounded-full origin-left transition-transform duration-500', EASE, colors[score], i < score ? 'scale-x-100' : 'scale-x-0')}
              />
            </span>
          ))}
        </div>
        {password && password.length < 8 && <p className="mt-2 text-[12px] text-dim">{t('crypto.passwordMin')}</p>}
      </div>
      <div>
        <FieldLabel
          aside={
            confirm &&
            (password === confirm ? (
              <Check size={13} strokeWidth={2.6} className="text-accent animate-soft-pop" />
            ) : (
              <span className="text-loss">{t('crypto.passwordMismatch')}</span>
            ))
          }
        >
          {t('crypto.confirmPassword')}
        </FieldLabel>
        <TextBox value={confirm} onChange={onConfirm} placeholder="••••••••" password={!show} />
      </div>
    </div>
  )
}

function Assemble({
  name,
  done,
  demo,
  keys,
}: {
  name: string
  done: number
  demo: boolean
  keys: readonly AssembleKey[]
}) {
  const t = useT()
  return (
    <div className="relative z-10 h-full flex flex-col items-center justify-center px-8 bg-bg">
      <div className="absolute inset-0 grain opacity-[0.045] mix-blend-overlay pointer-events-none" />
      <div aria-hidden className="absolute w-[420px] h-[300px] rounded-full bg-accent/[0.06] blur-[120px] pointer-events-none animate-glow-breathe" />
      <div className="drag-region absolute inset-x-0 top-0 h-12" />

      <div className="relative w-[68px] h-[68px] animate-fade-up">
        <span
          aria-hidden
          className="absolute inset-0 rounded-full animate-spin [animation-duration:1.8s]"
          style={{ background: 'conic-gradient(from 0deg, transparent 0 55%, rgba(74,222,128,0.95) 100%)' }}
        />
        <span className="absolute inset-[1.5px] rounded-full bg-bg flex items-center justify-center">
          <BrandMark size={40} />
        </span>
      </div>

      <h2 className="relative mt-10 text-[26px] font-medium tracking-[-0.035em] animate-fade-up" style={{ animationDelay: '100ms' }}>
        {t('on.preparing', { name })}
      </h2>
      <p className="relative mt-2 text-[13.5px] text-muted animate-fade-up" style={{ animationDelay: '160ms' }}>
        {demo ? t('on.loadingDemo') : t('on.applying')}
      </p>

      <div className="relative mt-10 w-full max-w-[280px] animate-fade-up" style={{ animationDelay: '220ms' }}>
        <div className="h-px bg-white/[0.08] overflow-hidden">
          <div
            className={clsx('h-full bg-accent transition-[width] duration-500', EASE)}
            style={{ width: `${(done / keys.length) * 100}%` }}
          />
        </div>
        <ul className="mt-5 flex flex-col gap-2.5">
          {keys.map((key, i) => {
            const on = done > i
            return (
              <li key={key} className="flex items-center justify-between text-[13px]">
                <span className={clsx('transition-colors duration-300', on ? 'text-text' : i === done ? 'text-muted' : 'text-dim')}>{t(key)}</span>
                <span className="w-4 h-4 flex items-center justify-center">
                  {on ? (
                    <Check size={13} strokeWidth={2.6} className="text-accent animate-soft-pop" />
                  ) : i === done ? (
                    <span className="w-3 h-3 rounded-full border border-white/[0.18] border-t-text animate-spin" />
                  ) : (
                    <span className="w-1 h-1 rounded-full bg-white/[0.18]" />
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}
