# 启动场景资源与客户打包

阿罗娜／普拉娜教室的四套 Spine 导出、六张纹理和两张封面是独立资源，不写入源码历史。
2026-10-31 素材提供方明确批准现有素材供客户使用，本机已准备资源版本 `1.0.0`；授权记录与原有来源声明随资源携带。
资源版本独立于 Eden 产品版本。修改资源不会自动推进产品版本、更新已安装程序或替换已交付归档。

## 准备资源

在 Agent 根目录执行，输入目录布局仍为原始导出包的 `assets/` 与三份原始声明：

```powershell
node Script/Project/prepare_startup_scene.mjs --source 'E:\path\scene-source' --version 1.0.0 --distribution-notice 'E:\path\DISTRIBUTION-NOTICE.txt'
```

`DISTRIBUTION-NOTICE.txt` 记录素材提供方批准的客户使用范围。准备器保留 `LICENSE.txt`、`NOTICE.txt`、`SPINE-LICENSE.txt` 原文，捕获全部输入后才写目标目录。需要独立资源目录时增加 `--output`。不传 `--version` 与 `--distribution-notice` 时继续生成 `localOnly: true` 的本机开发资源，打包器拒绝使用。

输出 `manifest.json` 使用 `schemaVersion: 1`、`resourceId: agent-startup-scene`、独立 `version`、`localOnly: false`，每个文件记录 `name`、`bytes`、`sha256`。固定文件契约见同目录 `startup_scene_contract.json`。可以额外携带已列入清单的文本声明；未列出的文件、路径越界、链接、缺件和摘要不符都会阻止打包。

## 干净源码构建

从已确认源码提交构建 Web，使用显式的外部资源目录，不依赖干净 checkout 中被 Git 忽略的素材：

```powershell
$env:EDEN_AGENT_STARTUP_SCENE_SOURCE = 'E:\EDEN\Agent\frontend\web\public\startup-scene'
node frontend/Script/Project/startup_scene.mjs --check $env:EDEN_AGENT_STARTUP_SCENE_SOURCE
node frontend/Script/Project/package_desktop.mjs win32 x64
```

Linux 同样通过 `EDEN_AGENT_STARTUP_SCENE_SOURCE=/absolute/resource/path` 指定资源，再运行 `package_desktop.mjs linux x64`。现有 runtime/Web/output 环境变量保持可用。不显式传入时，打包器只尝试 Web 构建目录中的 `startup-scene`，仍须通过全部交付校验；缺失时停止。

场景被写入 `resources/app/web/dist/startup-scene/`。打包器先捕获并验证全部文件，再把捕获的字节装入 Electron；不把开发 Web 输出中的其他同名资源混入交付。组装后再次核对资源，并在 `desktop-manifest.json.startupScene` 记录路径、版本、资源清单 SHA-256、文件数与总字节数；全部场景文件也进入桌面逐文件清单。

根 Windows/Linux 主包组装会验证这份桌面资源并写入 `BUILD-INFO.json.startupScene`。缺少场景的旧桌面制品不能作为新流程的候选。规划组件复用时必须同时确认场景清单与本次选定资源一致；资源变化需重新组装桌面资源，不能用旧组件源码 SHA 代替资源证据。

## 验证

```powershell
node --test frontend/tests/startup-scene-package.test.mjs frontend/tests/desktop-manifest.test.mjs
```

在 Eden 根目录可只读检查 Windows/Linux 桌面制品及完整包记录：

```powershell
Core/.venv/Scripts/python.exe -B Script/portable/agent_startup_scene.py --desktop <主包>/apps/eden-agent --build-info <主包>/BUILD-INFO.json
```

源码渲染验收支持通过 `EDEN_AGENT_STARTUP_SCENE_SOURCE` 指向实际打包后的资源目录。截图目录用 `EDEN_STARTUP_EVIDENCE_DIR` 指向根 `.release/current/Agent/` 下的固定目录；不指定时放系统临时目录并随测试清理。
