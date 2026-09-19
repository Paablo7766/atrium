/**
 * Cifrado extremo a extremo para sync opcional con Supabase.
 * Usa Web Crypto (renderer / Vitest) — nunca envía datos en claro al servidor.
 */
import { PBKDF2_ITERATIONS, SYNC_HKDF_INFO } from './types'

export const SYNC_CIPHER_VERSION = 1
export { SYNC_HKDF_INFO }

export type EncryptedBlob = {
  ciphertext: string
  nonce: string
  cipherVersion: number
}

function encodeBytes(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function decodeBytes(b64: string): Uint8Array {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i)
  return out
}

function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.trim()
  if (!/^[0-9a-f]+$/i.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error('Clave hex inválida.')
  }
  const out = new Uint8Array(normalized.length / 2)
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16)
  }
  return out
}

function asBufferSource(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return copy.buffer
}

export async function importAesKeyFromHex(keyHex: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', asBufferSource(hexToBytes(keyHex)), { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

/** Deriva la clave de sync (HKDF-SHA256) a partir de la clave SQLCipher en hex. */
export async function deriveSyncKeyFromDbKeyHex(dbKeyHex: string): Promise<CryptoKey> {
  const ikm = await crypto.subtle.importKey('raw', asBufferSource(hexToBytes(dbKeyHex)), 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new Uint8Array(0),
      info: new TextEncoder().encode(SYNC_HKDF_INFO),
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** Deriva clave de sync desde contraseña maestra (mismo KDF que SQLCipher + HKDF). */
export async function deriveSyncKeyFromPassword(password: string, saltHex: string): Promise<CryptoKey> {
  const salt = asBufferSource(hexToBytes(saltHex))
  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const dbKeyBits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    256,
  )
  const dbKeyHex = Array.from(new Uint8Array(dbKeyBits))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return deriveSyncKeyFromDbKeyHex(dbKeyHex)
}

export async function encryptJson(value: unknown, key: CryptoKey): Promise<EncryptedBlob> {
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(value))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext)
  return {
    ciphertext: encodeBytes(new Uint8Array(encrypted)),
    nonce: encodeBytes(nonce),
    cipherVersion: SYNC_CIPHER_VERSION,
  }
}

export async function decryptJson<T>(blob: EncryptedBlob, key: CryptoKey): Promise<T> {
  if (blob.cipherVersion !== SYNC_CIPHER_VERSION) {
    throw new Error(`Versión de cifrado no soportada: ${blob.cipherVersion}`)
  }
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: asBufferSource(decodeBytes(blob.nonce)) },
    key,
    asBufferSource(decodeBytes(blob.ciphertext)),
  )
  return JSON.parse(new TextDecoder().decode(plaintext)) as T
}
