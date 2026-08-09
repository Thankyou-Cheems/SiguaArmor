# Runtime card impressions

国际载具目录的卡片印象图由当前 RuntimeProbe `webUsable` visual index 离线生成。渲染身份始终是
`cardId × rawName`，不能按车型家族、阵营相似外观或 source package 猜测并复用另一张图。

当前目录闭合为 384 张载具卡片、604 个 exact variants。每个 variant 都从自己的 source-native
PBR placement 集合渲染；卡片封面使用该卡片 catalog 中第一个 variant 的图，详情中的变体列表使用
各自 exact variant 的图。缺失图时前端不回退到其他变体。

## 固定影棚参数

这些参数与发布分支 `tools/render-vehicle-card-impressions.mjs` 保持一致：

- 画布：640×360、透明背景、WebP、单图不超过 32 KiB；
- 相机方向：以发布分支 z-up 机位为基准，沿车辆纵向平面镜像后转为 RuntimeProbe y-up glTF 的
  `[1.7, 1.25, 2.7]`，使车头朝卡片右下方；FOV `32°`，普通载具取景 `1.08`，直升机取景 `0.62`；
- 色调曝光：`1.18`；
- 半球光：天空 `#eaf2ff`、地面 `#342c24`、强度 `1.8`；
- 主光：`#ffefd8`、强度 `4.35`、位置 `[6.5, -8.5, 10.5]`；
- 补光：`#9fc6ff`、强度 `1.55`、位置 `[-7, 2.5, 5.5]`；
- 轮廓光：`#ffc978`、强度 `1.75`、位置 `[-4.5, 8, 8]`；
- 正面柔光：`#ffffff`、强度 `0.55`、位置 `[3, 5, 4]`。

渲染前会复用 `app/runtime-probe-visual-selection-policy.json`，因此 ZBD05 等载具会先应用已确认的
炮塔 SkeletalMesh / 重复 WeaponMesh 抑制规则；影像不会再次引入已经从网页 3D 预览中排除的浮空炮管。

## 运行与校验

完整重建：

```text
npm run assets:runtime-card-impressions
npm run assets:validate-runtime-card-impressions
```

单个 exact variant 的隔离渲染应输出到 `outputs/` 临时目录，例如：

```text
node tools/render-runtime-card-impressions.mjs --variant "afu--mi-8--uh::BP_MI8_AFU" --output-root outputs/runtime-card-impressions-smoke --output-manifest outputs/runtime-card-impressions-smoke.json
```

正式 manifest 为 `generated/runtime-probe-card-impressions.json`，正式图片位于
`public/images/vehicle-impressions/`。文件名是 WebP 内容 SHA-256；manifest 同时绑定 catalog、visual
index、source package、source identity、source descriptor 和保留 occurrence 数量。卡片只加载静态的
lazy/low-priority `<img>`，Three.js 仍只在打开详情 3D 视口时启动。
