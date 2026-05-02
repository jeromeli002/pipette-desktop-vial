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
  VIAL_SERIAL_MAGIC,
} from './shared/constants/protocol'
import type { DeviceInfo, ProbeResult } from './shared/types/protocol'

// State
let openDevice: any = null
let sendMutex: Promise<void> = Promise.resolve()

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

async function readFromDevice(device: any): Promise<Uint8Array | null> {
  return new Promise<Uint8Array | null>((resolve) => {
    const timeoutId = setTimeout(() => {
      device.removeEventListener('inputreport', listener)
      resolve(null)
    }, HID_TIMEOUT_MS)

    const listener = (event: any) => {
      clearTimeout(timeoutId)
      device.removeEventListener('inputreport', listener)
      // 修复次要隐患：DataView 取 buffer 时必须结合 byteOffset 和 byteLength
      // 否则可能会取到包含其他内存段的完整底层 ArrayBuffer 导致数据错位
      const data = new Uint8Array(event.data.buffer, event.data.byteOffset, event.data.byteLength)
      resolve(data)
    }
    device.addEventListener('inputreport', listener)
  })
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

    for (let i = 0; i < HID_OPEN_RETRY_COUNT; i++) {
      try {
        await device.open()
        openDevice = device
        return true
      } catch {
        await delay(HID_OPEN_RETRY_DELAY_MS)
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
      await openDevice.close()
    }
  } finally {
    openDevice = null
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
      let lastError: Error | undefined
      for (let attempt = 0; attempt < HID_RETRY_COUNT; attempt++) {
        try {
          const sendData = new Uint8Array(padded)
          await sendReport(openDevice, sendData)

          const response = await readFromDevice(openDevice)
          if (!response) {
            throw new Error('HID read timeout')
          }

          const result = normalizeResponse(response, MSG_LEN)
          return result
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err))
          if (!isTransientError(lastError)) throw lastError
          if (attempt < HID_RETRY_COUNT - 1) {
            await delay(HID_RETRY_DELAY_MS)
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

export async function probeDevice(vendorId: number, productId: number, serialNumber?: string): Promise<ProbeResult> {
  throw new Error('probeDevice is not implemented in web version')
}