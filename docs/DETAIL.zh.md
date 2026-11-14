# 通用 Agent 环境预设

两套预设：工具与策略和官方 **Standard**、**PTC** 逐项一致，只改一件事——系统提示词
描述一个中性的 *agent 编码环境*，而不是报出 harness 的品牌名。

新建会话时选 `标准模式（中性环境）`（`standard-env`）或 `PTC 模式（中性环境）`
（`ptc-env`）。已存在的会话保持它启动时的预设不变。

## 安装

任选一种——没有构建步骤、没有原生依赖、没有安装脚本。

```sh
# 从 npm 安装（推荐）——钉版本的写法：dsh-agentic-env-presets@1.1.0
dsh plugin --profile web add dsh-agentic-env-presets

# 从 GitHub 安装（跟踪默认分支，会带上尚未发布的提交）
dsh plugin --profile web add https://github.com/Jing494/agentic-env-presets

# 从本地检出安装，link 方式适合边改边看
dsh plugin --profile web add link:/path/to/agentic-env-presets
```

也可以直接用本页的安装框。它只接受三种形态：**npm 包名**
（`dsh-agentic-env-presets`，可加 `@1.1.0`）、**GitHub 仓库地址**
（`https://github.com/Jing494/agentic-env-presets`）、或**绝对本地目录路径**。

它**不接受** npm 网页地址（`https://www.npmjs.com/package/…`）、整条命令行
（`dsh plugin add …`）、裸的 `owner/repo`、以及相对路径。

装完这样确认，输出应为 `2`：

```sh
dsh --profile web --dump-config | grep -c env-identity
```

加载不了的 bundle 会在启动时被跳过并打印原因，profile 本身照常启动。

## 它做了什么

预设改不了**部署级**的 `includeHarnessIdentity` 开关，也不该去全局改写框架的提示词
字符串——那会污染其他所有会话。预设能做的是**在自己的作用域内**注册提示词 section；
而注册表的分层结构**按名字索引**，所以同名注册会**遮蔽**全局的那一条，且只作用于
本预设的 agent。

六层，按优先级：

1. **换身份句** —— 在 preset scope 内重新注册 `harness:identity`。
2. **静默 harness 维护段落** —— 把 `harness:source` 和 `app:web-surface`（section 与
   runtime context 两半）注册为空串。
3. **遮蔽运行时上下文** —— 同名再注册，`text` 是「调原 provider 再擦洗」的函数。循环
   会在 waterfall **之后**调 `refreshContext()` 重解 provider，只有这样做才能盖住那一步。
4. **遮蔽工具描述** —— 同名再注册工具，擦洗三个文档面：顶层 `description`、
   `parameters` 里嵌套的 `description`/`title`、以及 `output.schema` 里的同类字段
   （`enum`/`default`/属性名等数据保持不动），其余回调原样转发。PTC 把这三面都内联进
   `tools:sdk`，所以两种执行器一并覆盖。
5. **改写 `complete: true` 的整段提示词** —— 这种 section 在 waterfall **之后**被
   `assemble()` 从瀑布前的快照恢复成**整个提示词**，上面四层都够不到。祖先层用同名
   再注册（保留 `complete`）；**本预设同一层**下同名注册必然抛错，于是改为**原地
   重写该 section 对象**（先确认未冻结、未跨层共享，卸载时还原）。
6. **擦除残留 token** —— `system-prompt/assemble` 兜底，加一条最外层
   （`{prepend:true}`）的 `agent/pre-step` 改写**技能目录与技能正文**消息。

品牌字样分布在**五个面**、分属四个子系统，再加上 `complete: true` 这条
绕过 waterfall 的路径，这才需要六层。其中两处特别反直觉：

- **运行时上下文在 waterfall 之后还会被重算**，所以只在 waterfall 里擦 context，
  单测看着完美、真实请求原样回来。
- **技能目录是在 `next()` 之后追加的**，所以 `agent/pre-step` 监听器必须是最外层，
  默认内层会先扫完空目录、然后目录才带着品牌进来。

