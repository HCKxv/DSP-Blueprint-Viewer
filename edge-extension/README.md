# 戴森球蓝图右键查看（Edge 扩展）

在任意网页右键蓝图文本，菜单里会出现「查看蓝图」；点击后在新标签页打开本工具，并载入蓝图。

## 安装

1. 打开 `edge://extensions/`
2. 打开「开发人员模式」
3. 点「加载解压缩的扩展」，选择本目录

安装后刷新已打开的页面，右键菜单才会生效。

## 使用

右键任意网页里的蓝图文本 → 点「查看蓝图」。工具会在新标签页打开并自动载入这份蓝图。

## 自建部署 / 改查看器地址

默认打开 <https://hckxv.github.io/DSP-Blueprint-Viewer/>。自建时改两处：

1. `background.js` 顶部的 `VIEWER_URL`
2. `manifest.json` 的 `host_permissions`，改成查看器所在域名，例如：

```json
"host_permissions": ["http://localhost:5173/*"]
```

改完在 `edge://extensions/` 里点扩展的「重新加载」。

## 权限说明

| 权限 | 用途 |
| --- | --- |
| `contextMenus` | 添加「查看蓝图」右键菜单 |
| `scripting` | 在查看器标签页里执行一段脚本，用 `window.postMessage` 投递蓝图 |
| `host_permissions`（查看器域名） | 允许向查看器标签页注入脚本 |
| `content_scripts`（所有 http/https 页面） | 右键时读取目标元素 / 选中文本，判断是不是蓝图 |
