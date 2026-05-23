// SPDX-License-Identifier: GPL-2.0-or-later
// WebHID based HID transport for browser.
// Handles raw HID device enumeration, connection, and 32-byte packet I/O.

import {
  MSG_LEN,
  HID_USAGE_PAGE,
  HID_USAGE,
  HID_REPORT_ID,
  HID_TIMEOUT_MS,
  HID_RETRY_COUNT,
  HID_RETRY_DELAY_MS,
  HID_OPEN_RETRY_COUNT,
  HID_OPEN_RETRY_DELAY_MS,
  BLUETOOTH_TIMEOUT_MS,
  BLUETOOTH_RETRY_COUNT,
  BLUETOOTH_RETRY_DELAY_MS,
  VIAL_SERIAL_MAGIC,
} from './shared/constants/protocol'
import type { DeviceInfo, ProbeResult } from './shared/types/protocol'

interface PendingRequest {
  resolve: (value: Uint8Array) => void
  reject: (reason: Error) => void
  timeout: ReturnType<typeof setTimeout>
}

// State
let openDevice: any = null
let openDeviceInfo: DeviceInfo | null = null
let sendMutex: Promise<void> = Promise.resolve()
let onDeviceDisconnected: (() => void) | null = null
let pendingRequests: Map<number, PendingRequest> = new Map()
let nextRequestId = 1
let inputReportHandler: ((event: any) => void) | null = null

function padToMsgLen(data: number[]): number[] {
  const padded = new Array<number>(MSG_LEN).fill(0)
  for (let i = 0; i < Math.min(data.length, MSG_LEN); i++) {
    padded[i] = data[i]
  }
  return padded
}

function normalizeResponse(buf: Uint8Array, expectedLen: number): number[] {
  if (buf.length === expectedLen + 1 && buf[0] === HID_REPORT_ID) {
    return Array.from(buf.subarray(1, expectedLen + 1))
  }
  const result = new Array<number>(expectedLen).fill(0)
  for (let i = 0; i < Math.min(buf.length, expectedLen); i++) {
    result[i] = buf[i]
  }
  return result
}

function acquireMutex(): { prev: Promise<void>; release: () => void } {
  const prev = sendMutex
  let release: () => void
  sendMutex = new Promise<void>((resolve) => {
    release = resolve
  })
  return { prev, release: release! }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isTransientError(err: Error): boolean {
  const msg = err.message.toLowerCase()
  return msg.includes('timeout') ||
    msg.includes('disconnected') ||
    msg.includes('connection') ||
    msg.includes('transmit') ||
    msg.includes('receive') ||
    msg.includes('io error') ||
    msg.includes('device not responding') ||
    msg.includes('resource temporarily unavailable')
}

function classifyDevice(serial: string): 'vial' | 'via' {
  return serial.includes(VIAL_SERIAL_MAGIC) ? 'vial' : 'via'
}

function isBluetoothDevice(device: any): boolean {
  if (!device) return false
  
  const serial = (device.serialNumber ?? '').toLowerCase()
  const product = (device.productName ?? '').toLowerCase()
  
  const bluetoothIndicators = ['bluetooth', 'ble', 'bt', 'wireless', '2.4g', 'wireless receiver']
  
  for (const indicator of bluetoothIndicators) {
    if (serial.includes(indicator) || product.includes(indicator)) {
      return true
    }
  }
  
  if (device.vendorId && device.productId) {
    const bluetoothVendors = [
      { vendorId: 0x05AC, productId: 0x023F },
      { vendorId: 0x046D, productId: 0xB008 },
    ]
    
    for (const { vendorId, productId } of bluetoothVendors) {
      if (device.vendorId === vendorId && device.productId === productId) {
        return true
      }
    }
  }
  
  return false
}

function getDeviceTimeouts(device: any): { timeout: number; retryCount: number; retryDelay: number } {
  if (isBluetoothDevice(device)) {
    return {
      timeout: BLUETOOTH_TIMEOUT_MS,
      retryCount: BLUETOOTH_RETRY_COUNT,
      retryDelay: BLUETOOTH_RETRY_DELAY_MS,
    }
  }
  
  return {
    timeout: HID_TIMEOUT_MS,
    retryCount: HID_RETRY_COUNT,
    retryDelay: HID_RETRY_DELAY_MS,
  }
}

function handleInputReport(event: any): void {
  if (event.reportId === HID_REPORT_ID && pendingRequests.size > 0) {
    const data = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength)
    const requestId = pendingRequests.keys().next().value as number
    const request = pendingRequests.get(requestId)
    if (request) {
      pendingRequests.delete(requestId)
      clearTimeout(request.timeout)
      request.resolve(data)
    }
  }
}

