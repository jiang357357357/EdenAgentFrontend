<div align="center">

# MonAgent Frontend

**The React/Vite client and Electron desktop shell for Eden Agent**

[![Integration CI](https://github.com/jiang357357357/MonAgent/actions/workflows/ci.yml/badge.svg)](https://github.com/jiang357357357/MonAgent/actions/workflows/ci.yml)
![React](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-42-47848f?logo=electron&logoColor=white)
![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=nodedotjs&logoColor=white)

[简体中文](README.md) · **English** · [Main repository](https://github.com/jiang357357357/MonAgent)

</div>

## Overview

This repository contains the MonAgent user interface and desktop host:

- `web`: the React, TypeScript, and Vite client.
- `desktop`: the Electron main process, preload bridge, and desktop lifecycle management.
- `Script`: frontend development launchers and smoke-test utilities.

The frontend does not access databases, model providers, or the local filesystem directly. All agent capabilities go through the generated WebSocket JSON-RPC client and Blob endpoints exposed by the Rust Server. The desktop shell launches and supervises the Server and passes a short-lived capability token to the renderer.

## Product areas

| Area | Features |
| --- | --- |
| Conversations | Streaming chat, tool states, session lists, participants, and agent switching |
| Workspace | File tree, workspace switching, and local task context |
| Character configuration | Basic information, full character profiles, and static or Spine visual resources |
| Model services | OpenAI, DeepSeek, Ollama, and custom compatible services |
| Voice configuration | GSV character voices, emotion selection, audio preview, and transcription |
| Extension management | Skills, plugins, connectors, data security, and runtime logs |

## Development

Requirements: Node.js 22+, npm, and an available `mon-agent-server`.

```bash
git clone https://github.com/jiang357357357/MonAgentFrontend.git
cd MonAgentFrontend
npm ci
npm run dev
```

Running from the complete MonAgent workspace is usually more convenient:

```bash
git clone --recurse-submodules https://github.com/jiang357357357/MonAgent.git
cd MonAgent
npm ci
npm --prefix frontend ci
npm run dev
```

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Web and Electron development environment |
| `npm run dev:web` | Start only the Vite client |
| `npm run dev:shell` | Start only the Electron shell |
| `npm run build` | Type-check and build the Web client |
| `npm run typecheck` | Run TypeScript checks |
| `npm --prefix web test` | Run Web tests |
| `npm --prefix desktop test` | Run desktop tests |

## Asset boundary

Character binaries are intentionally excluded from this repository. `web/public/characters/` is ignored and must not be used for distributable character assets. Import static art or Spine files from a separate local asset repository through the desktop configuration page.

Third-party characters, reaction art, Spine, voice, model, game, and trademark material are not licensed by the MonAgent software license. Spine Runtime is also subject to separate licensing terms; see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

## License

Current versions are source-available for noncommercial use under the [PolyForm Noncommercial License 1.0.0](LICENSE). Commercial use requires a [separate written commercial license](COMMERCIAL-LICENSE.md). Historical versions received under MIT remain governed by the terms that accompanied those copies.
