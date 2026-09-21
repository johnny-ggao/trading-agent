# 第三方 DSH 插件集成：官方约定与已验证的机制

**截至 2026-09-21。** 为这个仓库自己的插件所做的事实调查（见
[ADR-0003](../adr/0003-open-source-mit-npm-plugin.md)，一个开源 MIT 许可、
通过 npm 分发的 DSH 插件，带有构建后的宿主半边与客户端半边）。

**方法。** 对已安装的 DSH 包、DSH 源码 checkout、本地 profiles，以及一个仍存活的第三方集成（`recruiting-agents`）进行只读检查。未修改任何 DSH 文件。每条论断都引用拥有它的文件。

## 0. 版本与真正要紧的偏差 (Versions and the skew that matters)

| 制品 | 路径 | 版本 |
|---|---|---|
| 运行中的安装（在此处启动的 `dsh`） | `/Users/johnny/.nvm/versions/node/v24.18.0/lib/node_modules/@deepseek-ai/dsh/` | **0.1.6-alpha.1** |
| 源码 checkout（所有文档所在处） | `/Users/johnny/Work/Project/deepseek-harness/` (git `ddefc45fbc`) | **0.1.6-alpha.2** |
| Profiles | `/Users/johnny/.dsh/profiles/{web,recruiting,desktop}` | — |
| Settings | `/Users/johnny/.dsh/settings.yaml` | — |

- **已安装的包不附带 docs 目录树** —— 只有 `README.md`、
  `README.zh.md` 与 `lib/*.js`（`ls .../dsh/`）。所有开发者指南都在
  源码 checkout 中。
- **偏差：** `dsh.profile.patchReload` 存在于已安装的
  `@deepseek-ai/dsh-package-manifest/lib/types/types.d.ts` 中，并被运行中的
  `lib/profile-boot-CuwbWsnH.js:328` 采纳，但在 0.1.6-alpha.2 源码的
  `packages/util/package-manifest/src/types.ts` 中**缺失**（只有一条架构笔记提到它：
  `.agents/notes/implemented/architecture/2026-08-22-single-dsh-application-launcher.md`）。
  在这台机器上把 `patchReload` 当作真实存在（web profile 使用
  `patchReload: live`），但不要引用它作为当前的公开类型。

---

## 1. 编写插件的官方文档 —— 它确实存在 (Official documentation for authoring a plugin — it exists)

全部位于 `/Users/johnny/Work/Project/deepseek-harness/` 下：

| 指南 | 路径 | 它负责的内容 |
|---|---|---|
| Your first plugin | `docs/user/develop/basic/index.md` | plugin = 导出 `apply(ctx)` 的 TS 模块；函数/对象/类形式；`inject` |
| Build a tool | `docs/user/develop/basic/tool.md` | `ctx.tools.register(defineTool({...}))` |
| Plugin configuration | `docs/user/develop/basic/config.md` | `Config` + Schemastery schema；配置编辑会热替换插件 |
| **Package and install a plugin** | `docs/user/develop/basic/publish.md` | **第三方指南**：bundle vs profile、`dsh.bundle.patch`、`dsh plugin add`、层级顺序、git `prepare`/`allowBuilds` |
| Plugins and lifecycle | `docs/user/develop/framework/index.md` | fiber 状态机、清理、HMR |
| Services / Events | `docs/user/develop/framework/service.md`, `events.md` | `provide`/`inject`、`ctx.on` |
| Capability layering | `docs/user/develop/practice/index.md` | Service Definition / Provider / Consumer 的拆分 |
| **Dual-face cookbook** | `docs/cookbook/adding-a-settings-card.md` | 同一个包里的宿主半边与浏览器半边 |
| Package skeleton | `docs/cookbook/adding-a-package.md` | monorepo 包结构、client preset |
| Client Modules subsystem | `docs/subsystems/client-modules.md` | `dsh.client` 扫描、`__DSH_BOOT__` 接线、`/plugins` 路由 |
| Skills subsystem | `docs/subsystems/skills.md` | provider registry、ranks、调用策略 |
| Human Commands subsystem | `docs/subsystems/commands.md` | `ctx.commands.register` |
| Manifest types | `packages/util/package-manifest/README.md` + `src/types.ts` | 公开的 `dsh` 字段 schema |
| Client build rules | `packages/client/AGENTS.md` | 浏览器纯净性、externals、`dsh.client` 语义 |
| Plugin manager | `packages/boot/plugin-manager/README.md` | GUI/agent 安装/移除/启用 |
| Client HMR | `packages/client/hmr/README.md` | 浏览器重载链路 |
| Skill filesystem provider | `packages/skill/skill-filesystem/README.md` | 扫描的根目录、frontmatter |
| CLI behavior reference | `apps/cli/reference/README.md` | 层级优先级、plugin 模式、重启边界 |

