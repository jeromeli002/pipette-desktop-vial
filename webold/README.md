# Pipette - Vial Keyboard Configurator (Web Version)

这是 Pipette 键盘配置软件的 Web 版本，基于原桌面应用的完整实现，使用 Vite、React 和 WebHID 技术构建，可以直接在浏览器中运行并配置键盘！

## 功能特性

- ✅ 完整保持原桌面版的所有功能
- ✅ 使用 WebHID 连接键盘
- ✅ 键位修改、编辑宏功能
- ✅ 键位组合、Key Override 等功能
- ✅ 键盘布局编辑与导出
- ✅ 键盘 LED 控制与其他所有功能
- ✅ 支持 Vial 与 VIA 协议兼容
- ✅ 本地存储持久化
- ✅ 纯 Web 应用，无需安装任何依赖

## 环境要求

- **浏览器要求支持 WebHID 的现代浏览器：
  - Chrome 89+
  - Edge 89+
  - 其他支持 WebHID 的浏览器

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

访问 http://localhost:5173

### 构建生产版本

```bash
npm run build
```

构建产物生成在 `dist/` 目录

### 预览生产版本

```bash
npm run preview
```

## 项目结构

```
web/
├── src/
│   ├── api/
│   │   └── vial-api.ts      # Web 兼容 API 桥接 WebHID
│   ├── hid-transport.ts         # WebHID 通信
│   ├── protocol.ts              # 通信协议
│   ├── shared/                 # 共享类型与常量
│   ├── renderer/               # 所有 UI 组件和功能
│   ├── types/                # 类型声明
│   └── main.tsx              # 入口点
├── dist/                  # 构建产物
└── ... 其他配置文件
```

## 主要技术栈

- Vite 6
- React 19
- TypeScript
- TailwindCSS
- xz-decompress (用于解压定义)
- Recharts (图表库)

## 浏览器安全与桌面版区别

- 移除了以下功能：
  - 桌面系统托盘
  - 本地文件深度集成（部分功能使用浏览器本地存储
  - 依赖 node-hid（使用 WebHID
  - 数据库（使用 LocalStorage）
  - Electron 架构

## 支持功能保留完整的核心功能保持不变！

## 贡献

参考原项目 [pipette-desktop
