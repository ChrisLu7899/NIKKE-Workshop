# 素材来源说明

## 推荐一图流文字数据（2026-09-16 复核）

来源为用户提供、署名“屑芙蒂”的《NIKKE国际服PVE一图流》，作者主页沿用 <https://space.bilibili.com/17057196/dynamic>。原图未标明可确认的发布日期，本次日期仅表示复核日期。原图 SHA-256 为 `717768cd8509e9e72e32f474f4856accef7b27465f12038cc02deb936e850406`。

仅更新经用户确认的结构化培养建议与角色身份，不新增分发原图、OCR 草稿或其他图片。87 条培养建议及稳定角色编号保留在推荐方案数据文件中，来源记录见 `src/data/recommendationSource.json`。攻略文字权利属于原作者，不以本项目 GPL 代码许可替代其内容权利，也不表示作者为本工具背书。

## 全量立绘分发（2026-09-09）

623 张既有 WebP 原字节不变，全部随唯一完整安装包分发，原有角色编号、来源及许可文件继续保留。角色卡直接读取本地图片，不请求远端立绘或使用素材下载缓存。未新增或重新加工素材，具体权利归属及许可边界仍以下文各项原记录为准。

## 普通装备原图与编号映射（2026-09-07）

来自素材库正式 `output/character_card_ui_equipment-standard`：60 张 128×128 透明原图（3 职业×4 部位×5 组共享外观），覆盖 T1～T9；另外 12 张复用已验收 `character_card_ui_equipment`。不裁切、不缩放、不改色，不从用户截图取图。阶级来自 Blablalink 官方 ItemEquipTable 的 `item_rare`，124 条编号对应 72 个资源 ID；不能用 `_t9_3` 后缀推断 T10，因为表内另有 4 条 T9/All 占位记录共用该图。企业装用账号返回的企业类型独立显示，不虚构 `_t9_2` 素材。

`node scripts/sync-equipment-catalog.mjs [--check]` 校验正式晋级状态、逐图复核摘要、官方表/目录/PNG SHA 和旧素材的精确复用关系，完整预检后接入。公开证据：`public/ui-assets/nikke/equipment/standard-sources.json`；前端和未来 OCR 共用 `src/data/equipmentCatalog.json`。不包含原始包体、解密缓存路径或账号数据。游戏素材权利属于原权利人，接入不代表获得再分发许可，本批未更新 ZIP/GitHub。

## 当前魔方、收藏品物件与角色技能图标（2026-09-07）

统一来自素材库正式 `output/character_card_objects`：当前 dp 的 `icons-equip(hd)`、`icons-favoriteitem(hd)`、`icons-skill(hd)` 三个 Bundle。接入 17 种魔方、6 种武器玩偶、21 个角色珍藏品物件和 200 个角色技能映射（200 张爆裂、38 张去重技能 1/2 glyph），共 282 张原始 PNG。像素、尺寸和透明度不裁切、不重绘、不标准化放大；角色等级、收藏品星级、技能与魔方等级继续独立显示。

`node scripts/sync-character-objects.mjs [--dry-run|--check]` 预检/校验，省略参数接入；`sync:character-objects` 是统一入口，`check:character-objects` 只读校验；旧 npm 命令直接指向同一脚本，旧包装文件已删除，已移除 Wiki/GameWith 下载与截图裁切。正式来源、Sprite CAB/PathID、逐图复核、原图/输出 SHA 见 `public/ui-assets/nikke/objects/extracted-sources.json`。魔方显示使用 `cubes/ie_<resourceId>.png`，OCR 仍用独立 `public/ocr/cube-icons`，本次未改变识别模板。

技能 1/2 保留明确的 roledata icon 字段映射并匹配包内同名 Sprite；c104 新增映射另经公开 roledata 核对，证据包含 URL 和响应摘要。珍藏品用 `mi_favoriteitem_cNNN_00` 与当前角色目录绑定，不使用 `wallpaper` 或人物背景。素材库还保留额外 5 张魔方原图，仅确认资源 ID，未猜其业务 ID/名称。下方旧 Wiki/截图记录只解释历史版本，不是这三类当前运行素材的来源或生产入口。

游戏美术权利属于原权利人，不包含在 GPL 代码许可中。本次仅本地接入验收，不表示取得再分发授权，未发布 ZIP/GitHub。

## 当前角色卡好感度与等级装饰（2026-09-07）

`metadata/decorations` 使用素材库正式 `output/character_card_ui_decorations` 的四张原始 Sprite：CharacterDetail2 内嵌的爱心、圆角线框、实心圆和 4px 圆环。来源清单保存实际 CAB/PathID、主 Bundle/自带图集 SHA、逐项复核与源 PNG 哈希；不是从用户截图裁取，不带等级数字。