function setupInputReportListener(device: any): void {
  if (inputReportHandler) {
    device.removeEventListener('inputreport', inputReportHandler)
  }
  inputReportHandler = handleInputReport
  device.addEventListener('inputreport', inputReportHandler)
}

function cleanupInputReportListener(device: any): void {
  if (inputReportHandler && device) {
    device.removeEventListener('inputreport', inputReportHandler)
    inputReportHandler = null
  }
}

/** Set callback for when the connected device is disconnected */
export function setDisconnectCallback(callback: (() => void) | null): void {
  onDeviceDisconnected = callback
}

/** Initialize WebHID disconnect event listener */
function initHidDisconnectListener(): void {
  if (typeof navigator === 'undefined' || !navigator.hid) return

  navigator.hid.addEventListener('disconnect', (event: Event) => {
    const hidEvent = event as HIDConnectionEvent
    const device = hidEvent.device

    // Check if the disconnected device is the one we have open
    if (openDevice && device === openDevice) {
      console.log('[HID] Connected device disconnected')
      
      // Reject all pending requests
      for (const request of pendingRequests.values()) {
        clearTimeout(request.timeout)
        request.reject(new Error('Device disconnected'))
      }
      pendingRequests.clear()
      
      cleanupInputReportListener(openDevice)
      
      openDevice = null
      openDeviceInfo = null
      
      // Trigger the disconnect callback
      if (onDeviceDisconnected) {
        onDeviceDisconnected()
      }
    }
  })
}

// Initialize disconnect listener on module load
if (typeof navigator !== 'undefined' && navigator.hid) {
  initHidDisconnectListener()
}

export async function listDevices(): Promise<DeviceInfo[]> {
  try {
    const devices = await navigator.hid.getDevices()
    const result: DeviceInfo[] = []
    for (const d of devices) {
      let hasValidUsage = false
      for (const collection of d.collections || []) {
        if (collection.usagePage === HID_USAGE_PAGE && collection.usage === HID_USAGE) {
          hasValidUsage = true
          break
        }
      }
      if (!hasValidUsage) continue
      const serial = d.serialNumber ?? ''
      const type = classifyDevice(serial)
      result.push({
        vendorId: d.vendorId,
        productId: d.productId,
        productName: d.productName ?? '',
        serialNumber: serial,
        type,
      })
    }
    return result
  } catch (e) {
    console.error('Error listing devices:', e)
    return []
  }
}

async function findDevice(vendorId: number, productId: number, serialNumber?: string): Promise<any | null> {
  const devices = await navigator.hid.getDevices()
  for (const d of devices) {
    if (d.vendorId === vendorId && d.productId === productId) {
      
      // 修复核心：必须检查该设备接口是否为允许通信的 RAW HID 接口
      let hasValidUsage = false
      for (const collection of d.collections || []) {
        if (collection.usagePage === HID_USAGE_PAGE && collection.usage === HID_USAGE) {
          hasValidUsage = true
          break
        }
      }
      
      // 如果不是 RAW HID 接口（比如是标准键盘接口），则跳过，寻找下一个匹配项
      if (!hasValidUsage) continue

      if (serialNumber) {
        if (d.serialNumber === serialNumber) {
          return d
        }
      } else {
        return d
      }
    }
  }
  return null
}

async function sendReport(device: any, data: Uint8Array): Promise<void> {
  if (HID_REPORT_ID === 0) {
    await device.sendReport(0, data)
  } else {
    await device.sendReport(HID_REPORT_ID, data)
  }
}

