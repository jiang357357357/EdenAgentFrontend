<div align="center">

# Eden Agent Frontend

**Eden Agent 的 React/Vite 客户端与 Electron 桌面壳**

[![Integration CI](https://github.com/jiang357357357/EdenAgent/actions/workflows/ci.yml/badge.svg)](https://github.com/jiang357357357/EdenAgent/actions/workflows/ci.yml)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-42-47848f?logo=electron&logoColor=white)
![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white)

**简体中文** · [English](README.en.md) · [主仓库](https://github.com/jiang357357357/EdenAgent)

</div>

## 简介

本仓库包含 Eden Agent 的用户界面和桌面宿主：

- `web`：React、TypeScript 与 Vite 客户端。
- `desktop`：Electron 主进程、preload 桥接和桌面生命周期管理。
- `Script`：前端开发启动与冒烟测试工具。

前端不直接访问数据库、模型供应商或本地文件系统。所有智能体能力都通过生成的 WebSocket JSON-RPC 客户端和 Blob 端点交给 Rust Server；桌面壳负责启动、监管 Server，并向渲染进程传递短期能力令牌。

## 主要界面

| 模块 | 内容 |
| --- | --- |
| 会话 | 流式对话、工具状态、会话列表、参与者与智能体切换 |
| 工作区 | 文件树、工作区切换和本地任务上下文 |
| 角色配置 | 基本信息、完整角色档案、静态与 Spine 视觉资源 |
| 模型服务 | OpenAI、DeepSeek、Ollama 与自定义兼容服务 |
| 语音配置 | GSV 角色声线、情感选择、试听播放与语音转录 |
| 扩展管理 | 技能、插件、连接器、数据安全和运行日志 |

## 开发

环境要求：Node.js 22+、npm，以及可用的 `eden-agent-server`。

```bash
git clone https://github.com/jiang357357357/EdenAgentFrontend.git
cd EdenAgentFrontend
npm ci
npm run dev
```

从完整 Eden Agent 工作区启动更方便：

```bash
git clone --recurse-submodules https://github.com/jiang357357357/EdenAgent.git
cd EdenAgent
npm ci
npm --prefix frontend ci
npm run dev
```

## 常用命令

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动 Web 与 Electron 开发环境 |
| `npm run dev:web` | 只启动 Vite 客户端 |
| `npm run dev:shell` | 只启动 Electron 壳 |
| `npm run build` | 类型检查并构建 Web 客户端 |
| `npm run typecheck` | 执行 TypeScript 检查 |
| `npm --prefix web test` | 执行 Web 测试 |
| `npm --prefix desktop test` | 执行桌面端测试 |

## 资源边界

角色二进制资源不会随本仓库分发。`web/public/characters/` 已被忽略，不应存放准备发布的角色资源。请在桌面配置页从独立的本地资源仓库导入静态图片或 Spine 文件。

第三方角色、反应图、Spine、语音、模型、游戏内容和商标不因本软件许可证而获得授权。Spine Runtime 还受其单独许可条件约束，详见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。

## 许可证

当前版本依据 [PolyForm Noncommercial License 1.0.0](LICENSE) 提供非商业源码使用。商业使用需要[单独书面商业授权](COMMERCIAL-LICENSE.md)。此前按 MIT 条款取得的历史版本继续适用其随附条款。
