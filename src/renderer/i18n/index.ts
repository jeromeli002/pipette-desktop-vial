// SPDX-License-Identifier: GPL-2.0-or-later

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import ja from './locales/ja.json'
import zhCN from './locales/zh-CN.json'
import zhTW from './locales/zh-TW.json'

export const SUPPORTED_LANGUAGES = [
  { id: 'en', name: 'English' },
  { id: 'ja', name: '日本語' },
  { id: 'zhCN', name: '简体中文' },
  { id: 'zhTW', name: '繁體中文' },
import english from './locales/english.json'

const { name: _name, version: _version, ...englishTranslations } = english as Record<string, unknown>

export const SUPPORTED_LANGUAGES = [
  { id: 'builtin:en', name: 'English' },
] as const

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ja: { translation: ja },
    zhCN: { translation: zhCN },
    zhTW: { translation: zhTW },
  },
  lng: undefined,
  fallbackLng: 'zhCN',
    'builtin:en': { translation: englishTranslations },
  },
  lng: 'builtin:en',
  fallbackLng: 'builtin:en',
  keySeparator: '.',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
