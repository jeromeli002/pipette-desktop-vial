// SPDX-License-Identifier: GPL-2.0-or-later

import { useState, useCallback, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ColorWheelPicker, hsvToRgb, rgbToHex } from './ColorWheelPicker'
import { useConfirmAction } from '../../hooks/useConfirmAction'
import { ConfirmButton } from './ConfirmButton'

export interface LedConfig {
  index: number
  count: number
  h: number
  s: number
  v: number
}

export interface RGBIndicatorConfig {
  caps: LedConfig
  num: LedConfig
  scrl: LedConfig
  layers: LedConfig[]
  rgbTimeout: number
}

const vialAPI = window.vialAPI

interface Props {
  layerCount: number
  initialConfig?: RGBIndicatorConfig
  onConfigChange?: (config: RGBIndicatorConfig) => void
}

const INPUT_CLASS = 'rounded border border-edge bg-transparent px-1.5 py-0.5 font-mono text-xs w-14'

const DEFAULT_LED_CONFIG: LedConfig = {
  index: 0,
  count: 0,
  h: 0,
  s: 255,
  v: 255,
}

function useNumberInputWheel(min: number, max: number, onChange: (value: number) => void) {
  const inputRef = useRef<HTMLInputElement>(null)

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const input = inputRef.current
    if (!input || input.disabled) return

    const currentValue = parseInt(input.value) || min
    const delta = e.deltaY > 0 ? -1 : 1
    const step = parseInt(input.step) || 1
    const newValue = Math.max(min, Math.min(max, currentValue + delta * step))
    
    onChange(newValue)
  }, [min, max, onChange])

  useEffect(() => {
    const input = inputRef.current
    if (input) {
      input.addEventListener('wheel', handleWheel, { passive: false })
      return () => input.removeEventListener('wheel', handleWheel)
    }
  }, [handleWheel])

  return inputRef
}

function createDefaultConfig(layerCount: number): RGBIndicatorConfig {
  return {
    caps: { index: 0, count: 0, h: 0, s: 255, v: 255 },
    num: { index: 1, count: 0, h: 85, s: 255, v: 255 },
    scrl: { index: 2, count: 0, h: 170, s: 255, v: 255 },
    layers: Array.from({ length: layerCount }, (_, i) => ({
      index: 27 - i,
      count: 0,
      h: 128,
      s: 255,
      v: 255,
    })),
    rgbTimeout: 180,
  }
}

interface LedConfigEditorProps {
  label: string
  ledKey: string
  config: LedConfig
  onChange: (config: LedConfig) => void
  maxLedIndex: number
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  testLabel?: string
  onApply?: () => void
}

