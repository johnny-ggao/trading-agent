# 10: 打包与发布

**要构建什么：** 作为 MIT 开源 npm 包按包名安装；随包 README、LICENSE、Lightweight Charts/TradingView 署名、构建产物、GitHub `dsh-plugin` topic。

**Blocked by:** 07

**Status:** done（清单全部核实；**npm publish 待用户点头**）

- [x] MIT LICENSE（`LICENSE`，1068 B）
- [x] README（安装、用法、一键启动、可选视觉说明与排错；含 Jev 校准与图面内容说明）
- [x] TradingView 署名 / NOTICE（`THIRD_PARTY_NOTICES.md` + 图内 `attributionLogo`）
- [x] 构建产物随包提供（`lib/` 虽被 gitignore，但 `prepare`/`prepack` 都会自动构建；`pnpm pack` 产出的 tgz 内含构建后的 `lib/index.js` + `lib/client.js`）
- [x] GitHub 仓库打 `dsh-plugin` topic
- [x] 不含任何密钥、不打包行情数据

## Comments

- 2026-09-22：**发布前核对完成。**
  - `pnpm pack` 产出 `dsh-trading-agent-0.1.0.tgz`（**116K，8 个文件**）：`assets/trading-chart.md`、`cordis.patch.yml`、`lib/client.js`、`lib/index.js`、`LICENSE`、`package.json`、`README.md`、`THIRD_PARTY_NOTICES.md`。无源码、无 spec、无 `.scratch`、无行情数据。
  - **包内构建产物与本地构建逐字节一致**（`lib/index.js` sha256 `1c070c0f…`、`lib/client.js` `29c1adcd…`），说明 `prepack` 确实重建过，不存在「发出旧构建」的风险。
  - 从构建产物加载并捕获随包 skill：正文与 `assets/trading-chart.md` 完全相同（3214 字符），工单 07 新增的「不给交易建议 / 分层产出 / 已收盘 K 线 / 图面内容」章节都在。（注意：构建后中文是 `\uXXXX` 转义，直接 grep 中文会假阴性，要用加载实测。）
  - 密钥扫描：`lib/*.js` 无硬编码 key/token；`git grep` 在仓库内也无命中。行情数据扫描：构建产物里没有 OHLC 数据字面量。
  - 一键启动链路不受影响：`start.sh` 用 `dsh-trading-agent-*.tgz` 通配匹配同目录 tgz，README 的「方式 B」照旧成立。仓库根已重新生成该 tgz（gitignore，不发版不提交）。
  - **未做（等用户明确点头）**：`npm publish` / 推送 git 远端。发布命令：`npm publish --access public`（或 `pnpm publish`），需先 `npm login`。
