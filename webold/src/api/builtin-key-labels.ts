// SPDX-License-Identifier: GPL-2.0-or-later
// Built-in Key Labels presets loader

export interface BuiltinKeyLabelEntry {
  id: string
  name: string
  filename: string
}

export interface BuiltinKeyLabelList {
  labels: BuiltinKeyLabelEntry[]
}

export interface BuiltinKeyLabelData {
  name: string
  map: Record<string, string>
  composite_labels: Record<string, string> | null
}

/**
 * Load the labels list from the built-in labelslist.json
 */
export async function loadBuiltinLabelsList(): Promise<BuiltinKeyLabelList> {
  const response = await fetch('/hub/key-labels/labelslist.json')
  if (!response.ok) {
    throw new Error(`Failed to load labels list: ${response.status}`)
  }
  return response.json() as Promise<BuiltinKeyLabelList>
}

/**
 * Load a specific key label data from the built-in presets
 */
export async function loadBuiltinKeyLabel(filename: string): Promise<BuiltinKeyLabelData> {
  const response = await fetch(`/hub/key-labels/${filename}`)
  if (!response.ok) {
    throw new Error(`Failed to load key label ${filename}: ${response.status}`)
  }
  return response.json() as Promise<BuiltinKeyLabelData>
}
