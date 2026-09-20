/**
 * Repositorio IndexedDB cifrado — misma forma de journal que repository/ (SQLite),
 * sin el handle `Database` (no existe SQLCipher en el navegador).
 */
import { DEFAULT_SETTINGS, type AccountBook, type Cashflow, type JournalEntry, type PersistedData, type PlaybookItem, type PlaybookSetup, type Settings, type Trade } from '@/types'
import { getWebKeyHex } from '@/lib/crypto/keyManagerWeb'
import { countStore, openJournalDb, WEB_STORES } from './idb'
import { decryptRecord, encryptRecord, isEncryptedBlob } from './recordCrypto'

type AccountMeta = Omit<AccountBook, 'trades' | 'notes' | 'cashflows'>
type TradeRecord = Trade & { accountId: string }
type NoteRecord = JournalEntry & { accountId: string }
type CashflowRecord = Cashflow & { accountId: string }
type PlaybookItemRecord = PlaybookItem & { setupId: string; sortOrder: number }

function requireKey(): string {
  const key = getWebKeyHex()
  if (!key) throw new Error('El diario está bloqueado. Introduce tu contraseña maestra.')
  return key
}

async function decryptAll<T>(store: 'settings' | 'accounts' | 'trades' | 'journal_entries' | 'cashflows' | 'playbook_setups' | 'playbook_items', keyHex: string): Promise<T[]> {
  const db = await openJournalDb()
  const blobs = await db.getAll(store)
  const out: T[] = []
  for (const blob of blobs) {
    if (!isEncryptedBlob(blob)) throw new Error('El almacenamiento local no está cifrado o está dañado.')
    out.push(await decryptRecord<T>(blob, keyHex))
  }
  return out
}

function accountMeta(account: AccountBook): AccountMeta {
  return {
    id: account.id,
    name: account.name,
    broker: account.broker,
    type: account.type,
    color: account.color,
    currency: account.currency,
    startingBalance: account.startingBalance,
    riskPerTrade: account.riskPerTrade,
    dailyLossLimit: account.dailyLossLimit,
    createdAt: account.createdAt,
  }
}

function settingsWithoutPlaybook(settings: Settings): Omit<Settings, 'playbook'> {
  const { playbook: _playbook, ...rest } = settings
  return rest
}

export async function isDatabaseEmpty(): Promise<boolean> {
  return (await countStore('accounts')) === 0
}

export async function loadJournal(): Promise<PersistedData | null> {
  const keyHex = requireKey()
  const [settingsRows, accounts, tradeRows, noteRows, flowRows, setups, items] = await Promise.all([
    decryptAll<Omit<Settings, 'playbook'>>('settings', keyHex),
    decryptAll<AccountMeta>('accounts', keyHex),
    decryptAll<TradeRecord>('trades', keyHex),
    decryptAll<NoteRecord>('journal_entries', keyHex),
    decryptAll<CashflowRecord>('cashflows', keyHex),
    decryptAll<Omit<PlaybookSetup, 'checklist'>>('playbook_setups', keyHex),
    decryptAll<PlaybookItemRecord>('playbook_items', keyHex),
  ])

  const rawSettings = settingsRows[0]
  if (!rawSettings) return null
  if (!accounts.length) return null

  const itemsBySetup = new Map<string, PlaybookItemRecord[]>()
  for (const item of items) {
    const list = itemsBySetup.get(item.setupId) ?? []
    list.push(item)
    itemsBySetup.set(item.setupId, list)
  }
  const playbook: PlaybookSetup[] = setups.map((s) => ({
    ...s,
    checklist: (itemsBySetup.get(s.id) ?? [])
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map(({ id, label }) => ({ id, label })),
  }))

  const settings: Settings = { ...DEFAULT_SETTINGS, ...rawSettings, playbook }

  const tradesByAccount = new Map<string, Trade[]>()
  for (const row of tradeRows) {
    const { accountId, ...trade } = row
    const list = tradesByAccount.get(accountId) ?? []
    list.push(trade)
    tradesByAccount.set(accountId, list)
  }
  const notesByAccount = new Map<string, JournalEntry[]>()
  for (const row of noteRows) {
    const { accountId, ...note } = row
    const list = notesByAccount.get(accountId) ?? []
    list.push(note)
    notesByAccount.set(accountId, list)
  }
  const flowsByAccount = new Map<string, Cashflow[]>()
  for (const row of flowRows) {
    const { accountId, ...flow } = row
    const list = flowsByAccount.get(accountId) ?? []
    list.push(flow)
    flowsByAccount.set(accountId, list)
  }

  const books: AccountBook[] = accounts.map((account) => ({
    ...account,
    trades: tradesByAccount.get(account.id) ?? [],
    notes: notesByAccount.get(account.id) ?? [],
    cashflows: flowsByAccount.get(account.id) ?? [],
  }))

  return {
    version: 2,
    settings,
    accounts: books,
  }
}

