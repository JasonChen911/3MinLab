# 回归测试

本地修改时运行 `npm run test:watch`，保存网页或集成游戏源码后，Vitest 会自动重跑相关测试。准备合并或发布时运行 `npm run check`：依次执行策划器与服务端测试、集成游戏测试、独立游戏测试、Playwright 浏览器测试以及各项目正式构建。GitHub 的 `Regression` 工作流在每次推送和拉取请求时执行同一门禁。首次安装需在仓库根目录执行 `npm ci` 和 `npm ci --prefix standalone-game`。

浏览器测试位于 `e2e/`，使用独立的 Chromium 浏览器资料，不读取或覆盖日常浏览器里的活动。首次在新电脑运行前执行 `npx playwright install chromium`。失败时保留追踪文件于 `test-results/`。

关键固定场景：

| 场景 | 测试文件 | 保护的行为 |
| --- | --- | --- |
| 12 人餐厅活动、预算 ¥300 | `game/src/integration.test.ts` | 室内属性、人员与预算约束 |
| 计划人员和预算行桥接 | `src/integration/gameBridge.test.ts` | 空名册时不丢计划编制 |
| 姓名/角色/组织单位 CSV | `src/workbench/Grid.import.test.ts` | 表头映射、丢列阻断、重复检测 |
| 无签到台与 20000 人容量 | `game/src/regression.v10.test.ts` | 设施诊断互斥、容量上限 |
| 固定种子 `20261113` | `game/src/regression.v10.test.ts` | 到场、费用与事件过程可复现 |
| 创建、页内快速模拟、刷新恢复 | `e2e/planning-simulation.spec.ts` | 关键浏览器交互 |

独立游戏源码保存在 `standalone-game/`，可单独运行 `npm --prefix standalone-game test` 和 `npm --prefix standalone-game run build`。两套游戏的存档键已区分；旧独立游戏的 5180 端口存档会复制到新键，原存档仍保留。