- **CLI 帮助文本：** `apps/cli/src/args.ts:80-90`（launcher 示例）以及
  同一文件中的 commander 语法。
- **随附的编写技能（最接近官方"如何编写插件"runbook 的东西）：**
  `packages/preset/agent-presets/presets/cordis/skills/cordis-plugin-development/SKILL.md`
  以及 `.../editing-cordis-compositions/SKILL.md`。已安装副本：
  `.../dsh/node_modules/@deepseek-ai/dsh-agent-presets/presets/cordis/skills/...`。
- **网站：** https://deepseek-harness.github.io/deepseek-harness/（从
  根 `README.md:9` 链接过去），由 `website/` 构建。
- **发现：** `CONTRIBUTING.md:13-19` 与根 `README.md:46` 要求插件
  作者发布其 GitHub 仓库并打上 `dsh-plugin` topic 标签。

> 已发布的文档是从 monorepo 内部视角写的。它们讲授最小插件与
> `--patch` 覆盖层，但**没有**定义外部仓库应如何布局自身（见 §7）。

---

## 2. `dsh plugin` CLI (The `dsh plugin` CLI)

**没有任何 `dsh` 自有的子命令。** `dsh plugin` 要求
`--profile <name>`，并把其余每个参数原样转发给 `pnpm`，
工作目录设为 profile 目录。

- 注册：`apps/cli/src/args.ts:171-183`。
- 运行器：`apps/cli/src/plugin.ts:12-25` →
  `@deepseek-ai/dsh-plugin-manager/operations.runPluginCommand`。

```sh
dsh plugin --profile web add <pkg>        # pnpm add
dsh plugin --profile web remove <pkg>     # pnpm remove
dsh plugin --profile web why <pkg>        # pnpm why
dsh plugin --profile web update           # pnpm update
dsh plugin --profile web list             # pnpm list
```

### 可接受的来源形式 (Accepted source forms)

- **CLI：** `packages/boot/plugin-manager/src/operations.ts:46-50`
  （`anchorPathSpec`）把相对 spec `./x`、`../x` 及其
  `file:`/`link:` 形式锚定到**调用时的 cwd**（因此从插件
  checkout 执行 `add .` 会安装该 checkout）。其余一切都交给 pnpm 接受：
  npm 名称 + 范围、`github:you/repo`、`git+https://…`、`git@…`、托管仓库
  URL、`.tgz`（本地或 https），或 `file:`/`link:`。
- **Service / GUI / agent（`plugin_manager` 工具）：**
  `packages/boot/plugin-manager/src/install-spec.ts:51-74` 解析类型
  `registry | path | tarball | git`；在那里本地路径必须是**绝对路径**
  （浏览器没有有意义的 cwd）。

### 它会改动什么 (What it mutates)

- **Profile 的 `package.json`：** 如果 profile 缺失，
  `runPluginCommand` 会调用 `initProfile`
  （`packages/boot/app-boot/src/profile.ts:135-159,197-216`；模板：
  `web = [@deepseek-ai/dsh-base, @deepseek-ai/dsh-web-app]`，否则
  `DEFAULT_PROFILE_BUNDLES = ['@deepseek-ai/dsh-base']`）。pnpm 成功运行后，
  `reconcile()`（`operations.ts:73-97`）读取每个新安装依赖的 manifest；
  如果它声明了 `dsh.bundle.patch`，包名会被追加到
  `dsh.profile.bundles`，manifest 被原子地重写；
  无 bundle 的依赖仍作为普通依赖保留，并给出一条单行警告。
  移除会丢掉该层。
