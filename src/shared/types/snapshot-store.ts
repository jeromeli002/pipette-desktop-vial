import type { HubPrivateLink } from './hub-private'

export interface SnapshotMeta {
   id: string // UUID v4
  label: string // User label (may be empty)
  filename: string // Internal filename: {deviceName}_{ISO_timestamp}
  savedAt: string // ISO 8601
  updatedAt?: string // ISO 8601 — last update time
  deletedAt?: string // ISO 8601 — tombstone timestamp
  hubPostId?: string // Pipette Hub post ID (set after public upload)
  hubPrivate?: HubPrivateLink // Private (unlisted) Hub linkage — exclusive with hubPostId
  vilVersion?: number // VilFile format version (1 = legacy, 2 = current)
  deviceName?: string // Device name for display
  createdAt?: string // ISO 8601 — creation time (legacy compat)
}

export interface SnapshotIndex {
  uid: string
  entries: SnapshotMeta[]
}