`node scripts/sync-character-decorations.mjs [--check]` 根据固定配方生成显示图：好感边框保持原始 20px 九宫格、沿用插件红色；技能底色采用实际界面节点的 50/255 灰色，叠原始白环；等级徽章由同一圆形的白色外层和灰色内层构造。魔方复用是插件表现选择，不冒充游戏魔方卡原生等级节点。完整派生与输入证据见 `public/ui-assets/nikke/metadata/decorations/extracted-sources.json`。技能专属 glyph 与具体魔方物件图的既有来源本批不变。

## 当前角色卡五类公共图标（2026-09-06）

`metadata/native` 中 23 张图标来自素材库已晋级的 burst、element、weapon、class、manufacturer 分组。企业按小徽记映射，数字编号以逐项来源证据与完整 Logo 对照核实。武器/职业/企业为原始 PNG 字节；爆裂/属性由已晋级 frames 的原生六边形与原始符号组合，保留既有插件属性色，不是从截图裁取，也不宣称完全还原游戏 UI 材质。

生产/校验入口 `node scripts/sync-character-metadata.mjs [--check]`；完整源、复核、派生配方和输入/输出哈希见 `public/ui-assets/nikke/metadata/native/extracted-sources.json`，运行时白名单见 `src/data/characterMetadataAssets.json`。职业、企业等级继续由角色数据输出。下方 Wiki 同类素材记录保留历史出处，角色卡当前不再引用它们；未在本次处理的其他素材来源不变。

## 当前角色卡突破素材（2026-09-06）

亮星、空星、核心底图已从素材库正式 `output/character_card_ui_breakthrough` 接入 `metadata/breakthrough`。对应原生 Sprite 为 `ele_upgrade_S_on`、`ele_upgrade_S_off`、`ele_coreupgrade_bg_S`；不重绘或裁截图，核心数字独立动态显示。`metadata/breakthrough/extracted-sources.json` 保存主 Bundle、实际 SD 命名图集依赖、CAB/PathID、PNG 与复核哈希。更新/校验使用 `node scripts/sync-character-card-ui.mjs --group=breakthrough [--check]`。下方截图星形、核心外框记录仅为旧素材来源，角色卡与当前映射已不再引用它们。稀有度继续使用先前接入的 `metadata/rarity` 原图。本地增量未更新 ZIP/GitHub。

## 当前增量修复（2026-09-06）

德雷克：终极反派（c104_00）新增接入默认立绘和大厅技能动画静态图；角色身份经当前 Blablalink 繁中/英文目录交叉确认（name_code 5181、resource_id 104）。两项来自素材库正式 output，源 PNG 与派生 WebP 哈希见 extracted-sources.json；技能动画保留 native 1.1.0 的真实渲染版本和原有动态粒子/Shader 还原限制，不因接入而宣称重新渲染。下方历史批次中的 c104 未映射状态已由本次接入解决。

雪子与埃癸斯两组技能动画新增 native 1.2.1 正式修正：保留纹理铺贴参数与 Shader CAB 身份、还原雪子双滚动纹理/RGBA 遮罩、恢复埃癸斯环形网格顶点透明度。两组均通过三帧及每组九张 PNG 重复验证，再从正式 output 导入；其他已验收版本保持真实版本。普通立绘未改像素：三背景 Alpha 合成确认此前白边属于预览误判。全局雾效、动态粒子及游戏逐像素一致性仍未验证。

当前素材来源以 `public/ui-assets/nikke/character-artwork/extracted-sources.json` 的逐项哈希和真实版本为准。已复核的当前包体 native 1.1.0 成品与增量修复后的 1.2.0 并存，不将旧图片改标签冒充新渲染。此次接入 26 张普通立绘及 8 组技能动画修正图；另两项无插件映射，只在素材库保留。来源均为正式晋级的 output，未直接导入诊断候选。

## 技能动画静态图正式 1.0（2026-09-04，历史批次）

素材库以 `native-scene-1.0.0` 重新生成 224 套技能动画静态图，正式画布统一为 `1105 × 1300`。每套均绑定当前包体来源、三帧候选哈希，并通过两次渲染共九个 PNG 的 SHA-256 一致性检查。旧版本图片不再沿用；没有 1.0 候选的 `c470_02` 已从正式素材和插件目录移除。