function LedConfigEditor({
  label,
  ledKey: _ledKey,
  config,
  onChange,
  maxLedIndex,
  enabled,
  onEnabledChange,
  testLabel,
  onApply,
}: LedConfigEditorProps) {
  const { t } = useTranslation()
  const [showColorPicker, setShowColorPicker] = useState(false)

  const previewColor = rgbToHex(...hsvToRgb(config.h, config.s, config.v))

  const indexInputRef = useNumberInputWheel(0, maxLedIndex, (value) => onChange({ ...config, index: value }))
  const countInputRef = useNumberInputWheel(0, 20, (value) => onChange({ ...config, count: value }))

  const handleHueChange = (h: number) => onChange({ ...config, h })
  const handleSaturationChange = (s: number) => onChange({ ...config, s })
  const handleValueChange = (v: number) => onChange({ ...config, v })
  const handleColorChange = (h: number, s: number, v: number) => onChange({ ...config, h, s, v })

  return (
    <div className={`rounded border p-3 ${enabled ? 'border-edge' : 'border-border-subtle opacity-50'}`}>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onEnabledChange(!enabled)}
            className={`h-4 w-4 rounded-full border-2 transition-colors ${enabled ? 'bg-accent border-accent' : 'bg-transparent border-border-subtle'}`}
          />
          <span className="text-sm font-medium">{label}</span>
        </div>
        {testLabel && (
          <span className="text-xs text-content-muted">{testLabel}</span>
        )}
      </div>

      <div className="mb-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-xs text-content-muted">{t('editor.rgbIndicator.index')}</label>
          <input
            ref={indexInputRef}
            type="number"
            min={0}
            max={maxLedIndex}
            value={config.index}
            onChange={(e) => onChange({ ...config, index: Math.max(0, Math.min(maxLedIndex, parseInt(e.target.value) || 0)) })}
            className={INPUT_CLASS}
            disabled={!enabled}
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-content-muted">{t('editor.rgbIndicator.count')}</label>
          <input
            ref={countInputRef}
            type="number"
            min={0}
            max={20}
            value={config.count}
            onChange={(e) => onChange({ ...config, count: Math.max(0, Math.min(20, parseInt(e.target.value) || 0)) })}
            className={INPUT_CLASS}
            disabled={!enabled}
          />
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-content-muted">{t('editor.rgbIndicator.brightness')}</label>
          <input
            type="range"
            min={0}
            max={255}
            value={config.v}
            onChange={(e) => onChange({ ...config, v: parseInt(e.target.value) })}
            className="w-20"
            disabled={!enabled}
          />
          <span className="w-8 text-xs">{config.v}</span>
        </div>

        <button
          type="button"
          onClick={() => setShowColorPicker(!showColorPicker)}
          className="rounded border border-edge px-2 py-1 text-xs hover:bg-surface-dim disabled:opacity-50"
          disabled={!enabled}
        >
          <div
            className="h-4 w-4 rounded"
            style={{ backgroundColor: previewColor }}
          />
        </button>

        <button
          type="button"
          onClick={onApply}
          className="rounded border border-accent px-2 py-1 text-xs text-accent hover:bg-accent/10"
        >
          {t('editor.rgbIndicator.apply')}
        </button>
      </div>

      {showColorPicker && (
        <div className="mt-3 border-t border-edge pt-3">
          <ColorWheelPicker
            hue={config.h}
            saturation={config.s}
            value={config.v}
            onHueChange={handleHueChange}
            onSaturationChange={handleSaturationChange}
            onValueChange={handleValueChange}
            onColorChange={handleColorChange}
          />
        </div>
      )}
    </div>
  )
}