export async function openHidDevice(vendorId: number, productId: number): Promise<boolean> {
  try {
    let device = await findDevice(vendorId, productId)
    
    // 如果没有找到已授权的设备，弹出系统授权框
    if (!device) {
      const filters: any[] = [{ usagePage: HID_USAGE_PAGE, usage: HID_USAGE }]
      const requestedDevices = await navigator.hid.requestDevice({ filters })
      device = requestedDevices[0]
    }
    if (!device) return false

    const isBluetooth = isBluetoothDevice(device)
    
    for (let i = 0; i < HID_OPEN_RETRY_COUNT; i++) {
      try {
        await device.open()
        openDevice = device
        openDeviceInfo = {
          vendorId: device.vendorId,
          productId: device.productId,
          productName: device.productName ?? '',
          serialNumber: device.serialNumber ?? '',
          type: classifyDevice(device.serialNumber ?? ''),
        }
        
        // Setup input report listener once when device opens
        setupInputReportListener(device)
        
        // Bluetooth devices need extra time to fully initialize after open
        // This is the KEY fix for wireless connection slowness
        if (isBluetooth) {
          console.log('[HID] Bluetooth device detected, waiting for initialization...')
          await delay(500)
        }
        
        return true
      } catch {
        const waitTime = isBluetooth 
          ? HID_OPEN_RETRY_DELAY_MS * (1 + i * 0.5)  // Progressive backoff for Bluetooth
          : HID_OPEN_RETRY_DELAY_MS
        await delay(waitTime)
      }
    }

    return false
  } catch {
    return false
  }
}

export async function closeHidDevice(): Promise<void> {
  try {
    if (openDevice && openDevice.opened) {
      cleanupInputReportListener(openDevice)
      
      // Reject all pending requests
      for (const request of pendingRequests.values()) {
        clearTimeout(request.timeout)
        request.reject(new Error('Device closed'))
      }
      pendingRequests.clear()
      
      await openDevice.close()
    }
  } finally {
    openDevice = null
    openDeviceInfo = null
  }
}

export async function sendReceive(data: number[]): Promise<number[]> {
  const { prev, release } = acquireMutex()
  return prev.then(async () => {
    try {
      if (!openDevice) {
        throw new Error('No HID device is open')
      }

      const padded = padToMsgLen(data)
      const timeouts = getDeviceTimeouts(openDevice)
      let lastError: Error | undefined
      for (let attempt = 0; attempt < timeouts.retryCount; attempt++) {
        try {
          const responseData = await new Promise<Uint8Array>((resolve, reject) => {
            const requestId = nextRequestId++
            
            const timeout = setTimeout(() => {
              pendingRequests.delete(requestId)
              reject(new Error('HID read timeout'))
            }, timeouts.timeout)
            
            pendingRequests.set(requestId, { resolve, reject, timeout })
            
            sendReport(openDevice, new Uint8Array(padded)).catch((err: Error) => {
              pendingRequests.delete(requestId)
              clearTimeout(timeout)
              reject(err)
            })
          })
          
          const result = normalizeResponse(responseData, MSG_LEN)
          return result
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err))
          if (!isTransientError(lastError)) throw lastError
          if (attempt < timeouts.retryCount - 1) {
            await delay(timeouts.retryDelay)
          }
        }
      }
      throw lastError ?? new Error('HID send/receive failed')
    } finally {
      release()
    }
  })
}

export async function send(data: number[]): Promise<void> {
  const { prev, release } = acquireMutex()
  return prev.then(async () => {
    try {
      if (!openDevice) {
        throw new Error('No HID device is open')
      }
      const padded = padToMsgLen(data)
      const sendData = new Uint8Array(padded)
      await sendReport(openDevice, sendData)
    } finally {
      release()
    }
  })
}

export async function isDeviceOpen(): Promise<boolean> {
  return openDevice && openDevice.opened
}

export function getLastOpenedDevice(): DeviceInfo | null {
  return openDeviceInfo
}

export async function probeDevice(vendorId: number, productId: number, serialNumber?: string): Promise<ProbeResult> {
  throw new Error('probeDevice is not implemented in web version')
}
