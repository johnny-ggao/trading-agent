# 开源、MIT、通过 npm 分发的 DSH 插件

智能体以公开的开源（MIT）DSH 插件包形式发布，任何人都可以用 `dsh plugin add` 安装。可分享性是一等需求，而不是事后补上的想法：不做本地链接，不包含私有状态，不打包市场数据。

## 后果 (Consequences)

- **Advanced Charts 已永久出局。** 其免费许可禁止开源项目和该库的再分发，因此 ADR-0001 中勾勒的迁移路径现在是关闭，而不是推迟。
- Lightweight Charts 的 Apache-2.0 条款及其 TradingView 署名要求必须随包一同发布。
- Binance/Hyperliquid 市场数据由每个用户实时获取；我们从不分发它。（公共端点无需 API key，这使共享安装保持零摩擦。）
- 视觉是可选的：用户的 harness 可能配置纯文本路由，因此给模型的图表图像必须能优雅降级到数值路径。
- 该包必须可复现构建，并发布构建好的宿主半边和客户端半边 bundle，因为 DSH 在启动时组合客户端 bundle。
