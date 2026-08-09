# 载具目录 v3.1

状态：当前载具资料、目录绑定、运行时装甲引用和 Wiki 投影的规范。

- 首次基线：`2026-07-30`
- 源版本：`squad-editor-v10.5.0.621766.2374-ue5.7.4`
- canonical schema：`sigua-vehicle-catalog/v3.1`
- 可维护源 schema：`sigua-vehicle-source/v1`
- 公开资料投影：`sigua-vehicle-reference-projection/v5-localized-search-closure`

## 目标

载具资料必须同时满足：

1. 精确保留官方 Blueprint、目录卡片、运行时 actor 和装甲组件身份。
2. 只按规范化内容复用展示资料，不用同名、同数值或相似外形合并物理身份。
3. 搜索、卡片、Wiki 和 Viewer 共用一个生成图，禁止各自重新拼接座位、炮塔、
   武器或伤害抗性。
4. 重型 hit record、geometry、BVH 和 pose 继续内容寻址、按载具懒加载，不进入
   前端启动数据。
5. 静态 Editor 结构、Dedicated 下游伤害路由和原生弹丸/爆炸选择分别保存证据；
   未实测行为保持 `native-unknown`。
6. 每个 exact Blueprint 有一份可读、可改的 JSON；人工只维护语义字段，不维护
   hash、profile ordinal、runtime ID 或 artifact ID。

## 身份层

v3 不把“载具”压成一个含糊主键，而是保留三层身份：

| 层 | 基线数量 | 唯一身份 |
| --- | ---: | --- |
| 源载具实体 | 470 | pinned Editor package + `rawName` |
| 核心目录绑定 | 604 | exact `cardId + rawName` |
| 运行时装甲实体 | 471 | hit runtime `vehicleId` |
| 运行时视觉 artifact | 861 | edition + exact binding + sealed visual content |

`BP_CSK131_HJ-8ATGM_Naval` 是必须显式保留的 470→471 例外：PLAAGF 与
PLANMC 的两个 exact card binding 指向两个不同 runtime record。它们可以共享
geometry/BVH 内容，但不能按 `rawName` 合并运行时身份。

公开目录另有 36 个支援航空卡、44 个变体，总计 648 个公开变体。支援航空属于
视觉扩展，没有 official hit runtime 时不得伪造装甲实体。

## 可维护源

`data/vehicles/` 镜像 `/Game/Vehicles/` 之后的 package 路径，每个 exact
Blueprint 一份 `.json`。例如：

```text
data/vehicles/M1128_MGS/BP_M1128.json
data/vehicles/M1128_MGS/BP_M1128_Woodland.json
```

单车文件只保存：

```text
identity { rawName, targetPackage }
referenceData { general, seats, damageResistances, components }
bindings[] { factionId, cardId, visualSource }
notes[]
```

`config/local-vehicle-inventory.json` 和 turret overlay 只用于显式初始化/迁移，
不再是常规 canonical build 的第二份真相源。生成器从 470 份单车文件产生全局
profile pool、稳定 ID、runtime/hit/visual 引用和索引；因此修改载具资料时不需要
手工同步任何 hash 或 ordinal。

## Canonical 分区

`generated/internal/vehicle-catalog.json` 只保存轻量引用图：

```text
schemaVersion / catalogRevision / dataRevision
evidenceBoundary / evidenceSources
counts
identities
  vehicles
  catalogBindings
profiles
  general
  seats
  damageResistances
  components
runtime
  vehicles
  hitArtifacts
  visualArtifacts
extensions
  supportAir
indexes
audit
```

### 源载具实体

源载具实体固定 Blueprint 身份和内容 profile 引用：

```text
vehicleRef
rawName
targetPackage
sourceIdentity
generalProfileRef
seatProfileRefs[]
hullDamageProfileRefs[]
componentProfileRefs[]
runtimeVehicleRefs[]
```

`vehicleRef` 来自源身份，不来自展示名或资料内容。载具资料改变不会改变实体身份。

### 精确目录绑定

目录绑定保存所有 binding-scoped 信息：

```text
catalogBindingRef
bindingKey = cardId + NUL + rawName
factionId
cardId
rawName
vehicleRef
runtimeVehicleRef
visualArtifactRefs { international, china? }
weaponBindingIds[]
```

武器 v3 的 binding ID 由 exact card、载具和武器来源生成，因此
`weaponBindingIds` 必须留在目录绑定，不能提升到 470 个源载具实体。

### 内容 profile

`general`、单个 `seat`、单项 `damageResistance` 和单个 `component` 只按稳定
规范化内容 SHA-256 池化。profile ID 表示内容 revision，不表示实体身份。

禁止使用以下近似规则合并 profile：

- 组件或炮塔同名；
- 装甲厚度、血量或抗性数值相同；
- 同一武器型号；
- 几何外形相似；
- 共享父 Blueprint。