- **`cordis.patch.yml`：** CLI **从不编辑它**。只有 GUI/agent 插件
  管理器通过 `set_plugin`（重写最后一条匹配行的
  `disabled`，或追加一条 override）来编辑 —— `packages/boot/plugin-manager/README.md:40`。
- GUI/agent 动作：`packages/boot/plugin-manager/src/tools.ts:22` —
  `list_plugins | list_bundles | set_plugin | set_bundle | install_bundle | remove_bundle`；
  `set_bundle` 编辑 `dsh.profile.bundles`。

Profile 类型归属：`apps/cli/reference/README.md:62-76`；
`ProfileTemplate`、`ProfileManifest = Partial<DshPackageManifest>`、
`ProfileLayer`、`Profile` 位于 `packages/boot/app-boot/src/profile.ts:56-88`。

---

## 3. 包 manifest schema（`package.json#dsh`）(Package manifest schema)

权威类型：`packages/util/package-manifest/src/types.ts`；已安装
副本 `.../dsh/node_modules/@deepseek-ai/dsh-package-manifest/lib/types/types.d.ts`。

```ts
interface DshPackageManifest {
  name: string; version: string; description?: string; private?: boolean
  dependencies?: Record<string,string>; peerDependencies?: Record<string,string>
  engines?: { dsh?: string; node?: string; npm?: string }
  dsh?: DshManifest
}
interface DshManifest {
  manifestVersion?: 1
  bundle?:  { patch: string }                 // path to a patch file, relative to package root
  profile?: { bundles?: string[]; patchReload?: 'live' | 'startup' }  // installed 0.1.6-alpha.1
  client?:  { platform: string; inject?: string[]; immediately?: boolean; external?: string[] }
}
```

- **`dsh.bundle.patch`** —— 使包可作为 profile 层安装。该
  patch 是一个 YAML 数组，按 id 插入/覆盖插件行；行按名称引用
  该包。
- **`dsh.profile.bundles`** —— 有序的层列表，归 profile
  目录所有（绝不手工为已发布 profile 编写；由 `dsh plugin` 维护
  它）。
- **`dsh.client`** —— 浏览器半边。`platform: 'web'`；`inject` 是
  包名边的列表（信息性，不是 Cordis DI）；`immediately: true` 把
  该行放进第一阶段的注册屏障；`external` 声明精确的
  非 baseline module-table 请求。
- **不存在宿主插件半边、skills 半边或 commands 半边。** 宿主
  插件就是包的主模块，由 patch 行
  `name: <pkg>` 引用。Skills 和 commands 是**运行时注册**（§5）。
- **内部，而非公开作者 API：** `dsh.configTrees`（见于
  `apps/cli/package.json`，被实验性的 image packer 消费）、
  `dsh.sessionFormatMigration`、`dsh.moduleFallback` —
  `packages/util/package-manifest/README.md:55`、
  `packages/experimental/webworker-packer/README.md:28`。

可供抄写的真实 manifest：

| 包 | `dsh` 半边 | 路径 |
|---|---|---|
| `@deepseek-ai/dsh-web-app` | `bundle.patch` | `packages/bundle/web-app/package.json` |
| `@deepseek-ai/dsh-client-ui-tool` | `client`（仅浏览器） | `packages/client/ui-tool/package.json:26-33` |
| `@deepseek-ai/dsh-client-ui-theme` | `client`（双半） | `packages/client/ui-theme/package.json:28-40` |
| web profile | `profile.bundles` + `patchReload: live` | `/Users/johnny/.dsh/profiles/web/package.json` |

---

## 4. 最小双半插件（宿主工具 + 浏览器渲染器）(Minimal dual-face plugin)

