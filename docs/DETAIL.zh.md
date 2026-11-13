# 通用 Agent 环境预设

两套预设：工具与策略和官方 **Standard**、**PTC** 逐项一致，只改一件事——系统提示词
描述一个中性的 *agent 编码环境*，而不是报出 harness 的品牌名。

新建会话时选 `标准模式（中性环境）`（`standard-env`）或 `PTC 模式（中性环境）`
（`ptc-env`）。已存在的会话保持它启动时的预设不变。

## 它做了什么

预设改不了**部署级**的 `includeHarnessIdentity` 开关，也不该去全局改写框架的提示词
字符串——那会污染其他所有会话。预设能做的是**在自己的作用域内**注册提示词 section；
而注册表的分层结构**按名字索引**，所以同名注册会**遮蔽**全局的那一条，且只作用于
本预设的 agent。

三层，按优先级：

1. **换身份句** —— 在 preset scope 内重新注册 `harness:identity`。
2. **静默 harness 维护段落** —— 把 `harness:source` 和 `app:web-surface`（section 与
   runtime context 两半）注册为空串。
3. **擦除零散措辞** —— 一个 scope 过滤的 `system-prompt/assemble` 监听器做**字面
   `[from, to]` 短语替换**，绝不用正则。

刻意**不做**的事：不全局改写框架字符串；不用 `complete: true` 整段接管（那会吞掉
工具指引并让 prompt cache 失效）；不用正则替换。

## 配置

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

`peerDependencies` 把 `@deepseek-ai/dsh-system-prompt` 声明为 `>=0.1.0-0`，并且**刻意
不写 `engines.dsh`**。官方的那几个 section（`harness:identity`、`harness:source`、
`app:web-surface`）和提示词 API（`getSectionOrder`、`getContextOrder`、
`system-prompt/assemble`）从 `0.1.7` 一直到 `0.2.x` 都在，所以这个 bundle 在整个区间
都能加载，而不是引擎一过 `0.2.5` 就被直接拒绝。

如果将来的引擎改掉了这些 section 名，bundle 会在**启动时被跳过**并打印诊断，明确
指出缺了哪一块——profile 本身照常启动。

## 验证

`verify.mjs` 挂载真实的提示词插件，开一个 preset scope、在其下链一个 agent scope，
对三组用例做**精确子串**断言：干净态、关闭静默态、以及必须仍然显示品牌的基线预设。
退出码 0 表示全部通过。

```sh
node verify.mjs            # 或：node verify.mjs <dsh 安装目录>
```

## 边界

这只改**模型看到的文字**，改不了产品本身。Web GUI、CLI help、插件管理器、市场文案、
onboarding 仍然会报出 harness 的名字——预设够不到那些地方，也不该去够。

MIT 许可。