这条边界尤其适用于炮管、武器站、炮塔和附加装甲，因为相似内容可能具有不同
owner、health pool 或 damage forwarding。

当前 470 车基线的内容池化结果为：

| 资料节点 | 原引用数 | 唯一 profile | 减少的重复节点 |
| --- | ---: | ---: | ---: |
| general | 470 | 262 | 208 |
| seat | 4,239 | 451 | 3,788 |
| damage resistance（hull + component） | 3,899 | 68 | 3,831 |
| component | 2,222 | 152 | 2,070 |

这只池化相同内容，不合并上述三层实体身份。v3.1 canonical 内部图为
4,622,563 bytes；增加的体积来自 470 个 source evidence lock 和 861 个视觉
artifact 小记录。它属于生成/发布信任输入，不进入浏览器启动路径。公开格式另做
按文档的 profile pool 投影，避免把 canonical 的全局 ID 图直接复制到浏览器。

### 运行时引用

canonical 只保存 hit artifact 的内容地址、字节数、SHA 和 exact binding
关系。以下内容继续留在 `hit-scene-runtime/v1` 及其 CAS：

```text
actor graph
health pools
components
surfaces
owner and forwarding flags
geometry
BVH
physical material
pose evidence
```

Viewer 必须先解析 exact `catalogBindingRef`，再异步加载相应 runtime record。
不得把完整 471 车物理图内联到目录或页面启动 bundle。

### 视觉引用

视觉 descriptor 的 placements、模型 URL、姿态与 package 身份形成完整 64 位
`visual-artifact-*` 内容 ID。canonical 只保存小型 artifact record 和
edition-specific ref，不复制 3D descriptor 或模型。国际版 604 个核心载具与
44 个支援航空共用 `international` registry；国服 213 个载具使用独立 `china`
registry。两版不得只因 `vehicleId` 相同而共用 ref，因为部分国服模型 URL 已经
脱敏替换。

Viewer 仍按 exact card/variant 找到 descriptor，但必须同时验证
`runtimeVehicleRef` 和 `visualArtifactRef`；只命中 `cardId + rawName` 不再足够。

## 证据权限

每类输入只可支持其声明范围：

| 输入 | 可支持结论 | 不可提升为 |
| --- | --- | --- |
| Editor allowlist | exact package / Blueprint identity | 伤害路由 |
| `data/vehicles/*.json` | 可维护百科资料与已迁移 turret 字段 | 官方装甲数据 |
| visual release index | exact edition 的加载内容与姿态 | 命中或伤害路由 |
| hit runtime record | 官方 actor/component/surface 静态结构 | 原生弹丸选择 |
| Dedicated point probe | 已选 owner 后的 point forwarding | 穿深或组件选择 |
| Dedicated radial probe | 已选 actor 的 radial forwarding | 完整爆炸目标聚合 |
| native weapon/projectile probe | 对应链实际观察到的行为 | 未覆盖武器或版本 |

任何字段只要缺少对应证据，就保留 `native-unknown`、`partial` 或
`not-requested`，不得用组件名、材质名或其他载具结果补齐。

## 公开投影

按阵营发布的 JSON 继续保留卡片和变体顺序，但不再在每一行重复完整
`variant.data`。每份文档包含：

```text
vehicleCatalogRevision
vehicleReferenceSchemaVersion =
  sigua-vehicle-reference-projection/v5-localized-search-closure
vehicleProfiles.general.{id, values[]}
vehicleProfiles.seats.{id, values[]}
vehicleProfiles.damageResistances.{id, values[]}
vehicleProfiles.components.{id, values[]}
vehicleReferences.{id, values[]}
records[].variants[].vehicleReferenceRef
records[].variants[].visualArtifactRef
```

v5 保留 v4 的本地整数引用表、四个 profile pool 和
`sigua-vehicle-reference-graph/v1` 摘要算法；它没有把本地化字段塞进
`vehicleReferences.id`，也没有把显示文本提升为载具 canonical 身份。新增的是
权威的 faction→search 生成闭包：本地化 faction record/variant 先确定
`official`、`presentation`、显示名、`searchTerms`、`searchAliases` 和 exact
vehicle/visual refs，同代搜索索引再从这些权威记录投影，禁止另行重算一份本地化
元数据。国际版在同一生成过程共享这些记录；国服搜索索引显式从已经本地化的国服
faction records 派生。

四个 pool 按文档首次出现顺序保存唯一值，reference 使用从 0 开始的本地整数
ordinal。general profile 不保存 binding-scoped `rawName`；component profile
不内联 damage resistance，而保存对应 damage pool ordinal。`rawName` 和
`weaponBindingIds` 仍留在 `vehicleReferences.values[]`，不得跨 binding 合并。