短语表用字面 `split/join`，顺序有意义（长短语在前）。裸 `DSH` 由一条带断言的窄正则
`(?<![\w$.\-])DSH(?![\w\-])` 兜底，`$DSH_HOME`、`__DSH_BOOT__`、`engines.dsh`
这类标识符逐字保留。

刻意**不做**的事：不全局改写框架字符串；**不把**预设切换成 `complete: true` 整段
接管（那会吞掉工具指引并让 prompt cache 失效——但上游这样配了，我们必须能擦掉它）；
不改工具**名**（那是调用面，改名直接打断调用）。

## 配置

```yaml
- id: env-identity
  name: 'dsh-agentic-env-presets'
  config:
    identity: You are an AI coding agent working inside an agentic coding environment.
    silenceDevContext: true        # 可选，默认 true
    scrubToolDescriptions: true    # 可选，默认 true；关掉则只擦提示词与上下文
    scrubLoopMessages: true        # 可选，默认 true；关掉则不碰上下文/技能目录
    bareToken: true                # 可选，默认 true；关掉则只跑短语表
    replacements:                  # 可选，默认见 DEFAULT_REPLACEMENTS；整表替换
      - ['DSH（DeepSeek Harness）', 'the agentic coding environment']
      - ['DeepSeek Harness ', '']
      - ['DeepSeek Harness', 'the agentic coding environment']
      - ['DSH Marketplace', 'plugin marketplace']
      - ['DSH file policy', 'file policy']
      - ['DSH file sandbox', 'file sandbox']
      - ['extend DSH itself', 'extend the environment itself']
```

## 兼容性

`peerDependencies` 把 `@deepseek-ai/dsh-system-prompt` 声明为 `>=0.1.0-0`，并且**刻意
不写 `engines.dsh`**。官方的那几个 section（`harness:identity`、`harness:source`、
`app:web-surface`）和提示词 API（`getSectionOrder`、`getContextOrder`、
`system-prompt/assemble`）从 `0.1.7` 一直到 `0.2.x` 都在，所以这个 bundle 在整个区间
都能加载，而不是引擎一过 `0.2.5` 就被直接拒绝。

如果将来的引擎改掉了这些 section 名，bundle 会在**启动时被跳过**并打印诊断，明确
指出缺了哪一块——profile 本身照常启动。

## 验证

`verify.mjs` 挂载真实的提示词、工具、执行器与 agent 包，开一个 preset scope、在其下链
一个 agent scope，按**循环真实的顺序**装配、刷新、渲染、解析工具、跑 pre-step，
对十八组用例做**精确子串**断言。退出码 0 表示全部通过。

```sh
node verify.mjs            # 或：node verify.mjs <dsh 安装目录>
```

十八组分别对应：默认配置、关闭静默、基线预设（必须仍显示品牌）、`refreshContext()`
之后、工具 schema、技能目录（必须被**真的改写**）、标识符安全、**挂载顺序无关**。

**改完代码请跑变异测试**——去掉 `{prepend:true}` 必须让第 6 组失败，停掉上下文遮蔽
必须让第 4 组失败。一套永远通过的测试等于没有测试。

第 8 组的存在本身就是个教训：它来自装到真实 profile 后跑的 e2e。遮蔽扫描会被
**自己的空遮蔽**打断（同名重复注册抛错、错误被吞进 logger），于是**先装哪个插件**
决定了是否泄漏。只跑单一装配顺序的测试套件，永远测不出这类 bug。

## 边界

这只改**模型看到的文字**，改不了产品本身。Web GUI、CLI help、插件管理器、市场文案、
onboarding 仍然会报出 harness 的名字——预设够不到那些地方，也不该去够。

已知没擦的只剩**技能名字**与磁盘上的 `SKILL.md` 文件本身：前者是调用面（改名会打断
`skill()`），后者不在提示词层。工具参数与技能正文都已在 1.2.0 覆盖。

MIT 许可。
