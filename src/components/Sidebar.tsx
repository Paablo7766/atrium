import { useMemo, useRef, useState, type FormEvent } from 'react'
import { clsx } from 'clsx'
import { LayoutDashboard, ListOrdered, CalendarDays, BarChart3, NotebookPen, Settings, Plus, Search, PanelLeftClose, PanelLeft, ChevronDown, X } from 'lucide-react'
import { useStore, type Page } from '@/store'
import { BrandMark } from '@/components/BrandMark'
import { AvatarPhoto, traderInitials } from '@/components/Avatar'
import { Menu, menuRowClass } from '@/components/ui'
import { computeStats } from '@/lib/stats'
import { accountEquity } from '@/lib/capital'
import { fmtMoney } from '@/lib/format'
import { ACCOUNT_COLORS } from '@/types'
import { useT } from '@/lib/useI18n'

export function Sidebar() {
  const page = useStore((s) => s.page)
  const setPage = useStore((s) => s.setPage)
  const openTradeModal = useStore((s) => s.openTradeModal)
  const setTradesQuery = useStore((s) => s.setTradesQuery)
  const collapsed = useStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useStore((s) => s.toggleSidebar)
  const trades = useStore((s) => s.trades)
  const settings = useStore((s) => s.settings)
  const accounts = useStore((s) => s.accounts)
  const cashflows = useStore((s) => s.cashflows)
  const switchAccount = useStore((s) => s.switchAccount)
  const toast = useStore((s) => s.toast)
  const t = useT()
  const [q, setQ] = useState('')
  const [accOpen, setAccOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const accRef = useRef<HTMLButtonElement>(null)

  const stats = useMemo(() => computeStats(trades, settings.startingBalance, cashflows), [trades, settings.startingBalance, cashflows])
  const equity = accountEquity(settings.startingBalance, trades, cashflows)
  const invested = equity - stats.netPnl
  const pct = invested ? (stats.netPnl / invested) * 100 : 0
  const initials = traderInitials(settings.traderName)
  const NAV: { id: Page; label: string; icon: typeof LayoutDashboard; group: 'main' | 'analysis' }[] = [
    { id: 'dashboard', label: t('nav.dashboard'), icon: LayoutDashboard, group: 'main' },
    { id: 'trades', label: t('nav.trades'), icon: ListOrdered, group: 'main' },
    { id: 'calendar', label: t('nav.calendar'), icon: CalendarDays, group: 'main' },
    { id: 'analytics', label: t('nav.analytics'), icon: BarChart3, group: 'analysis' },
    { id: 'journal', label: t('nav.journal'), icon: NotebookPen, group: 'analysis' },
  ]

  const search = (e: FormEvent) => {
    e.preventDefault()
    setTradesQuery(q.trim())
    setPage('trades')
  }

  const Item = ({ id, label, icon: Icon }: (typeof NAV)[number]) => {
    const active = page === id
    return (
      <button
        data-page={id}
        title={collapsed ? label : undefined}
        onClick={() => setPage(id)}
        className={clsx(
          'group relative flex items-center h-9 rounded-xl text-[13px] font-medium transition-all',
          collapsed ? 'w-10 mx-auto justify-center px-0' : 'w-full gap-3 px-3',
          active ? 'bg-surface-3 text-text shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]' : 'text-muted hover:text-text hover:bg-surface-2',
        )}
      >
        {active && !collapsed && <span className="absolute left-1 top-2 bottom-2 w-0.5 rounded-full bg-accent" />}
        <Icon size={16} strokeWidth={active ? 2.2 : 1.8} className={clsx(active ? 'text-accent' : 'text-dim group-hover:text-muted')} />
        {!collapsed && label}
      </button>
    )
  }

  return (
    <aside
      className={clsx(
        'shrink-0 h-full flex flex-col border-r border-border/80 bg-surface/50 overflow-hidden transition-[width] duration-200 ease-out',
        'shadow-[1px_0_0_0_rgba(255,255,255,0.02)]',
        collapsed ? 'w-[72px]' : 'w-[232px]',
      )}
    >
      <div className={clsx('drag-region h-12 flex items-center pt-1', collapsed ? 'justify-center px-1' : 'justify-between gap-2 px-3')}>
        <div className="no-drag flex items-center gap-2.5 min-w-0">
          <BrandMark size={28} className="shadow-[0_0_20px_-6px_rgba(74,222,128,0.45)]" />
          {!collapsed && (
            <div className="leading-none">
              <div className="text-[13px] font-semibold tracking-tight">Atrium</div>
              <div className="text-[10px] text-dim mt-0.5 uppercase tracking-[0.18em]">Journal</div>
            </div>
          )}
        </div>
        {!collapsed && (
          <button
            type="button"
            title={t('nav.collapse')}
            onClick={toggleSidebar}
            className="no-drag w-8 h-8 rounded-lg flex items-center justify-center text-dim hover:text-text hover:bg-surface-3 transition-colors"
          >
            <PanelLeftClose size={16} />
          </button>
        )}
      </div>

      {collapsed && (
        <div className="px-2 pb-1 flex justify-center">
          <button
            type="button"
            title={t('nav.expand')}
            onClick={toggleSidebar}
            className="w-10 h-8 rounded-lg flex items-center justify-center text-dim hover:text-text hover:bg-surface-3 transition-colors"
          >
            <PanelLeft size={16} />
          </button>
        </div>
      )}

      {collapsed ? (
        <div className="px-2 pt-1 flex flex-col items-center gap-1">
          <button
            type="button"
            title={t('nav.searchTrade')}
            onClick={() => {
              toggleSidebar()
              setTimeout(() => searchRef.current?.focus(), 220)
            }}
            className="w-10 h-9 rounded-xl flex items-center justify-center text-dim hover:text-text hover:bg-surface-2"
          >
            <Search size={15} />
          </button>
          <button
            data-tour="new-trade"
            type="button"
            title={t('nav.newTrade')}
            onClick={() => openTradeModal()}
            className="w-10 h-10 rounded-xl bg-accent text-black flex items-center justify-center hover:bg-[#5ce392] active:scale-[0.98] transition-colors"
          >
            <Plus size={16} strokeWidth={2.5} />
          </button>
        </div>
      ) : (
        <>
          <form onSubmit={search} className="px-3 pt-2">
            <label className="relative block">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-dim pointer-events-none" />
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t('nav.searchPlaceholder')}
                className={clsx(
                  'w-full h-9 pl-8 rounded-xl bg-surface-2 border border-border text-[12.5px] text-text placeholder:text-dim focus:outline-none focus:border-accent/40',
                  q.trim() ? 'pr-8' : 'pr-3',
                )}
              />
              {q.trim() && (
                <button
                  type="button"
                  title={t('common.clear')}
                  onClick={() => {
                    setQ('')
                    setTradesQuery('')
                    searchRef.current?.focus()
                  }}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-dim hover:text-text hover:bg-surface-3 transition-colors"
                >
                  <X size={12} strokeWidth={2.25} />
                </button>
              )}
            </label>
          </form>
          <div className="px-3 pt-3">
            <button
              data-tour="new-trade"
              onClick={() => openTradeModal()}
              className="w-full h-9 rounded-xl bg-accent text-black text-[13px] font-semibold flex items-center justify-center gap-2 hover:bg-[#5ce392] active:scale-[0.98] transition-all shadow-[0_0_0_1px_rgba(74,222,128,0.25),0_8px_20px_-10px_rgba(74,222,128,0.55)]"
            >
              <Plus size={16} strokeWidth={2.5} />
              {t('nav.newTrade')}
            </button>
          </div>
        </>
      )}

      <nav data-tour="nav" className={clsx('flex-1 py-2 flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden', collapsed ? 'px-2' : 'px-3')}>
        {!collapsed && <div className="px-3 pt-3 pb-1.5 text-[10px] font-semibold text-dim uppercase tracking-[0.16em]">{t('nav.main')}</div>}
        {collapsed && <div className="h-2" />}
        {NAV.filter((n) => n.group === 'main').map((n) => (
          <Item key={n.id} {...n} />
        ))}
        {!collapsed && <div className="px-3 pt-4 pb-1.5 text-[10px] font-semibold text-dim uppercase tracking-[0.16em]">{t('nav.analysis')}</div>}
        {collapsed && <div className="h-3" />}
        {NAV.filter((n) => n.group === 'analysis').map((n) => (
          <Item key={n.id} {...n} />
        ))}
      </nav>

      <div data-tour="account" className={clsx('border-t border-border', collapsed ? 'p-2' : 'p-3')}>
        {!collapsed && (
          <div className="relative">
            <button
              ref={accRef}
              type="button"
              onClick={() => accounts.length > 1 && setAccOpen((v) => !v)}
              className={clsx(
                'w-full rounded-2xl bg-surface-2 border border-border p-3.5 text-left',
                accounts.length > 1 && 'hover:border-border-2 transition-colors',
                accOpen && 'border-border-2',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 min-w-0">
                  <span
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: ACCOUNT_COLORS.find((c) => c.value === (accounts.find((a) => a.id === settings.activeAccountId)?.color ?? 'green'))?.swatch }}
                  />
                  <span className="text-[11px] text-muted truncate">{settings.accountName}</span>
                  {accounts.length > 1 && <ChevronDown size={12} className={clsx('text-dim shrink-0 transition-transform', accOpen && 'rotate-180')} />}
                </span>
                <span className={clsx('num text-[11px] font-semibold', pct >= 0 ? 'text-accent' : 'text-loss')}>
                  {pct >= 0 ? '+' : ''}
                  {pct.toFixed(1)}%
                </span>
              </div>
              <div className="num text-[17px] font-semibold tracking-tight mt-1">{fmtMoney(equity, settings.currency)}</div>
              <div className="text-[11px] text-dim mt-1">
                {fmtMoney(stats.netPnl, settings.currency, { sign: true })} P&L
              </div>
            </button>
            <Menu open={accOpen && accounts.length > 1} onClose={() => setAccOpen(false)} anchorRef={accRef}>
              {accounts.map((a) => {
                const on = a.id === settings.activeAccountId
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      if (a.id !== settings.activeAccountId) toast(t('nav.accountToast', { name: a.name }), 'info')
                      switchAccount(a.id)
                      setAccOpen(false)
                    }}
                    className={menuRowClass(on)}
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ACCOUNT_COLORS.find((c) => c.value === a.color)?.swatch }} />
                    <span className="truncate flex-1 font-medium">{a.name}</span>
                    <span className="num text-[11px] text-dim">
                      {fmtMoney(
                        accountEquity(
                          a.startingBalance,
                          a.id === settings.activeAccountId ? trades : a.trades,
                          a.id === settings.activeAccountId ? cashflows : a.cashflows,
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
        )}
        <button
          data-page="settings"
          title={collapsed ? t('nav.settings') : undefined}
          onClick={() => setPage('settings')}
          className={clsx(
            'flex items-center rounded-xl text-[13px] font-medium transition-all',
            collapsed ? 'w-10 h-10 mx-auto justify-center' : 'mt-2 gap-2.5 w-full h-11 px-2.5',
            page === 'settings' ? 'bg-surface-3 text-text' : 'text-muted hover:text-text hover:bg-surface-2',
          )}
        >
          <AvatarPhoto src={settings.avatar} initials={initials} size={28} />
          {!collapsed && (
            <>
              <span className="flex-1 text-left min-w-0">
                <span className="block truncate leading-tight">{settings.traderName}</span>
                <span className="block text-[10px] text-dim truncate leading-tight">{t('nav.accountSettings')}</span>
              </span>
              <Settings size={14} className={page === 'settings' ? 'text-accent' : 'text-dim'} />
            </>
          )}
        </button>
      </div>
    </aside>
  )
}
