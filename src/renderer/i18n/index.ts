// SPDX-License-Identifier: GPL-2.0-or-later

import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import english from './locales/english.json'
import japanese from './locales/japanese.json'
import zhCN from './locales/zh-CN.json'
import zhTW from './locales/zh-TW.json'

export const SUPPORTED_LANGUAGES = [
  { id: 'builtin:en', name: 'English' },
  { id: 'ja', name: '日本語' },
  { id: 'zhCN', name: '简体中文' },
  { id: 'zhTW', name: '繁體中文' },
] as const

i18n.use(initReactI18next).init({
  resources: {
    'builtin:en': { translation: english },
    'ja': { translation: japanese },
    'zhCN': { translation: zhCN },
    'zhTW': { translation: zhTW },
  },
  lng: 'zhCN',
  fallbackLng: 'zhCN',
  keySeparator: '.',
  interpolation: {
    escapeValue: false,
  },
})

export default i18n
