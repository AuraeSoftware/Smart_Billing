/**
 * Offline document history — SOW Section 3.5.
 *
 * Every invoice, quotation, and receipt the tenant has ever created is mirrored
 * into IndexedDB on each successful sync, not just the ones most recently
 * viewed. When the device is offline, pages read from this store instead of
 * the network, so the full history stays searchable/viewable/exportable.
 * Documents created while offline are queued here and flushed to the API the
 * next time syncAll() succeeds.
 */
import { openDB, type IDBPDatabase } from 'idb'
import { apiFetch } from './api'

const DB_NAME = 'smart-billing-offline'
const DB_VERSION = 1

export type DocType = 'invoices' | 'quotations' | 'receipts'

interface QueuedCreate {
  id: string
  docType: DocType
  payload: unknown
  createdAt: string
}

let dbPromise: Promise<IDBPDatabase> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('invoices')) db.createObjectStore('invoices', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('quotations')) db.createObjectStore('quotations', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('receipts')) db.createObjectStore('receipts', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta')
      },
    })
  }
  return dbPromise
}

/** Pull the full list for one document type from the API and replace the
 * local cache with it. Call this after login and periodically while online. */
export async function syncDocType(docType: DocType): Promise<void> {
  const items = await apiFetch<Array<{ id: string }>>(`/${docType}`)
  const db = await getDb()
  const tx = db.transaction(docType, 'readwrite')
  await tx.store.clear()
  for (const item of items) await tx.store.put(item)
  await tx.done
  await (await getDb()).put('meta', new Date().toISOString(), `${docType}_last_sync`)
}

export async function syncAll(): Promise<void> {
  await flushOutbox()
  await Promise.all([syncDocType('invoices'), syncDocType('quotations'), syncDocType('receipts')])
}

export async function getCached<T>(docType: DocType): Promise<T[]> {
  const db = await getDb()
  return (await db.getAll(docType)) as T[]
}

export async function getLastSyncTime(docType: DocType): Promise<string | null> {
  const db = await getDb()
  return (await db.get('meta', `${docType}_last_sync`)) || null
}

/** Queue a document created while offline; flushed automatically on next sync. */
export async function queueOfflineCreate(docType: DocType, payload: unknown): Promise<void> {
  const db = await getDb()
  const entry: QueuedCreate = { id: crypto.randomUUID(), docType, payload, createdAt: new Date().toISOString() }
  await db.put('outbox', entry)
}

export async function getOutboxCount(): Promise<number> {
  const db = await getDb()
  return db.count('outbox')
}

async function flushOutbox(): Promise<void> {
  const db = await getDb()
  const queued = (await db.getAll('outbox')) as QueuedCreate[]
  for (const entry of queued) {
    try {
      await apiFetch(`/${entry.docType}`, { method: 'POST', body: JSON.stringify(entry.payload) })
      await db.delete('outbox', entry.id)
    } catch {
      // Leave it queued — most likely a numbering/validation conflict that
      // needs the document numbering to catch up; surfaced to the user as an
      // unresolved outbox count rather than silently dropped.
    }
  }
}

export function isOnline(): boolean {
  return navigator.onLine
}
