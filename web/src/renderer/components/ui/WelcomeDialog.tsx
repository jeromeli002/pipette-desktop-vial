// SPDX-License-Identifier: GPL-2.0-or-later

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { HelpCircle, X } from 'lucide-react'

interface WelcomeDialogProps {
  onClose: () => void
}

interface Step {
  titleKey: string
  descriptionKey: string
}

const STEPS: Step[] = [
  {
    titleKey: 'welcome.steps.step1Title',
    descriptionKey: 'welcome.steps.step1Desc',
  },
  {
    titleKey: 'welcome.steps.step2Title',
    descriptionKey: 'welcome.steps.step2Desc',
  },
  {
    titleKey: 'welcome.steps.step3Title',
    descriptionKey: 'welcome.steps.step3Desc',
  },
  {
    titleKey: 'welcome.steps.step4Title',
    descriptionKey: 'welcome.steps.step4Desc',
  },
]

export function WelcomeDialog({ onClose }: WelcomeDialogProps): JSX.Element {
  const { t } = useTranslation()

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      data-testid="welcome-dialog-backdrop"
    >
      <div
        className="w-[480px] max-w-[90vw] rounded-xl bg-surface-alt p-6 shadow-2xl"
        data-testid="welcome-dialog"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-content">{t('welcome.title')}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-content-muted transition-colors hover:bg-surface-dim hover:text-content"
            data-testid="welcome-dialog-close"
            aria-label={t('common.close')}
          >
            <X size={20} />
          </button>
        </div>

        <p className="mb-6 text-sm text-content-secondary">
          {t('welcome.subtitle')}
        </p>

        <div className="mb-6 space-y-4">
          {STEPS.map((step, index) => (
            <div key={index} className="flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/10 text-sm font-semibold text-accent">
                {index + 1}
              </div>
              <div>
                <h3 className="text-sm font-semibold text-content">
                  {t(step.titleKey)}
                </h3>
                <p className="mt-0.5 text-xs text-content-muted">
                  {t(step.descriptionKey)}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-accent px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent/90"
            data-testid="welcome-dialog-ok"
          >
            {t('welcome.ok')}
          </button>
        </div>
      </div>
    </div>
  )
}

export function HelpButton(): JSX.Element {
  const { t } = useTranslation()
  const [showWelcome, setShowWelcome] = useState(false)

  useEffect(() => {
    const hasSeenWelcome = localStorage.getItem('pipette-welcome-seen')
    if (!hasSeenWelcome) {
      setShowWelcome(true)
    }
  }, [])

  const handleOpen = () => {
    setShowWelcome(true)
  }

  const handleClose = () => {
    localStorage.setItem('pipette-welcome-seen', 'true')
    setShowWelcome(false)
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="fixed bottom-16 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-transform hover:scale-110"
        data-testid="help-button"
        aria-label={t('welcome.helpButton')}
      >
        <HelpCircle size={20} />
      </button>

      {showWelcome && <WelcomeDialog onClose={handleClose} />}
    </>
  )
}