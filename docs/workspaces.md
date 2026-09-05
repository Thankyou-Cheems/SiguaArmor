# 工作目录、阶段成果与继续入口

`D:/Dev/SiguaArmor` 是日常主目录，保持在 `main`。`main` 保存可集成产品源码；实际线上版本以带 `deployed` 的发布 tag 和部署核对为准。共享数据仍从 SiguaWiki 读取，研究结论在私有 SiguaResearch 查询。

## 日常并行工作

先运行 `npm run workspace:status`，检查现有任务的分支、修改和本地保管内容。单任务可以在主目录的短期 `codex/<task>` 分支工作，完成后合入 `main` 并切回。需要并行时统一使用仓库内被忽略的 `.local/worktrees/`：

```powershell
git worktree add .local/worktrees/my-task -b codex/my-task main
```

任务的状态写在对应文档或 Issue 中。记录结论、证据范围、未闭合项和下一步；分支和目录只承担临时编辑隔离。完成后合并适用内容，删除临时分支和工作树。保留候选时，先提交并创建注明边界的 annotated tag，再释放工作树，需要继续时从 tag 建新分支。

移除前逐一确认：精确 tip 已包含在 `main` 或 annotated tag；所有 dirty/untracked 内容已保存；ignored 文件已区分可重建缓存与需保管材料；没有其他任务或进程使用目录。`workspace:status` 是只读盘点，不代替这些检查。遇到 junction，只处理链接本身。备份、凭据和研究材料放在其所属私有保管目录。

## 状态与 tag

| 状态 | 保存方式 | 含义 |
| --- | --- | --- |
| 开发中 | 短期 `codex/<task>` 分支和任务记录 | 有明确下一步的当前工作 |
| 候选 / 部分完成 | `candidate/<topic>-YYYY-MM-DD` annotated tag + 边界说明 | 源码可恢复；不代表产品验收或上线 |
| 已接受 | 合入 `main`；重大阶段可保留 `accepted` tag | 通过该阶段适用验证；不自动代表已部署 |
| 已上线 | 保留既有 `<topic>-v<build>-deployed-YYYY-MM-DD` annotated tag | 指向已核对的发布源码，按[部署流程](deployment.md)执行 |
| 过时 / 试错 | `archive/<topic>-YYYY-MM-DD` annotated tag + 取代原因 | 可查阅和恢复的历史，日常工作不保留常驻分支 |

已经合入主线的普通分支直接依靠 Git 历史检索，不为每条旧分支制造一个 tag。私有旧历史只存入私有归档；向 public origin 推送时明确列出要推送的公开 refs。

## 2026-09-05 整合后的入口

| 成果 | 入口 | 当前判断 |
| --- | --- | --- |
| 无限弹药线上版本 | `vehicle-infinite-ammo-v10.5.3-deployed-2026-09-04` | 源码恢复到 `f24e11f`。3,367 个打包文件中 3,364 个逐字节匹配生产，剩余 3 个仅有构建随机标识差异；所有浏览器包相同。457 项测试通过。本次整理没有重新部署。 |
| Narva 学校和足球场 | `candidate/narva-school-2026-09-05` | 保留全部 23 个修改/新增文件。仍是本地预览；继续前读取下方边界。 |
| 页脚布局原型 | `archive/footer-prototype-2026-09-05` | 保留原先未提交的 3 个文件，未作为新产品方案验收。 |
| 双车对抗早期原型 | `archive/vehicle-duel-prototype-2026-08-20` | 保留 2 个未合并提交；当前产品入口是 `main` 上的 `VehicleDuelApp`。 |
| 旧私有 maintainer 历史 | 私有 SiguaResearch 的整合记录及 annotated bundle | `2e08b1b` 的 107 个独立历史提交已保管；与当前公开主线无共同祖先，不能合并进公开仓库。 |

既有载具装填闭合、操作视角、runtime selector 和射击反馈阶段 tag 均保留。历史目录与分支对应关系、文件保管索引及恢复操作位于私有 SiguaResearch `sources/migrations/2026-09-05-siguaarmor.md`。

### 继续 Narva 候选

```powershell
git fetch origin --tags
git worktree add .local/worktrees/narva-school -b codex/narva-school candidate/narva-school-2026-09-05
git -C .local/worktrees/narva-school merge main
```

候选的历史说明是其当时的证据，v20 和旧研究分支/路径不再是当前入口。先读私有 Research 的 `investigations/2026-09-04-armor-narva-projectile-collision.md`、`investigations/2026-09-05-native-hit-and-damage-code.md`，以及 `knowledge/damage/narva-school-projectile-collision.md`。地图分发已推进至 v21；按当前分发记录确认资源路径和解码器兼容性，旧本地 v20 路径不能直接照抄。

候选的公共依赖 `/data/maps/narva/fixed-display.json`、`/algorithms/maps/fixed-display-format.js` 在本次核对时仍为 404。它会等待学校查询就绪才允许开火，因此直接上线会破坏当前操作功能。先完成 Wiki 资源接入，再在默认 HTTPS 数据源上验证。

场景接触不等于完整游戏穿透结算。学校 native 法线、正反面准入、每组件/实例命中数量等仍未闭合；Research 已恢复最小向前 span 1 cm 的代码证据，候选需跟进核对。建筑伤害、摧毁、径向爆炸、动态场景和实时制导遮蔽仍在这个候选范围之外。另保留炮手切驾驶员时残留弹药 HUD 的待修问题。
