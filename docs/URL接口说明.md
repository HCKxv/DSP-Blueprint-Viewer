# 蓝图链接接口说明（`?txt=`）

本工具支持通过 URL 参数直接加载蓝图：把蓝图代码文件的地址放进 `?txt=`，打开链接后页面会自动下载文件、按内容判断蓝图类型，并切到对应界面（戴森球预览 / 工厂蓝图）。

在线地址：<https://hckxv.github.io/dysonBlueprintParser/>

## 快速开始

```
https://hckxv.github.io/dysonBlueprintParser/?txt=蓝图链接
```

把 `蓝图链接` 换成任意蓝图文件地址即可。文件内容以 `DYBP:` 开头会进入戴森球预览，以 `BLUEPRINT:` 开头会进入工厂蓝图。

自建部署时把链接前半段换成自己的站点地址即可，参数名不变。

## 参数

| 参数 | 说明 |
| --- | --- |
| `txt` | 蓝图代码文件的地址，放在 URL 查询串里；不带该参数时页面按正常方式使用 |

注意：

- 值必须是**地址**，不能直接填蓝图代码本身。
- 必须指向**蓝图代码原文**。GitHub 上的文件请使用 `raw.githubusercontent.com` 的地址；`github.com/.../blob/...` 是网页，返回 HTML，会提示「链接不是有效的蓝图代码」。
- 值里含 `&`、`#`、空格等特殊字符时要先 URL 编码，否则会被当成参数分隔符或锚点截断。
- 页面是 https 时不要用 `http://` 地址，会被浏览器按混合内容拦截。

## 地址要求

不限制域名，只要满足下面两点即可：

1. 浏览器能请求到（跨域地址需要目标站点允许 CORS，见下）；
2. 返回的是蓝图文本，而不是网页或二进制文件。

蓝图文件由浏览器直接 `fetch`，不经过工具服务器。

### 网络地址（跨域）

`txt` 可以直接写完整的 http/https 地址：

```
https://example.com/blueprints/a.txt
```

跨域请求需要目标站点允许跨域（响应带 `Access-Control-Allow-Origin`），否则会提示「加载蓝图失败：Failed to fetch」之类的网络错误；页面是 https 时，`http://` 地址会被浏览器按混合内容拦截。

示例：

```
https://hckxv.github.io/dysonBlueprintParser/?txt=https://example.com/blueprints/a.txt
```

### 同源地址

蓝图文件放在本工具站自己的目录下时，可以直接写相对路径或绝对路径，不受跨域限制：

```
https://hckxv.github.io/dysonBlueprintParser/?txt=./a.txt
```

## 蓝图文件要求

蓝图文件是纯文本，内容必须以以下标记之一开头，区分大小写：

| 开头标记 | 蓝图类型 | 加载后 |
| --- | --- | --- |
| `DYBP:` | 戴森球蓝图 | 切到戴森球预览并解析 |
| `BLUEPRINT:` | 工厂蓝图 | 切到工厂蓝图并解析 |

内容不符合时提示「加载蓝图失败：链接不是有效的蓝图代码」。

## 加载行为

- `?txt=` 在页面打开时读取一次，页面内不会持续监听地址栏。
- 加载结束（成功、失败或参数为空）后会自动从地址栏移除 `txt` 参数；因此刷新页面不会重复加载，要再次加载请重新打开带参数的链接。分享时也请用带参数的原始链接。
- 下载期间会提示「正在加载蓝图」。

## 常见提示

| 提示 | 原因 |
| --- | --- |
| 加载蓝图失败：HTTP 404 | 文件地址不存在，或仓库/分支/路径写错 |
| 加载蓝图失败：链接不是有效的蓝图代码 | 拉到的不是蓝图内容，最常见是填了网页地址 |
| 加载蓝图失败：Failed to fetch 等 | 网络错误、跨域被拒或混合内容拦截，不同浏览器文案不同 |
| 加载蓝图失败：Invalid URL | `txt` 的值不是合法地址（例如只写了 `https://`） |
| 加载蓝图失败：`<解析失败信息>` | 工厂蓝图解析失败，具体信息由解析器给出 |

## 使用案例

> https://hckxv.github.io/DSB/

## 生成链接

在网页或脚本里拼链接时，对目标地址做一次 `encodeURIComponent` 最稳妥：

```js
const fileUrl = 'https://example.com/blueprints/a.txt'
const link = `https://hckxv.github.io/dysonBlueprintParser/?txt=${encodeURIComponent(fileUrl)}`
```

## 维护说明

| 位置 | 作用 |
| --- | --- |
| `src/utils/urlLoader.ts` | `?txt=` 接口的整体实现：读取参数、下载蓝图、按 `BLUEPRINT_PREFIXES` 判断类型，以及加载结束后清理地址栏参数 |
| `.env` 的 `VITE_ENABLE_URL_LOAD` | 功能开关（true 开启 / false 关闭）；关闭后不加载，并直接清掉 `txt` 参数 |
| `src/App.vue` 的 `loadUrlBlueprint()` | 页面入口与加载提示 |