插件按现有角色与皮肤目录映射其中 218 套；`c013_00`、`c104_00`、`c610_00`、`c901_00`、`c907_00`、`c993_00` 暂无对应图鉴条目，因此只保留在素材库正式输出，不虚构角色映射。插件当前目录共 619 项，其中 615 项有素材库派生记录，4 项为独立保留素材。PNG 与 WebP 的来源、摘要、尺寸、选帧和限制记录在 `public/ui-assets/nikke/character-artwork/extracted-sources.json`。

角色卡对这类 1.0 技能动画图使用完整画面适配，不再以 `cover` 二次裁掉画面边缘。当前结果仍是主体与主背景的阶段性静态还原，不代表动态粒子、原始 Unity Shader、后处理或编译后的 AnimationClip 曲线已完整复现。已知的 `c610_00` 背景蜂窝/噪点、`c871_00` 纵向条带，以及六项映射缺口记录于素材库 `errors/native_scene_reconstruction/正式1.0批次待复核异常-20260904.md`。

## 插件图标

- 素材：NIKKE 角色“钟鸣（Chime）”官方 SD 头像
- 来源：GODDESS OF VICTORY: NIKKE 官方英文账号发布的头像素材
- 原始发布：https://x.com/NIKKE_en/status/1984817760191594868
- 使用位置：`public/images/icon-16.png`、`icon-32.png`、`icon-48.png`、`icon-128.png`

角色、美术及相关商标的权利归其各自权利人所有。上述官方美术素材不包含在本项目 GPL-3.0-or-later 代码许可的授权范围内。

## 本地装备截图识别模板