这个仓库的目标形态（ADR-0003）：一个 npm 包，带一个宿主半边和一个
浏览器半边。

### 布局与构建产物 (Layout and build outputs)

```
my-plugin/
├── package.json        # "exports": { ".": lib/index.js, "./client": lib/client.js }
│                       #   "dsh": { "bundle": { "patch": "./cordis.patch.yml" },
│                       #            "client": { "platform": "web", "inject": [...] } }
├── cordis.patch.yml    # inserts the package's plugin row(s) by name
├── src/index.ts        # host half   -> lib/index.js
└── src/client/index.ts # browser half -> lib/client.js  (lazy-CJS factory)
```

- 浏览器半边由客户端模块系统提供，**无需重建
  web 应用**：`@deepseek-ai/dsh-client-modules` 扫描实时的 Loader 条目以寻找
  `dsh.client`，在
  `/plugins/??<pkg>/client.js&rev=…` 下提供每个包构建后的 `exports["./client"]`，
  并注入 `window.__DSH_BOOT__`
  图。参考：`docs/subsystems/client-modules.md:9-103`；
  `docs/cookbook/adding-a-settings-card.md:82-102`。
- 一个干净的内置双半示例是 `@deepseek-ai/dsh-client-ui-theme`：
  宿主 `src/index.ts:36-44` 注册一个 settings section 和一个
  `webserver/index-inject` handler；浏览器半边注册 Appearance
  设置行。`@deepseek-ai/dsh-client-ui-tool` 是仅浏览器变体
  （它的宿主 `src/index.ts` 字面上就是 `export function apply(): void {}`）。

### 宿主半边注册工具 (Host half registers tools)

```ts
import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'my-plugin'
export const inject = ['tools']

export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: 'my_tool',
    description: '…',
    parameters: { x: { type: 'string', required: true } },
    output: { schema: { type: 'string' }, render: (_a, v) => [{ type: 'text', text: v }] },
    async execute(args) { return args.x },
  }))
}
```

来源：`docs/user/develop/basic/tool.md`；生命周期/清理见
`docs/user/develop/framework/index.md:40-64`。

### 客户端半边注册 UI 槽位 (Client half registers UI slots)

```ts
export const inject = ['slots']
export function apply(ctx: ClientContext) {
  ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
    name: 'conversation.chat.node',
    key: 'my-card',
    locale: 'myPlugin',
    children: { 'tool.call.toolview': { kind: 'keyed', scope: 'session' } },
    inject: () => ({ /* props */ }),
  }, MyComponent))
}
```

来源：`docs/cookbook/adding-a-settings-card.md:48-70`；
`packages/client/ui-tool/src/client/apply.ts:21-51`。

### `__ModuleLoader__` 启动契约 (boot contract)

浏览器产物必须是一个 **lazy-CJS 闭包工厂** —— 不是 ESM 模块：

```js
window.__ModuleLoader__.load({
  id: '@scope/my-plugin',           // must equal the package name
  factory(require) {
    const React = require('react')  // React/Cordis come from the browser module table
    // register styles/timers/listeners inside apply via ctx.effect/ctx.on
    return { inject: ['slots'], apply(ctx) { /* ctx.slots.register(...) */ } }
  },
})
```

- 保持 factory 无副作用；在 `apply` 内注册资源。
- 非 baseline 的运行时导入必须在 `dsh.client.external` 中声明；
  跨 feature 插件的值导入会失败客户端 bundle-purity 门禁。
- 在 monorepo 内部，该格式由共享的 tsdown preset 产出：
  `packages/client/tsdown.config.ts` = `clientBundle('<pkg>', ['lib/types/index.js'])`
  脚本为 `"bundle": "tsdown"`、`"watch": "tsdown --watch"`
  （`packages/client/ui-tool/tsdown.config.ts`）。
- **共享 preset `packages/client/tsdown.client.ts` 未发布**，因此本仓库之外的
  包必须自行复现相同的输出格式
  （`docs/cookbook/adding-a-settings-card.md:102`；
  `cordis-plugin-development/SKILL.md:56`）。