每个 pool 的 `id` 是对完整有序 `values[]` 使用下述稳定规范化后计算的 SHA-256，
并以无 padding 的 base64url 保存。浏览器必须重算 pool ID；内容、顺序或 ordinal
任一漂移均 fail closed。公开 variant 不再重复发送 64 位
`vehicleReferenceId`，只发送文档内从 0 开始的 `vehicleReferenceRef`。

`vehicleReferences.id` 是整份本地引用图的单一摘要。preimage 为：

```text
"sigua-vehicle-reference-graph/v1" + NUL +
stableJson({
  profilePoolIds,
  referenceValues,
  bindingTriples: [promoEntryId, sourceRawName, vehicleReferenceRef][]
})
```

数组保持原顺序，对象键使用 `localeCompare(key, "en")` 排序，然后对 UTF-8 字节
计算 SHA-256 并保存为无 padding base64url。摘要同时覆盖四个 profile pool、
有序引用表和 variant→整数引用边，因而把一个整数改成另一个仍在范围内的整数也会
fail closed；不能只校验 ordinal 范围。

浏览器先使用 Web Crypto 校验四个 pool 的完整内容和顺序，拒绝 duplicate、
missing、out-of-range 或未使用 ordinal，再重建每个完整 `ReferenceData`。
随后重算引用图摘要，并将 faction document 的 group、record、variant 三层身份
与同 generation 的 catalog index 精确闭合。只有所有 hash、revision、exact
`catalogBindingRef` / `vehicleRef` / `runtimeVehicleRef` /
`visualArtifactRef`、记录闭包和无未使用引用均通过后，才将引用恢复成兼容的
`variant.data`；不得只用 `general.rawName` 或同 generation 字样替代 exact
index closure，也不得接受绕过引用表的 inline record data。
校验只遍历 compact 文档中的唯一 reference，不遍历或加载 private runtime、hit
record、geometry 或 BVH，因此同步规范化成本受每个阵营去重后的公开资料大小约束，
不会引入服务端计算或私有运行时依赖。

22 份公开文档的实际池化闭包为：

| profile | 展开出现次数 | 文档内唯一值 | 去除重复 |
| --- | ---: | ---: | ---: |
| general | 861 | 572 | 289 |
| seat | 7,366 | 1,206 | 6,160 |
| damage resistance | 22,723 | 988 | 21,735 |
| component | 3,708 | 503 | 3,205 |
| 合计 | 34,658 | 3,269 | 31,389（90.57%） |

公开 faction JSON 使用 minified UTF-8/LF 传输。对同一组 22 个文件逐文件压缩的
实测为：

| 格式 | raw bytes | gzip -9 | Brotli |
| --- | ---: | ---: | ---: |
| v2（迁移前 HEAD） | 10,320,281 | 304,476 | 150,404 |
| 旧 v3 完整 reference 投影（同代重放） | 9,617,036 | 453,748 | 239,954 |
| v3 profile-pools | 2,221,107 | 302,759 | 229,406 |
| v3.1 / v4 local reference table（结构压缩基线） | 2,163,923 | 274,199 | 228,223 |

v3 profile-pools 相对 v2 将浏览器需要解析的 JSON 减少 78.48%，gzip -9 减少
0.56%；相对旧 v3 分别减少 76.90%、33.28% 和 4.40%。v2 的重复完整对象对
Brotli 极易压缩，因此 v3 profile-pools 与 v4 的 Brotli 总量仍分别比 v2 高
79,002 和 77,819 bytes；这是显式保留 pool/reference 完整性哈希与显著降低
解析、内存成本之间的已知取舍，不得把 raw 降幅误报成所有压缩算法都同比下降。

v4 在同时新增 861 个 `visualArtifactRef` 的情况下，仍比 v3 profile-pools
减少 57,184 raw bytes（2.57%）、28,560 gzip-9 bytes（9.43%）和 1,183
Brotli-11 bytes（0.52%）。这是移除每条完整 64 位 reference hash、改用本地整数
并以单一整图摘要闭合后的净结果。

上述字节数是 v4 结构压缩迁移时的测量，不是 v5 的新压缩宣称。v5 改变的是
本地化 faction→search 的权威生成关系和 schema/cache 身份；未重新测量前不得把
它描述为进一步减小传输体积。

Wiki 使用 `sigua-wiki-vehicles/v3` 的 604 条 exact binding 投影，并保存：

```text
catalogBindingRef
vehicleRef
runtimeVehicleRef
weaponVariantIds[]
```

Wiki summary 必须从 canonical 生成 470/604/471 计数，不再维护手写
`sourceVehicles`。

## 构建与迁移

生成顺序：

