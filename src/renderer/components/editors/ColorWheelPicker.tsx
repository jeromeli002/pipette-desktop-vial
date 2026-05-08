// SPDX-License-Identifier: GPL-2.0-or-later

import { useRef, useCallback, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  hue: number
  saturation: number
  value: number
  onHueChange: (h: number) => void
  onSaturationChange: (s: number) => void
  onValueChange: (v: number) => void
  onColorChange?: (h: number, s: number, v: number) => void
}

interface PaletteEntry {
  readonly h: number
  readonly s: number
  readonly v: number
  readonly hex: string
}

export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hDeg = (h / 255) * 360
  const sN = s / 255
  const vN = v / 255
  const c = vN * sN
  const x = c * (1 - Math.abs(((hDeg / 60) % 2) - 1))
  const m = vN - c
  let r1: number, g1: number, b1: number
  if (hDeg < 60) {
    ;[r1, g1, b1] = [c, x, 0]
  } else if (hDeg < 120) {
    ;[r1, g1, b1] = [x, c, 0]
  } else if (hDeg < 180) {
    ;[r1, g1, b1] = [0, c, x]
  } else if (hDeg < 240) {
    ;[r1, g1, b1] = [0, x, c]
  } else if (hDeg < 300) {
    ;[r1, g1, b1] = [x, 0, c]
  } else {
    ;[r1, g1, b1] = [c, 0, x]
  }
  return [
    Math.round((r1 + m) * 255),
    Math.round((g1 + m) * 255),
    Math.round((b1 + m) * 255),
  ]
}

export function rgbToHex(r: number, g: number, b: number): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  )
}

const PALETTE: ReadonlyArray<PaletteEntry> = (() => {
  const COLS = 10
  const HUE_STEP = 256 / COLS

  function makeEntry(h: number, s: number, v: number): PaletteEntry {
    const rgb = hsvToRgb(h, s, v)
    return { h, s, v, hex: rgbToHex(...rgb) }
  }

  function makeRow(s: number, v: number): PaletteEntry[] {
    return Array.from({ length: COLS }, (_, col) =>
      makeEntry(Math.round(col * HUE_STEP), s, v),
    )
  }

  const chromaticRows: ReadonlyArray<{ s: number; v: number }> = [
    { s: 43, v: 255 },
    { s: 85, v: 255 },
    { s: 128, v: 255 },
    { s: 170, v: 255 },
    { s: 255, v: 255 },
    { s: 255, v: 213 },
    { s: 255, v: 170 },
    { s: 255, v: 128 },
    { s: 255, v: 64 },
  ]

  const grayscaleRow = Array.from({ length: COLS }, (_, col) =>
    makeEntry(0, 0, Math.round(255 - col * (255 / (COLS - 1)))),
  )

  return Object.freeze(chromaticRows.flatMap(({ s, v }) => makeRow(s, v)).concat(grayscaleRow))
})()

function usePointerDrag(
  ref: React.RefObject<SVGSVGElement | null>,
  onDrag: (clientX: number, clientY: number) => void,
): {
  onPointerDown: (e: React.PointerEvent) => void
  onPointerMove: (e: React.PointerEvent) => void
  onPointerUp: () => void
  onPointerCancel: () => void
  onLostPointerCapture: () => void
} {
  const draggingRef = useRef(false)

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      draggingRef.current = true
      e.currentTarget.setPointerCapture(e.pointerId)
      onDrag(e.clientX, e.clientY)
    },
    [onDrag],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!draggingRef.current) return
      onDrag(e.clientX, e.clientY)
    },
    [onDrag],
  )

  const stopDrag = useCallback(() => {
    draggingRef.current = false
  }, [])

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: stopDrag,
    onPointerCancel: stopDrag,
    onLostPointerCapture: stopDrag,
  }
}

type PickerMode = 'palette' | 'wheel'