来源：`packages/client/tsdown.client.ts:1-12`；
`cordis-plugin-development/SKILL.md:54-85`。

---

## 5. 插件能随附 `SKILL.md` 吗？能 —— 但不是通过 manifest (Can a plugin ship a `SKILL.md`? Yes — but not via the manifest)

**没有 `dsh.skills` 字段**。Skills 通过以下之一到达模型：

1. **宿主侧 provider 注册** —— 插件调用
   `ctx.skills.registerProvider(...)`（provider）或
   `ctx.skills.register(skill)`（runtime skill）。来源：
   `docs/subsystems/skills.md`；服务定义
   `packages/skill/skill/src/index.ts`。打包先例：
   `dsh-skill-badge` 注册一个不可变的随附候选并把它的
   asset 目录暴露为 `resourceBase`（`docs/subsystems/skills.md:79`）。
2. **一个配置好的文件系统扫描根** —— `dsh-skill-filesystem` 发现
   `<name>/SKILL.md` bundle 或扁平的 `<name>.md` 文件（一层深；不支持
   嵌套发现）。默认 ranks：
   `packages/skill/skill-filesystem/README.md:44-77`：

   | 等级 | 来源 | 根目录 |
   |---|---|---|
   | 100 | `project-dsh` | `<projectRoot>/.dsh/skills` |
   | 200 | `project-agents` | `<projectRoot>/.agents/skills` |
   | 300 | `custom` | `Config.customSkillDirs` |
   | 400 | `user-dsh` | `<dshHome>/skills` |
   | 500 | `user-agents` | `<agentsHome>/skills` |
   | 600 | `bundled` | `Config.bundledSkillDir` / `$DSH_BUNDLED_SKILL_DIR` |

   Frontmatter 要求 `name`（kebab-case）与 `description`；可选
   `whenToUse`、`metadata`、`disable-model-invocation`、`user-invocable`。

**一个随附 skill 的 composition 的官方先例：** 随附的 `cordis`
agent preset 携带 `skills/cordis-plugin-development/SKILL.md` 与
`skills/editing-cordis-compositions/SKILL.md`，并用
`customSkillDirs: [<baseUrl>/skills/]` 挂载它们 ——
`packages/preset/agent-presets/presets/cordis/agent.cordis.yml:263-277`。recruiting
preset 重复了该模式
（`recruiting-agents/packages/recruiting/presets/recruiting/agent.cordis.yml:20-24`）。

所以：随插件打包一个 skill 是受支持的，并且如果该插件注册 provider 或有一个挂载点指向随附
目录，就不需要单独安装。注意：agent-preset 的生成以 `agent.cordis.yml` 的
mtime/size 为键，所以只编辑一个 `SKILL.md` 不会到达新会话，直到
composition 改变或进程重启。

---

## 6. 开发循环：重启 vs 热重载 (Dev loop: restart vs hot-reload)

| 变更 | 效果 |
|---|---|
| `dsh plugin add/remove/update`（bundle 成员资格） | 改动 `dsh.profile.bundles`；**重启该 profile**（`apps/cli/reference/README.md:76`） |
| 编辑 profile/home 的 `cordis.patch.yml` | 在 `patchReload: live` 下热重载（已安装的 `lib/profile-boot-CuwbWsnH.js:328`；`apps/cli/reference/README.md:9`） |
| 插件 `config` 变更 | 热替换插件实例（`docs/user/develop/basic/config.md:98-100`） |
| 宿主插件**源码**编辑 | 在已发布 profile 中需要重启：`dsh-base` 以 disabled 插入 module-HMR 行，而已发布 profile 不启用服务器模块 HMR（`.agents/notes/implemented/architecture/2026-08-22-single-dsh-application-launcher.md:35`；`docs/user/develop/framework/index.md:99-107`） |
| 浏览器 bundle（`lib/client.js`）变更 | 通过 `dsh-client-hmr` **热替换，无需页面重载、无需宿主重启**（`packages/client/hmr/README.md:12,30-48,62-74`） |

