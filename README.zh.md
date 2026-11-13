# 通用 Agent 环境预设

[![npm version](https://img.shields.io/npm/v/dsh-agentic-env-presets.svg)](https://www.npmjs.com/package/dsh-agentic-env-presets)
[![npm downloads](https://img.shields.io/npm/dm/dsh-agentic-env-presets.svg)](https://www.npmjs.com/package/dsh-agentic-env-presets)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.1.7%20→%200.2.x-4D6BFE.svg)](https://github.com/Jing494/agentic-env-presets)

[English](README.md) | [中文](README.zh.md)

两套预设——**官方 Standard 与 PTC 组合的逐字克隆**——把系统提示词里的品牌表述换成
一个中性的 *agent 编码环境* 说法。工具、计划模式、压缩、委派、子代理、prompt
caching 以及每一个配置值都从官方声明逐字复制。组合上唯一的改动是多了
`env-identity` 这一行。

## 安装

要求 DSH 的提示词 API 与本 bundle 匹配——即 `0.1.7` 到 `0.2.x`（见
[兼容性](#兼容性)）。除此之外不需要任何东西：没有构建步骤、没有原生依赖、
没有 post-install 脚本。

### 在插件页填写安装（图形界面）

Web GUI 的插件管理器用同一个输入框完成上面三种安装（**设置 → 插件 → 安装**）。
粘贴以下任意一种：

| 填这个 | 装到的东西 | 解析类型 |
|---|---|---|
| `dsh-agentic-env-presets` | npm 上的最新版 | registry |
| `dsh-agentic-env-presets@1.1.0` | npm 上那个确切版本 | registry |
| `https://github.com/Jing494/agentic-env-presets` | GitHub 默认分支 | git |
| `github:Jing494/agentic-env-presets` | GitHub 默认分支 | git |
| `/absolute/path/to/agentic-env-presets` | 本地检出目录 | path |

那个输入框要的就是 **npm 包名**、**GitHub 仓库地址** 或 **本地目录路径**——只有
这三种形态。下面这些看着对、但**装不上**，每条都用安装器自己的解析器实测过：

| 别填 | 为什么失败 |
|---|---|
| `https://www.npmjs.com/package/dsh-agentic-env-presets` | 这是 npm 的**网页地址**，不是仓库地址；它会被当成 git 主机解析然后失败。请填纯包名。 |
| `npm install dsh-agentic-env-presets` / `dsh plugin add …` | 整条命令行不是安装规格；只填 `add` **之后**的那一段。 |
| `Jing494/agentic-env-presets` | 既不是合法包名也不是 URL——请用完整的 `https://github.com/…` 形式。 |
| `./agentic-env-presets` | 本地路径必须是**绝对路径**。 |

这个 bundle 从不安装脚本，所以插件页不会让你确认任何构建步骤。如果它要装的某个
包确实想跑安装脚本，页面会停下来先问你——那是**授权门槛**，不是报错。

### 从 npm 安装（推荐）

```sh
dsh plugin --profile web add dsh-agentic-env-presets
```

想自己控制升级时机的话，可以钉死版本：

```sh
dsh plugin --profile web add dsh-agentic-env-presets@1.1.0
```

### 从 GitHub 安装

跟踪仓库的默认分支——你拿到的是最新提交，**包括尚未正式发布的改动**：

```sh
dsh plugin --profile web add https://github.com/Jing494/agentic-env-presets
# 或 pnpm 支持的简写：
dsh plugin --profile web add github:Jing494/agentic-env-presets
```

### 从本地检出安装

适合要改预设或改写插件本身的情况。`link:` 让 Host 直接指向这个工作目录，改完
不用重装就能看到效果：

```sh
dsh plugin --profile web add link:/path/to/agentic-env-presets
```

### 安装之后

上面两条命令都会自动把这个 bundle 登记为 profile 的一层。`dsh` 会把它写进
`$DSH_HOME/profiles/<profile>/package.json` 的 `dsh.profile.bundles`，可以这样确认：

```sh
dsh --profile web --dump-config | grep -E 'preset-(standard|ptc)-env'
```

重启 profile，然后在**新建**会话时选 `标准模式（中性环境）` 或
`PTC 模式（中性环境）`——选择器里它们会和内置预设排在一起。已存在的会话保持它
启动时的预设不变。

### 验证安装

```sh
dsh --profile web --dump-config | grep -c env-identity   # 期望输出 2
```

如果某个 bundle 加载失败，`dsh` 会打印
`skipping profile bundle "<名称>": <原因>` 然后照常启动——坏的 bundle 永远不会
把 profile 拖垮。修好之后重新 `add` 即可。

### 卸载

```sh
dsh plugin --profile web remove dsh-agentic-env-presets
```

这一步会同时移除依赖和它在 `dsh.profile.bundles` 里的条目，不会留下残留的层。
已经跑在这些预设上的会话会一直用到重启为止。

## 交付物

| 文件 | 说明 |
|---|---|
| [`presets-standard.patch.yml`](presets-standard.patch.yml) | Standard 克隆，预设 id `standard-env`，Loader 行 `preset-standard-env` |
| [`presets-ptc.patch.yml`](presets-ptc.patch.yml) | PTC 克隆（仅 `run_code` 执行器，workflow / 插件市场工具关闭），预设 id `ptc-env` |
| [`index.js`](index.js) | `env-identity` 改写插件（三层，短语表可配置） |
| [`verify.mjs`](verify.mjs) | 针对真实官方插件的可复跑验证 |
| [`gen-presets.mjs`](gen-presets.mjs) | 从官方文件重新生成两个 patch（保真检查／升级工具） |
| [`package.json`](package.json) | bundle 清单；`dsh.bundle.patch` 列出两个 patch 文件 |
| [`icon.svg`](icon.svg)、[`locale/en.json`](locale/en.json)、[`locale/zh.json`](locale/zh.json) | 官方风格图标与本地化标题／描述 |
| [`docs/DETAIL.md`](docs/DETAIL.md)、[`docs/DETAIL.zh.md`](docs/DETAIL.zh.md) | 各语言 `meta.detail` 指向的详情文档 |
| [`README.md`](README.md) | 英文 README |
| [`移植说明.md`](移植说明.md) | 中文设计／坑／移植笔记 |
| [`PROMPT.md`](PROMPT.md) | 最初的任务简报 |

## 原理

`includeHarnessIdentity` 是**部署级**开关，预设挂不到 prompt registry 本身，所以任何
预设都无法关掉它。预设能做的是在**自己的作用域内**注册 section；注册表的分层结构
**按名字索引**：`ScopedLayers.merge()` 让作用域内的同名 section **遮蔽**全局的那一条
（祖先在前），而 `dsh-agent-presets` 用 `bindScopeParent(agentKey, presetKey)` 把
agent scope 链到预设的 standing scope。整个技巧就是这样：

```
global 层     harness:identity, 各工具指引, harness:source, app:web-surface …
      ▲ 被同名遮蔽
preset 层     harness:identity（新文案）, harness:source = "", app:web-surface = ""
      ▲ 被继承
agent scope   每会话追加项
```

空遮蔽项仍然作为 assembly 条目存在，但 `renderPrompt` 会丢弃空 section，空 context
在拼接快照时消失。全局 owner 仍挂载给其他所有预设。

## 插件做了什么（`index.js`）

它是一个普通的 Cordis 函数插件（`name`、`inject`、`apply`），**无运行时依赖**，作为
每个预设里的一行挂载。三层，按优先级：

1. **换身份句。** 在 preset scope 内用 `config.identity` 注册 `harness:identity`。
   同名 ⇒ 全局那条被替换，而不是重复。
2. **静默 harness 维护段落。** 当 `silenceDevContext`（默认 `true`）时，把
   `harness:source` 和 `app:web-surface`——section 与 runtime context 两半共四个
   名字——注册为空串。这一步移除 checkout 路径与 GUI URL，但不卸载它们的 owner。
3. **擦除残留 token。** 一个 scope 过滤的 `system-prompt/assemble` waterfall 监听器，
   用 `config.replacements` 里的字面 `[from, to]` 短语对改写每个已装配的 section 与
   context。字面 `split/join`，**绝不用正则**，所以 `$DSH_HOME`、`DSH_ENV_PREFIX`、
   `dsh` 这个 CLI 名（`only dsh web injects …`）和 socket 路径永远不会被改坏。
   带尾空格的 `DeepSeek Harness ` 短语先跑，于是 "the DeepSeek Harness implementation
   checkout" 变成 "the implementation checkout"，而不是 "the the …"。
   `extend DSH itself` 单独成对，因为它是自指而非标识符。

监听器返回的是 section/context 条目的**拷贝**。在 waterfall 返回前，assembly 与注册表
共享对象，原地修改会泄漏到其他 agent 之后的请求里。

刻意**不做**：不全局改写框架提示词字符串；不用 `complete: true` section（那会吞掉
工具指引、计划模式和 SDK 说明，并让 prompt cache 失效）；不用正则替换。

### 配置

```yaml
- id: env-identity
  name: 'dsh-agentic-env-presets'
  config:
    identity: You are an AI coding agent working inside an agentic coding environment.
    silenceDevContext: true        # 可选，默认 true
    replacements:                  # 可选，默认见 DEFAULT_REPLACEMENTS
      - ['DeepSeek Harness ', '']
      - ['DeepSeek Harness', 'the agentic coding environment']
      - ['DSH file policy', 'file policy']
      - ['DSH file sandbox', 'file sandbox']
      - ['extend DSH itself', 'extend the environment itself']
```

## 兼容性

清单**刻意不写 `engines.dsh`**。像 `^0.2.2-rc.1` 这样的窄区间只覆盖
`0.2.2`–`0.2.5`，引擎一旦越过这个窗口，bundle 就会被**直接拒绝**——这正是"升级引擎
却被迫先升级插件"的失败模式。改用：

- `peerDependencies` 声明 `@deepseek-ai/dsh-system-prompt": ">=0.1.0-0"`；
  `semver` 在 `includePrerelease` 下匹配，所以预发布版引擎也算在内。
- 插件触碰的 section（`harness:identity`、`harness:source`、`app:web-surface`）和它
  调用的 API（`getSectionOrder`、`getContextOrder`、`system-prompt/assemble`）从
  `0.1.7` 一直到 `0.2.x` 都存在，区间就是据此锚定的。

如果将来的引擎改掉了这些 section 名，bundle 会在**启动时被跳过**并打印诊断，明确指出
缺了哪一块，而 profile 本身照常启动——坏 bundle 永远不会把 harness 一起带走。

## 验证

`verify.mjs` 挂载**真实的** `dsh-system-prompt`、`dsh-harness-dev-context` 和
`dsh-persona` 包，外加一个忠实还原的 `dsh-sandbox-policy` runtime context 桩，以及
`dsh-harness-dev-context` 注入的两个 Host 服务桩（`webApp`、`sessionProjections`）。
它开一个 preset scope，在其下链一个 agent scope，装配并渲染，然后做**精确子串**断言：

| 用例 | 断言 |
|---|---|
| 新预设，默认配置 | 身份句是新文案；维护 section/context 为空；提示词与 context 中**无品牌短语**；无重复的 "the the" |
| 新预设，`silenceDevContext: false` | 维护段落仍在（这正是关闭静默的含义），但**擦除层仍清掉所有品牌短语**，无 "the the" |
| 官方预设（基线，无 env 行） | 品牌短语**仍在**——证明没有泄漏到全局／部署层 |

在任何目录都能跑（它自己定位 dsh 安装目录，并用绝对路径 ESM import，因为 ESM 不认
`NODE_PATH`，且本文件系统不允许建符号链接）：

```sh
node verify.mjs                      # 或：node verify.mjs <dsh 安装目录>
echo $?                              # 0 = 全部通过，1 = 失败
```

本机实测输出（三组全部 `PASS`）：

```
===== env preset (default config) =====
--- prompt ---
You are an AI coding agent working inside an agentic coding environment.

You are a coding agent powered by the deepseek-v4.1-flash model.
--- runtime context snapshot ---
Current runtime context. This snapshot supersedes earlier runtime-context snapshots.

Current file policy: danger-full-access. The file sandbox does not restrict file modifications by available operations.
brand tokens found: none
brand=ok identity=ok maintenance=ok noDoubledWord=ok
ASSERTION: PASS

===== env preset (silenceDevContext: false) =====
… "The runtime context names the implementation checkout. … extend the environment itself."
… "Current implementation checkout: …" / "Current Web GUI URL: …"
brand tokens found: none
brand=ok identity=ok maintenance=ok noDoubledWord=ok
ASSERTION: PASS

===== baseline preset (no env row) =====
You are an AI agent powered by DeepSeek Harness.
… The runtime context names the DeepSeek Harness implementation checkout …
brand tokens found: DeepSeek Harness, DSH file policy, DSH file sandbox, extend DSH itself
brand=ok identity=ok maintenance=ok noDoubledWord=ok
ASSERTION: PASS

ALL 3 CASES PASS
```

## 限制／改不了什么

- **这只改模型看到的文字，不改产品。** Web GUI、CLI help（`dsh --help`）、插件管理器、
  市场文案、onboarding 文案仍然会报出 harness 的名字。预设够不到那些地方，也不该去够。
- **它按构造就是 per-agent 的。** 其他预设、其他会话、部署层都保持原提示词，所以
  维护 harness 的那个 agent 仍能准确描述它自己。如果哪天**基线**预设里的品牌字样
  消失了，说明遮蔽泄漏了——这正是用例 3 在检查的。
- **空遮蔽 section 仍然存在。** 它们渲染为空，但 `SystemPrompt.assemble()` 会把它们
  列出来；检查原始 assembly 的工具会看到两条空项。这是有意为之，无害。
- **它与 harness 的形状绑定。** 它依赖 `ScopedLayers` 的同名遮蔽、
  `system-prompt/assemble` 是 scope 过滤的 waterfall、以及预设→agent 的 scope 链。
  在没有这些接缝的平台上，见 [`移植说明.md`](移植说明.md) 的移植章节。
- **短语表是部署相关的。** 官方措辞是默认值；改过自己提示词的部署应编辑
  `config.replacements`。本版本模型可见的品牌清单就是 `BRAND_TOKENS` /
  `DEFAULT_REPLACEMENTS` 里的那五条——框架升级后请重跑 `verify.mjs`。

## 升级克隆

两个 patch 都是逐字克隆。DSH 升级后重新生成并 diff：

```sh
node gen-presets.mjs <dsh-install>/node_modules/@deepseek-ai/dsh-web-app/presets
diff -u <shipped>/standard.patch.yml presets-standard.patch.yml
```

diff 必须恰好只有：文件头、行 id、元数据块、以及 `env-identity` 这一行。

### 变更记录

**2026-11-11 —— 针对 DSH `0.2.2-rc.1` 重新克隆（修复了一个坏行）。**

两个文件都已与官方声明漂移。可见症状是

```
tool-subagent-list-agents (@deepseek-ai/dsh-tool-subagent-control/list-agents): never started
```

由 `@deepseek-ai/dsh-agent-preset-registry` 在挂载 `standard-env` / `ptc-env` 时报告。
该行 import 了 `@deepseek-ai/dsh-tool-subagent-control/list-agents`，但这个包的
`exports` 映射里**没有 `./list-agents` 子路径**——`list_agents` 是由它的主入口注册的
（`apply()` 调用 `registerListAgents(ctx)`）。所以这个 import 只可能以
`ERR_PACKAGE_PATH_NOT_EXPORTED` 失败，Loader 记下 import 错误、`entry.fiber` 留空，
审计就把它渲染成 "never started"。官方 `standard`／`ptc` 预设从不声明这样一行。

修复方式是从 0.2.2-rc.1 的声明逐字重新生成两个文件，于是这行消失了。同一次重新生成
还恢复了三处曾经悄然改变行为的漂移：

| 行 | 之前 | 之后（与官方一致） |
|---|---|---|
| `tool-fs` | 没有 `config`（applyPatch 默认为关，但注释没了） | `applyPatch: false` |
| `tool-subagent` | `modelSelectionSettings: true`（不是配置键） | `modelSelection: true` + `modelDiscovery: true` |
| `tool-executor-ptc`（仅 ptc） | `@deepseek-ai/dsh-agent-tool-presentation`（`mode: ptc`） | `@deepseek-ai/dsh-tool-executor-ptc` |

**2026-11-13 —— 可发布的清单。** 改名为无 scope 的 `dsh-agentic-env-presets`，
去掉 `private`，补 `license: MIT`、`repository`、`icon`、`keywords`、`main`，以及
各语言 `meta.detail` 详情文档；用宽 `peerDependencies` 取代任何 `engines.dsh` 钉死
（见「兼容性」）。

## 许可

[MIT](LICENSE) © 2026 Jing494
