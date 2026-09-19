import type Database from 'better-sqlite3-multiple-ciphers'
import type { PlaybookItem, PlaybookSetup } from '@/types'
import { TABLES, type PlaybookItemRow, type PlaybookSetupRow } from '../schema'

export function listPlaybook(db: Database.Database): PlaybookSetup[] {
  const setups = db.prepare(`SELECT * FROM ${TABLES.playbookSetups} ORDER BY created_at ASC`).all() as PlaybookSetupRow[]
  const items = db.prepare(`SELECT * FROM ${TABLES.playbookItems} ORDER BY sort_order ASC`).all() as PlaybookItemRow[]
  const bySetup = new Map<string, PlaybookItem[]>()
  for (const item of items) {
    const list = bySetup.get(item.setup_id) ?? []
    list.push({ id: item.id, label: item.label })
    bySetup.set(item.setup_id, list)
  }
  return setups.map((s) => ({
    id: s.id,
    name: s.name,
    notes: s.notes ?? '',
    checklist: bySetup.get(s.id) ?? [],
    createdAt: s.created_at,
    updatedAt: s.updated_at,
  }))
}

export function replacePlaybook(db: Database.Database, playbook: PlaybookSetup[]): void {
  db.prepare(`DELETE FROM ${TABLES.playbookItems}`).run()
  db.prepare(`DELETE FROM ${TABLES.playbookSetups}`).run()
  const insertSetup = db.prepare(`
    INSERT INTO ${TABLES.playbookSetups} (id, name, notes, created_at, updated_at)
    VALUES (@id, @name, @notes, @created_at, @updated_at)
  `)
  const insertItem = db.prepare(`
    INSERT INTO ${TABLES.playbookItems} (id, setup_id, label, sort_order)
    VALUES (@id, @setup_id, @label, @sort_order)
  `)
  for (const setup of playbook) {
    insertSetup.run({
      id: setup.id,
      name: setup.name,
      notes: setup.notes ?? '',
      created_at: setup.createdAt,
      updated_at: setup.updatedAt,
    })
    setup.checklist.forEach((item, idx) => {
      insertItem.run({
        id: item.id,
        setup_id: setup.id,
        label: item.label,
        sort_order: idx,
      })
    })
  }
}
