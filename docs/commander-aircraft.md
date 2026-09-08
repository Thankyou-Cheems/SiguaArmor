# 大型 UAV 与攻击机

现有 32 个 UAV/CAS 变体使用 Wiki 的 `targetKind: command-aircraft` runtime。页面加载独立 simple/complex hit 数据和匹配外观，提供“穿透材质”、来袭武器与机体伤害估算。该类型没有载具驾驶位、乘员、底盘或模块抗性；普通载具继续使用原合同。

`hit` 为三角网格（Complex），`simpleHit` 为游戏资产自带的凸体（Simple）。这是独立查询对照，不是游戏碰撞精度设置；原生穿透后续处理会组合 simple/complex 查询，当前飞机页面尚未接入完整组合路径。切换时清除旧射线，URL 的 `collision=simple` 保留凸体选择；缺省使用三角网格。两种查询可以使用不同物理材质，未知字段不会变成零厚度。

Actor 生命池由 Wiki 的 `damageReceiver` 显式指定。部分确认的点伤害显示在独立“估算机体伤害”卡片，保持其原证据状态；完整弹体查询、爆炸遮挡和实战等价性仍未确认。不要把该估算转入普通 resolved damage 或击毁时间计算。

实时命中提示与机体卡片共用 `editorNativeActorDamageEstimate`：正伤害显示“预计可造成机体伤害”，不再因 partial 事件被普通车辆结算排除而误报无法伤害。未知或零估算不显示正伤害提示。

比例口径为游戏中展开后实际飞行阶段的尺寸，不能用现实飞机规格校正游戏模型。展示保留 Wiki 发布的活动阶段组件矩阵，外观和碰撞使用同一米制空间，参照士兵与地面刻度不随飞机大小归一化。现有蓝图中，UAV 的展开插值目标读取构造时保存的 `Origin Scale`，固定翼的展开插值目标为 `(1,1,1)`；不能把 UAV 的源组件倍率直接改成 1。相机自动取景只改变观察距离。以上为蓝图与受控组件状态依据，尚非零售服自然飞行的动态测量。

更新已验证的 Wiki 数据后，运行 `node tools/sync-support-air-catalog.mjs <Wiki root>/data/vehicles/catalog.json` 和 `npm run catalog:bootstrap` 更新产品绑定。数据内容由 Wiki 维护，产品不复制原始模型或研究记录。

本地预览使用 `tools/dev/serve-wiki-preview.mjs <Wiki worktree> <aircraft manifest.json>`，只将该清单中具名资源从本地提供，已有公开资源经 Wiki 代理。随后以 `NEXT_PUBLIC_SIGUA_WIKI_ORIGIN=http://127.0.0.1:4840` 构建，再使用 `PORT=4838 node tools/dev/serve-product-preview.mjs`。两台服务器都仅监听 loopback；此构建含本地 origin，发布必须按部署文档重新准备正式构建。

回归检查包括两种飞机碰撞的显示/切换、单查询伤害估算、未知材质和普通载具驾驶视角。运行 typecheck、完整测试、lint、build，并用浏览器实际选择弹药、点击机体核对血条；模型加载成功不足以验证伤害。
