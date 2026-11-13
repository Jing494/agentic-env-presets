# 作为 DSH 插件发布的仓库规范

一个仓库要被装得上、搜得到、被 DSH 的插件市场收录，需要满足的全部条件。下面每一条都
标注了它是**被 DSH 运行时强制**（真的装不上），还是**被索引目录读取**——这个区别很
重要，所以逐条说明。

## DSH 本身要求的（硬性）

这些是硬要求：运行时或 pnpm 会强制执行，缺任何一项要么安装失败，要么 bundle 在启动
时被跳过。

| 要求 | 位置 | 为什么强制 |
|---|---|---|
| `dsh.bundle.patch` 指向 patch 文件 | `package.json` | 没有它 `loadProfileDirectory` 会抛 `profile bundle "<名称>" declares no dsh.bundle`；包会被当成普通依赖装上，永远不作为一层生效 |
| 这些 patch 文件必须在包里 | tarball | 文件缺失会让 bundle 在**启动时被跳过**并打印诊断，而不是崩溃 |
| 包名能在 profile 中解析到 | `node_modules` | 预设里的 `env-identity` 行引用了这个包（`name: 'dsh-agentic-env-presets'`），所以装进去的包自身名字必须与那一行一致 |
| 有 `license` | `package.json` | npm 没有它会拒绝发布（HTTP 422） |
| 不能有 `private` | `package.json` | 有它 npm 拒绝发布 |
| 版本与运行的引擎兼容 | `engines.dsh` 或 `@deepseek-ai/dsh*` peer | 运行时在挂载前会校验。本 bundle **刻意不写 `engines.dsh`**、peer 写成宽区间（`>=0.1.0-0`），这样引擎升级后不会被拒（见 [兼容性](../README.zh.md#兼容性)） |
| 不需要安装脚本 | `package.json` | 本 bundle 没有安装脚本，所以不会触发构建授权 |

以上都不需要构建步骤、不需要 lockfile、不需要 `prepare` 脚本：发布的 JavaScript
就是实际运行的东西。

## 让仓库可被发现的条件

DSH 内置市场读的是**社区注册表**；第三方目录还会额外同步 GitHub 的
[`dsh-plugin` topic][topic]。加 topic 是作者唯一能独立完成、无需审核的动作。

[topic]: https://github.com/topics/dsh-plugin

| 项目 | 本仓库状态 | 说明 |
|---|---|---|
| `dsh-plugin` topic | 已设置 | 目录靠它抓取；无需申请、无需审核 |
| 仓库描述 | 已设置，含安装命令 | 目录自己没有摘要时会展示它 |
| `homepage` | 指向 npm 页面 | 同步时从 GitHub API 读取 |
| `license` | MIT | 每张卡片都会显示 |
| `package.json` 的 `keywords` | `dsh`、`dsh-plugin`、`dsh-bundle` … | 注册表搜索用 |
| 已发布到 npm | 是 | 发布到 npm 的插件从 tarball 安装，比 clone 更快、更可复现 |
| 仓库公开 | 是 | |

## 发新版本的检查清单

```sh
# 1. 清单仍然可发布
node -e 'const p=require("./package.json");
  if(p.private) throw "private:true";
  if(!p.license) throw "no license";
  if(!p.dsh?.bundle?.patch) throw "no bundle patch";'

# 2. `files` 里声明的文件一个都不缺
npm pack --dry-run --json | node -e '...'   # 发布 workflow 会做这一步

# 3. 预设对真实插件仍然工作
node verify.mjs

# 4. 打 tag 发布——workflow 通过 OIDC 发到 npm
npm version patch && git push --follow-tags
```

`.github/workflows/publish.yml` 自动完成第 1、2、4 步：当 tag 与 `package.json`
不一致、清单不可发布、tarball 缺文件、或该版本已在注册表上时，它会**拒绝发布**。

## 用用户的方式验证安装

```sh
dsh plugin --profile verify-check add dsh-agentic-env-presets
dsh --profile verify-check --dump-config | grep -c env-identity   # 期望 2
dsh --profile verify-check remove dsh-agentic-env-presets
```

加载失败的 bundle 会打印 `skipping profile bundle "<名称>": <原因>`，而 profile
照常启动——坏的 bundle 永远不会把 harness 拖垮。这也是为什么上面的检查看的是
**这一层有没有装配成功**，而不是命令有没有返回 0。

## 目录会标记的风险项

第三方目录会标注一个包能接触到什么，所以有必要知道本包做和不做什么：

| 风险项 | 本 bundle |
|---|---|
| 安装脚本 | 无——安装时什么都不跑 |
| 终端面 | 无——它不执行 shell 命令 |
| 需要凭据 | 无——它不索取 API key 或 token |

它唯一的作用是影响所声明的两个预设的系统提示词。

## 这件事做不到什么

收录不等于安全审计，被索引也不等于背书。另外，发布本身并不能进入 DSH 的**内置**
市场：那个市场由一个带审核的社区注册表供给，出现在里面是另一个由外部负责的步骤，
不是本仓库能配置的。