let writeChain: Promise<void> = Promise.resolve()

export function saveJournal(data: PersistedData): Promise<void> {
  const run = () => saveJournalInner(data)
  writeChain = writeChain.then(run, run)
  return writeChain
}

async function saveJournalInner(data: PersistedData): Promise<void> {
  const keyHex = requireKey()
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

  const playbook = settings.playbook ?? []
  const tradeRecords: TradeRecord[] = []
  const noteRecords: NoteRecord[] = []
  const flowRecords: CashflowRecord[] = []
  for (const account of accounts) {
    for (const trade of account.trades ?? []) tradeRecords.push({ ...trade, accountId: account.id })
    for (const note of account.notes ?? []) noteRecords.push({ ...note, accountId: account.id })
    for (const flow of account.cashflows ?? []) flowRecords.push({ ...flow, accountId: account.id })
  }
  const itemRecords: PlaybookItemRecord[] = []
  for (const setup of playbook) {
    setup.checklist.forEach((item, sortOrder) => {
      itemRecords.push({ id: item.id, label: item.label, setupId: setup.id, sortOrder })
    })
  }

  const [settingsBlob, accountBlobs, tradeBlobs, noteBlobs, flowBlobs, setupBlobs, itemBlobs] = await Promise.all([
    encryptRecord(settingsWithoutPlaybook(settings), keyHex),
    Promise.all(accounts.map((a) => encryptRecord(accountMeta(a), keyHex))),
    Promise.all(tradeRecords.map((t) => encryptRecord(t, keyHex))),
    Promise.all(noteRecords.map((n) => encryptRecord(n, keyHex))),
    Promise.all(flowRecords.map((c) => encryptRecord(c, keyHex))),
    Promise.all(playbook.map(({ checklist: _c, ...setup }) => encryptRecord(setup, keyHex))),
    Promise.all(itemRecords.map((item) => encryptRecord(item, keyHex))),
  ])

  const db = await openJournalDb()
  const tx = db.transaction(WEB_STORES, 'readwrite')
  await Promise.all([
    tx.objectStore('settings').clear(),
    tx.objectStore('accounts').clear(),
    tx.objectStore('trades').clear(),
    tx.objectStore('journal_entries').clear(),
    tx.objectStore('cashflows').clear(),
    tx.objectStore('playbook_setups').clear(),
    tx.objectStore('playbook_items').clear(),
  ])
  await tx.objectStore('settings').put(settingsBlob, '1')
  await Promise.all(accounts.map((account, i) => tx.objectStore('accounts').put(accountBlobs[i], account.id)))
  await Promise.all(tradeRecords.map((row, i) => tx.objectStore('trades').put(tradeBlobs[i], row.id)))
  await Promise.all(noteRecords.map((row, i) => tx.objectStore('journal_entries').put(noteBlobs[i], row.id)))
  await Promise.all(flowRecords.map((row, i) => tx.objectStore('cashflows').put(flowBlobs[i], row.id)))
  await Promise.all(playbook.map((setup, i) => tx.objectStore('playbook_setups').put(setupBlobs[i], setup.id)))
  await Promise.all(itemRecords.map((item, i) => tx.objectStore('playbook_items').put(itemBlobs[i], item.id)))
  await tx.done
}

export async function hasEncryptedJournal(): Promise<boolean> {
  const [accounts, settings, canary] = await Promise.all([
    countStore('accounts'),
    countStore('settings'),
    countStore('verify'),
  ])
  return accounts + settings + canary > 0
}
