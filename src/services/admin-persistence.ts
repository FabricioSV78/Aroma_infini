import type { AdminState } from './admin-service'

const databaseName = 'aroma-infini-admin'
const storeName = 'snapshot'
const schemaVersion = 1
let databasePromise: Promise<IDBDatabase> | undefined

function database() {
  databasePromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, schemaVersion)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName)
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  }).catch((error: unknown) => {
    databasePromise = undefined
    throw error
  })
  return databasePromise
}

export async function readAdminState(): Promise<AdminState | undefined> {
  if (typeof indexedDB === 'undefined') return undefined
  const db = await database()
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(storeName, 'readonly')
      .objectStore(storeName)
      .get('current')
    request.onsuccess = () => resolve(request.result as AdminState | undefined)
    request.onerror = () => reject(request.error)
  })
}

export async function writeAdminState(snapshot: AdminState): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  const db = await database()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).put(snapshot, 'current')
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}