- 素材：装备图标、装备词条文字、档位数值和锁定状态的本地匹配模板
- 来源：用户提供的《胜利女神：妮姬》游戏内装备详情截图，经裁切与标准化后用于离线识别
- 使用位置：`public/ocr/`
- 用途：仅在浏览器本地识别用户自行选择的装备截图，不向服务器上传图片或识别结果
- 魔方模板：17 种 Harmony Cube 图标参考自 [Loot & Waifus - Harmony Cube Stats](https://lootandwaifus.com/nikke-harmony-cube-stats/)，本地化保存于 `public/ocr/cube-icons/`，仅用于练度截图中的图标匹配

上述游戏界面、美术和文字素材的权利归 SHIFT UP 及相关权利人所有，不包含在本项目 GPL-3.0-or-later 代码许可的授权范围内。

## 国服独占角色头像

- 素材：国服角色“画皮”和“婴宁”的官方角色图
- 来源：用户提供的《胜利女神：新的希望》官方角色素材；角色资料可参见官方社区发布的[画皮介绍](https://www.taptap.cn/moment/736536122837962341)与[婴宁战斗演示](https://www.bilibili.com/video/BV17hCTBxE6L/)
- 原图位置：`public/images/characters/cn-exclusive-huapi.png`、`cn-exclusive-yingning.png`
- 使用位置：同目录下 `cn-exclusive-huapi-thumb.png`、`cn-exclusive-yingning-thumb.png`
- 处理：仅进行固定比例裁切和高质量缩放，用于图鉴卡片、角色详情及 Excel 头像

上述角色美术、名称和相关商标的权利归 SHIFT UP、Tencent 及相关权利人所有，不包含在本项目 GPL-3.0-or-later 代码许可的授权范围内。

## 国服独占角色默认全身立绘（2026-08-31）

- 画皮：用户下载的 [The Spriters Resource · Huapi](https://www.spriters-resource.com/pc_computer/goddessofvictorynikke/asset/595578/) ZIP，提交者 Redtarp；使用 `Huapi/Standing/Idle/Idle (Default).png`，原图 `1378 × 2276`，包内模型标识 `c8005_00`。
- 婴宁：用户下载的 [The Spriters Resource · Ying Ning](https://www.spriters-resource.com/pc_computer/goddessofvictorynikke/asset/551050/) ZIP，提交者 Redtarp；使用 `Ying Ning/Standing/Idle/Idle (Default).png`，原图 `1298 × 1982`，包内模型标识 `c8004_00`。
- 输出：`public/ui-assets/nikke/character-artwork/cn-exclusive-huapi.webp`（268,614 字节）、`cn-exclusive-yingning.webp`（364,986 字节）。完整 PNG 等比缩至 `1536 × 1536` 透明内画布，四周加 32px 透明边距，输出 `1600 × 1600` WebP（质量 92，透明通道质量 100）；不裁切、不拉伸、不补画、不重新渲染 Live2D。
- 溯源：同目录 `china-exclusive-sources.json` 保存 ZIP 名称、包内路径、原图与输出尺寸、大小及 SHA-256。复现时仅提取上述两个条目，分别命名为 `huapi-default.png`、`yingning-default.png`，执行 `node scripts/prepare-china-exclusive-artwork.mjs --input-dir=原图目录 --output-dir=暂存目录`；核验后才导入正式素材。
- 范围：两个包仅核实默认服装 `00`，其余站姿是表情差分，不作为皮肤。继续使用原来的稳定国服角色 ID，包内模型编号只作来源记录，不冒用 Blablalink 资源 ID。头像与旧 PNG 原件保留。
- 本地目录计数：标准角色目录现为 609 项，另加 2 个国服独占默认背景，正式可选背景合计 611 项；国服独占项通过 `manifest.json` 的 `chinaExclusiveDefaults` 和角色 `artwork_url` 引用，不受标准目录重新同步影响。

上述游戏美术权利属于 SHIFT UP、Tencent 及相关权利人，不属于项目 GPL 代码授权。资源站公开下载与包内 README 不构成商业使用或再分发授权；本次只用于用户要求的本地插件验收，未发布 ZIP／GitHub，后续外部分发仍须单独核对授权。

## 2026-09-10 露菲技能动画素材核对

露菲奢侈兔 `lobby_burst_c200_01` 使用素材库已晋级的 native 1.2.4 成果。该版本按当前粒子渲染器的 Apply Active Color Space 设置，在进入线性合成前转换粒子颜色，修复背景偏灰；保留 5.600 秒选帧、全部原生固定粒子层，三帧人物层 SHA 与修复前一致。正式 PNG 与派生 WebP 的摘要分别记录在 `character-artwork/extracted-sources.json`，来源仍为 `NIKKE_files/output/lobby_burst_static/c200_01`。动态粒子、完整后处理及游戏同帧截图逐像素对齐仍不在本次修复的验证范围内。

露菲默认 `lobby_burst_c200_00` 已核对精确骨架的 idle 动画：睁眼附件从循环起点被隐藏，25 个采样点均保持闭眼笑表情，因此保留原图。本次仅本地交付，不更新已发布 ZIP 或 GitHub。

## 2026-09-10 爱丽丝与麦斯威尔画面确认

用户查看并明确批准爱丽丝·童话幻梦 `lobby_burst_c191_02` 的 8.200 秒画面与麦斯威尔默认 `lobby_burst_c102_00` 的 2.967 秒画面，授权替换正式素材。两项使用素材库 native 1.2.5 的来源绑定旋转配方，恢复主体可见；规则仅适用于已确认的当前场景与渲染对象，不作为其他角色的通用旋转算法。

正式合成 PNG 与用户确认图逐字节一致，经素材库复核、正式晋级后转换为完整画布 WebP；输入、批准配方及 PNG/WebP 摘要记录在素材库 manifest 和 `character-artwork/extracted-sources.json`。用户批准证明这两张画面满足本次交付要求，不代表已验证 Unity 原生 billboard 旋转实现或整场景逐像素游戏一致。两项素材选项 ID 不变，保留已有角色卡构图设置。本次仅同步源码和本地验收目录。

## 本地 NIKKE UI 素材库

2026-09-06：角色卡 R／SR／SSR 改为素材库正式 `output/character_card_ui` 中逐图复核的原始 Sprite，路径为 `public/ui-assets/nikke/metadata/rarity/`。用 `scripts/sync-character-card-ui.mjs` 接入、`--check` 校验；随附 `extracted-sources.json` 记录主 Bundle 与图集依赖 SHA、PathID、原 PNG SHA 和复核证据。原截图 SSR 文件已删除；其他截图或 Wiki 素材尚未全量替换。只用于本地验收，不意味着获得美术再分发许可。

- 素材：企业、职业、代码属性、武器类型、爆裂阶段、装备部位、常用属性、OVERLOAD 装备图标和角色卡身份标识
- 使用位置：`public/ui-assets/nikke/`
- 清单：`public/ui-assets/nikke/manifest.json`
- 详细来源与使用约束：`public/ui-assets/nikke/SOURCES.md`
- 在线索引：[NIKKE International Wiki Icons](https://nikke-goddess-of-victory-international.fandom.com/wiki/Category:Icons)、[Code Chips](https://nikke-goddess-of-victory-international.fandom.com/wiki/Code_Chips)、[Mi2O-nikke/Nikke-db](https://github.com/Mi2O-nikke/Nikke-db)
- 获取日期：基础 UI 图标为 2026-08-27，OVERLOAD 装备原图为 2026-08-28；所有在线素材均已本地化，产品运行时不会热链第三方站点

2026-09-07：`equipment/overload/` 的 12 张 `128 × 128` 透明 PNG 已替换为素材库正式 `output/character_card_ui_equipment` 原图，对应当前 dp 装备图集的 `icn_equipment_<部位>_<职业>_t9_3`。`V Matter`、`Pattern 99`、`Code XXX` 各四个部位，国服“v金属”仍对应 `V Matter`，不是 `Rare Metallic`。`equipment/overload-badge.png` 由正式 `overload-frame/glyph/stroke` 三组原图组合：保留原生边缘、阴影和透明度，紫色及等比组合尺寸是明确声明的 Workshop 显示配方，不宣称完整游戏运行时材质还原。原图和前端派生 SHA 分开保存在 `equipment/extracted-sources.json`，更新与校验用 `node scripts/sync-character-equipment.mjs [--check]`。旧截图徽章文件已删除。OCR 图标独立留在 `public/ocr/equipment-icons/`，本次未改变。游戏素材的权利归 SHIFT UP、Level Infinite 及相关权利人，不属于 GPL 代码许可；仅完成本地验收不表示已取得再分发许可。

旧 SSR、单星、核心外框与改造徽章截图源已按用户授权删除；相应角色卡只引用当前原生交付素材。R／SR 收藏品现按武器读取素材库原生的六种透明指挥官玩偶：AR=`Cooking`、SMG=`Coffee`、MG=`Shopping`、SG=`Battling`、SR=`Napping`、RL=`Exercising`；详细文件和来源链接见 `public/ui-assets/nikke/SOURCES.md`。SSR 收藏品作为角色专属珍藏品，优先读取角色目录中的 `favorite-item` 素材，缺失时才回退到武器玩偶；收藏品文字与三星等级条由组件动态生成，不烘焙角色数据。标准角色、皮肤立绘、珍藏品背景与角色技能动画静态图只允许从独立素材工作区 `NIKKE_files/output` 的当前包体已晋级成果导入，不再访问游戏原目录、网页或 Live2D 可视化器截图。`scripts/sync-character-artwork.mjs` 会核对 `com.shiftup.patch` CDB 虚拟来源、资源键与 Bundle 哈希、当前渲染契约、输出 SHA-256 和逐图复核证据；任一项缺失时整次同步在写入前失败，不保留旧素材冒充当前来源。透明人物图等比居中压缩为 `1600 × 1600` WebP，技能动画保持素材库 `1105 × 1300` 正式构图并转换为 WebP；`character-artwork/extracted-sources.json` 保存可移植的派生关系。当前覆盖数量以素材库来源审计和该 JSON 为准，不把历史批次数量写成长期事实。插件不包含或分发 Spine Runtime、骨骼或纹理图集。

珍藏品入口物件与人物背景为两套独立素材：`character-card/favorite-items/` 当前收录 21 件素材库原生物件 PNG，按角色资源 ID 命名；海伦 `c352.png` 对应原生 `mi_favoriteitem_c352_00`。人物珍藏品画面继续存放在 `character-artwork/favorite_c{resource}.webp`，不得作为入口物件缩略图使用。完整角色映射与缺失回退规则见 `public/ui-assets/nikke/SOURCES.md`。

## 皇冠静态技能背景（2026-08-30）

皇冠新增两张独立静态背景：`skill_c330_00.webp`（默认服装，499,046 字节）和 `skill_c330_01.webp`（国王的新衣，325,652 字节）。原件分别来自 [The Spriters Resource · Crown Burst](https://www.spriters-resource.com/pc_computer/goddessofvictorynikke/asset/592557/) 与 [Crown — Naked King Burst](https://www.spriters-resource.com/pc_computer/goddessofvictorynikke/asset/592923/)。用户已核对动画与静态样例；从 Spine 4.1.20 的 `idle` 动画 5% 位置离线渲染为 1600×1600 透明 WebP（质量 94），不从低清视频放大、不补画原素材缺失的身体或独立场景。插件仅携带两张 WebP，不携带视频、骨骼、图集或 Spine Runtime。

下拉项为“技能背景 · 默认服装”和“技能背景 · 国王的新衣”，ID 分别为 `skill-default`、`skill-skin-1`，追加于原有三套立绘之后；不替换普通皮肤、不受 SSR 珍藏品门槛限制，构图按背景独立保存。同步器使用显式人工核验清单保护这两张图，`--force` 不重新渲染或覆盖。SHA-256 固定在 `scripts/character-skill-backgrounds.mjs` 并由测试核验。

游戏美术权利属于原权利人；资源站可下载不代表取得额外商业再分发授权。此次仅按用户要求接入本地插件验收，未执行 ZIP 或 GitHub 发布，外部分发仍须单独核对素材授权。