- 浏览器重建：仓库根 `pnpm run dev:web`（`scripts/dev-web.ts` 发现
  每个 `dsh.client.platform === 'web'` 的包并重建
  `lib/client.js`）或按包的 `tsdown --watch` / `pnpm run watch`。需要先执行一次
  `pnpm run build`（`docs/api-gateway.md:139-148`）。
- HMR 传输对每个包带时间戳的 `lib/client.js` 做 stat 轮询；任何
  重写该文件的进程都会触发替换。
- GUI/agent 的 `plugin_manager install_bundle` 可以通过 HMR 应用一个**新**
  bundle，无需 CLI 重启（`packages/boot/plugin-manager/README.md:14,44`；
  `cordis-plugin-development/SKILL.md:52`），但**替换一个已安装
  包的 JavaScript 需要重启**。
- 注意：`dsh web --help` 仍会自动初始化 profile，所以它并非
  纯只读。

---

## 7. `.dsh-plugin/` 约定 —— 无文档且已被放弃 (The `.dsh-plugin/` convention — undocumented and abandoned)

- **DSH 中没有任何地方记录它。** 在整个源码 checkout 中
  `grep -r "\.dsh-plugin"` 没有任何返回。它是一个第三方
  仓库选择的布局约定，而非受支持的契约。
- 该第三方仓库自己也这么说：
  `recruiting-agents/.scratch/research/dsh-official-conventions.md` §F 得出结论，
  官方文档**没有如何让外部仓库嵌入 DSH 的指引**。
  唯一的官方表述是 `CONTRIBUTING.md:13-19`（发布一个外部
  插件；给它打上 `dsh-plugin` 标签）与 `apps/cli/reference/README.md:105`
  （"通过
  `dsh plugin --profile <name> add <package-or-git-spec>` 安装外部插件 bundle"）。
- 那个仓库**此后已放弃该模式**：同一篇调研文档的
  后记记录 `.dsh-plugin/index.js` 被删除，`main` 移到
  `lib/plugin/index.js`；该包现在位于
  `recruiting-agents/packages/recruiting/`。在这台机器上，web profile 的
  `dsh-recruiting → recruiting-agents/.dsh-plugin` 符号链接是**悬空的**，同样悬空的还有
  `dsh-codex-auth → /Users/johnny/Work/Project/dsh-codex-auth`（源码已不在）。
  历史描述：`recruiting-agents/spikes/s9_harness/README.md:35,38`。

**官方推荐的从仓库开发插件的方式：** 编写一个普通的
npm 包，其 `package.json` 声明 `dsh.bundle.patch`（或者对于一个普通宿主插件，
它就直接是 main 入口），然后用
`dsh plugin --profile <name> add ./checkout`、git spec、tarball 或 npm
名称安装它 —— `docs/user/develop/basic/publish.md`。对于 git 安装，作者随附一个
自包含的 `prepare` 脚本，用户在 profile 的
`pnpm-workspace.yaml` 中通过 `allowBuilds` 将它加入允许列表。不存在受支持的
"把外部仓库嵌入 DSH"布局。

---

## 8. 速查 (Quick reference)

```sh
# Install this repo's plugin into a profile (from the plugin checkout)
dsh plugin --profile web add .

# Inspect the composed tree without booting
dsh --profile web --dump-config
dsh --profile web --dump-default-config

# Dev loop for the browser half (from the DSH source checkout, after pnpm run build)
pnpm dsh web          # terminal 1
pnpm run dev:web      # terminal 2 — rebuilds lib/client.js, hot-swaps the page
```

**设计时必须绕开的关键限制：** 没有 host/skills/commands manifest 半边；一个
浏览器 bundle 必须是 lazy-CJS 的 `__ModuleLoader__` 工厂，而共享的
tsdown client preset 未发布；已发布 profile 中宿主源码 HMR 是关闭的；
并且 bundle 成员资格变更需要重启。
