# 通用 Agent 环境预设

[![npm version](https://img.shields.io/npm/v/dsh-agentic-env-presets.svg)](https://www.npmjs.com/package/dsh-agentic-env-presets)
[![npm downloads](https://img.shields.io/npm/dm/dsh-agentic-env-presets.svg)](https://www.npmjs.com/package/dsh-agentic-env-presets)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![DSH](https://img.shields.io/badge/DSH-0.1.7%20→%200.2.x-4D6BFE.svg)](https://github.com/Jing494/agentic-env-presets)

[English](README.md) | [中文](README.zh.md)

两套预设——**官方 Standard 与 PTC 组合的逐字克隆**——把模型能读到的品牌表述换成一个
中性的 *agent 编码环境* 说法。工具、计划模式、压缩、委派、子代理、prompt caching
以及每一个配置值都从官方声明逐字复制。组合上唯一的改动是多了 `env-identity` 这一行。

"模型能读到的"比想象中宽：除了系统提示词，还包括**运行时上下文**、**工具 schema 的
description**、以及**每步注入的技能目录消息**。四类文本分属四个子系统，所以插件是
五层而不是一层——详见[原理](#原理)。

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
| [`index.js`](index.js) | `env-identity` 改写插件（五层，短语表与三个开关可配置） |
| [`verify.mjs`](verify.mjs) | 针对真实官方插件的 18 组可复跑验证（含变异测试说明） |
| [`probe-restrict.mjs`](probe-restrict.mjs) | 证明工具同名遮蔽**不会**绕过子 agent 的 `tools.restrict()` |
| [`probe-robust.mjs`](probe-robust.mjs) | 证明缺服务/缺字段时**降级为 no-op 而不抛错**（含对照实验） |
| [`gen-presets.mjs`](gen-presets.mjs) | 从官方文件重新生成两个 patch（保真检查／升级工具） |
| [`package.json`](package.json) | bundle 清单；`dsh.bundle.patch` 列出两个 patch 文件 |
| [`icon.svg`](icon.svg)、[`locale/en.json`](locale/en.json)、[`locale/zh.json`](locale/zh.json) | 官方风格图标与本地化标题／描述 |
| [`docs/DETAIL.md`](docs/DETAIL.md)、[`docs/DETAIL.zh.md`](docs/DETAIL.zh.md) | 各语言 `meta.detail` 指向的详情文档 |
| [`docs/PUBLISHING.md`](docs/PUBLISHING.md)、[`docs/PUBLISHING.zh.md`](docs/PUBLISHING.zh.md) | 作为 DSH 插件发布与收录所需的仓库规范 |
| [`LICENSE`](LICENSE) | MIT |
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
global 层     harness:identity, 各工具指引, harness:source, app:web-surface, sandbox:policy …
      ▲ 被同名遮蔽
preset 层     harness:identity（新文案）, harness:source = "", app:web-surface = "",
              sandbox:policy = 委托包装, 各工具 = 换 description 的同名定义
      ▲ 被继承
agent scope   每会话追加项
```

空遮蔽项仍然作为 assembly 条目存在，但 `renderPrompt` 会丢弃空 section，空 context
在拼接快照时消失。全局 owner 仍挂载给其他所有预设。

### 品牌字样在**五个**地方，不在一个地方

这一点是 1.1.1 的核心疏漏：它只盖住了系统提示词的两个 section，于是真实会话里模型
仍然自报品牌。

| 面 | 归属 | 接缝 |
|---|---|---|
| 系统提示词 section | `dsh-system-prompt` | 同名 `section()` |
| 运行时上下文 context | 各 owner 注册、**循环事后重算** | 同名 `context()` 委托包装 |
| 工具 schema 的 description | `dsh-tools` | 同名 `tools.register()`，转发可执行回调 |
| 循环注入的 user message（技能目录） | `dsh-tool-skill` 等 | `agent/pre-step`，且必须 `{prepend:true}` |
| 其余漏网 | 任意 | `system-prompt/assemble` 兜底 |

其中两条尤其反直觉，值得单独说：

- **运行时上下文在 waterfall 之后还会被重算。** `dsh-agent-loop` 的顺序是
  `assemble()` → waterfall → `refreshContext()` → 渲染。`refreshContext()` 重新解析
  所有 context provider，所以只在 waterfall 里擦 context 的写法，单测看着完美，真实
  请求里原样回来。本包改为同名委托包装，让重算解析到我们的函数。
- **技能目录是在 `next()` 之后追加的。** 所以 `agent/pre-step` 监听器必须是
  **最外层**（`{prepend:true}`）；按默认内层注册会先跑完、扫到空目录、什么也没擦，
  然后目录才带着品牌被追加进来。这一条在 `verify.mjs` 里有专门的用例。

## 插件做了什么（`index.js`）

它是一个普通的 Cordis 函数插件（`name`、`inject`、`apply`），**无运行时依赖**，作为
每个预设里的一行挂载。五层：

1. **换身份句。** 在 preset scope 内用 `config.identity` 注册 `harness:identity`。
   同名 ⇒ 全局那条被替换，而不是重复。
2. **静默 harness 维护段落。** 当 `silenceDevContext`（默认 `true`）时，把
   `harness:source` 和 `app:web-surface`——section 与 runtime context 两半共四个
   名字——注册为空串。这一步移除 checkout 路径与 GUI URL，但不卸载它们的 owner。
3. **遮蔽运行时上下文。** 每个全局 context 用同名 provider 再注册一遍，`text` 是函数：
   调原 provider、擦洗结果。这样 `refreshContext()` 重算时拿到的就是擦干净的版本，
   而工作目录、文件策略、审批策略这些有用信息照常保留。
4. **遮蔽工具描述。** 每个描述带品牌的工具用同名定义再注册一遍，擦洗三个文档面：
   顶层 `description`、`parameters` 里嵌套的 `description`/`title`、以及
   `output.schema` 里的同类字段。`enum`/`const`/`default`/`$ref`/属性名是**数据**，
   保持逐字节不变；`execute` / `render` / `when` 原样转发。PTC 模式把这三面都内联进
   `tools:sdk`，所以两种执行器一并覆盖。保留名 `run_code` 跳过。
   同名遮蔽**不会**绕过子 agent 的 `tools.restrict()`——预设层是继承层，仍受限。
5. **改写 `complete: true` 的整段提示词。** 这种 section 在 waterfall **之后**被
   `assemble()` 从瀑布前的快照里原样恢复成**整个提示词**，上面四层都够不到它。
   放在祖先层时用同名再注册（保留 `complete`）；放在**本预设同一层**时同名注册必然
   抛错，于是改为**原地重写该 section 对象**（先确认未被冻结、未被多层共享，卸载时
   还原）。官方 `minimal` 预设就设置了 `complete: true`，所以这是实际路径而非理论。
6. **擦除残留 token。** 一个 scope 过滤的 `system-prompt/assemble` waterfall 监听器
   兜底，加一条 `agent/pre-step`（最外层）改写**技能目录与技能正文**消息
   （`skill-catalog` / `skill-invocation` 等），并靠消息 id 排除用户自己的发言。

第 5 层的短语表用字面 `split/join`，**顺序有意义**（长短语在前），带尾空格的
`DeepSeek Harness ` 先跑，于是 "the DeepSeek Harness implementation checkout" 变成
"the implementation checkout"，而不是 "the the …"。

裸 `DSH` 散文由一条**带三重断言的窄正则** `(?<![\w$.\-])DSH(?![\w\-])` 兜底。
它与 1.1.1 的"绝不用正则"原则相反，但实践证明纯短语表永远滞后于插件作者的措辞。
替换后若处在句首，首字母会大写（`DSH rules apply` → `The … rules apply`），
但**中文语境不加英文冠词**（`DSH 的规则` 不会变成 `The … 的规则`）。

断言保证这些**一个字节都不动**：

```
$DSH_HOME   DSH_ENV_PREFIX   __DSH_BOOT__   engines.dsh
@deepseek-ai/dsh-tool-bash   DSH-1234   myDSHThing
```

监听器返回的是 section/context 条目的**拷贝**。在 waterfall 返回前，assembly 与注册表
共享对象，原地修改会泄漏到其他 agent 之后的请求里。

刻意**不做**：不全局改写框架提示词字符串；**不把**预设切换成 `complete: true` 整段
接管（那会吞掉工具指引、计划模式和 SDK 说明，并让 prompt cache 失效——但上游这样配了，
我们必须能擦掉它，见第 5 层）；不改工具**名**（那是调用面，改名直接打断工具调用）；
不改 `$DSH_*` 等标识符。

### 配置

```yaml
- id: env-identity
  name: 'dsh-agentic-env-presets'
  config:
    identity: You are an AI coding agent working inside an agentic coding environment.
    silenceDevContext: true        # 可选，默认 true
    scrubToolDescriptions: true    # 可选，默认 true；关掉则只擦提示词与上下文
    scrubLoopMessages: true        # 可选，默认 true；关掉则不碰上下文/技能目录
    bareToken: true                # 可选，默认 true；关掉则只跑短语表，不跑裸 DSH 正则
    replacements:                  # 可选，默认见 DEFAULT_REPLACEMENTS；整表替换
      - ['DSH（DeepSeek Harness）', 'the agentic coding environment']
      - ['DeepSeek Harness ', '']
      - ['DeepSeek Harness', 'the agentic coding environment']
      - ['DSH Marketplace', 'plugin marketplace']
      - ['DSH file policy', 'file policy']
      - ['DSH file sandbox', 'file sandbox']
      - ['extend DSH itself', 'extend the environment itself']
```

三个开关是为**排障与移植**留的，不是日常配置：怀疑某一层误伤正常文本时，逐层关掉就能
定位。`bareToken: false` 保留"纯字面短语"的旧行为。

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

`verify.mjs` 挂载**真实的** `dsh-system-prompt`、`dsh-harness-dev-context`、
`dsh-persona`、`dsh-tools`、`dsh-tool-executor-native`、`dsh-agent`、`dsh-scope`，
外加 `dsh-harness-dev-context` 注入的两个 Host 服务桩（`webApp`、`sessionProjections`）。
它开一个 preset scope，在其下链一个 agent scope，然后按**循环真实的顺序**装配、刷新、
渲染、解析工具、跑 pre-step，做**精确子串**断言。十八组：

| 用例 | 断言 |
|---|---|
| 1 默认配置 | 身份句是新文案；维护 section/context 为空；四个面都**无品牌字样**；无 "the the" |
| 2 `silenceDevContext: false` | 维护段落仍在（这正是关闭静默的含义），但**擦除层仍清掉品牌** |
| 3 官方预设（基线，无 env 行） | 品牌字样**仍在**——证明没有泄漏到全局／部署层 |
| 4 `refreshContext()` 之后 | 循环会**在 waterfall 之后**重解 context；此时仍必须干净，且文件策略文本没被清空 |
| 5 工具 schema | 顶层描述**与 `parameters` 里的嵌套文档**都被擦；标识符一字不动；`enum`/`default`/属性名等**数据**保留；基线的工具描述仍是原文 |
| 6 技能目录 | 目录消息被**真的改写**（不是"没跑到"），且 `source.entries` 未被污染 |
| 7 标识符安全 | `$DSH_HOME`、`__DSH_BOOT__`、`engines.dsh`、`DSH-1234` 等原样保留 |
| 8 挂载顺序无关 | 同一组插件、**两种挂载顺序**都必须干净——遮蔽扫描曾被自己的空遮蔽打断，只在其中一种顺序下泄漏 |
| 5b PTC `tools:sdk` 渲染 | 用**真实的 `renderToolsSdkPy()`** 渲染遮蔽后的定义，散文必须干净，而 `enum` 数据（`Literal["DSH", …]`）必须保留 |
| 9 `complete: true` 的两种摆放 | 放在**祖先层**要能同名遮蔽；放在**本预设同一层**（`dsh-persona` 就是同层兄弟行）时同名注册必然抛错，必须改为**原地重写 section 对象**。两种摆放都不得泄漏，且修好后不再打 warn |
| 10 措辞可读 | 句首替换后首字母大写；句中仍小写；中文前后**不加**英文冠词；标识符一字节不变 |

在任何目录都能跑（它自己定位 dsh 安装目录，并用绝对路径 ESM import，因为 ESM 不认
`NODE_PATH`，且本文件系统不允许建符号链接）：

```sh
node verify.mjs                      # 或：node verify.mjs <dsh 安装目录>
echo $?                              # 0 = 全部通过，1 = 失败
```

每组都会把该面实际送进模型的文本打出来，便于肉眼复核。

### 一定要做变异测试

一套永远通过的测试等于没有测试。至少跑这两条，**期望都是 FAIL**：

```sh
# 去掉 prepend：技能目录用例（6）必须失败
sed -i "s/onPreStep, { prepend: true }/onPreStep/" index.js && node verify.mjs

# 停掉上下文遮蔽：刷新用例（4）必须失败
sed -i "s/^    rescanContexts();/    \/\/ rescanContexts();/" index.js && node verify.mjs

git checkout index.js    # 复原
```

这两条都已在 1.2.0 上实测：分别精确击穿用例 6 与用例 4，其余用例保持通过。

另外两个探针覆盖"不炸"这一面，退出码 0 表示通过：

```sh
node probe-restrict.mjs   # 遮蔽不会复活被 tools.restrict() 禁掉的工具
node probe-robust.mjs     # 缺 tools 服务 / 缺 layers / 空配置 / provider 自己抛错
```

`probe-robust.mjs` 的最后一个用例是**对照实验**：某个 context provider 自己会抛错时，
不装本插件也照样抛——它断言的是"装与不装行为一致"，而不是"绝不抛错"。
## 限制／改不了什么

- **这只改模型看到的文字，不改产品。** Web GUI、CLI help（`dsh --help`）、插件管理器、
  市场文案、onboarding 文案仍然会报出 harness 的名字。预设够不到那些地方，也不该去够。
- **它按构造就是 per-agent 的。** 其他预设、其他会话、部署层都保持原提示词，所以
  维护 harness 的那个 agent 仍能准确描述它自己。如果哪天**基线**预设里的品牌字样
  消失了，说明遮蔽泄漏了——这正是用例 3 在检查的。
- **空遮蔽 section 仍然存在。** 它们渲染为空，但 `SystemPrompt.assemble()` 会把它们
  列出来；检查原始 assembly 的工具会看到两条空项。这是有意为之，无害。
- **它与 harness 的形状绑定。** 它依赖 `ScopedLayers` 的同名遮蔽、
  `system-prompt/assemble` 是 scope 过滤的 waterfall、`refreshContext()` 走 registry、
  `agent/pre-step` 的 waterfall 顺序、以及预设→agent 的 scope 链。在没有这些接缝的
  平台上，见 [`移植说明.md`](移植说明.md) 的移植章节。
- ~~工具参数里的子描述没被擦~~：**1.2.0 已修复**。现在递归擦 `parameters` 里的
  `description`/`title`，同时**不动** `enum`/`const`/`default`/`$ref` 与属性名——
  那些是数据或标识符，改了会让模型产出的参数对不上。
- ~~技能正文没被擦~~：**1.2.0 已修复**。`skill-invocation` 与技能目录走同一个
  `agent/pre-step` 钩子，正文同样被擦洗（见 `verify.mjs` case 6）。
- ~~`complete: true` 的整段接管~~：**1.2.0 已修**。祖先层用同名遮蔽，同层用原地
  重写 section 对象（见 `verify.mjs` case 9）。只有在对象被 `Object.freeze()` 或被
  多个层共享时才会退回"打 warn 不修"——那两种情况会明确写日志，不会静默。
- **技能的名字**（如 `dsh-plugin-store`）与磁盘上的 `SKILL.md` 文件本身没改。前者是
  调用面，改名会打断 `skill()` 调用；后者不在提示词层，本包只在它进入上下文时擦洗。
- **短语表是部署相关的。** 官方措辞是默认值；改过自己提示词的部署应编辑
  `config.replacements`。裸 `DSH` 由那条带断言的窄正则兜底，新增品牌词请加进表里——
  框架升级后请重跑 `verify.mjs`，并跑一次变异测试。

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

**2026-11-14 —— 1.2.0：擦洗覆盖到真正会被模型读到的地方。**

1.1.1 在有 `standard-env` 预设的会话里，模型仍然自报「运行在 DSH（DeepSeek
Harness）里」。从会话日志取出那次请求后，确认泄漏来自 **1.1.1 完全没触及的三个面**：

| 面 | 实测 |
|---|---|
| 运行时上下文 | `Current DSH file policy: … the DSH file sandbox …` |
| 工具 schema 的 description | 11 处，如 `Search the DSH Marketplace catalogue of DeepSeek Harness plugins` |
| 技能目录 user message | 3 处，`Find and install DeepSeek Harness (DSH) plugins` |

而它**自以为**盖住的运行时上下文，其实只盖住了 `assemble()` 那一瞬间：
`dsh-agent-loop` 会在 waterfall 之后调 `refreshContext()` 重解全部 provider，
把原句原样放回来。旧 `verify.mjs` 断言的是 `assemble()` 的产物，所以三组全 PASS。

修复与加固：

- 新增**上下文同名委托遮蔽**，让 `refreshContext()` 解析到擦洗后的函数。
- 新增**工具同名遮蔽**（转发 `execute`/`output`/`when`），顺带修好 PTC 模式把工具
  文档内联进 `tools:sdk` 的同类泄漏。
- 新增**技能目录擦洗**，监听器用 `{prepend:true}` 注册在最外层——技能目录是在
  `next()` 之后才追加的，注册在默认内层会静默失效。
- 裸 `DSH` 改用带断言的窄正则兜底，`$DSH_HOME` 这类标识符逐字保留。
- `verify.mjs` 从 3 组扩到 18 组，覆盖上述每一条，并用变异测试证明它们真的会失败。
  其中第 8 组来自安装后 e2e 实测：遮蔽扫描曾被自己的空遮蔽打断，导致**挂载顺序**决定
  是否泄漏——单一顺序的测试套件测不出这类 bug。

**2026-11-14（同日，兼容性核查后）—— 补两个真缺口，9 组用例。**

核查引擎更新成本与跨版本兼容时，实测又抓到两个面：

| 缺口 | 表现 |
|---|---|
| `output.schema` 里的文档 | `dsh-tools` 不把它给模型，但 PTC 的 `renderSdk()` 会渲染进 `tools:sdk`，嵌套 `description` 变成 `#` 注释 |
| 技能**正文** | `skill-invocation` 与技能目录由同一个 `agent/pre-step` 追加，之前只擦了目录 |

同时实测：0.1.7-rc.2 与 0.2.2-rc.3 双向兼容；`gen-presets.mjs` 能自动吸收官方预设的
全部变化（rc.1→rc.3 的 3 处）。用例扩到 18 组，新增 case 5b 用**真实
`renderToolsSdkPy()`** 渲染后断言，并保留 `enum` 数据不被误删。

## 许可

[MIT](LICENSE) © 2026 Jing494
