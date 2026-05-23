// Type definitions for WebHID API
// Project: https://wicg.github.io/webhid/
// Definitions by: TypeScript <https://github.com/microsoft>

interface HIDDevice {
  vendorId: number;
  productId: number;
  productName: string;
  serialNumber: string;
  deviceVersionMajor: number;
  deviceVersionMinor: number;
  deviceVersionSubminor: number;
  manufacturerName: string;
  deviceName: string;
  collections: HIDCollectionInfo[];
  opened: boolean;

  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
  sendFeatureReport(reportId: number, data: BufferSource): Promise<void>;
  receiveFeatureReport(reportId: number): Promise<DataView>;

  oninputreport: ((this: HIDDevice, ev: HIDInputReportEvent) => any) | null;
  addEventListener<K extends keyof HIDDeviceEventMap>(
    type: K,
    listener: (this: HIDDevice, ev: HIDDeviceEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener<K extends keyof HIDDeviceEventMap>(
    type: K,
    listener: (this: HIDDevice, ev: HIDDeviceEventMap[K]) => any,
    options?: boolean | EventListenerOptions
  ): void;
}

interface HIDCollectionInfo {
  usagePage: number;
  usage: number;
  type?: number;
  children: HIDCollectionInfo[];
  inputReports: HIDReportInfo[];
  outputReports: HIDReportInfo[];
  featureReports: HIDReportInfo[];
}

interface HIDReportInfo {
  reportId: number;
  items: HIDReportItem[];
}

interface HIDReportItem {
  isAbsolute?: boolean;
  isArray?: boolean;
  isBufferedBytes?: boolean;
  isConstant?: boolean;
  isLinear?: boolean;
  isRange?: boolean;
  isVolatile?: boolean;
  hasNull?: boolean;
  hasPreferredState?: boolean;
  reportSize: number;
  reportCount: number;
  unitExponent: number;
  unit: number;
  logicalMinimum?: number;
  logicalMaximum?: number;
  physicalMinimum?: number;
  physicalMaximum?: number;
  usages?: number[];
  usageMinimum?: number;
  usageMaximum?: number;
  stringMinimum?: number;
  stringMaximum?: number;
  designatorMinimum?: number;
  designatorMaximum?: number;
}

interface HIDInputReportEvent extends Event {
  readonly device: HIDDevice;
  readonly reportId: number;
  readonly data: DataView;
}

interface HIDDeviceEventMap {
  inputreport: HIDInputReportEvent;
}

interface HIDRequestOptions {
  filters: HIDDeviceFilter[];
}

interface HIDDeviceFilter {
  vendorId?: number;
  productId?: number;
  usagePage?: number;
  usage?: number;
}

interface Navigator {
  readonly hid: HID;
}

interface HID {
  getDevices(): Promise<HIDDevice[]>;
  requestDevice(options: HIDRequestOptions): Promise<HIDDevice[]>;

  onconnect: ((this: HID, ev: HIDConnectionEvent) => any) | null;
  ondisconnect: ((this: HID, ev: HIDConnectionEvent) => any) | null;
  addEventListener<K extends keyof HIDEventMap>(
    type: K,
    listener: (this: HID, ev: HIDEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener<K extends keyof HIDEventMap>(
    type: K,
    listener: (this: HID, ev: HIDEventMap[K]) => any,
    options?: boolean | EventListenerOptions
  ): void;
}

interface HIDConnectionEvent extends Event {
  readonly device: HIDDevice;
}

interface HIDEventMap {
  connect: HIDConnectionEvent;
  disconnect: HIDConnectionEvent;
}
