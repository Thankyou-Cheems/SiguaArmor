# RuntimeProbe pitfalls

按时间倒序记录已经造成返工、并已由规范条款和行为回归钉住的故障。这里不是替代测试的经验清单。

## 2026-07-22 — 小地图不等于 extraction carrier

- 症状：旧 RuntimeProbe 能启动且只有一个 actor，但 discovery 看到的是 `TestVehicleSpawner`，`specific_vehicle` 为空、spawner disabled，native VehicleSettings resolver 没有解析结果；它只能做诊断，不能提取。
- 根因：地图体积被误当成 authority。旧图没有正式 `BP_VehicleSpawner_C`，而且复制 Layer/Level Data 还可能造成全局 DataTable row ID 冲突；Editor 手工放置不会提供真实 gameplay spawner 语义。
- 修复：carrier builder 只替换旧测试 actor 为原生 `BP_VehicleSpawner_C`，保留一个可回读的原始 VehicleSettings；capture 用目标阵营正式 LayerData，在单独进程内临时注入 exact setting，依次证明 resolver、initialize、try_spawn、owned root、稳定窗口和恢复。
- 行为回归：`runtimeprobe-carrier-official-baseline.json`、PLAAGF ZBD05 和 PLANMC Z-8J carrier capture 都必须是完整终态；`TestVehicleSpawner` 残留、目标 setting 未恢复或跨阵营复用 PLAAGF LayerData 都失败关闭。
- 禁止做法：把旧 `RuntimeProbeRequestSpawner` 当正式 authority、把 carrier 的 PLAAGF diagnostic LayerData 复制给其他阵营、保存注入后的地图，或用“地图能打开”替代 native resolver evidence。

## 2026-07-21 — 车辆无关入口仍携带历史阵营默认值

- 症状：主捕获器已经要求 target manifest，但 discovery、骨骼批处理或 Phase0 审计仍会自动使用历史阵营的环境变量、manifest 文件名或地图字段；换阵营时可能“成功运行”却采集了错误 authority。
- 根因：早期从单阵营垂直切片扩展时只替换了主脚本，周边入口保留了旧的专用边界。
- 规范修订：`RTP-FLOW-01`、`RTP-ID-03`；所有跨进程字段统一为 `SIGUA_RUNTIME_PROBE_*`，target manifest、source map、LayerData 和 faction 必须同源。
- 行为回归：PowerShell 入口必须在无 `TargetManifest` 时拒绝启动；discovery 与 batch recapture 使用 generic 环境变量或显式 `--batch-manifest LABEL=PATH`。
- 禁止做法：复制历史路径/文件名到新阵营、用 rawName 猜地图或 vehicle setting、以“Editor 启动成功”替代 manifest identity 校验。

## 2026-07-21 — 炮塔已闭合时仍先验证代表武器，或在 settle 窗口刷新姿态

- 症状：同一炮塔出现浮空/重复炮管，或 `AlwaysTickPoseAndRefreshBones` 在物理落地期间触发原生 Editor 崩溃。
- 根因：把 weapon occurrence 当作默认展示件，并把姿态刷新插入 physics settle；这两个动作都改变了真正需要验收的 attachment/pose 时序。
- 规范修订：`RTP-VIS-11A`、`RTP-VIS-11B`、`RTP-VIS-11C`。
- 修复顺序：先判断 exact turret SkeletalMesh 是否闭合；若闭合，按 selection policy 抑制代表武器渲染；direct route 在 settle 完成后执行 `refresh → final bone sample → mount reassert → exporter`。
- 禁止做法：手填 offset、按 mesh 名自动删炮管、把旧截图当作新 evidence、在 settle 窗口启用 pose refresh。

## 2026-07-21 — 六视图把网页壳层混入载具证据

- 症状：六视图从视觉上看到了载具，但截图边界依赖整页 catalog、详情卡片或运行时把 viewer root 临时 fixed 到页面顶部。
- 根因：QA 入口先导航完整前端，再用 URL/按钮处理变体选择；截图脚本因此承担了不属于 3D 视口的页面布局职责。
- 规范修订：`RTP-VIS-14`。
- 行为回归：`test_viewer_qa_selection_boundary.py` 验证 exact `cardId × rawName × packageSha256` viewer-only URL、catalog shell 排除和无按钮选择。
- 禁止做法：把整页截图边界当作载具证据、在 QA 中点击变体、或用脚本临时改写 viewer 布局来凑满屏尺寸。

## 2026-07-20 — ZBL08 炮管矩阵与 Transform 符号矛盾

- 症状：重复炮管删除后，保留炮管陷入炮塔，根部布套无法闭合。
- 根因：旧 official evidence 的 `translationCm.y=-11.548...`，但矩阵 glTF Z 写成 `+0.11548...`；组合器照抄，打包器只检查有限/可逆/包络。
- 规范修订：`RTP-VIS-17`。
- 行为回归：`test_rejects_zbl08_lateral_sign_mismatch` 同时覆盖组合与打包边界。
- 禁止做法：手填 offset、按车型删除更多组件、只凭六视图放行。

## 2026-07-20 — 注入生成成功后 Editor 崩溃仍留下 running 证据

- 症状：resolver、initialize、`try_spawn` 和 exact root 都成功，随后原生 Editor 崩溃；raw evidence 仍为 `running`，注入恢复为 `null`。
- 根因：启动器只按进程退出码抛错，没有把异常退出和恢复未证明原子回写证据；打包器也未验证终态/恢复。
- 规范修订：`RTP-SPAWN-08`、`RTP-SPAWN-09`。
- 行为回归：`test_reconcile_runtime_capture_exit.py` 与 packaging terminal-state tests。
- 禁止做法：相同输入盲重试、把已生成 actor 当作成功闭环、复用崩溃进程的临时状态。
