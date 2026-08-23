# SiguaArmor「从夯到拉」载具排名器竞品研究

- 调研日期：2026-08-23
- 目的：为 Armor 站的载具 Tier List 选择低摩擦的分级、找卡片、拖拽、移动端、可访问性、持久化和导出交互。
- 证据边界：只记录截至调研日可直接读取的官方产品页、官方帮助文档和官方应用商店页；没有把搜索结果摘要、用户评论或未公开的实现细节当成事实。没有写入或修改任何产品代码。
- 研究结论状态：`observed` 为页面直接说明；`derived` 为基于这些观察对 Armor 的产品建议。产品页没有提到的能力标为“未声明”，不推断为“支持”。

## 先给结论

Armor 最值得复用的是「专用目录 + 未分级池 + 直接拖入行」这一条路径，而不是把排名器做成泛用白板：

1. 打开即给用户五行：`夯`、`顶级`、`人上人`、`NPC`、`拉`；卡片先进入一个明确的“未分级”池。五行只是默认值，用户可以增加、删除、重命名、改色和调整顺序。
2. 搜索应该搜 Armor/Wiki 的载具目录（本地化名称、别名、拼音和分类），结果直接显示 Armor 载具卡片。点击结果加入“未分级”；把结果拖到某一行则一步完成“添加 + 分级”。这解决了通用工具要求用户自己上传图片的主要摩擦。
3. 桌面端用指针拖拽，触屏端用长按拖拽并支持自动滚动；键盘用户可以用焦点卡片和方向键在行之间移动、在行内排序，Delete 移回未分级或移除。拖拽不是唯一的操作入口。
4. 低成本持久化应是浏览器本地自动保存；另提供可复现的 JSON 导入/导出和一键 PNG 导出。账号、云端公共模板、多人投票和实时协作不应成为首版依赖。
5. 视觉上复用 Armor 现有卡片、深色面板、边框和 Wiki 缩略图策略；只借鉴 TierMaker/Miro 的任务顺序，不复制 Canva 的通用设计画布。

## 一手产品观察

### TierMaker：专用 Tier List 的基准交互

