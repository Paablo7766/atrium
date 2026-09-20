import {
  decryptJson,
  encryptJson,
  importAesKeyFromHex,
  type EncryptedBlob,
} from '@/lib/crypto/syncCrypto'

const keyCache = new Map<string, CryptoKey>()

export async function aesKeyFromHex(keyHex: string): Promise<CryptoKey> {
  const existing = keyCache.get(keyHex)
  if (existing) return existing
  const key = await importAesKeyFromHex(keyHex)
  keyCache.set(keyHex, key)
  return key
}

export function clearAesKeyCache(): void {
  keyCache.clear()
}

export async function encryptRecord(value: unknown, keyHex: string): Promise<EncryptedBlob> {
  return encryptJson(value, await aesKeyFromHex(keyHex))
}

export async function decryptRecord<T>(blob: EncryptedBlob, keyHex: string): Promise<T> {
  return decryptJson<T>(blob, await aesKeyFromHex(keyHex))
}

export function isEncryptedBlob(value: unknown): value is EncryptedBlob {
  if (!value || typeof value !== 'object') return false
  const v = value as EncryptedBlob
  return typeof v.ciphertext === 'string' && typeof v.nonce === 'string' && typeof v.cipherVersion === 'number'
}
