/**
 * Selector de Google Drive dentro de Atrium (web/móvil).
 * Requiere VITE_GOOGLE_CLIENT_ID y VITE_GOOGLE_API_KEY (Drive API + Picker API).
 */

import { GOOGLE_DRIVE_PICKER_UI_ENABLED } from '@/lib/featureFlags'

const CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
const API_KEY = import.meta.env.VITE_GOOGLE_API_KEY as string | undefined
const APP_ID = import.meta.env.VITE_GOOGLE_APP_ID as string | undefined

const SCOPES = 'https://www.googleapis.com/auth/drive.readonly'

function configured(): boolean {
  if (!GOOGLE_DRIVE_PICKER_UI_ENABLED) return false
  return !!(CLIENT_ID?.trim() && API_KEY?.trim())
}

export function isGoogleDrivePickerConfigured(): boolean {
  return configured()
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve()
      return
    }
    const s = document.createElement('script')
    s.src = src
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('No se pudo cargar Google Drive.'))
    document.head.appendChild(s)
  })
}

async function loadGapiPicker(): Promise<void> {
  await loadScript('https://apis.google.com/js/api.js')
  const gapi = (window as unknown as { gapi?: { load: (n: string, o: { callback: () => void; onerror: () => void }) => void } })
    .gapi
  if (!gapi) throw new Error('Google API no disponible.')
  await new Promise<void>((resolve, reject) => {
    gapi.load('picker', {
      callback: () => resolve(),
      onerror: () => reject(new Error('No se pudo cargar el selector de Drive.')),
    })
  })
}

async function loadGis(): Promise<void> {
  await loadScript('https://accounts.google.com/gsi/client')
}

function getAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const oauth2 = (window as unknown as { google?: { accounts?: { oauth2?: { initTokenClient: (c: unknown) => { requestAccessToken: (o?: { prompt?: string }) => void } } } } })
      .google?.accounts?.oauth2
    if (!oauth2 || !CLIENT_ID) {
      reject(new Error('Google Drive no está configurado en el servidor.'))
      return
    }
    const client = oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (resp: { error?: string; access_token?: string }) => {
        if (resp.error || !resp.access_token) {
          reject(new Error(resp.error ?? 'No se pudo conectar con Google.'))
          return
        }
        resolve(resp.access_token)
      },
    })
    client.requestAccessToken({ prompt: 'select_account' })
  })
}

async function downloadDriveFile(fileId: string, accessToken: string): Promise<string> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('No se pudo descargar la copia desde Google Drive.')
  return res.text()
}

function openPicker(accessToken: string): Promise<{ id: string } | null> {
  return new Promise((resolve) => {
    type PickerCallbackData = { action: string; docs?: { id: string }[] }
    type PickerApi = {
      DocsView: new (viewId: unknown) => {
        setIncludeFolders: (v: boolean) => { setSelectFolderEnabled: (v: boolean) => object }
      }
      PickerBuilder: new () => {
        setAppId: (id: string) => PickerApi['PickerBuilder']['prototype']
        setDeveloperKey: (k: string) => PickerApi['PickerBuilder']['prototype']
        setOAuthToken: (t: string) => PickerApi['PickerBuilder']['prototype']
        setTitle: (t: string) => PickerApi['PickerBuilder']['prototype']
        addView: (v: object) => PickerApi['PickerBuilder']['prototype']
        setCallback: (cb: (d: PickerCallbackData) => void) => PickerApi['PickerBuilder']['prototype']
        build: () => { setVisible: (v: boolean) => void }
      }
      ViewId: { DOCS: unknown }
      Action: { PICKED: string }
    }
    const picker = (window as unknown as { google?: { picker: PickerApi } }).google?.picker
    if (!picker) {
      resolve(null)
      return
    }
    const view = new picker.DocsView(picker.ViewId.DOCS).setIncludeFolders(false).setSelectFolderEnabled(false)
    new picker.PickerBuilder()
      .setAppId(APP_ID?.trim() || '')
      .setDeveloperKey(API_KEY!.trim())
      .setOAuthToken(accessToken)
      .setTitle('Elige tu copia de Atrium')
      .addView(view)
      .setCallback((data: PickerCallbackData) => {
        if (data.action !== picker.Action.PICKED || !data.docs?.[0]?.id) {
          resolve(null)
          return
        }
        resolve({ id: data.docs[0].id })
      })
      .build()
      .setVisible(true)
  })
}

/** Abre el selector de Google Drive y devuelve el contenido del archivo elegido. */
export async function pickBackupFromGoogleDrive(): Promise<string | null> {
  if (!configured()) {
    throw new Error('Google Drive no está configurado. Falta VITE_GOOGLE_CLIENT_ID / VITE_GOOGLE_API_KEY.')
  }
  await loadGis()
  await loadGapiPicker()
  const token = await getAccessToken()
  const picked = await openPicker(token)
  if (!picked) return null
  return downloadDriveFile(picked.id, token)
}