TierMaker 的官方载具示例直接展示了接近目标的最小闭环：默认 `S/A/B/C/D` 五行；每行可编辑标签、改标签底色，支持删除/清空行，并提供“在上方/下方添加行”；页面明确指导用户拖动图片排序。页面还有“Add additional images”输入、`Save or Download`、`Presentation Mode` 和背景色设置。见 [Best Overall Vehicle Tier List](https://tiermaker.com/create/best-overall-vehicle-322637)。

它的目录/模板生态是优势：主页按类别和模板入口组织，并允许搜索主题后选择已有模板（见 [Tier List Maker for Everything](https://tiermaker.com/)）。官方创建指南要求创建者先用搜索框检查已有模板，并支持公开模板与一次性列表两种模式；这证明“先找到可用集合，再开始排序”比每次从空白画布开始更符合这类工具的习惯。见 [Template Creation Guide and FAQs](https://tiermaker.com/blog/support/10/tier-list-template-creation-guide-and-faqs)。

但它的“添加条目”仍是图片中心：官方载具示例说明，用户追加的图片“不会保存到网站，只会包含在下载结果”；官方 FAQ 也说，把图片上传到别人的模板只对当前会话和下载有效，不能保存到网站。也就是说，它解决了“拖动现有图片”，没有解决“按领域目录搜索并复用稳定条目身份”。这是 Armor 做得更贴近载具卡片的机会。

保存/分享是账号分层：官方登录页说明，创建账号才能创建自己的模板并保存 Tier List；使用已有模板时，不登录也能下载图片。见 [TierMaker Login](https://tiermaker.com/login/)。这支持 Armor 首版把“无账号可用”作为默认路径。

移动端方面，TierMaker 官方页面列出 Android/iOS 应用、改进的移动体验、快速投票格式、更高质量下载、自定义宽度、收藏模板和文本转图片；见 [Official TierMaker Mobile App](https://tiermaker.com/app/) 及 [官方创建指南的 App FAQ](https://tiermaker.com/blog/support/10/tier-list-template-creation-guide-and-faqs)。但 Apple 官方应用页明确显示开发者尚未声明该 App 支持哪些无障碍功能，因此不能把 TierMaker 当成可访问性范本；见 [TierMaker.com on the App Store](https://apps.apple.com/us/app/tiermaker-com/id6744654563)。

可复用点：五行默认、未分级池、行级操作、图片导出、搜索模板后排序的路径。

不应直接照搬：通用图片上传代替载具目录、登录才可保存、移动端付费门槛，以及没有公开无障碍承诺的拖拽-only 假设。

### Miro：自定义行、触屏和可访问性的强参考

Miro 的官方 Tier List 模板说明，用户可以直接输入条目或拖放便签进入模板；条目可以快速在不同级别间移动；可重命名或增加级别、改颜色以及字体；最后可以分享链接或下载图片/PDF。见 [Miro Tier List Template](https://miro.com/templates/tier-list/)。

Miro 的专用介绍页进一步声明级别数量不限，可用文字、形状或图片表示条目，并支持上传/拖放图片、吸附和对齐；见 [Miro Tier List Maker](https://miro.com/graphs/tier-list/)。这给 Armor 两个实用启发：行操作应有清晰的“添加上方/下方”入口，卡片拖入时应有稳定的插入位置，而不是只能丢到行末。

Miro 的代价是它是无限画布和协作工作区，不是载具目录排序器。实时协作、评论、投票、AI 和无边界画布对 Armor 首版都不是必要依赖；可借鉴的是局部交互，不是整体容器。

移动端/触控证据比较明确：Miro 官方帮助文档说明，触屏可拖动画布、双指缩放、长按拖动选择对象，并自动区分触摸与鼠标/触控板事件。见 [Using Miro with a mouse, trackpad, or touchscreen](https://help.miro.com/hc/en-us/articles/360017731053-Using-Miro-with-a-mouse-trackpad-or-touchscreen)。对 Armor 来说，这支持“长按后开始拖动、普通滑动仍然滚动页面”的交互约束。

可访问性是 Miro 最值得借鉴的差异点：官方文档声明支持键盘和辅助技术创建、读取、更新、删除对象；提供 Tab/Shift+Tab 的对象导航、方向键在对象间移动、Enter/Space 激活控件，并允许关闭单键快捷键；另有减少动画、颜色标签和图像替代文本/可访问性检查器。见 [Overview of Miro Accessibility](https://help.miro.com/hc/en-us/articles/19506114302354-Overview-of-Miro-Accessibility)、[Shortcuts and hotkeys](https://help.miro.com/hc/en-us/articles/360017731033-Shortcuts-and-hotkeys)。Armor 不需要复制整套白板键位，但应至少保留“焦点可见、键盘可完成移动和排序、颜色之外有文本语义、尊重减少动画”的原则。

可复用点：触屏长按、可见焦点、键盘移动/排序、减少动画、图像替代文本、行可无限扩展的模型。

不应直接照搬：无限画布、多人协作、投票和过重的工具栏。

### Canva：视觉模板和导出参考，不是排名器内核参考

Canva 官方 Tier List 页面把入口设计成“选模板 → 拖放替换图片/插图 → 改颜色和文字 → 下载或分享”。它同时提供媒体库、上传自有图片、实时协作和高分辨率图片/视频导出。见 [Canva Free Tier List Maker](https://www.canva.com/create/tier-lists/)。

Canva 的模板页还支持搜索数千模板、编辑类别、缩减或扩展列表，账号会保存设计副本，并支持 JPG/PNG/PDF 导出。见 [Canva Tier List Templates](https://www.canva.com/tier-lists/templates/)。官方页面说明可从桌面或移动 App 打开，创建 Tier List 不必登录；见同一 [Canva Tier List Maker](https://www.canva.com/create/tier-lists/) 页面。

可复用点：Armor 的视觉质感、模板选择、导出结果的清晰度和移动端入口。

不应照搬：将载具卡片当成任意设计元素、把搜索变成通用媒体库、为排名器引入整套设计画布和视频编辑能力。Canva 官方 Tier List 页面没有给出针对“卡片在不同级别间移动”的专门键盘语义，因此可访问性不应据此推断。

### 轻量专用工具：本地保存、库搜索和键盘替代的交互补充证据

以下工具不是用来证明“成熟度”，而是用来观察更接近 Armor 首版的轻量控制面：

- [TierListMaker.io](https://tierlistmaker.io/) 页面直接露出 `Search Library`、`ADD`、文字条目输入、`Classic S-D`/`Rank 1-10`/`GOAT vs TRASH` 预设、`Add New Tier`、`Auto-Save`、`.tier` 项目导入/导出和 PNG 导出。它声明数据和上传图片存于浏览器本地，PNG 以约 2 倍画布尺寸导出。值得复用的是“库 → 添加 → 未分级 → 行”的明确流水线；但页面未声明移动端触控或无障碍支持。
- [TierListMaker.online](https://tierlistmaker.online/) 明确声明移动/平板响应式、触控拖放、自动把行/颜色/标签/标题保存到 `localStorage`、2 倍 PNG、文字条目、无限行/条目和多个图片显示比例。可作为 Armor 移动端和本地保存的交互检查表，但不应把营销文案当成已完成的质量验证。
- [Andergrove Tier List Maker](https://andergrove.com/tools/tier-list-maker/) 给出了最具体的键盘替代：Tab 聚焦卡片，方向键上下移动到其他行、左右调整行内顺序，Delete 删除；同时支持鼠标或手指拖拽、浏览器本地处理和 PNG 导出。这是 Armor 可以直接转化为验收标准的简洁键位模型。

## 对 Armor 的可执行建议

### 1. 默认分级与行模型

推荐首版数据模型是“稳定行 ID + 稳定载具 ID + 行内顺序”，而不是把行名当作身份：

```text
tiers: [
  { id: "夯", label: "夯", color: "...", order: 0 },
  { id: "顶级", label: "顶级", color: "...", order: 1 },
  { id: "人上人", label: "人上人", color: "...", order: 2 },
  { id: "NPC", label: "NPC", color: "...", order: 3 },
  { id: "拉", label: "拉", color: "...", order: 4 }
]
unranked: [vehicleId, ...]
placements: [{ vehicleId, tierId, order }]
```

这是从 TierMaker 的可编辑行、Miro 的重命名/增行以及本地工具的预设模型推导出的产品建议（`derived`），不是对竞品内部实现的断言。删除行时把其中卡片送回“未分级”，比静默塞进别的行更可逆；行标题允许重命名但 ID 不变，避免用户改名后丢排名。

### 2. 搜索、添加和拖动添加

推荐把“搜索添加”做成首屏主要入口：

- 搜索框同时匹配 Wiki 的本地化名称、社区别名、拼音和车型/阵营过滤；结果使用已有 Armor/Wiki 载具卡片缩略图和名称，不要求用户手动找图或上传图。
- 点击 `添加` 将卡片放入“未分级”；再次点击显示已添加状态，不产生重复卡片。
- 从搜索结果拖到某行，直接加入该行；拖到“未分级”则加入池。桌面和触屏都支持拖入，键盘使用 `Enter` 添加到未分级，随后用移动操作完成分级。
- 已添加卡片仍可从未分级池拖入行，行内拖动决定相对顺序；行与行之间显示明确的放置高亮和插入线。
- 首版不需要开放任意 URL/图片上传。TierMaker 证明了通用图片追加很常见，但它也明确说明追加图片不会保存到模板；Armor 的优势应是稳定的载具实体身份、统一缩略图和可复用的搜索结果。

### 3. 桌面、触屏与可访问性

- 桌面：卡片和行都使用 pointer events；拖动开始前保留短按点击语义，避免误拖。
- 触屏：长按后进入拖动态，拖动时自动滚动；普通单指滑动继续滚动页面。卡片、添加按钮、行操作按钮满足至少 44px 触控目标。
- 键盘：Tab 可进入搜索、添加按钮、未分级卡片、各行卡片和行操作；`Enter/Space` 添加或打开“移动到”菜单；方向键上下换行、左右改行内顺序；Delete 移回未分级并由 `aria-live` 宣布结果；Escape 取消拖动/菜单。
- 语义：每个行标题、行内卡片数量、卡片所属行、拖动后的结果都应能被屏幕阅读器读出；颜色不能是唯一等级信号，保留文字标签和可辨识边界；支持 `prefers-reduced-motion`。
- 小屏：先固定搜索/筛选，再显示未分级池，行按纵向堆叠；不要强制用户在无限画布中横向拖动。

这些建议分别对应 Miro 的触屏、键盘和减少动画文档，以及 Andergrove 的方向键模型；它们是 Armor 的 `derived` 验收要求，不表示 Armor 已经具备这些能力。

### 4. 持久化与导出

优先级建议如下：

1. `localStorage` 自动保存当前榜单（行、标签、颜色、顺序、卡片 ID、标题和 schema 版本），刷新后恢复；这是 TierListMaker.online/TierListMaker.io 明确采用的低成本模式。
2. JSON 导出/导入，保存稳定 ID 而不是复制图片二进制；导入时对不存在的载具 ID 给出“待重新匹配”状态，不静默丢卡片。
3. PNG 导出用于分享，至少包含标题、行标签、卡片缩略图和名称；可选 2 倍输出，参考 TierListMaker.io/online 的做法。
4. 公共 URL、账号云保存、多人协作和实时投票等到确有产品需求时再加。TierMaker 的账号/模板体系和 Miro 的协作体系都说明它们会显著扩大产品边界，不应为一个本地排名器首版预装。

### 5. Armor 风格落地

- 复用 Armor 已有载具卡片的缩略图来源、字体层级、深色背景、描边和状态徽记；不引入 Canva 式泛媒体库视觉。
- 用行色表达气氛，但保留高对比度文本标签；“夯/拉”等中文标签本身是信息，不要只显示颜色。
- 卡片信息优先保证轮廓和名称可辨识；在窄屏减少装饰而不隐藏名称。
- 排名器页面只负责产品行为、行分组、排序和保存；载具名称、别名和缩略图仍走既有 Wiki 数据边界，不在 Armor 新增权威共享快照。

## 建议的首版验收清单

- 首次打开有五个默认行和一个“未分级”池，默认中文标签与用户需求一致。
- 搜索载具本地名、别名或拼音能显示匹配卡片；点击一次只添加一次。
- 从搜索结果直接拖到目标行可完成添加和分级；从未分级池拖到行可排序；行内顺序刷新后保持。
- 行可添加、重命名、改色、上下移动和删除；删除行的卡片回到未分级并有明确反馈。
- 鼠标、触控长按和键盘三条路径都能完成“添加、跨行、行内排序、移回未分级”。
- 刷新页面可恢复本地排名；PNG 输出可读；JSON 导入/导出不会把卡片身份变成图片副本。
- 视觉检查通过 Armor 现有风格和对比度约束；`prefers-reduced-motion`、焦点可见和 `aria-live` 结果可验证。

## 一手来源

| 来源 | 用途 |
| --- | --- |
| [TierMaker 载具示例](https://tiermaker.com/create/best-overall-vehicle-322637) | 五行默认、行级编辑/增删、拖拽、追加图片、保存/下载流程 |
| [TierMaker 首页](https://tiermaker.com/) | 类别/模板搜索入口和大规模模板生态 |
| [TierMaker 创建指南与 FAQ](https://tiermaker.com/blog/support/10/tier-list-template-creation-guide-and-faqs) | 一次性/公开模板、账号保存边界、追加图片不持久化、移动 App FAQ |
| [TierMaker 登录页](https://tiermaker.com/login/) | 账号保存与无账号下载边界 |
| [TierMaker 官方移动 App](https://tiermaker.com/app/) | 移动体验、快速投票、下载质量、自定义宽度、模板收藏 |
| [TierMaker App Store listing](https://apps.apple.com/us/app/tiermaker-com/id6744654563) | 移动端可用性和“未声明无障碍支持”的边界 |
| [Miro Tier List 模板](https://miro.com/templates/tier-list/) | 拖放、重命名/增行、颜色/字体、链接/图片/PDF 分享 |
| [Miro Tier List Maker](https://miro.com/graphs/tier-list/) | 自定义级别、添加图片、拖放排序、协作能力 |
| [Miro 触屏文档](https://help.miro.com/hc/en-us/articles/360017731053-Using-Miro-with-a-mouse-trackpad-or-touchscreen) | 触屏长按、双指缩放和输入类型区分 |
| [Miro 可访问性概览](https://help.miro.com/hc/en-us/articles/19506114302354-Overview-of-Miro-Accessibility) | 键盘/辅助技术、减少动画、标签和替代文本 |
| [Miro 快捷键文档](https://help.miro.com/hc/en-us/articles/360017731033-Shortcuts-and-hotkeys) | Tab、方向键、Enter/Space、删除和搜索键位模型 |
| [Canva Tier List Maker](https://www.canva.com/create/tier-lists/) | 模板、媒体库、拖放、协作、桌面/移动入口和高分辨率导出 |
| [Canva Tier List 模板](https://www.canva.com/tier-lists/templates/) | 模板搜索、类别编辑、账号保存和 JPG/PNG/PDF 导出 |
| [TierListMaker.io](https://tierlistmaker.io/) | 搜索库、ADD、预设、自动保存、`.tier` 导入/导出和 PNG |
| [TierListMaker.online](https://tierlistmaker.online/) | 移动触控、localStorage、2x PNG、文字条目、无限行/条目 |
| [Andergrove Tier List Maker](https://andergrove.com/tools/tier-list-maker/) | Tab/方向键/Delete 的非拖拽替代和触控拖拽 |
