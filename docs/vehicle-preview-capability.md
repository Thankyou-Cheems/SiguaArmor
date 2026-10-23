# 外观加载与独立装甲能力

目录、详情及底层 viewer 共用 `app/vehicle-preview-policy.ts` 的能力状态。
精确绑定允许开始请求，不能单凭 descriptor 的 ready 声明或 hit 完成就宣布外观可用。

- `pending`：此选择尚未完成外观加载，允许进入外观以触发请求。
- `available`：必需外观源、贴图、非空有限几何/skin、完整 occurrence 装配和首次渲染完成。
- `unavailable`：保存本选择的具体错误。只降级外观，保留独立 hit/analysis；
  同一 viewer 不因模式切换、晚到请求或父层更新自动重试。显式边界重试仍遵循原产品行为。

选择身份由 edition、cardId、rawName、runtimeVehicleRef、visualArtifactRef 组成。
reader 原有 class、Station Graph、driver 和 historical pose 校验保持；错误精确 ID 不模糊回退。
详情按相同身份隔离解析结果、异步能力和边界，失败涂装仍允许切到另一准确涂装。
未打开的目录卡片只展示已有缩略图和绑定状态，不批量加载模型，也不宣称其外观已验证。

外观资源或装配失败会撤销该次 exterior skeletal registrations，隐藏失败外观，
保留 hit/analysis 的 renderer、资源和控制器。WebGL context loss、初始化或实际 render
异常仍走原 fatal boundary，释放并丢弃失效 renderer，不伪装成局部资源失败。
状态文案不再按车型名称断言“官方资源存在问题”，也不在 hit 自身失败时承诺装甲可用。

该能力只描述本次产品资源加载；不为共享数据续签来源版本，不声明当前游戏物理或所有涂装完成。
几何、材质、装配、历史 observed pose 和 source-solved 物理仍有各自权威。

验证覆盖实际五个相关旧新装配场景，以及受控的 pending、缺贴图、空模型、无效属性/skin、
部分装配、晚到回调、精确涂装/edition 切换和 render fatal 反例。
旧 cancellation 测试中的自动重试/全局 teardown 断言改为终态降级与独立 hit 保护；
缓存资源所有权、关闭取消及真正 renderer 故障的原保护仍保留。
