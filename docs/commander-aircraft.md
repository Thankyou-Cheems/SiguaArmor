# 大型 UAV 与攻击机

现有 32 个 UAV/CAS 变体使用 Wiki 的 `targetKind: command-aircraft` runtime。页面加载独立 simple/complex hit 数据和匹配外观，提供“穿透材质”、来袭武器与机体伤害估算。该类型没有载具驾驶位、乘员、底盘或模块抗性；普通载具继续使用原合同。

`hit` 为精细碰撞，`simpleHit` 为简化碰撞。切换时清除旧射线，URL 的 `collision=simple` 保留简化选择；缺省使用精细碰撞。两种查询可以使用不同物理材质，未知字段不会变成零厚度。

Actor 生命池由 Wiki 的 `damageReceiver` 显式指定。部分确认的点伤害显示在独立“估算机体伤害”卡片，保持其原证据状态；完整弹体查询、爆炸遮挡和实战等价性仍未确认。不要把该估算转入普通 resolved damage 或击毁时间计算。

更新已验证的 Wiki 数据后，运行 `node tools/sync-support-air-catalog.mjs <Wiki root>/data/vehicles/catalog.json` 和 `npm run catalog:bootstrap` 更新产品绑定。数据内容由 Wiki 维护，产品不复制原始模型或研究记录。

本地预览使用 `tools/dev/serve-wiki-preview.mjs <Wiki worktree> <aircraft manifest.json>`，只将该清单中具名资源从本地提供，已有公开资源经 Wiki 代理。随后以 `NEXT_PUBLIC_SIGUA_WIKI_ORIGIN=http://127.0.0.1:4840` 构建，再使用 `PORT=4838 node tools/dev/serve-product-preview.mjs`。两台服务器都仅监听 loopback；此构建含本地 origin，发布必须按部署文档重新准备正式构建。

回归检查包括两种飞机碰撞的显示/切换、单查询伤害估算、未知材质和普通载具驾驶视角。运行 typecheck、完整测试、lint、build，并用浏览器实际选择弹药、点击机体核对血条；模型加载成功不足以验证伤害。