export function ColorWheelPicker({
  hue,
  saturation,
  value,
  onHueChange,
  onSaturationChange,
  onValueChange,
  onColorChange,
}: Props) {
  const { t } = useTranslation()
  const wheelRef = useRef<SVGSVGElement>(null)
  const [mode, setMode] = useState<PickerMode>('palette')

  const hexStr = rgbToHex(...hsvToRgb(hue, saturation, value))

  const nearestIdx = useMemo(() => {
    let bestIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < PALETTE.length; i++) {
      const entry = PALETTE[i]
      const rawDh = Math.abs(hue - entry.h)
      const dh = Math.min(rawDh, 255 - rawDh)
      const hueWeight = Math.min(saturation, entry.s) / 255
      const ds = saturation - entry.s
      const dv = value - entry.v
      const dist = dh * dh * hueWeight + ds * ds + dv * dv
      if (dist < bestDist) {
        bestDist = dist
        bestIdx = i
      }
    }
    return bestIdx
  }, [hue, saturation, value])

  const wheelSize = 180
  const wheelRadius = 84
  const centerPos = wheelSize / 2

  const updateWheel = useCallback(
    (clientX: number, clientY: number) => {
      const el = wheelRef.current
      if (!el) return

      const rect = el.getBoundingClientRect()
      const scaleX = wheelSize / rect.width
      const scaleY = wheelSize / rect.height

      const x = (clientX - rect.left) * scaleX
      const y = (clientY - rect.top) * scaleY

      const dx = x - centerPos
      const dy = y - centerPos

      let angle = Math.atan2(dy, dx)
      angle += Math.PI / 2
      if (angle < 0) angle += 2 * Math.PI

      let hDeg = (angle / (2 * Math.PI)) * 360
      if (hDeg >= 360) hDeg -= 360

      const radius = Math.sqrt(dx * dx + dy * dy)
      const normalizedRadius = Math.min(radius / wheelRadius, 1)

      const newHue = Math.round((hDeg / 360) * 255)
      const newSaturation = Math.round(normalizedRadius * 255)

      if (onColorChange) {
        onColorChange(newHue, newSaturation, value)
      } else {
        onHueChange(newHue)
        onSaturationChange(newSaturation)
      }
    },
    [value, onHueChange, onSaturationChange, onColorChange, wheelSize, wheelRadius, centerPos],
  )

  const wheelHandlers = usePointerDrag(wheelRef, updateWheel)

  const handleValueChange = useCallback(
    (newValue: number) => {
      if (onColorChange) {
        onColorChange(hue, saturation, newValue)
      } else {
        onValueChange(newValue)
      }
    },
    [hue, saturation, onValueChange, onColorChange],
  )

  function applyHsv(h: number, s: number, v: number): void {
    if (onColorChange) {
      onColorChange(h, s, v)
    } else {
      onHueChange(h)
      onSaturationChange(s)
      onValueChange(v)
    }
  }

  const hueRad = (hue / 255) * 2 * Math.PI - Math.PI / 2
  const wheelCenterX = (saturation / 255) * Math.cos(hueRad) * 75 + centerPos
  const wheelCenterY = (saturation / 255) * Math.sin(hueRad) * 75 + centerPos

  const hueStops = useMemo(() => {
    const stops = []
    for (let i = 0; i <= 6; i++) {
      const angle = (i / 6) * 360
      stops.push({ angle, color: `hsl(${angle}, 100%, 50%)` })
    }
    return stops
  }, [])

  return (
    <div className="flex w-[22rem] flex-col gap-3">
      <div className="flex gap-1.5">
        <button
          type="button"
          className={`rounded-md border px-3 py-1.5 text-[13px] transition-colors ${
            mode === 'palette'
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-edge text-content-secondary hover:text-content'
          }`}
          onClick={() => setMode('palette')}
        >
          {t('editor.lighting.colorPicker.palette')}
        </button>
        <button
          type="button"
          className={`rounded-md border px-3 py-1.5 text-[13px] transition-colors ${
            mode === 'wheel'
              ? 'border-accent bg-accent/10 text-accent'
              : 'border-edge text-content-secondary hover:text-content'
          }`}
          onClick={() => setMode('wheel')}
        >
          {t('editor.rgbIndicator.colorWheel')}
        </button>
      </div>

      {mode === 'palette' ? (
        <>
          <div className="grid grid-cols-[repeat(10,1.5rem)] gap-0">
            {PALETTE.map((entry, i) => {
              const selected = i === nearestIdx
              return (
                <button
                  key={i}
                  type="button"
                  className={
                    selected
                      ? 'relative z-10 h-6 w-6 rounded-none border-0 p-0 ring-2 ring-white shadow-[0_0_0_1px_rgba(0,0,0,0.3)]'
                      : 'h-6 w-6 rounded-none border-0 p-0'
                  }
                  style={{ backgroundColor: entry.hex }}
                  onClick={() => applyHsv(entry.h, entry.s, entry.v)}
                />
              )
            })}
          </div>

          <div className="h-8 w-full rounded border border-edge" style={{ backgroundColor: hexStr }} />
        </>
      ) : (
        <>
          <div className="flex justify-center">
            <div
              className="relative rounded-full"
              style={{
                width: `${wheelSize}px`,
                height: `${wheelSize}px`,
                background: `conic-gradient(from 0deg, ${hueStops.map(s => s.color).join(', ')})`,
              }}
            >
              <div
                className="absolute inset-3 rounded-full"
                style={{
                  background: 'radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,255,255,0) 100%)',
                }}
              />
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  border: '2px solid rgba(0,0,0,0.3)',
                }}
              />
              <svg
                ref={wheelRef}
                className="absolute inset-0 cursor-crosshair"
                viewBox={`0 0 ${wheelSize} ${wheelSize}`}
                style={{ touchAction: 'none' }}
                {...wheelHandlers}
              >
                <circle
                  cx={wheelCenterX}
                  cy={wheelCenterY}
                  r="12"
                  fill="none"
                  stroke="white"
                  strokeWidth="3"
                  className="pointer-events-none"
                />
                <circle
                  cx={wheelCenterX}
                  cy={wheelCenterY}
                  r="6"
                  fill="black"
                  className="pointer-events-none"
                />
              </svg>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-xs text-content-muted w-16">{t('editor.rgbIndicator.brightness')}</label>
            <input
              type="range"
              min={0}
              max={255}
              value={value}
              onChange={(e) => handleValueChange(parseInt(e.target.value))}
              className="flex-1"
              style={{ background: `linear-gradient(to right, #000, ${hexStr})` }}
            />
            <span className="w-8 text-xs text-right">{value}</span>
          </div>

          <div className="h-8 w-full rounded border border-edge" style={{ backgroundColor: hexStr }} />
        </>
      )}
    </div>
  )
}
