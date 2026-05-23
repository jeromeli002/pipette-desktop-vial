// SPDX-License-Identifier: GPL-2.0-or-later
// Hub API client for /api/key-labels — list/download (public),
// upload/update/delete (auth required).

import type {
  HubKeyLabelItem,
  HubKeyLabelListResponse,
  HubKeyLabelListParams,
  HubKeyLabelTimestampsResponse,
} from '../../shared/types/hub-key-label'

const HUB_API_DEFAULT = 'https://pipette-hub-worker.keymaps.workers.dev'
const IS_DEV = import.meta.env.DEV
const HUB_API_BASE = IS_DEV ? '' : HUB_API_DEFAULT
const MAX_RETRY_AFTER_S = 60

export interface HubKeyLabelDownload {
  name: string
  map: Record<string, string>
  composite_labels: Record<string, string> | null
}

export interface HubKeyLabelInput {
  name: string
  map: Record<string, string>
  compositeLabels?: Record<string, string> | null
}

interface HubApiResponse<T> {
  ok: boolean
  data: T
  error?: string
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null
  const seconds = Number(header)
  if (Number.isFinite(seconds) && seconds >= 0) return seconds
  const date = Date.parse(header)
  if (!Number.isNaN(date)) return Math.max(0, Math.ceil((date - Date.now()) / 1000))
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function hubFetch<T>(url: string, init: RequestInit, label: string): Promise<T> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url, init)

    if (response.status === 429) {
      const retryAfter = parseRetryAfter(response.headers.get('Retry-After'))
      if (attempt === 0 && retryAfter != null && retryAfter <= MAX_RETRY_AFTER_S) {
        await sleep(retryAfter * 1000)
        continue
      }
      const text = await response.text()
      throw new Error(`${label}: Rate limited (${retryAfter}s)`)
    }

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`${label}: ${String(response.status)} ${text}`)
    }

    const json = (await response.json()) as HubApiResponse<T>
    if (!json.ok) {
      throw new Error(`${label}: ${json.error ?? 'unknown error'}`)
    }
    return json.data
  }
  throw new Error(`${label}: unexpected retry exhaustion`)
}

export async function fetchKeyLabelList(query: HubKeyLabelListParams): Promise<HubKeyLabelListResponse> {
  const qs = new URLSearchParams()
  if (query.q && query.q.trim()) qs.set('q', query.q.trim())
  if (query.page != null) qs.set('page', String(query.page))
  if (query.perPage != null) qs.set('per_page', String(query.perPage))
  const tail = qs.toString()
  const url = `${HUB_API_BASE}/api/key-labels${tail ? `?${tail}` : ''}`
  return hubFetch<HubKeyLabelListResponse>(url, { method: 'GET' }, 'Hub key-label list failed')
}

export async function fetchKeyLabelDetail(hubPostId: string): Promise<HubKeyLabelItem> {
  return hubFetch<HubKeyLabelItem>(
    `${HUB_API_BASE}/api/key-labels/${encodeURIComponent(hubPostId)}`,
    { method: 'GET' },
    'Hub key-label fetch failed',
  )
}

export async function fetchKeyLabelTimestamps(ids: string[]): Promise<HubKeyLabelTimestampsResponse> {
  return hubFetch<HubKeyLabelTimestampsResponse>(
    `${HUB_API_BASE}/api/key-labels/timestamps`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    },
    'Hub key-label timestamps fetch failed',
  )
}

export async function downloadKeyLabel(hubPostId: string): Promise<HubKeyLabelDownload> {
  const url = `${HUB_API_BASE}/api/key-labels/${encodeURIComponent(hubPostId)}/download`
  const response = await fetch(url, { method: 'GET' })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Hub key-label download failed: ${String(response.status)} ${text}`)
  }
  return (await response.json()) as HubKeyLabelDownload
}