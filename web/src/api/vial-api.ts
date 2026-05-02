/**
 * Web version of the Vial API that replaces Electron's contextBridge.
 * Uses localStorage for persistence and WebHID for device communication.
 */

import {
  listDevices,
  openHidDevice,
  closeHidDevice,
  isDeviceOpen,
  probeDevice,
} from '../hid-transport'
import * as protocol from '../protocol'
import type { DeviceInfo, KeyboardDefinition, ProbeResult } from '../shared/types/protocol'
import type { SnapshotMeta } from '../shared/types/snapshot-store'
import type { AnalyzeFilterSnapshotMeta } from '../shared/types/analyze-filter-store'
import type { SavedFavoriteMeta, FavoriteImportResult } from '../shared/types/favorite-store'
import type { KeyLabelMeta, KeyLabelRecord, KeyLabelStoreResult } from '../shared/types/key-label-store'
import type { HubKeyLabelItem, HubKeyLabelListResponse, HubKeyLabelListParams } from '../shared/types/hub-key-label'
import type { AppConfig } from '../shared/types/app-config'
import type { DeviceScope } from '../shared/types/analyze-filters'
import type { SyncAuthStatus, SyncProgress, PasswordStrength, SyncResetTargets, LocalResetTargets, UndecryptableFile, SyncDataScanResult, SyncScope, StoredKeyboardInfo, SyncOperationResult } from '../shared/types/sync'
import type { PipetteSettings } from '../shared/types/pipette-settings'
import type {
  LayoutComparisonOptions,
  LayoutComparisonResult,
  TypingActivityCell,
  TypingAnalyticsDeviceInfoBundle,
  TypingAnalyticsEvent,
  TypingDailySummary,
  TypingHeatmapByCell,
  TypingIntervalDailySummary,
  TypingKeyboardSummary,
  TypingKeymapSnapshot,
  TypingKeymapSnapshotSummary,
  TypingLayerUsageRow,
  TypingMatrixCellRow,
  TypingMatrixCellDailyRow,
  TypingMinuteStatsRow,
  TypingSessionRow,
  TypingBksMinuteRow,
  TypingTombstoneResult,
  PeakRecords,
  TypingBigramAggregateOptions,
  TypingBigramAggregateResult,
  TypingBigramAggregateView,
} from '../shared/types/typing-analytics'
import type { LanguageListEntry } from '../shared/types/language-store'
import type { HubUploadPostParams, HubUpdatePostParams, HubPatchPostParams, HubUploadResult, HubDeleteResult, HubFetchMyPostsResult, HubFetchMyPostsParams, HubFetchMyKeyboardPostsResult, HubUserResult, HubUploadFavoritePostParams, HubUpdateFavoritePostParams } from '../shared/types/hub'
import type { NotificationFetchResult } from '../shared/types/notification'
import * as xzDecompress from 'xz-decompress'
const XzReadableStream = xzDecompress?.XzReadableStream

const MAX_COMPRESSED_SIZE = 1 * 1024 * 1024   // 1 MB
const MAX_DECOMPRESSED_SIZE = 10 * 1024 * 1024 // 10 MB

const XZ_MAGIC = new Uint8Array([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00])

function hasXzMagic(buf: Uint8Array): boolean {
  if (buf.length < XZ_MAGIC.length) return false
  for (let i = 0; i < XZ_MAGIC.length; i++) {
    if (buf[i] !== XZ_MAGIC[i]) return false
  }
  return true
}

async function decompressXz(buf: Uint8Array): Promise<string | null> {
  if (!XzReadableStream) return null
  try {
    const input = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(buf))
        controller.close()
      },
    })
    const stream = new XzReadableStream(input)
    const reader = stream.getReader()
    const chunks: Uint8Array[] = []
    let totalSize = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      totalSize += value.byteLength
      if (totalSize > MAX_DECOMPRESSED_SIZE) {
        await reader.cancel()
        console.warn('XZ output exceeded limit:', totalSize, 'bytes')
        return null
      }
      chunks.push(value)
    }
    const merged = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0))
    let offset = 0
    for (const c of chunks) {
      merged.set(c, offset)
      offset += c.length
    }
    return new TextDecoder('utf-8').decode(merged)
  } catch (err) {
    console.warn('XZ decompress error:', err)
    return null
  }
}

// LocalStorage keys
const STORAGE_KEYS = {
  SNAPSHOTS: 'vial_snapshots',
  FAVORITES: 'vial_favorites',
  KEY_LABELS: 'vial_key_labels',
  SETTINGS: 'vial_settings',
  APP_CONFIG: 'vial_app_config',
  TYPING_ANALYTICS: 'vial_typing_analytics',
}

// Helper for localStorage
const getStorage = (key: string): any => {
  try {
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : null
  } catch {
    return null
  }
}

const setStorage = (key: string, value: any): void => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (err) {
    console.error('Failed to save to localStorage:', err)
  }
}

/**
 * API exposed to the renderer.
 */