export function RGBIndicatorConfigurator({ layerCount, initialConfig, onConfigChange }: Props) {
  const { t } = useTranslation()
  const [config, setConfig] = useState<RGBIndicatorConfig>(
    initialConfig ?? createDefaultConfig(layerCount),
  )
  const [activeTab, setActiveTab] = useState<'system' | 'layers' | 'timeout'>('system')
  const [saving, setSaving] = useState(false)
  const [realTimeSync, setRealTimeSync] = useState(true)
  const [timeoutUnit, setTimeoutUnit] = useState<'seconds' | 'minutes'>('seconds')
  const [enabledIndicators, setEnabledIndicators] = useState<{
    caps: boolean
    num: boolean
    scrl: boolean
    layers: boolean[]
  }>({
    caps: false,
    num: false,
    scrl: false,
    layers: Array(layerCount).fill(false),
  })

  useEffect(() => {
    if (initialConfig) {
      setConfig(initialConfig)
    }
  }, [initialConfig])

  useEffect(() => {
    setEnabledIndicators((prev) => ({
      ...prev,
      layers: prev.layers.length !== layerCount ? Array(layerCount).fill(false) : prev.layers,
    }))
  }, [layerCount])

  const sendIndicatorConfig = useCallback(async (indicator: string, index: number, ledConfig: LedConfig, enabled: boolean) => {
    const sendConfig = enabled ? ledConfig : { ...ledConfig, count: 0 }

    try {
      switch (indicator) {
        case 'caps':
          await vialAPI.setRgbIndicatorCaps(sendConfig)
          break
        case 'num':
          await vialAPI.setRgbIndicatorNum(sendConfig)
          break
        case 'scrl':
          await vialAPI.setRgbIndicatorScrl(sendConfig)
          break
        case 'layer':
          await vialAPI.setRgbIndicatorLayer(index, sendConfig)
          break
      }
      await vialAPI.saveRgbIndicatorConfig()
    } catch (err) {
      console.error('[RGBIndicator] Send failed:', err)
    }
  }, [])

  const applyCaps = useCallback(async () => {
    await sendIndicatorConfig('caps', 0, config.caps, enabledIndicators.caps)
  }, [config.caps, enabledIndicators.caps, sendIndicatorConfig])

  const applyNum = useCallback(async () => {
    await sendIndicatorConfig('num', 0, config.num, enabledIndicators.num)
  }, [config.num, enabledIndicators.num, sendIndicatorConfig])

  const applyScrl = useCallback(async () => {
    await sendIndicatorConfig('scrl', 0, config.scrl, enabledIndicators.scrl)
  }, [config.scrl, enabledIndicators.scrl, sendIndicatorConfig])

  const applyLayer = useCallback(async (index: number) => {
    await sendIndicatorConfig('layer', index, config.layers[index], enabledIndicators.layers[index])
  }, [config.layers, enabledIndicators.layers, sendIndicatorConfig])

  const applyTimeout = useCallback(async () => {
    try {
      await vialAPI.setRgbIndicatorSleepTime(config.rgbTimeout)
      await vialAPI.saveRgbIndicatorConfig()
    } catch (err) {
      console.error('[RGBIndicator] Apply timeout failed:', err)
    }
  }, [config.rgbTimeout])

  const updateCaps = useCallback((caps: LedConfig) => {
    setConfig((prev) => ({ ...prev, caps }))
    onConfigChange?.({ ...config, caps })
    
    if (realTimeSync) {
      sendIndicatorConfig('caps', 0, caps, enabledIndicators.caps)
    }
  }, [config, onConfigChange, realTimeSync, enabledIndicators.caps, sendIndicatorConfig])

  const updateNum = useCallback((num: LedConfig) => {
    setConfig((prev) => ({ ...prev, num }))
    onConfigChange?.({ ...config, num })
    
    if (realTimeSync) {
      sendIndicatorConfig('num', 0, num, enabledIndicators.num)
    }
  }, [config, onConfigChange, realTimeSync, enabledIndicators.num, sendIndicatorConfig])

  const updateScrl = useCallback((scrl: LedConfig) => {
    setConfig((prev) => ({ ...prev, scrl }))
    onConfigChange?.({ ...config, scrl })
    
    if (realTimeSync) {
      sendIndicatorConfig('scrl', 0, scrl, enabledIndicators.scrl)
    }
  }, [config, onConfigChange, realTimeSync, enabledIndicators.scrl, sendIndicatorConfig])

  const updateLayer = useCallback((index: number, layer: LedConfig) => {
    setConfig((prev) => {
      const layers = [...prev.layers]
      layers[index] = layer
      const newConfig = { ...prev, layers }
      onConfigChange?.(newConfig)
      
      if (realTimeSync) {
        sendIndicatorConfig('layer', index, layer, enabledIndicators.layers[index])
      }
      
      return newConfig
    })
  }, [config, onConfigChange, realTimeSync, enabledIndicators.layers, sendIndicatorConfig])

  const updateTimeout = useCallback((rgbTimeout: number) => {
    setConfig((prev) => ({ ...prev, rgbTimeout }))
    onConfigChange?.({ ...config, rgbTimeout })
    
    if (realTimeSync) {
      try {
        vialAPI.setRgbIndicatorSleepTime(rgbTimeout)
      } catch (err) {
        console.error('[RGBIndicator] Send timeout failed:', err)
      }
    }
  }, [config, onConfigChange, realTimeSync])

  const toggleIndicator = useCallback((type: 'caps' | 'num' | 'scrl', enabled: boolean) => {
    setEnabledIndicators((prev) => ({ ...prev, [type]: enabled }))
    
    if (realTimeSync) {
      const indicatorConfig = config[type]
      sendIndicatorConfig(type, 0, indicatorConfig, enabled)
    }
  }, [config, realTimeSync, sendIndicatorConfig])

  const toggleLayerIndicator = useCallback((index: number, enabled: boolean) => {
    setEnabledIndicators((prev) => ({
      ...prev,
      layers: prev.layers.map((l, i) => (i === index ? enabled : l)),
    }))
    
    if (realTimeSync) {
      const layerConfig = config.layers[index]
      sendIndicatorConfig('layer', index, layerConfig, enabled)
    }
  }, [config, realTimeSync, sendIndicatorConfig])

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      await vialAPI.setRgbIndicatorCaps(enabledIndicators.caps ? config.caps : { ...config.caps, count: 0 })
      await vialAPI.setRgbIndicatorNum(enabledIndicators.num ? config.num : { ...config.num, count: 0 })
      await vialAPI.setRgbIndicatorScrl(enabledIndicators.scrl ? config.scrl : { ...config.scrl, count: 0 })
      
      for (let i = 0; i < config.layers.length && i < layerCount; i++) {
        await vialAPI.setRgbIndicatorLayer(i, enabledIndicators.layers[i] ? config.layers[i] : { ...config.layers[i], count: 0 })
      }
      
      await vialAPI.setRgbIndicatorSleepTime(config.rgbTimeout)
      await vialAPI.saveRgbIndicatorConfig()
    } catch (err) {
      console.error('[RGBIndicator] Save failed:', err)
    } finally {
      setSaving(false)
    }
  }, [config, enabledIndicators, layerCount])

  const confirmRevert = useConfirmAction(() => {
    const defaultConfig = createDefaultConfig(layerCount)
    setConfig(defaultConfig)
    onConfigChange?.(defaultConfig)
    setEnabledIndicators({
      caps: false,
      num: false,
      scrl: false,
      layers: Array(layerCount).fill(false),
    })
  })

  const isDirty = JSON.stringify(config) !== JSON.stringify(initialConfig ?? createDefaultConfig(layerCount))

  const displayTimeout = timeoutUnit === 'minutes' ? Math.floor(config.rgbTimeout / 60) : config.rgbTimeout
  const handleTimeoutChange = (value: number) => {
    const actualValue = timeoutUnit === 'minutes' ? value * 60 : value
    updateTimeout(Math.max(0, Math.min(0xFFFFFFFF, actualValue)))
  }

  const timeoutMax = timeoutUnit === 'minutes' ? Math.floor(0xFFFFFFFF / 60) : 0xFFFFFFFF
  const timeoutInputRef = useNumberInputWheel(0, timeoutMax, handleTimeoutChange)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h4 className="text-base font-medium">{t('editor.rgbIndicator.title')}</h4>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setRealTimeSync(!realTimeSync)}
              className={`h-4 w-4 rounded-full border-2 transition-colors ${realTimeSync ? 'bg-accent border-accent' : 'bg-transparent border-border-subtle'}`}
            />
            <span className="text-xs text-content-muted">{t('editor.rgbIndicator.realTimeSync')}</span>
          </div>
        </div>
      </div>

      <div className="flex gap-1 border-b border-edge">
        <button
          type="button"
          onClick={() => setActiveTab('system')}
          className={`px-3 py-1.5 text-sm ${activeTab === 'system' ? 'border-b-2 border-accent text-content' : 'text-content-muted'}`}
        >
          {t('editor.rgbIndicator.systemIndicators')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('layers')}
          className={`px-3 py-1.5 text-sm ${activeTab === 'layers' ? 'border-b-2 border-accent text-content' : 'text-content-muted'}`}
        >
          {t('editor.rgbIndicator.layerIndicators')}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('timeout')}
          className={`px-3 py-1.5 text-sm ${activeTab === 'timeout' ? 'border-b-2 border-accent text-content' : 'text-content-muted'}`}
        >
          {t('editor.rgbIndicator.timeout')}
        </button>
      </div>

      <div className="max-h-[400px] overflow-y-auto">
        {activeTab === 'system' && (
          <div className="flex flex-col gap-3">
            <LedConfigEditor
              label={t('editor.rgbIndicator.capsLock')}
              ledKey="caps"
              config={config.caps}
              onChange={updateCaps}
              maxLedIndex={207}
              enabled={enabledIndicators.caps}
              onEnabledChange={(enabled) => toggleIndicator('caps', enabled)}
              testLabel={t('editor.rgbIndicator.capsLockDesc')}
              onApply={applyCaps}
            />
            <LedConfigEditor
              label={t('editor.rgbIndicator.numLock')}
              ledKey="num"
              config={config.num}
              onChange={updateNum}
              maxLedIndex={207}
              enabled={enabledIndicators.num}
              onEnabledChange={(enabled) => toggleIndicator('num', enabled)}
              testLabel={t('editor.rgbIndicator.numLockDesc')}
              onApply={applyNum}
            />
            <LedConfigEditor
              label={t('editor.rgbIndicator.scrollLock')}
              ledKey="scrl"
              config={config.scrl}
              onChange={updateScrl}
              maxLedIndex={207}
              enabled={enabledIndicators.scrl}
              onEnabledChange={(enabled) => toggleIndicator('scrl', enabled)}
              testLabel={t('editor.rgbIndicator.scrollLockDesc')}
              onApply={applyScrl}
            />
          </div>
        )}

        {activeTab === 'layers' && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-content-muted">{t('editor.rgbIndicator.layerHint')}</p>
            {Array.from({ length: layerCount }, (_, index) => (
              <LedConfigEditor
                key={index}
                label={`${t('editor.rgbIndicator.layer')} ${index}`}
                ledKey={`layer-${index}`}
                config={config.layers[index] || DEFAULT_LED_CONFIG}
                onChange={(newConfig) => updateLayer(index, newConfig)}
                maxLedIndex={207}
                enabled={enabledIndicators.layers[index] || false}
                onEnabledChange={(enabled) => toggleLayerIndicator(index, enabled)}
                onApply={() => applyLayer(index)}
              />
            ))}
          </div>
        )}

        {activeTab === 'timeout' && (
          <div className="flex flex-col gap-4">
            <p className="text-xs text-content-muted">{t('editor.rgbIndicator.timeoutHint')}</p>

            <div className="flex items-center gap-4">
              <label className="text-sm">{t('editor.rgbIndicator.sleepTimeout')}</label>
              <input
                ref={timeoutInputRef}
                type="number"
                min={0}
                max={timeoutMax}
                value={displayTimeout}
                onChange={(e) => handleTimeoutChange(parseInt(e.target.value) || 0)}
                className={`${INPUT_CLASS} w-24`}
              />
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTimeoutUnit('seconds')}
                    className={`h-3 w-3 rounded-full border transition-colors ${timeoutUnit === 'seconds' ? 'bg-accent border-accent' : 'bg-transparent border-border-subtle'}`}
                  />
                  <span className="text-xs text-content-muted">{t('editor.rgbIndicator.seconds')}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setTimeoutUnit('minutes')}
                    className={`h-3 w-3 rounded-full border transition-colors ${timeoutUnit === 'minutes' ? 'bg-accent border-accent' : 'bg-transparent border-border-subtle'}`}
                  />
                  <span className="text-xs text-content-muted">{t('editor.rgbIndicator.minutes')}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={applyTimeout}
                className="rounded border border-accent px-2 py-1 text-xs text-accent hover:bg-accent/10"
              >
                {t('editor.rgbIndicator.apply')}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setTimeoutUnit('seconds')
                  updateTimeout(0)
                }}
                className="rounded border border-edge px-2 py-1 text-xs hover:bg-surface-dim"
              >
                {t('editor.rgbIndicator.never')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTimeoutUnit('minutes')
                  updateTimeout(60)
                }}
                className="rounded border border-edge px-2 py-1 text-xs hover:bg-surface-dim"
              >
                1 {t('editor.rgbIndicator.minute')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTimeoutUnit('minutes')
                  updateTimeout(300)
                }}
                className="rounded border border-edge px-2 py-1 text-xs hover:bg-surface-dim"
              >
                5 {t('editor.rgbIndicator.minutes')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setTimeoutUnit('minutes')
                  updateTimeout(600)
                }}
                className="rounded border border-edge px-2 py-1 text-xs hover:bg-surface-dim"
              >
                10 {t('editor.rgbIndicator.minutes')}
              </button>
            </div>

            <p className="text-xs text-content-muted">
              {config.rgbTimeout === 0
                ? t('editor.rgbIndicator.timeoutNeverDesc')
                : t('editor.rgbIndicator.timeoutDesc', { seconds: config.rgbTimeout })}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-edge pt-4">
        {isDirty && (
          <ConfirmButton
            testId="rgb-indicator-revert"
            confirming={confirmRevert.confirming}
            onClick={() => confirmRevert.trigger()}
            labelKey="common.revert"
            confirmLabelKey="common.confirmRevert"
          />
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded bg-accent px-4 py-2 text-sm text-content-inverse hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      </div>
    </div>
  )
}
