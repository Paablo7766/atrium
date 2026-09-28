import { useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react'
import { clsx } from 'clsx'
import { ChevronDown, Menu as MenuIcon, MessageSquare, Plus, Search, X } from 'lucide-react'
import { useStore, type Page } from '@/store'
import { useActivePage } from '@/lib/useActivePage'
import { useGoToPage } from '@/lib/useGoToPage'
import { BrandMark } from '@/components/BrandMark'
import { AvatarPhoto, traderInitials } from '@/components/Avatar'
import { Menu, menuRowClass } from '@/components/ui'
import { computeStats } from '@/lib/stats'
import { accountEquity } from '@/lib/capital'
import { fmtMoney } from '@/lib/format'
import { ACCOUNT_COLORS, type AccountBook, type Cashflow, type Currency, type Trade } from '@/types'
import { useT } from '@/lib/useI18n'
import { isDesktop } from '@/lib/db/client'

const NEW_TRADE_CLS =
  'bg-[linear-gradient(180deg,#f4f4f5_0%,#d4d4d8_100%)] text-black shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_1px_1px_rgba(0,0,0,0.28)] hover:brightness-[1.04] active:scale-[0.98] transition-[filter,transform] duration-150'

const ICON_BTN =
  'h-7 w-7 rounded-md flex items-center justify-center text-dim hover:text-text hover:bg-white/[0.05] transition-colors'

const NAV_IDS: { id: Page; key: 'nav.dashboard' | 'nav.trades' | 'nav.calendar' | 'nav.analytics' | 'nav.journal' }[] = [
  { id: 'dashboard', key: 'nav.dashboard' },
  { id: 'trades', key: 'nav.trades' },
  { id: 'calendar', key: 'nav.calendar' },
  { id: 'analytics', key: 'nav.analytics' },
  { id: 'journal', key: 'nav.journal' },
]

function useMinWidth(px: number) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(`(min-width: ${px}px)`).matches : true,
  )
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${px}px)`)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [px])
  return matches
}

function swatchFor(color: string | undefined) {
  return ACCOUNT_COLORS.find((c) => c.value === (color ?? 'green'))?.swatch
}

export function AppBar() {
  const page = useActivePage()
  const goToPage = useGoToPage()
  const openTradeModal = useStore((s) => s.openTradeModal)
  const setTradesQuery = useStore((s) => s.setTradesQuery)
  const trades = useStore((s) => s.trades)
  const settings = useStore((s) => s.settings)
  const accounts = useStore((s) => s.accounts)
  const cashflows = useStore((s) => s.cashflows)
  const switchAccount = useStore((s) => s.switchAccount)
  const openFeedback = useStore((s) => s.openFeedback)
  const toast = useStore((s) => s.toast)
  const t = useT()
  const wide = useMinWidth(900)
  const labeled = useMinWidth(1024)
  const roomy = useMinWidth(1200)
  const showTradeLabel = isDesktop() ? roomy : labeled
  const [q, setQ] = useState('')
  const [accOpen, setAccOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const accRef = useRef<HTMLButtonElement>(null)
  const pendingSearchFocus = useRef(false)

  const stats = useMemo(() => computeStats(trades, settings.startingBalance, cashflows), [trades, settings.startingBalance, cashflows])
  const equity = accountEquity(settings.startingBalance, trades, cashflows)
  const invested = equity - stats.netPnl
  const pct = invested ? (stats.netPnl / invested) * 100 : 0
  const initials = traderInitials(settings.traderName)
  const activeColor = accounts.find((a) => a.id === settings.activeAccountId)?.color

  const goTo = (id: Page) => {
    setMenuOpen(false)
    setAccOpen(false)
    goToPage(id)
  }

  const search = (e: FormEvent) => {
    e.preventDefault()
    setTradesQuery(q.trim())
    goTo('trades')
  }

  const clearSearch = () => {
    setQ('')
    setTradesQuery('')
    searchRef.current?.focus()
  }

  useEffect(() => {
    if (wide) setMenuOpen(false)
  }, [wide])

  useEffect(() => {
    if (!menuOpen || !pendingSearchFocus.current) return
    pendingSearchFocus.current = false
    searchRef.current?.focus()
  }, [menuOpen])

  useEffect(() => {
    const onFocus = () => {
      if (window.innerWidth < 900 && !searchRef.current) {
        pendingSearchFocus.current = true
        setMenuOpen(true)
        return
      }
      searchRef.current?.focus()
    }
    window.addEventListener('atrium:focus-search', onFocus)
    return () => window.removeEventListener('atrium:focus-search', onFocus)
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const links = (
    <>
      {NAV_IDS.map((item) => {
        const active = page === item.id
        return (
          <button
            key={item.id}
            type="button"
            data-page={item.id}
            onClick={() => goTo(item.id)}
            className={clsx(
              'relative h-12 shrink-0 px-2.5 inline-flex items-center text-[13px] font-medium tracking-tight transition-colors',
              active ? 'text-text' : 'text-muted hover:text-text',
            )}
            aria-current={active ? 'page' : undefined}
          >
            {t(item.key)}
            {active && (
              <span className="absolute inset-x-2.5 bottom-0 h-0.5 rounded-full bg-text shadow-[0_0_8px_rgba(255,255,255,0.45)]" />
            )}
          </button>
        )
      })}
    </>
  )

  return (
    <>
      <header
        className={clsx(
          'drag-region relative sticky top-0 z-40 grid h-12 shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center border-b border-white/[0.06] bg-bg',
          isDesktop() ? 'pr-[148px]' : 'pr-3',
        )}
      >
        <div className="no-drag flex items-center gap-2.5 pl-4 min-w-0">
          <button type="button" onClick={() => goTo('dashboard')} className="flex items-center gap-2 min-w-0 rounded-md">
            <BrandMark size={20} className="shadow-[0_0_16px_-8px_rgba(255,255,255,0.35)]" />
            <span className="text-[13px] font-semibold tracking-tight leading-none">Atrium</span>
          </button>
        </div>

        {wide ? (
          <div className="min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <nav data-tour="nav" className="no-drag mx-auto flex h-12 w-max items-stretch gap-1">
              {links}
            </nav>
          </div>
        ) : (
          <div />
        )}

        <div className="no-drag flex items-center gap-2 pr-1.5">
          <div className="flex items-center gap-1">
            {wide ? (
              <SearchField inputRef={searchRef} q={q} setQ={setQ} onSubmit={search} onClear={clearSearch} compact={!showTradeLabel} />
            ) : (
              <button
                type="button"
                title={t('nav.searchTrade')}
                onClick={() => {
                  if (searchRef.current) {
                    searchRef.current.focus()
                    return
                  }
                  pendingSearchFocus.current = true
                  setMenuOpen(true)
                }}
                className={ICON_BTN}
              >
                <Search size={14} />
              </button>
            )}

            <button
              data-tour="new-trade"
              type="button"
              title={t('nav.newTrade')}
              onClick={() => openTradeModal()}
              className={clsx(
                'h-7 rounded-md text-[12px] font-semibold flex items-center justify-center gap-1 whitespace-nowrap',
                showTradeLabel ? 'px-2.5' : 'w-7',
                NEW_TRADE_CLS,
              )}
            >
              <Plus size={13} strokeWidth={2.5} />
              {showTradeLabel && <span>{t('nav.newTrade')}</span>}
            </button>
          </div>

          {wide && (
            <>
              <span className="h-3.5 w-px bg-white/[0.08]" aria-hidden />
              <div className="flex items-center gap-0.5">
                <AccountSwitcher
                  compact={!showTradeLabel}
                  accRef={accRef}
                  accOpen={accOpen}
                  setAccOpen={setAccOpen}
                  accountName={settings.accountName}
                  currency={settings.currency}
                  activeAccountId={settings.activeAccountId}
                  activeColor={activeColor}
                  equity={equity}
                  pct={pct}
                  netPnl={stats.netPnl}
                  accounts={accounts}
                  trades={trades}
                  cashflows={cashflows}
                  onSwitch={(id, name) => {
                    if (id !== settings.activeAccountId) toast(t('nav.accountToast', { name }), 'info')
                    switchAccount(id)
                    setAccOpen(false)
                  }}
                />

                <button
                  type="button"
                  data-page="settings"
                  title={settings.traderName ? `${settings.traderName} · ${t('nav.accountSettings')}` : t('nav.settings')}
                  onClick={() => goTo('settings')}
                  className={clsx(
                    'h-7 w-7 rounded-full flex items-center justify-center transition-shadow',
                    page === 'settings' ? 'ring-1 ring-white/50' : 'hover:ring-1 hover:ring-white/15',
                  )}
                >
                  <AvatarPhoto src={settings.avatar} initials={initials} size={22} />
                </button>

                <button
                  type="button"
                  title={t('nav.feedback')}
                  onClick={() => openFeedback('sidebar')}
                  className={ICON_BTN}
                >
                  <MessageSquare size={14} />
                </button>
              </div>
            </>
          )}

          {!wide && (
            <>
              <button
                type="button"
                data-page="settings"
                title={settings.traderName ? `${settings.traderName} · ${t('nav.accountSettings')}` : t('nav.settings')}
                onClick={() => goTo('settings')}
                className={clsx(
                  'h-7 w-7 rounded-full flex items-center justify-center transition-shadow',
                  page === 'settings' ? 'ring-1 ring-white/50' : 'hover:ring-1 hover:ring-white/15',
                )}
              >
                <AvatarPhoto src={settings.avatar} initials={initials} size={22} />
              </button>
              <button
                type="button"
                title={t('nav.menu')}
                aria-label={t('nav.menu')}
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
                className={ICON_BTN}
              >
                {menuOpen ? <X size={15} /> : <MenuIcon size={15} />}
              </button>
            </>
          )}
        </div>
      </header>

      {menuOpen && !wide && (
        <>
          <button
            type="button"
            aria-label={t('common.close')}
            className="fixed inset-0 top-12 z-30 bg-black/55"
            onClick={() => setMenuOpen(false)}
          />
          <div className="no-drag fixed inset-x-0 top-12 z-40 max-h-[min(560px,calc(100vh-48px))] overflow-y-auto border-b border-border/70 bg-bg shadow-[0_24px_48px_-24px_rgba(0,0,0,0.85)]">
            <nav className="flex flex-col px-2 pt-1 pb-2">
              {NAV_IDS.map((item) => {
                const active = page === item.id
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-page={item.id}
                    onClick={() => goTo(item.id)}
                    className={clsx(
                      'h-11 px-3 text-left text-[15px] font-medium tracking-tight rounded-lg transition-colors',
                      active ? 'text-text' : 'text-muted hover:text-text hover:bg-white/[0.04]',
                    )}
                    aria-current={active ? 'page' : undefined}
                  >
                    {t(item.key)}
                  </button>
                )
              })}
            </nav>
            <div className="px-3 pb-3 flex flex-col gap-2 border-t border-border/70 pt-3">
              <SearchField inputRef={searchRef} q={q} setQ={setQ} onSubmit={search} onClear={clearSearch} wide />
            <AccountSwitcher
              sheet
              accRef={accRef}
              accOpen={accOpen}
              setAccOpen={setAccOpen}
              accountName={settings.accountName}
              currency={settings.currency}
              activeAccountId={settings.activeAccountId}
              activeColor={activeColor}
              equity={equity}
              pct={pct}
              netPnl={stats.netPnl}
              accounts={accounts}
              trades={trades}
              cashflows={cashflows}
              onSwitch={(id, name) => {
                if (id !== settings.activeAccountId) toast(t('nav.accountToast', { name }), 'info')
                switchAccount(id)
                setAccOpen(false)
                setMenuOpen(false)
              }}
            />
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  openFeedback('sidebar')
                }}
                className="h-10 px-3 rounded-lg flex items-center gap-2.5 text-[13px] font-medium text-muted hover:text-text hover:bg-white/[0.04] transition-colors"
              >
                <MessageSquare size={15} className="text-dim" />
                {t('nav.feedback')}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

function SearchField({
  inputRef,
  q,
  setQ,
  onSubmit,
  onClear,
  compact,
  wide,
}: {
  inputRef: RefObject<HTMLInputElement | null>
  q: string
  setQ: (value: string) => void
  onSubmit: (e: FormEvent) => void
  onClear: () => void
  compact?: boolean
  wide?: boolean
}) {
  const t = useT()
  const filled = Boolean(q.trim())
  return (
    <form onSubmit={onSubmit} className={clsx(wide ? 'w-full' : 'relative h-7 w-7 shrink-0')}>
      <label
        className={clsx(
          'group/sf block h-7',
          wide ? 'relative' : 'absolute right-0 top-0 z-20 transition-[width] duration-200 ease-out',
          !wide && (compact
            ? filled
              ? 'w-36'
              : 'w-7 focus-within:w-36'
            : filled
              ? 'w-44'
              : 'w-7 focus-within:w-44'),
        )}
      >
        <Search
          size={14}
          className={clsx(
            'absolute top-1/2 -translate-y-1/2 text-dim pointer-events-none transition-[left,transform] duration-200',
            wide || filled
              ? 'left-2'
              : 'left-1/2 -translate-x-1/2 group-focus-within/sf:left-2 group-focus-within/sf:translate-x-0',
          )}
        />
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('nav.searchPlaceholder')}
          aria-label={t('nav.searchTrade')}
          title={t('nav.searchTrade')}
          className={clsx(
            'h-7 w-full rounded-md text-[12px] text-text placeholder:text-dim/90 focus:outline-none',
            wide
              ? 'pl-8 bg-white/[0.04] border border-border focus:border-white/15'
              : clsx(
                  'border bg-bg',
                  filled
                    ? 'border-white/[0.1] pl-7 pr-7 text-text'
                    : 'border-transparent pl-0 pr-0 cursor-pointer text-transparent placeholder:text-transparent caret-transparent hover:bg-white/[0.04] group-focus-within/sf:border-white/[0.1] group-focus-within/sf:pl-7 group-focus-within/sf:pr-2.5 group-focus-within/sf:cursor-text group-focus-within/sf:text-text group-focus-within/sf:placeholder:text-dim/90 group-focus-within/sf:caret-text',
                ),
          )}
        />
        {filled && (
          <button
            type="button"
            title={t('common.clear')}
            onClick={onClear}
            className="absolute right-0.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-dim hover:text-text hover:bg-white/[0.06] transition-colors"
          >
            <X size={11} strokeWidth={2.25} />
          </button>
        )}
      </label>
    </form>
  )
}

function AccountSwitcher({
  compact,
  sheet,
  accRef,
  accOpen,
  setAccOpen,
  accountName,
  currency,
  activeAccountId,
  activeColor,
  equity,
  pct,
  netPnl,
  accounts,
  trades,
  cashflows,
  onSwitch,
}: {
  compact?: boolean
  sheet?: boolean
  accRef: RefObject<HTMLButtonElement | null>
  accOpen: boolean
  setAccOpen: (open: boolean | ((value: boolean) => boolean)) => void
  accountName: string
  currency: Currency
  activeAccountId: string
  activeColor: string | undefined
  equity: number
  pct: number
  netPnl: number
  accounts: AccountBook[]
  trades: Trade[]
  cashflows: Cashflow[]
  onSwitch: (id: string, name: string) => void
}) {
  const multi = accounts.length > 1
  const pctLabel = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
  const equityLabel = fmtMoney(equity, currency, { compact: !sheet })
  const pnlLabel = fmtMoney(netPnl, currency, { sign: true, compact: !sheet })
  return (
    <div className={clsx('relative', sheet && 'w-full')} data-tour="account">
      <button
        ref={accRef}
        type="button"
        title={`${accountName} · ${fmtMoney(equity, currency)} · ${pctLabel} · ${fmtMoney(netPnl, currency, { sign: true })} P&L`}
        onClick={() => multi && setAccOpen((v) => !v)}
        className={clsx(
          'flex items-center text-left transition-colors',
          sheet ? 'w-full h-12 gap-1.5 px-3 rounded-lg bg-surface-2 border border-border' : 'h-7 gap-2 rounded-md',
          !sheet && (compact ? 'px-1.5' : 'pl-2 pr-1.5'),
          multi && 'hover:bg-white/[0.04]',
          accOpen && 'bg-white/[0.04]',
        )}
      >
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: swatchFor(activeColor) }} />
        {sheet ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium tracking-tight">{accountName}</span>
              <span className="block text-[11px] text-dim num">
                {equityLabel}
                <span className="text-border-3"> · </span>
                <span className={netPnl >= 0 ? 'text-accent' : 'text-loss'}>{pnlLabel} P&L</span>
              </span>
            </span>
            <span className={clsx('num text-[12px] font-medium', pct >= 0 ? 'text-accent' : 'text-loss')}>{pctLabel}</span>
          </>
        ) : (
          <>
            {!compact && (
              <span className="truncate text-[12px] text-muted max-w-[7rem] tracking-tight">{accountName}</span>
            )}
            <span className={clsx('num text-[12px] font-medium tabular-nums', pct >= 0 ? 'text-accent' : 'text-loss')}>
              {pctLabel}
            </span>
          </>
        )}
        {multi && <ChevronDown size={11} className={clsx('text-dim shrink-0 transition-transform', accOpen && 'rotate-180')} />}
      </button>
      <Menu open={accOpen && multi} onClose={() => setAccOpen(false)} anchorRef={accRef}>
        {accounts.map((a) => {
          const on = a.id === activeAccountId
          return (
            <button key={a.id} type="button" onClick={() => onSwitch(a.id, a.name)} className={menuRowClass(on)}>
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: swatchFor(a.color) }} />
              <span className="truncate flex-1 font-medium">{a.name}</span>
              <span className="num text-[11px] text-dim">
                {fmtMoney(
                  accountEquity(
                    a.startingBalance,
                    a.id === activeAccountId ? trades : a.trades,
                    a.id === activeAccountId ? cashflows : a.cashflows,
                  ),
                  a.currency,
                  { compact: true },
                )}
              </span>
            </button>
          )
        })}
      </Menu>
    </div>
  )
}
