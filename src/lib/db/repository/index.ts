import type Database from 'better-sqlite3-multiple-ciphers'
import type { AccountBook, PersistedData, Settings } from '@/types'
import { DEFAULT_SETTINGS } from '@/types'
import { deleteAccountsNotIn, isAccountsEmpty, listAccounts, upsertAccount } from './accountsRepository'
import { replaceCashflowsForAccount } from './cashflowsRepository'
import { replaceJournalEntriesForAccount } from './journalEntriesRepository'
import { listPlaybook, replacePlaybook } from './playbookRepository'
import { ensureDefaultSettings, getSettings, saveSettings } from './settingsRepository'
import { replaceTradesForAccount } from './tradesRepository'

export function isDatabaseEmpty(db: Database.Database): boolean {
  return isAccountsEmpty(db)
}

export function loadJournal(db: Database.Database): PersistedData | null {
  ensureDefaultSettings(db)
  const playbook = listPlaybook(db)
  const settings = getSettings(db, playbook)
  if (!settings) return null

  const accounts = listAccounts(db)
  if (!accounts.length) return null

  return {
    version: 2,
    settings,
    accounts,
  }
}

export function saveJournal(db: Database.Database, data: PersistedData): void {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...data.settings, playbook: data.settings.playbook ?? [] }
  const accounts: AccountBook[] = data.accounts?.length
    ? data.accounts
    : data.trades || data.notes
      ? [
          {
            id: settings.activeAccountId,
            name: settings.accountName,
            broker: '',
            type: 'live',
            color: 'green',
            currency: settings.currency,
            startingBalance: settings.startingBalance,
            riskPerTrade: settings.riskPerTrade,
            dailyLossLimit: settings.dailyLossLimit,
            createdAt: new Date().toISOString(),
            trades: data.trades ?? [],
            notes: data.notes ?? [],
            cashflows: [],
          },
        ]
      : []

  db.transaction(() => {
    replacePlaybook(db, settings.playbook ?? [])
    saveSettings(db, settings)
    const ids = new Set(accounts.map((a) => a.id))
    deleteAccountsNotIn(db, ids)
    for (const account of accounts) {
      upsertAccount(db, account)
      replaceTradesForAccount(db, account.id, account.trades ?? [])
      replaceJournalEntriesForAccount(db, account.id, account.notes ?? [])
      replaceCashflowsForAccount(db, account.id, account.cashflows ?? [])
    }
  })()
}

export {
  deleteAccountsNotIn,
  isAccountsEmpty,
  listAccounts,
  upsertAccount,
} from './accountsRepository'
export { replaceCashflowsForAccount, listCashflowsByAccount } from './cashflowsRepository'
export { replaceJournalEntriesForAccount, listJournalEntriesByAccount } from './journalEntriesRepository'
export { listPlaybook, replacePlaybook } from './playbookRepository'
export { ensureDefaultSettings, getSettings, saveSettings } from './settingsRepository'
export { replaceTradesForAccount, listTradesByAccount } from './tradesRepository'
