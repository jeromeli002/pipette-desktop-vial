// SPDX-License-Identifier: GPL-2.0-or-later

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, RefreshCw } from 'lucide-react'
import { BTN_PRIMARY } from './settings-modal-shared'

const GUIDE_URL = 'https://jlkb.jlkb.top/tools/guide/'

export function SettingsGuideTab() {
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [iframeReady, setIframeReady] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!iframeReady) {
        setLoadFailed(true)
        setLoading(false)
      }
    }, 5000)

    return () => clearTimeout(timer)
  }, [iframeReady])

  const handleOpenInBrowser = () => {
    if (window.vialAPI && window.vialAPI.openExternal) {
      window.vialAPI.openExternal(GUIDE_URL)
    } else {
      window.open(GUIDE_URL, '_blank')
    }
  }

  const handleIframeLoad = () => {
    setIframeReady(true)
    setLoading(false)
    setLoadFailed(false)
  }

  const handleIframeError = () => {
    setLoadFailed(true)
    setLoading(false)
  }

  return (
    <div className="pt-4" aria-live="polite" data-testid="guide-tab-content">
      <div className="flex flex-col items-center gap-6">
        <button
          className={`${BTN_PRIMARY} px-6 py-2`}
          onClick={handleOpenInBrowser}
          data-testid="open-guide-browser"
        >
          <span className="flex items-center gap-2">
            <ExternalLink size={18} />
            {t('guide.openInBrowser')}
          </span>
        </button>
        <div className="w-full rounded-lg border border-edge bg-surface p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-[300px]">
              <RefreshCw className="h-8 w-8 animate-spin text-content-muted" />
              <p className="mt-4 text-sm text-content-secondary">{t('common.loading')}</p>
            </div>
          ) : loadFailed ? (
            <div className="flex flex-col items-center justify-center h-[300px] text-center">
              <p className="text-sm text-content-secondary mb-4">{t('guide.loadFailed')}</p>
              <button
                className={BTN_PRIMARY}
                onClick={handleOpenInBrowser}
              >
                <span className="flex items-center gap-2">
                  <ExternalLink size={16} />
                  {t('guide.openInBrowser')}
                </span>
              </button>
            </div>
          ) : (
            <iframe
              src={GUIDE_URL}
              className="h-[300px] w-full rounded"
              title={t('guide.title')}
              onLoad={handleIframeLoad}
              onError={handleIframeError}
            />
          )}
        </div>
      </div>
    </div>
  )
}