```text
canonical weapon catalog
  -> runtime/Wiki weapon client projections
  + 470 exact Blueprint authoring sources
  + sealed international/support/China visual indexes
  -> vehicle catalog v3.1 + compact visual artifact index
  -> runtime weapon source closure
  -> Wiki vehicle v3
  -> v5 localized compact faction projections
  -> same-generation international/China catalog search indexes
  -> runtime visual/equipment projections
```

`tools/build-vehicle-catalog.mjs --check` 必须验证：

- 470 个 allowlist/source file/source entity 全闭合，文件路径与 package 一致；
- 604 个核心 binding 各有 exact runtime entity；
- 471 个 runtime entity 和 hit artifact 全闭合；
- 861 个 edition-specific visual artifact 与 604 + 44 + 213 条引用全闭合；
- 44 个支援航空变体保持独立扩展；
- 1374 个 weapon binding reference 全闭合；
- hit record、geometry 和 BVH 没有被内联或改写；
- 所有输入记录 byte count、SHA-256、schema 和 role；
- 文本输入先规范化为 UTF-8/LF 再计算 byte count 与 SHA，Windows/Linux
  checkout 产生同一 revision；
- 整份 canonical 的 `catalogRevision` 可确定性重算。

发布门禁必须验证 index、faction document、Wiki 与 vehicle canonical 使用同一
`vehicleCatalogRevision`，并完整解析公开引用表。旧 schema 不做静默兼容；
`vehicleReferenceSchemaVersion` 和由其导出的 `dataRevision` 负责显式缓存失效。
任一缺失、重复、多余引用、pool ordinal 或 revision 漂移都 fail closed。

从 v4 迁移到 v5 时不重写 profile pool/reference table 算法，也不重建未失效的
hit、geometry、BVH 或视觉 blob；必须重新生成全部 22 个 faction shards 及同代
国际版/国服搜索索引，使本地化显示与搜索元数据进入 faction→search 闭包。v5
消费者拒绝 v4 schema，不能在浏览器端静默补齐或沿用旧索引。

`tools/sync-vehicle-source-files.mjs --initialize` 仅用于首次迁移：目标目录已有
JSON 时拒绝覆盖。日常编辑直接修改对应单车文件；常规 build 不会从旧 inventory
反向覆盖人工修改。

## 99 项武器装甲候选

候选身份是 exact：

```text
recordSha256 + componentId + owner identity + target package
```

冻结基线包含 99 个 component case、81 个 package 和 116 个目录 binding。
同 package 的两个组件可以在一个 Editor 进程内使用各自的新鲜 fixture，但不同
package 不得合批。

每项结果拆为三条正交证据：

1. `surfaceSelection`：真实弹丸/命中链是否选择该组件及其 physical material。
2. `pointOwnerRouting`：组件 owner 已被选中后，point damage 如何影响 owner
   与 hull。
3. `radialRouting`：径向伤害如何影响 owner 与 hull，以及是否真的执行完整
   projectile explosion aggregation。

对于 `damageParentActor=false` 的条目，直接调用 owner damage 不能证明原生武器
会选择 owner。若 occupied-seat `ASQWeapon` 或等价真实链不可用，结果必须是
`native-unknown`，不能据 direct-owner 扣血将组件改成 `armor`。

“完成 99 项验证”表示每个 exact case 都具有唯一终态和完整失败证据；不表示
强行把 99 项全部判定为可受损组件。

当前闭环为 99/99 complete。point 路由分为 47 项
`owner=-10/hull=-10` 与 52 项 `owner=-10/hull=0`，和每个 exact owner health
pool 的 `passDamageToParent && passPointDamageToParent` 99/99 一致。候选的静态
surface 又把它们拆成 28 项 `damageParentActor=false`、19 项
`damageParentActor=true` 的普通 `StaticMeshComponent`、52 项
`damageParentActor=true` 且 owner-local-only 的 `SQArmorMeshWeapon`。因此 v3
必须继续把 component surface、owner pool 和 parent forwarding 分开引用：
owner-local-only 不是“无伤害”，但也不能被投影成 hull damage。

radial 的六种 owner/hull delta 组合来自独立 overlap，不能反向填充 surface route
或 `passRadialDamageToParent`。完整原生 projectile selection 与 explosion
aggregation 仍为 `native-unknown`。严格收据 revision 为
`8ba3e8f079c87bc1e6232ba30e0fda71260c5d3de2814ef83d25db8983f8f693`。

## 更新规则

普通资料更新只重建 canonical 和受影响投影。只有下列输入变化才重新生成对应
物理或实机证据：

- SDK/source build 或 exact Blueprint identity 改变；
- hit record、component/surface/owner 身份改变；
- runtime damage 探针或真实 weapon/projectile 路由改变；
- geometry/BVH/pose 内容哈希改变。

不得因新 worktree、提交、时间戳或缓存副本而重跑全车队。成功 checkpoint、
失败尝试、runtime receipt 和内容寻址 artifact 都应按精确身份复用。
