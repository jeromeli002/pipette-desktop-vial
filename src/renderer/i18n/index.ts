// SPDX-License-Identifier: GPL-2.0-or-later

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import english from './locales/english.json'
import chinese from './locales/chinese.json'

const { name: _name, version: _version, ...englishTranslations } = english as Record<string, unknown>
const { name: _chineseName, version: _chineseVersion, ...chineseTranslations } = chinese as Record<string, unknown>

export const SUPPORTED_LANGUAGES = [
  { id: 'builtin:en', name: 'English' },
  { id: 'builtin:zh', name: '简体中文' },
] as const

i18n.use(initReactI18next).init({
  resources: {
    'builtin:en': { translation: englishTranslations },
    'builtin:zh': { translation: chineseTranslations },
  },
  lng: 'builtin:zh',
  fallbackLng: 'builtin:zh',
  keySeparator: '.',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
