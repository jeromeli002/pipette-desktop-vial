// SPDX-License-Identifier: GPL-2.0-or-later

import { useState, useEffect, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { HelpCircle, X } from 'lucide-react'

interface WelcomeDialogProps {
  onClose: () => void
}

interface Step {
  titleKey: string
  descriptionKey: string
  guideLink?: string
  guideLinkKey?: string
}

const GUIDE_URL = 'https://jlkb.jlkb.top/tools/guide/'

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
    guideLink: GUIDE_URL,
    guideLinkKey: 'welcome.steps.step4Guide',
  },
]

const STORAGE_KEY = 'pipette-help-button-position'

interface Position {
  x: number
  y: number
}

function getStoredPosition(): Position | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // Ignore parse errors
  }
  return null
}

function savePosition(pos: Position): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos))
  } catch {
    // Ignore storage errors
  }
}

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
                {step.guideLink && step.guideLinkKey && (
                  <a
                    href={step.guideLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-block text-xs text-accent hover:text-accent/80 hover:underline"
                  >
                    {t(step.guideLinkKey)}
                  </a>
                )}
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
  const [position, setPosition] = useState<Position>(() => {
    const stored = getStoredPosition()
    return stored ?? { x: -1, y: -1 }
  })
  const [isDragging, setIsDragging] = useState(false)
  const [hasMoved, setHasMoved] = useState(false)
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; btnX: number; btnY: number } | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const stored = getStoredPosition()
    if (stored) {
      setPosition(stored)
    }
  }, [])

  const handleOpen = () => {
    setShowWelcome(true)
  }

  const handleClose = () => {
    localStorage.setItem('pipette-welcome-seen', 'true')
    setShowWelcome(false)
  }

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    setIsDragging(true)
    setHasMoved(false)
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      btnX: position.x >= 0 ? position.x : window.innerWidth - 64,
      btnY: position.y >= 0 ? position.y : window.innerHeight - 104,
    }
  }, [position])

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0]
    setIsDragging(true)
    setHasMoved(false)
    dragStartRef.current = {
      mouseX: touch.clientX,
      mouseY: touch.clientY,
      btnX: position.x >= 0 ? position.x : window.innerWidth - 64,
      btnY: position.y >= 0 ? position.y : window.innerHeight - 104,
    }
  }, [position])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return
      const dx = e.clientX - dragStartRef.current.mouseX
      const dy = e.clientY - dragStartRef.current.mouseY
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        setHasMoved(true)
      }
      const newX = Math.max(0, Math.min(window.innerWidth - 40, dragStartRef.current.btnX + dx))
      const newY = Math.max(0, Math.min(window.innerHeight - 40, dragStartRef.current.btnY + dy))
      setPosition({ x: newX, y: newY })
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!dragStartRef.current || e.touches.length === 0) return
      const touch = e.touches[0]
      const dx = touch.clientX - dragStartRef.current.mouseX
      const dy = touch.clientY - dragStartRef.current.mouseY
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        setHasMoved(true)
      }
      const newX = Math.max(0, Math.min(window.innerWidth - 40, dragStartRef.current.btnX + dx))
      const newY = Math.max(0, Math.min(window.innerHeight - 40, dragStartRef.current.btnY + dy))
      setPosition({ x: newX, y: newY })
    }

    const handleEnd = () => {
      setIsDragging(false)
      dragStartRef.current = null
      if (hasMoved) {
        savePosition(position)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleEnd)
    window.addEventListener('touchmove', handleTouchMove)
    window.addEventListener('touchend', handleEnd)

    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleEnd)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleEnd)
    }
  }, [isDragging, position, hasMoved])

  const clampPosition = useCallback((pos: Position): Position => {
    const maxX = Math.max(0, window.innerWidth - 40)
    const maxY = Math.max(0, window.innerHeight - 40)
    return {
      x: Math.max(0, Math.min(pos.x, maxX)),
      y: Math.max(0, Math.min(pos.y, maxY)),
    }
  }, [])

  useEffect(() => {
    if (!isDragging && (position.x >= 0 || position.y >= 0)) {
      const clamped = clampPosition(position)
      if (clamped.x !== position.x || clamped.y !== position.y) {
        setPosition(clamped)
      }
      savePosition(clamped)
    }
  }, [isDragging, position, clampPosition])

  useEffect(() => {
    const handleResize = () => {
      if (position.x >= 0 || position.y >= 0) {
        const clamped = clampPosition(position)
        if (clamped.x !== position.x || clamped.y !== position.y) {
          setPosition(clamped)
          savePosition(clamped)
        }
      }
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [position, clampPosition])

  const handleClick = () => {
    if (!hasMoved) {
      handleOpen()
    }
  }

  const style: React.CSSProperties = position.x >= 0 || position.y >= 0
    ? {
        position: 'fixed',
        right: 'auto',
        bottom: 'auto',
        left: position.x >= 0 ? position.x : undefined,
        top: position.y >= 0 ? position.y : undefined,
      }
    : {
        position: 'fixed',
        bottom: '4rem',
        right: '1rem',
      }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        style={style}
        className={`fixed bottom-16 right-4 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-transform hover:scale-110 ${
          isDragging ? 'cursor-grabbing scale-110' : 'cursor-grab'
        }`}
        data-testid="help-button"
        aria-label={t('welcome.helpButton')}
      >
        <HelpCircle size={20} />
      </button>

      {showWelcome && <WelcomeDialog onClose={handleClose} />}
    </>
  )
}
