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

默认打开 <https://hckxv.github.io/DSP-Blueprint-Viewer/>。自建时修改：

`background.js` 顶部的 `VIEWER_URL`，并确保目标页面支持 `dsp-blueprint:request-ready` 握手协议。

## 权限说明

| 权限 | 用途 |
| --- | --- |
| `contextMenus` | 添加「查看蓝图」右键菜单 |
| `content_scripts`（所有 http/https 页面） | 右键时读取目标元素 / 选中文本，判断是不是蓝图 |