export const vialAPI = {
  // --- Device Management (WebHID) ---
  listDevices: (): Promise<DeviceInfo[]> => listDevices(),
  openDevice: (vendorId: number, productId: number): Promise<boolean> =>
    openHidDevice(vendorId, productId),
  closeDevice: (): Promise<void> => closeHidDevice(),
  isDeviceOpen: (): Promise<boolean> => isDeviceOpen(),
  probeDevice: (vendorId: number, productId: number, serialNumber?: string): Promise<ProbeResult> =>
    probeDevice(vendorId, productId, serialNumber),

  // --- VIA Protocol ---
  getProtocolVersion: (): Promise<number> => protocol.getProtocolVersion(),
  getLayerCount: (): Promise<number> => protocol.getLayerCount(),
  getKeymapBuffer: (offset: number, size: number): Promise<number[]> =>
    protocol.getKeymapBuffer(offset, size),
  setKeycode: (layer: number, row: number, col: number, keycode: number): Promise<void> =>
    protocol.setKeycode(layer, row, col, keycode),
  getLayoutOptions: (): Promise<number> => protocol.getLayoutOptions(),
  setLayoutOptions: (options: number): Promise<void> => protocol.setLayoutOptions(options),

  // --- Vial Protocol ---
  getKeyboardId: (): Promise<{ vialProtocol: number; uid: string }> =>
    protocol.getKeyboardId(),
  getDefinitionSize: (): Promise<number> => protocol.getDefinitionSize(),
  getDefinitionRaw: (size: number): Promise<number[]> =>
    protocol.getDefinitionRaw(size).then((buf) => Array.from(buf)),
  getDefinition: async (): Promise<KeyboardDefinition | null> => {
    try {
      const size = await protocol.getDefinitionSize()
      if (size > MAX_COMPRESSED_SIZE) {
        console.warn('Definition size exceeds limit:', size)
        return null
      }
      const raw = await protocol.getDefinitionRaw(size)
      const rawUint8 = new Uint8Array(raw)

      let decompressed: string | null = null

      if (hasXzMagic(rawUint8)) {
        decompressed = await decompressXz(rawUint8)
      }

      if (!decompressed) {
        // Just try to see if it's already JSON
        try {
          const testStr = new TextDecoder('utf-8').decode(rawUint8)
          if (testStr.startsWith('{')) {
            decompressed = testStr
          }
        } catch {
          // Not plain JSON
        }
      }

      if (decompressed) {
        return JSON.parse(decompressed) as KeyboardDefinition
      }

      return null
    } catch (err) {
      console.warn('Failed to fetch or decompress definition:', err)
      return null
    }
  },

  requestDevice: async (): Promise<void> => {
    if (!('hid' in navigator)) {
      throw new Error('WebHID is not supported by your browser')
    }
    const filters = [
      { usagePage: 0xff60 },
      { usagePage: 0xff00 },
    ]
    try {
      await navigator.hid.requestDevice({ filters })
    } catch (err) {
      if (err && (err as Error).name !== 'NotFoundError') {
        throw err
      }
    }
  },
  getEncoder: (layer: number, index: number): Promise<[number, number]> =>
    protocol.getEncoder(layer, index),
  setEncoder: (layer: number, index: number, direction: number, keycode: number): Promise<void> =>
    protocol.setEncoder(layer, index, direction, keycode),

  // --- Macro ---
  getMacroCount: (): Promise<number> => protocol.getMacroCount(),
  getMacroBufferSize: (): Promise<number> => protocol.getMacroBufferSize(),
  getMacroBuffer: (totalSize: number): Promise<number[]> =>
    protocol.getMacroBuffer(totalSize),
  setMacroBuffer: (data: number[]): Promise<void> => protocol.setMacroBuffer(data),

  // --- Lighting ---
  getLightingValue: (id: number): Promise<number[]> => protocol.getLightingValue(id),
  setLightingValue: (id: number, ...args: number[]): Promise<void> =>
    protocol.setLightingValue(id, ...args),
  saveLighting: (): Promise<void> => protocol.saveLighting(),

  // --- VialRGB ---
  getVialRGBInfo: (): Promise<{ version: number; maxBrightness: number }> =>
    protocol.getVialRGBInfo(),
  getVialRGBMode: (): Promise<{ mode: number; speed: number; hue: number; sat: number; val: number }> =>
    protocol.getVialRGBMode(),
  getVialRGBSupported: (): Promise<number[]> =>
    protocol.getVialRGBSupported().then((s) => Array.from(s)),
  setVialRGBMode: (mode: number, speed: number, hue: number, sat: number, val: number): Promise<void> =>
    protocol.setVialRGBMode(mode, speed, hue, sat, val),

  // --- Lock/Unlock ---
  getUnlockStatus: (): Promise<{ unlocked: boolean; inProgress: boolean; keys: [number, number][] }> =>
    protocol.getUnlockStatus(),
  unlockStart: (): Promise<void> => protocol.unlockStart(),
  unlockPoll: (): Promise<number[]> => protocol.unlockPoll(),
  lock: (): Promise<void> => protocol.lock(),

  // --- Dynamic Entries ---
  getDynamicEntryCount: (): Promise<{ tapDance: number; combo: number; keyOverride: number; altRepeatKey: number; featureFlags: number }> =>
    protocol.getDynamicEntryCount(),
  getTapDance: (index: number): Promise<unknown> => protocol.getTapDance(index),
  setTapDance: (index: number, entry: unknown): Promise<void> =>
    protocol.setTapDance(index, entry as any),
  getCombo: (index: number): Promise<unknown> => protocol.getCombo(index),
  setCombo: (index: number, entry: unknown): Promise<void> =>
    protocol.setCombo(index, entry as any),
  getKeyOverride: (index: number): Promise<unknown> => protocol.getKeyOverride(index),
  setKeyOverride: (index: number, entry: unknown): Promise<void> =>
    protocol.setKeyOverride(index, entry as any),
  getAltRepeatKey: (index: number): Promise<unknown> => protocol.getAltRepeatKey(index),
  setAltRepeatKey: (index: number, entry: unknown): Promise<void> =>
    protocol.setAltRepeatKey(index, entry as any),

  // --- QMK Settings ---
  qmkSettingsQuery: (startId: number): Promise<number[]> =>
    protocol.qmkSettingsQuery(startId),
  qmkSettingsGet: (qsid: number): Promise<number[]> => protocol.qmkSettingsGet(qsid),
  qmkSettingsSet: (qsid: number, data: number[]): Promise<void> =>
    protocol.qmkSettingsSet(qsid, data),
  qmkSettingsReset: (): Promise<void> => protocol.qmkSettingsReset(),

  // --- Matrix Tester ---
  getMatrixState: (): Promise<number[]> => protocol.getMatrixState(),

  // --- File I/O (Browser downloads/uploads) ---
  saveLayout: async (json: string, deviceName?: string): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    try {
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${deviceName || 'keyboard'}_layout.vil`
      a.click()
      URL.revokeObjectURL(url)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
  loadLayout: async (title?: string, extensions?: string[]): Promise<{ success: boolean; data?: string; filePath?: string; error?: string }> => {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = extensions?.join(',') || '.vil,.json'
      
      input.onchange = (e: any) => {
        const file = e.target.files[0]
        if (!file) {
          resolve({ success: false, error: 'No file selected' })
          return
        }
        
        const reader = new FileReader()
        reader.onload = (event) => {
          const data = event.target?.result as string
          resolve({ success: true, data, filePath: file.name })
        }
        reader.onerror = () => {
          resolve({ success: false, error: 'Failed to read file' })
        }
        reader.readAsText(file)
      }
      
      input.click()
    })
  },
  exportKeymapC: async (content: string, deviceName?: string): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    try {
      const blob = new Blob([content], { type: 'text/plain' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${deviceName || 'keyboard'}_keymap.c`
      a.click()
      URL.revokeObjectURL(url)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
  exportPdf: async (base64Data: string, deviceName?: string): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    try {
      const byteCharacters = atob(base64Data)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${deviceName || 'keyboard'}_layout.pdf`
      a.click()
      URL.revokeObjectURL(url)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
  exportCsv: async (content: string, defaultName?: string): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    try {
      const blob = new Blob([content], { type: 'text/csv' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = defaultName || 'export.csv'
      a.click()
      URL.revokeObjectURL(url)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
  exportCsvBundle: async (
    files: ReadonlyArray<{ name: string; content: string }>,
  ): Promise<{ success: boolean; dirPath?: string; files?: string[]; error?: string }> => {
    try {
      // In web version, we can only download one file at a time
      // Download all files sequentially
      for (const file of files) {
        const blob = new Blob([file.content], { type: 'text/csv' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        a.click()
        URL.revokeObjectURL(url)
      }
      return { success: true, files: files.map(f => f.name) }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
  exportJson: async (content: string, defaultName?: string): Promise<{ success: boolean; filePath?: string; error?: string }> => {
    try {
      const blob = new Blob([content], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = defaultName || 'export.json'
      a.click()
      URL.revokeObjectURL(url)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  },
  sideloadJson: async (title?: string): Promise<{ success: boolean; data?: unknown; error?: string }> => {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json'
      
      input.onchange = (e: any) => {
        const file = e.target.files[0]
        if (!file) {
          resolve({ success: false, error: 'No file selected' })
          return
        }
        
        const reader = new FileReader()
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target?.result as string)
            resolve({ success: true, data })
          } catch {
            resolve({ success: false, error: 'Invalid JSON' })
          }
        }
        reader.onerror = () => {
          resolve({ success: false, error: 'Failed to read file' })
        }
        reader.readAsText(file)
      }
      
      input.click()
    })
  },

  // --- Snapshot Store (localStorage) ---
  snapshotStoreList: (uid: string): Promise<{ success: boolean; entries?: SnapshotMeta[]; error?: string }> => {
    const snapshots = getStorage(STORAGE_KEYS.SNAPSHOTS) || {}
    return Promise.resolve({ success: true, entries: snapshots[uid] || [] })
  },
  snapshotStoreSave: (uid: string, json: string, deviceName: string, label: string, vilVersion?: number): Promise<{ success: boolean; entry?: SnapshotMeta; error?: string }> => {
    const snapshots = getStorage(STORAGE_KEYS.SNAPSHOTS) || {}
    if (!snapshots[uid]) snapshots[uid] = []
    
    const entry: SnapshotMeta = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      label,
      deviceName,
      vilVersion: vilVersion || 2,
    }
    
    // Store the actual snapshot data in a separate key
    setStorage(`${STORAGE_KEYS.SNAPSHOTS}_${uid}_${entry.id}`, json)
    snapshots[uid].push(entry)
    setStorage(STORAGE_KEYS.SNAPSHOTS, snapshots)
    
    return Promise.resolve({ success: true, entry })
  },
  snapshotStoreLoad: (uid: string, entryId: string): Promise<{ success: boolean; data?: string; error?: string }> => {
    const data = getStorage(`${STORAGE_KEYS.SNAPSHOTS}_${uid}_${entryId}`)
    return Promise.resolve(data ? { success: true, data } : { success: false, error: 'Snapshot not found' })
  },
  snapshotStoreUpdate: (uid: string, entryId: string, json: string, vilVersion?: number): Promise<{ success: boolean; error?: string }> => {
    setStorage(`${STORAGE_KEYS.SNAPSHOTS}_${uid}_${entryId}`, json)
    return Promise.resolve({ success: true })
  },
  snapshotStoreRename: (uid: string, entryId: string, newLabel: string): Promise<{ success: boolean; error?: string }> => {
    const snapshots = getStorage(STORAGE_KEYS.SNAPSHOTS) || {}
    const entries = snapshots[uid] || []
    const entry = entries.find((e: any) => e.id === entryId)
    if (entry) {
      entry.label = newLabel
      setStorage(STORAGE_KEYS.SNAPSHOTS, snapshots)
      return Promise.resolve({ success: true })
    }
    return Promise.resolve({ success: false, error: 'Snapshot not found' })
  },
  snapshotStoreDelete: (uid: string, entryId: string): Promise<{ success: boolean; error?: string }> => {
    const snapshots = getStorage(STORAGE_KEYS.SNAPSHOTS) || {}
    snapshots[uid] = (snapshots[uid] || []).filter((e: any) => e.id !== entryId)
    setStorage(STORAGE_KEYS.SNAPSHOTS, snapshots)
    localStorage.removeItem(`${STORAGE_KEYS.SNAPSHOTS}_${uid}_${entryId}`)
    return Promise.resolve({ success: true })
  },

  // --- Analyze Filter Store ---
  analyzeFilterStoreList: (uid: string): Promise<{ success: boolean; entries?: AnalyzeFilterSnapshotMeta[]; error?: string }> => {
    const filters = getStorage('vial_analyze_filters') || {}
    return Promise.resolve({ success: true, entries: filters[uid] || [] })
  },
  analyzeFilterStoreSave: (uid: string, json: string, label: string, summary?: string): Promise<{ success: boolean; entry?: AnalyzeFilterSnapshotMeta; error?: string }> => {
    const filters = getStorage('vial_analyze_filters') || {}
    if (!filters[uid]) filters[uid] = []
    
    const entry: AnalyzeFilterSnapshotMeta = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      label,
      summary,
    }
    
    setStorage(`vial_analyze_filters_${uid}_${entry.id}`, json)
    filters[uid].push(entry)
    setStorage('vial_analyze_filters', filters)
    
    return Promise.resolve({ success: true, entry })
  },
  analyzeFilterStoreLoad: (uid: string, entryId: string): Promise<{ success: boolean; data?: string; error?: string }> => {
    const data = getStorage(`vial_analyze_filters_${uid}_${entryId}`)
    return Promise.resolve(data ? { success: true, data } : { success: false, error: 'Filter not found' })
  },
  analyzeFilterStoreUpdate: (uid: string, entryId: string, json: string): Promise<{ success: boolean; error?: string }> => {
    setStorage(`vial_analyze_filters_${uid}_${entryId}`, json)
    return Promise.resolve({ success: true })
  },
  analyzeFilterStoreRename: (uid: string, entryId: string, newLabel: string): Promise<{ success: boolean; error?: string }> => {
    const filters = getStorage('vial_analyze_filters') || {}
    const entries = filters[uid] || []
    const entry = entries.find((e: any) => e.id === entryId)
    if (entry) {
      entry.label = newLabel
      setStorage('vial_analyze_filters', filters)
      return Promise.resolve({ success: true })
    }
    return Promise.resolve({ success: false, error: 'Filter not found' })
  },
  analyzeFilterStoreDelete: (uid: string, entryId: string): Promise<{ success: boolean; error?: string }> => {
    const filters = getStorage('vial_analyze_filters') || {}
    filters[uid] = (filters[uid] || []).filter((e: any) => e.id !== entryId)
    setStorage('vial_analyze_filters', filters)
    localStorage.removeItem(`vial_analyze_filters_${uid}_${entryId}`)
    return Promise.resolve({ success: true })
  },

  // --- Favorite Store ---
  favoriteStoreList: (type: string): Promise<{ success: boolean; entries?: SavedFavoriteMeta[]; error?: string }> => {
    const favorites = getStorage(STORAGE_KEYS.FAVORITES) || {}
    return Promise.resolve({ success: true, entries: favorites[type] || [] })
  },
  favoriteStoreSave: (type: string, json: string, label: string): Promise<{ success: boolean; entry?: SavedFavoriteMeta; error?: string }> => {
    const favorites = getStorage(STORAGE_KEYS.FAVORITES) || {}
    if (!favorites[type]) favorites[type] = []
    
    const entry: SavedFavoriteMeta = {
      id: Date.now().toString(),
      createdAt: new Date().toISOString(),
      label,
    }
    
    setStorage(`vial_favorites_${type}_${entry.id}`, json)
    favorites[type].push(entry)
    setStorage(STORAGE_KEYS.FAVORITES, favorites)
    
    return Promise.resolve({ success: true, entry })
  },
  favoriteStoreLoad: (type: string, entryId: string): Promise<{ success: boolean; data?: string; error?: string }> => {
    const data = getStorage(`vial_favorites_${type}_${entryId}`)
    return Promise.resolve(data ? { success: true, data } : { success: false, error: 'Favorite not found' })
  },
  favoriteStoreRename: (type: string, entryId: string, newLabel: string): Promise<{ success: boolean; error?: string }> => {
    const favorites = getStorage(STORAGE_KEYS.FAVORITES) || {}
    const entries = favorites[type] || []
    const entry = entries.find((e: any) => e.id === entryId)
    if (entry) {
      entry.label = newLabel
      setStorage(STORAGE_KEYS.FAVORITES, favorites)
      return Promise.resolve({ success: true })
    }
    return Promise.resolve({ success: false, error: 'Favorite not found' })
  },
  favoriteStoreDelete: (type: string, entryId: string): Promise<{ success: boolean; error?: string }> => {
    const favorites = getStorage(STORAGE_KEYS.FAVORITES) || {}
    favorites[type] = (favorites[type] || []).filter((e: any) => e.id !== entryId)
    setStorage(STORAGE_KEYS.FAVORITES, favorites)
    localStorage.removeItem(`vial_favorites_${type}_${entryId}`)
    return Promise.resolve({ success: true })
  },
  favoriteStoreExport: (scope: string, vialProtocol: number, entryId?: string): Promise<{ success: boolean; error?: string }> => {
    // Web version placeholder
    return Promise.resolve({ success: false, error: 'Not implemented in web version' })
  },
  favoriteStoreExportCurrent: (scope: string, vialProtocol: number, data: string): Promise<{ success: boolean; error?: string }> => {
    // Web version placeholder
    return Promise.resolve({ success: false, error: 'Not implemented in web version' })
  },
  favoriteStoreImport: (): Promise<FavoriteImportResult> => {
    // Web version placeholder
    return Promise.resolve({ success: false, error: 'Not implemented in web version' } as FavoriteImportResult)
  },
  favoriteStoreImportToCurrent: (scope: string): Promise<{ success: boolean; data?: unknown; error?: string }> => {
    // Web version placeholder
    return Promise.resolve({ success: false, error: 'Not implemented in web version' })
  },

  // --- Key Label Store ---
  keyLabelStoreList: (): Promise<KeyLabelStoreResult<KeyLabelMeta[]>> => {
    const labels = getStorage(STORAGE_KEYS.KEY_LABELS) || { entries: [] }
    return Promise.resolve({ success: true, data: labels.entries || [] })
  },
  keyLabelStoreListAll: (): Promise<KeyLabelStoreResult<KeyLabelMeta[]>> => {
    const labels = getStorage(STORAGE_KEYS.KEY_LABELS) || { entries: [] }
    return Promise.resolve({ success: true, data: labels.entries || [] })
  },
  keyLabelStoreGet: (id: string): Promise<KeyLabelStoreResult<KeyLabelRecord>> => {
    const labels = getStorage(STORAGE_KEYS.KEY_LABELS) || {}
    const data = labels[id]
    return Promise.resolve(data ? { success: true, data } : { success: false, error: 'Key label not found' })
  },
  keyLabelStoreRename: (id: string, newName: string): Promise<KeyLabelStoreResult<KeyLabelMeta>> => {
    const labels = getStorage(STORAGE_KEYS.KEY_LABELS) || { entries: [] }
    const entry = labels.entries?.find((e: any) => e.id === id)
    if (entry) {
      entry.name = newName
      setStorage(STORAGE_KEYS.KEY_LABELS, labels)
      return Promise.resolve({ success: true, data: entry })
    }
    return Promise.resolve({ success: false, error: 'Key label not found' })
  },
  keyLabelStoreDelete: (id: string): Promise<KeyLabelStoreResult<void>> => {
    const labels = getStorage(STORAGE_KEYS.KEY_LABELS) || { entries: [] }
    labels.entries = (labels.entries || []).filter((e: any) => e.id !== id)
    delete labels[id]
    setStorage(STORAGE_KEYS.KEY_LABELS, labels)
    return Promise.resolve({ success: true })
  },
  keyLabelStoreImport: (): Promise<KeyLabelStoreResult<KeyLabelMeta>> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' })
  },
  keyLabelStoreExport: (id: string): Promise<KeyLabelStoreResult<{ filePath: string }>> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' })
  },
  keyLabelStoreReorder: (orderedIds: string[]): Promise<KeyLabelStoreResult<void>> => {
    const labels = getStorage(STORAGE_KEYS.KEY_LABELS) || { entries: [] }
    // Reorder entries based on orderedIds
    if (labels.entries) {
      const newEntries: any[] = []
      for (const id of orderedIds) {
        const entry = labels.entries.find((e: any) => e.id === id)
        if (entry) newEntries.push(entry)
      }
      labels.entries = newEntries
      setStorage(STORAGE_KEYS.KEY_LABELS, labels)
    }
    return Promise.resolve({ success: true })
  },
  keyLabelStoreSetHubPostId: (id: string, hubPostId: string | null): Promise<KeyLabelStoreResult<KeyLabelMeta>> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' })
  },
  keyLabelStoreHasName: (name: string, excludeId?: string): Promise<KeyLabelStoreResult<boolean>> => {
    const labels = getStorage(STORAGE_KEYS.KEY_LABELS) || { entries: [] }
    const exists = labels.entries?.some((e: any) => e.name === name && e.id !== excludeId)
    return Promise.resolve({ success: true, data: !!exists })
  },

  // --- Key Label Hub ---
  keyLabelHubList: (params?: HubKeyLabelListParams): Promise<KeyLabelStoreResult<HubKeyLabelListResponse>> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' })
  },
  keyLabelHubDetail: (hubPostId: string): Promise<KeyLabelStoreResult<HubKeyLabelItem>> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' })
  },
  keyLabelHubDownload: (hubPostId: string): Promise<KeyLabelStoreResult<KeyLabelMeta>> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' })
  },
  keyLabelHubUpload: (localId: string): Promise<KeyLabelStoreResult<KeyLabelMeta>> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' })
  },
  keyLabelHubUpdate: (localId: string): Promise<KeyLabelStoreResult<KeyLabelMeta>> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' })
  },
  keyLabelHubDelete: (localId: string): Promise<KeyLabelStoreResult<void>> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' })
  },

  // --- Pipette Settings Store ---
  pipetteSettingsGet: (uid: string): Promise<PipetteSettings | null> => {
    const settings = getStorage(STORAGE_KEYS.SETTINGS) || {}
    return Promise.resolve(settings[uid] || null)
  },
  pipetteSettingsSet: (uid: string, prefs: PipetteSettings): Promise<{ success: boolean; error?: string }> => {
    const settings = getStorage(STORAGE_KEYS.SETTINGS) || {}
    settings[uid] = prefs
    setStorage(STORAGE_KEYS.SETTINGS, settings)
    return Promise.resolve({ success: true })
  },

  // --- Typing Analytics ---
  typingAnalyticsEvent: (event: TypingAnalyticsEvent): Promise<void> => {
    const analytics = getStorage(STORAGE_KEYS.TYPING_ANALYTICS) || { events: [] }
    analytics.events.push({ ...event, timestamp: Date.now() })
    setStorage(STORAGE_KEYS.TYPING_ANALYTICS, analytics)
    return Promise.resolve()
  },
  typingAnalyticsFlush: (uid: string): Promise<void> => Promise.resolve(),
  typingAnalyticsListAppsForRange: (
    uid: string,
    sinceMs: number,
    untilMs: number,
    scope: unknown,
  ): Promise<{ name: string; keystrokes: number; activeMs: number }[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsGetAppUsageForRange: (
    uid: string,
    sinceMs: number,
    untilMs: number,
    scope: unknown,
  ): Promise<{ name: string; keystrokes: number; activeMs: number }[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsGetWpmByAppForRange: (
    uid: string,
    sinceMs: number,
    untilMs: number,
    scope: unknown,
  ): Promise<{ name: string; keystrokes: number; activeMs: number }[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListKeyboards: (): Promise<TypingKeyboardSummary[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListItems: (uid: string, appScopes: string[] = []): Promise<TypingDailySummary[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsDeleteItems: (uid: string, dates: string[]): Promise<TypingTombstoneResult> => {
    return Promise.resolve({ success: true, deletedCount: 0 } as TypingTombstoneResult)
  },
  typingAnalyticsDeleteAll: (uid: string): Promise<TypingTombstoneResult> => {
    return Promise.resolve({ success: true, deletedCount: 0 } as TypingTombstoneResult)
  },
  typingAnalyticsGetMatrixHeatmap: (
    uid: string,
    layer: number,
    sinceMs: number,
  ): Promise<TypingHeatmapByCell> => {
    return Promise.resolve({})
  },
  typingAnalyticsListItemsLocal: (uid: string, appScopes: string[] = []): Promise<TypingDailySummary[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListDeviceInfos: (uid: string): Promise<TypingAnalyticsDeviceInfoBundle | null> => {
    return Promise.resolve(null)
  },
  typingAnalyticsListItemsForHash: (uid: string, machineHash: string, appScopes: string[] = []): Promise<TypingDailySummary[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListIntervalItems: (uid: string): Promise<TypingIntervalDailySummary[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListIntervalItemsLocal: (uid: string): Promise<TypingIntervalDailySummary[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListIntervalItemsForHash: (uid: string, machineHash: string): Promise<TypingIntervalDailySummary[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListActivityGrid: (uid: string, sinceMs: number, untilMs: number, appScopes: string[] = []): Promise<TypingActivityCell[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListActivityGridLocal: (uid: string, sinceMs: number, untilMs: number, appScopes: string[] = []): Promise<TypingActivityCell[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListActivityGridForHash: (uid: string, machineHash: string, sinceMs: number, untilMs: number, appScopes: string[] = []): Promise<TypingActivityCell[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListLayerUsage: (uid: string, sinceMs: number, untilMs: number, appScopes: string[] = []): Promise<TypingLayerUsageRow[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListLayerUsageLocal: (uid: string, sinceMs: number, untilMs: number, appScopes: string[] = []): Promise<TypingLayerUsageRow[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListLayerUsageForHash: (uid: string, machineHash: string, sinceMs: number, untilMs: number, appScopes: string[] = []): Promise<TypingLayerUsageRow[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListMatrixCells: (uid: string, sinceMs: number, untilMs: number, appScopes: string[] = []): Promise<TypingMatrixCellRow[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListMatrixCellsLocal: (uid: string, sinceMs: number, untilMs: number, appScopes: string[] = []): Promise<TypingMatrixCellRow[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListMatrixCellsForHash: (uid: string, machineHash: string, sinceMs: number, untilMs: number, appScopes: string[] = []): Promise<TypingMatrixCellRow[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListMatrixCellsByDay: (uid: string, sinceMs: number, untilMs: number, appScopes: string[] = []): Promise<TypingMatrixCellDailyRow[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListMatrixCellsByDayLocal: (uid: string, sinceMs: number, untilMs: number, appScopes: string[] = []): Promise<TypingMatrixCellDailyRow[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListMatrixCellsByDayForHash: (uid: string, machineHash: string, sinceMs: number, untilMs: number, appScopes: string[] = []): Promise<TypingMatrixCellDailyRow[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListMinuteStats: (uid: string, sinceMs: number, untilMs: number, appScopes: string[] = []): Promise<TypingMinuteStatsRow[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListMinuteStatsLocal: (uid: string, sinceMs: number, untilMs: number, appScopes: string[] = []): Promise<TypingMinuteStatsRow[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListMinuteStatsForHash: (uid: string, machineHash: string, sinceMs: number, untilMs: number, appScopes: string[] = []): Promise<TypingMinuteStatsRow[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListSessions: (uid: string, sinceMs: number, untilMs: number): Promise<TypingSessionRow[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListSessionsLocal: (uid: string, sinceMs: number, untilMs: number): Promise<TypingSessionRow[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListSessionsForHash: (uid: string, machineHash: string, sinceMs: number, untilMs: number): Promise<TypingSessionRow[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListBksMinute: (uid: string, sinceMs: number, untilMs: number, appScopes: string[] = []): Promise<TypingBksMinuteRow[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListBksMinuteLocal: (uid: string, sinceMs: number, untilMs: number, appScopes: string[] = []): Promise<TypingBksMinuteRow[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsListBksMinuteForHash: (uid: string, machineHash: string, sinceMs: number, untilMs: number, appScopes: string[] = []): Promise<TypingBksMinuteRow[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsGetPeakRecords: (uid: string, sinceMs: number, untilMs: number, appScopes: string[] = []): Promise<PeakRecords> => {
    return Promise.resolve({} as PeakRecords)
  },
  typingAnalyticsGetPeakRecordsLocal: (uid: string, sinceMs: number, untilMs: number, appScopes: string[] = []): Promise<PeakRecords> => {
    return Promise.resolve({} as PeakRecords)
  },
  typingAnalyticsGetPeakRecordsForHash: (uid: string, machineHash: string, sinceMs: number, untilMs: number, appScopes: string[] = []): Promise<PeakRecords> => {
    return Promise.resolve({} as PeakRecords)
  },
  typingAnalyticsSaveKeymapSnapshot: (partial: Omit<TypingKeymapSnapshot, 'machineHash'>): Promise<{ saved: boolean; savedAt: number | null }> => {
    return Promise.resolve({ saved: true, savedAt: Date.now() })
  },
  typingAnalyticsGetKeymapSnapshotForRange: (uid: string, fromMs: number, toMs: number): Promise<TypingKeymapSnapshot | null> => {
    return Promise.resolve(null)
  },
  typingAnalyticsListKeymapSnapshots: (uid: string): Promise<TypingKeymapSnapshotSummary[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsGetMatrixHeatmapForRange: (uid: string, layer: number, sinceMs: number, untilMs: number, scope: DeviceScope, appScopes: string[] = []): Promise<TypingHeatmapByCell> => {
    return Promise.resolve({})
  },
  typingAnalyticsGetBigramAggregateForRange: (
    uid: string,
    sinceMs: number,
    untilMs: number,
    view: TypingBigramAggregateView,
    scope: DeviceScope,
    options?: TypingBigramAggregateOptions,
    appScopes: string[] = [],
  ): Promise<TypingBigramAggregateResult> => {
    return Promise.resolve({} as TypingBigramAggregateResult)
  },
  typingAnalyticsGetLayoutComparisonForRange: (
    uid: string,
    sinceMs: number,
    untilMs: number,
    scope: DeviceScope,
    options: LayoutComparisonOptions,
    appScopes: string[] = [],
  ): Promise<LayoutComparisonResult | null> => {
    return Promise.resolve(null)
  },
  typingAnalyticsListLocalDeviceDays: (uid: string, machineHash: string): Promise<string[]> => {
    return Promise.resolve([])
  },
  typingAnalyticsHasRemote: (): Promise<boolean> => Promise.resolve(false),
  typingAnalyticsListRemoteCloudHashes: (uid: string): Promise<string[]> => Promise.resolve([]),
  typingAnalyticsListRemoteCloudDays: (uid: string, machineHash: string): Promise<string[]> => Promise.resolve([]),
  typingAnalyticsFetchRemoteDay: (uid: string, machineHash: string, utcDay: string): Promise<boolean> => Promise.resolve(false),
  typingAnalyticsDeleteRemoteDay: (uid: string, machineHash: string, utcDay: string): Promise<boolean> => Promise.resolve(false),
  typingAnalyticsExport: (uid: string, dates: string[]): Promise<{ written: number; cancelled: boolean }> => {
    return Promise.resolve({ written: 0, cancelled: false })
  },
  typingAnalyticsImport: (): Promise<{ result: { imported: number; rejections: { fileName: string; reason: string }[] }; cancelled: boolean }> => {
    return Promise.resolve({ result: { imported: 0, rejections: [] }, cancelled: false })
  },

  // --- Language Store ---
  langList: (): Promise<LanguageListEntry[]> => {
    return Promise.resolve([])
  },
  langGet: (name: string): Promise<unknown> => {
    return Promise.resolve(null)
  },
  langDownload: (name: string): Promise<{ success: boolean; error?: string }> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' })
  },
  langDelete: (name: string): Promise<{ success: boolean; error?: string }> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' })
  },

  // --- App Config ---
  appConfigGetAll: (): Promise<AppConfig> => {
    const config = getStorage(STORAGE_KEYS.APP_CONFIG) || {}
    return Promise.resolve(config as AppConfig)
  },
  appConfigSet: (key: string, value: unknown): Promise<void> => {
    const config = getStorage(STORAGE_KEYS.APP_CONFIG) || {}
    config[key] = value
    setStorage(STORAGE_KEYS.APP_CONFIG, config)
    return Promise.resolve()
  },

  // --- Sync ---
  syncAuthStart: (): Promise<{ success: boolean; error?: string }> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' })
  },
  syncAuthStatus: (): Promise<SyncAuthStatus> => {
    return Promise.resolve({ authenticated: false } as SyncAuthStatus)
  },
  syncAuthSignOut: (): Promise<SyncOperationResult> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' } as SyncOperationResult)
  },
  syncExecute: (direction: 'download' | 'upload', scope?: SyncScope): Promise<SyncOperationResult> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' } as SyncOperationResult)
  },
  syncSetPassword: (password: string): Promise<SyncOperationResult> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' } as SyncOperationResult)
  },
  syncChangePassword: (newPassword: string): Promise<SyncOperationResult> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' } as SyncOperationResult)
  },
  syncResetTargets: (targets: SyncResetTargets): Promise<SyncOperationResult> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' } as SyncOperationResult)
  },
  syncHasPassword: (): Promise<boolean> => Promise.resolve(false),
  syncValidatePassword: (password: string): Promise<PasswordStrength> => {
    return Promise.resolve({ score: 0 } as PasswordStrength)
  },
  syncOnProgress: (callback: (progress: SyncProgress) => void): (() => void) => {
    // No-op in web version
    return () => {}
  },
  syncHasPendingChanges: (): Promise<boolean> => Promise.resolve(false),
  syncListUndecryptable: (): Promise<UndecryptableFile[]> => Promise.resolve([]),
  syncScanRemote: (): Promise<SyncDataScanResult> => {
    return Promise.resolve({} as SyncDataScanResult)
  },
  syncFetchRemoteBundle: (syncUnit: string): Promise<unknown> => Promise.resolve(null),
  syncDeleteFiles: (fileIds: string[]): Promise<{ success: boolean; error?: string }> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' })
  },
  syncCheckPasswordExists: (): Promise<boolean> => Promise.resolve(false),
  syncAnalyticsNow: (uid: string): Promise<boolean> => Promise.resolve(false),
  syncOnPendingChange: (callback: (pending: boolean) => void): (() => void) => {
    // No-op in web version
    return () => {}
  },

  // --- Hub ---
  hubUploadPost: (params: HubUploadPostParams): Promise<HubUploadResult> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' } as HubUploadResult)
  },
  hubUpdatePost: (params: HubUpdatePostParams): Promise<HubUploadResult> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' } as HubUploadResult)
  },
  hubPatchPost: (params: HubPatchPostParams): Promise<HubDeleteResult> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' } as HubDeleteResult)
  },
  hubDeletePost: (postId: string): Promise<HubDeleteResult> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' } as HubDeleteResult)
  },
  hubFetchMyPosts: (params?: HubFetchMyPostsParams): Promise<HubFetchMyPostsResult> => {
    return Promise.resolve({ posts: [] } as HubFetchMyPostsResult)
  },
  hubFetchMyKeyboardPosts: (keyboardName: string): Promise<HubFetchMyKeyboardPostsResult> => {
    return Promise.resolve({ posts: [] } as HubFetchMyKeyboardPostsResult)
  },
  hubFetchAuthMe: (): Promise<HubUserResult> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' } as HubUserResult)
  },
  hubPatchAuthMe: (displayName: string): Promise<HubUserResult> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' } as HubUserResult)
  },
  hubSetAuthDisplayName: (displayName: string | null): Promise<void> => Promise.resolve(),
  hubGetOrigin: (): Promise<string> => Promise.resolve(''),

  // --- Notification ---
  notificationFetch: (): Promise<NotificationFetchResult> => {
    return Promise.resolve({ notifications: [] } as NotificationFetchResult)
  },

  // --- Hub Feature posts (favorites) ---
  hubUploadFavoritePost: (params: HubUploadFavoritePostParams): Promise<HubUploadResult> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' } as HubUploadResult)
  },
  hubUpdateFavoritePost: (params: HubUpdateFavoritePostParams): Promise<HubUploadResult> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' } as HubUploadResult)
  },

  // --- Favorite Store extensions ---
  favoriteStoreSetHubPostId: (type: string, entryId: string, hubPostId: string | null): Promise<{ success: boolean; error?: string }> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' })
  },

  // --- Snapshot Store extensions ---
  snapshotStoreSetHubPostId: (uid: string, entryId: string, hubPostId: string | null): Promise<{ success: boolean; error?: string }> => {
    return Promise.resolve({ success: false, error: 'Not implemented in web version' })
  },

  // --- Shell ---
  openExternal: (url: string): Promise<void> => {
    window.open(url, '_blank')
    return Promise.resolve()
  },

  // --- Data Management ---
  listStoredKeyboards: (): Promise<StoredKeyboardInfo[]> => {
    return Promise.resolve([])
  },
  resetKeyboardData: (uid: string): Promise<{ success: boolean; error?: string }> => {
    // Clear all data for this keyboard
    const snapshots = getStorage(STORAGE_KEYS.SNAPSHOTS) || {}
    for (const id of (snapshots[uid] || []).map((e: any) => e.id)) {
      localStorage.removeItem(`${STORAGE_KEYS.SNAPSHOTS}_${uid}_${id}`)
    }
    delete snapshots[uid]
    setStorage(STORAGE_KEYS.SNAPSHOTS, snapshots)
    
    const settings = getStorage(STORAGE_KEYS.SETTINGS) || {}
    delete settings[uid]
    setStorage(STORAGE_KEYS.SETTINGS, settings)
    
    return Promise.resolve({ success: true })
  },
  resetLocalTargets: (targets: LocalResetTargets): Promise<{ success: boolean; error?: string }> => {
    if (targets.snapshots) {
      localStorage.removeItem(STORAGE_KEYS.SNAPSHOTS)
    }
    if (targets.favorites) {
      localStorage.removeItem(STORAGE_KEYS.FAVORITES)
    }
    if (targets.keyLabels) {
      localStorage.removeItem(STORAGE_KEYS.KEY_LABELS)
    }
    if (targets.typingAnalytics) {
      localStorage.removeItem(STORAGE_KEYS.TYPING_ANALYTICS)
    }
    if (targets.settings) {
      localStorage.removeItem(STORAGE_KEYS.SETTINGS)
    }
    return Promise.resolve({ success: true })
  },
  exportLocalData: (): Promise<{ success: boolean; error?: string }> => {
    // Export all localStorage data
    const exportData: any = {}
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key) {
        exportData[key] = getStorage(key)
      }
    }
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'vial_web_data_backup.json'
    a.click()
    URL.revokeObjectURL(url)
    
    return Promise.resolve({ success: true })
  },
  importLocalData: (): Promise<{ success: boolean; error?: string }> => {
    return new Promise((resolve) => {
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = '.json'
      
      input.onchange = (e: any) => {
        const file = e.target.files[0]
        if (!file) {
          resolve({ success: false, error: 'No file selected' })
          return
        }
        
        const reader = new FileReader()
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target?.result as string)
            // Restore all keys
            for (const [key, value] of Object.entries(data)) {
              setStorage(key, value)
            }
            resolve({ success: true })
          } catch {
            resolve({ success: false, error: 'Invalid JSON' })
          }
        }
        reader.onerror = () => {
          resolve({ success: false, error: 'Failed to read file' })
        }
        reader.readAsText(file)
      }
      
      input.click()
    })
  },

  // --- Window Management ---
  setWindowCompactMode: (enabled: boolean, compactSize?: { width: number; height: number }): Promise<{ width: number; height: number } | null> => {
    // No-op in web version
    return Promise.resolve(null)
  },
  setWindowAspectRatio: (ratio: number): Promise<void> => Promise.resolve(),
  setWindowAlwaysOnTop: (enabled: boolean): Promise<void> => Promise.resolve(),
  setWindowMinSize: (width: number, height: number): Promise<void> => Promise.resolve(),
  setWindowTitle: (title: string): Promise<void> => {
    document.title = title
    return Promise.resolve()
  },
  isAlwaysOnTopSupported: (): Promise<boolean> => Promise.resolve(false),
}
