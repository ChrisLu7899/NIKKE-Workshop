# NIKKE UI 素材库

## 2026-09-07 普通装备

`equipment/standard` 的 60 张原始 PNG 来自正式 `character_card_ui_equipment-standard`。`equipment/catalog.json` 按官方 ID/部位/职业/阶级关联 72 个资源（其中 12 张复用 `equipment/overload`），供角色卡与未来 OCR 使用；共享外观不能唯一确定阶级。来源及复核摘要见 `equipment/standard-sources.json`；更新与只读核验：`node scripts/sync-equipment-catalog.mjs [--check]`。不包含账号响应或原始缓存路径。

## 2026-09-07 魔方、收藏品物件与角色技能图标

当前三类统一来自素材库正式 `output/character_card_objects`，不是下文历史 Wiki 图片。17种魔方、6种玩偶、21个珍藏品物件及200个角色的238张去重技能图标，共282张 PNG，全部保留原始像素、尺寸和 Alpha。原图与输出摘要、实际 Bundle/CAB/PathID 和逐图复核证据见 `objects/extracted-sources.json`；更新与校验用 `scripts/sync-character-objects.mjs [--dry-run|--check]`。魔方显示从独立 `cubes/` 读取，不改 OCR 模板。下文各批次“尚未替换”仅描述当时范围，不是当前缺项。

## 2026-09-07 好感度与等级装饰

`metadata/decorations` 来自素材库已晋级 CharacterDetail2 的 heart、affection-border、circle、skill-ring 四项。脚本 `scripts/sync-character-decorations.mjs` 保留原图 Alpha，独立记录改色、九宫格与圆形叠层配方；数字由 JSX 输出，不烘焙到图中。`extracted-sources.json` 包含源/复核/派生哈希，`manifest.json` 的 decorations 和源码映射一同生成。`--check` 重新派生并比对，不写文件。技能和魔方共用等级徽章；角色专属技能 glyph、17 种魔方物件图尚未在本批替换。

## 2026-09-06 五类公共图标替换

角色卡与装备上的职业小徽章现在使用 `metadata/native/`：4 个爆裂阶段、5 个属性、6 个武器、3 个职业、5 个企业。符号来自素材库正式分组 `character_card_ui_burst/element/weapon/class/manufacturer`，另有 `character_card_ui_frames` 的暗色六边形。企业为 `icn_corp_01～05` 小徽记，不是全称 Logo；全部阶段用 `icn_burst_all`。

武器/职业/企业 PNG 与原图字节一致；爆裂/属性是插件显示派生图，组合原生底框与 glyph、等比缩放并沿用既有属性配色，没有截图裁切和 AI 补画。图集已裁掉的透明部分不凭空补画，底框现有边距与阴影保留，通过显示尺寸适配统一轮廓。角色等级不写入图标。

更新/校验：`node scripts/sync-character-metadata.mjs [--check]`。`metadata/native/extracted-sources.json` 记录各组正式来源、复核哈希、派生配方、生产脚本指纹与输出哈希；公共 manifest 与源码白名单同时生成。缺失或未知元数据不猜文件名。旧 Wiki 公共图标已按用户授权删除，角色卡仅引用新版，其他未处理的界面或素材不自动改来源。本轮不更新 ZIP/GitHub。

## 2026-09-06 突破与核心原图替换

`metadata/breakthrough/star-filled.png`、`star-empty.png`、`core-frame.png` 来自素材库正式 `output/character_card_ui_breakthrough`。原始 Sprite 为 `ele_upgrade_S_on/off`（91×90）和 `ele_coreupgrade_bg_S`（107×107）；完整透明图，不缩放文件、不裁截图、不重绘空星。核心底图不含数字，组件按账号数据叠加 01～06/MAX。主 HD 对象实际引用 SD 命名 class 图集，必须按 CAB 引用解析，不能按 HD/SD 名称猜依赖。

来源和像素复核见 `metadata/breakthrough/extracted-sources.json`；更新：`node scripts/sync-character-card-ui.mjs --group=breakthrough`，只读校验另加 `--check`。旧截图星级和 core-frame.webp 已删除，当前角色卡和 manifest 只引用原生素材。

## 2026-09-06 稀有度原图替换

角色卡当前使用 `metadata/rarity/r.png`、`sr.png`、`ssr.png`，来自素材库正式 `output/character_card_ui`。分别对应 `ele_grade_icon_001/002/003`，保持原始透明 PNG 和宽高比，不再显示截图裁片。`metadata/rarity/extracted-sources.json` 保存主 Bundle、SpriteAtlas 依赖、对象 PathID、Sprite 元数据、源/输出及复核哈希。

更新：`node scripts/sync-character-card-ui.mjs`；只读检查：同命令加 `--check`。只接收已晋级、逐项复核的三图，不扫描游戏、cache 或 work。原截图 SSR 文件已删除；下文关于截图 SSR 的记录仅为历史来源，突破/核心的当前来源见上节。游戏美术不属于项目 GPL 代码许可，解包不产生再分发授权。

## 当前素材导入契约

`character-artwork` 只接受 `NIKKE_files/output` 中与当前 `com.shiftup.patch` 包体绑定、已经显式晋级的成果。普通立绘、珍藏品背景和技能动画分别核对当前 CDB 虚拟来源、资源键与 Bundle 哈希、渲染契约、输出 SHA-256 和逐图复核证据；任一条件不满足时，同步会在写入前失败。历史 `0.4.0` 快照、`user_accepted_candidate`、旧 `naps` 来源和仅凭总览通过的结果均不再是有效输入。

技能动画接受已发布的 `native_version=1.1.0/1.2.0`，画布均为 `1105 × 1300`，每项必须绑定当前包体与确切像素的复核证据。2026-09-06 将丽塔默认及普丽瓦蒂「严厉教诲」替换为 1.2.0 修正成果：分别修复眉眼上方的透明孔洞和特效合成的粗色阶；丽塔背景硬边仍作为已知限制保留。其他图保留原已验收版本。实际导入数量与逐项版本以 `character-artwork/extracted-sources.json` 和同步脚本检查结果为准。

本目录收录 NIKKE Workshop 界面可复用的本地游戏素材，涵盖角色元数据、角色卡身份标识、角色立绘、装备部位、OVERLOAD 装备和常用属性。除未本地化的旧角色立绘外，角色卡运行时只读取本地 UI 素材，不热链第三方图标。

## 目录与用途

- `metadata/native/manufacturer/`：5 个企业图标。
- `metadata/native/class/`：3 个职业图标。
- `metadata/native/element/`：5 个代码属性图标。
- `metadata/native/weapon/`：6 个武器类型图标。
- `metadata/native/burst/`：4 个爆裂阶段图标。
- `character-card/`：六种通用收藏品玩偶及 `favorite-items/` 中的角色专属珍藏品物件。身份、等级装饰在 `metadata/` 的正式分组，改造徽章在 `equipment/`；旧截图文件已删除。
- `character-artwork/`：常规立绘、珍藏品背景和角色技能动画静态图由 `NIKKE_files/output` 的当前包体正式成果生成，并附带运行目录 `catalog.json` 与派生关系 `extracted-sources.json`。目录中的既有 WebP 可能是上一批运行文件；只有重新通过 `npm run check:character-artwork` 的项目才算当前来源。区域服装和独立来源图必须有自己的允许清单与来源记录，不得冒充解包成果。
- `skill-icons/`：角色卡本地技能 glyph；原始 PNG 尺寸和透明度保留，不再强制 128×128。`generic/` 为技能 1/2 去重符号，`burst/` 为精确 cNNN 专属爆裂图；当前角色映射由 `catalog.json` 与源码 `characterSkillIconCatalog.json` 共同记录。
- `equipment/slots/`：头部、身躯、臂部、腿部图标。
- `equipment/overload/`：12 种固定 OVERLOAD 装备图标。
- `stats/`：攻击、防御、体力、装弹和换弹图标。
- `manifest.json`：界面代码使用的稳定键名与相对路径映射。

## 来源

2026-08-27 通过 NIKKE International Wiki 的 MediaWiki API 获取原始 PNG，不在产品运行时访问 Wiki：

- [Icons 分类](https://nikke-goddess-of-victory-international.fandom.com/wiki/Category:Icons)：企业、职业、武器、爆裂、装备部位和属性图标。
- [Item icons 分类](https://nikke-goddess-of-victory-international.fandom.com/wiki/Category:Item_icons)：OVERLOAD 装备原始图标及物品图标索引。
- [Code Chips](https://nikke-goddess-of-victory-international.fandom.com/wiki/Code_Chips)：H.S.T.A.、P.S.I.D.、A.N.M.I.、Z.E.U.S.、D.M.T.R. 与火、水、风、电、铁的对应关系。
- [Mi2O-nikke/Nikke-db](https://github.com/Mi2O-nikke/Nikke-db)：用于核对企业、职业和武器分类命名及文件组织。

2026-09-07：`equipment/overload/` 已替换为素材库正式 `character_card_ui_equipment` 原图，来自当前 dp 装备图集的 `icn_equipment_<部位>_<职业>_t9_3`，保持 `128 × 128` 透明 PNG 字节。固定映射如下：

| 本地键 | 头部 | 身躯 | 臂部 | 腿部 |
| --- | --- | --- | --- | --- |
| `vmetal` | V Matter Visor | V Matter Vest | V Matter Armguard | V Matter Boots |
| `99` | Pattern 99 Helmet | Pattern 99 Gear | Pattern 99 Gauntlets | Pattern 99 Gaiters |
| `code` | Code XXX Goggles | Code XXX Jacket | Code XXX Gloves | Code XXX Shoes |

国服“v金属”对应英文 `V Matter`，不能映射为 `Rare Metallic`。OCR 原件继续保留在 `public/ocr/equipment-icons/`，UI 不直接依赖 OCR 目录。

`equipment/overload-badge.png` 使用三组正式原始 Sprite（`overload-frame/glyph/stroke`）组合；配方为 `scripts/sync-character-equipment.mjs`，`--check` 可独立重新生成比对。原图备份在 `equipment/native/`，完整输入和输出哈希在 `equipment/extracted-sources.json`。原生白底六边形按 Workshop 紫色染色，描边和核心符号保持白色；不是整张游戏界面截图或完整 Shader 复现。外围透明边距、阴影保留，CSS 不再裁切外圈。游戏底框带底部色带，与已确认布局不同，本轮不替换现有中性装备底框。

`character-card/` 中历史身份与改造截图文件已删除，角色卡只使用正式稀有度、突破和改造徽章素材。R／SR 玩偶已替换为当前包体的 `mi_favoriteitem_<武器>_00` 原始透明 PNG；下表 Wiki 链接只保留原型名称的历史索引，不再是当前图片输入。武器与稳定本地路径不变。

| 武器 | 本地文件 | 收藏品原型 |
| --- | --- | --- |
| AR | `collectible-ar-cooking.png` | [Cooking Commander Doll](https://nikke-goddess-of-victory-international.fandom.com/wiki/File:Item_Cooking_Commander_Doll.png) |
| SMG | `collectible-smg-coffee.png` | [Coffee Commander Doll](https://nikke-goddess-of-victory-international.fandom.com/wiki/File:Item_Coffee_Commander_Doll.png) |
| MG | `collectible-mg-shopping.png` | [Shopping Commander Doll](https://nikke-goddess-of-victory-international.fandom.com/wiki/File:Item_Shopping_Commander_Doll.png) |
| SG | `collectible-sg-battling.png` | [Battling Commander Doll](https://nikke-goddess-of-victory-international.fandom.com/wiki/File:Item_Battling_Commander_Doll.png) |
| SR | `collectible-sr-napping.png` | [Napping Commander Doll](https://nikke-goddess-of-victory-international.fandom.com/wiki/File:Item_Napping_Commander_Doll.png) |
| RL | `collectible-rl-exercising.png` | [Exercising Commander Doll](https://nikke-goddess-of-victory-international.fandom.com/wiki/File:Item_Exercising_Commander_Doll.png) |

SSR 收藏品视为角色专属珍藏品。左上入口只使用已晋级 `mi_favoriteitem_cNNN_00` 物件，与人物珍藏品背景分离。当前 21 件由 `objects/catalog.json` 与源 manifest 绑定，海伦 c352 为指南针；缺失时仍保留既有武器玩偶回退。星级、颜色与等级来自角色数据，不烘焙。

当前物件身份由 `objects/extracted-sources.json` 中的正式映射给出：在原有 17 件基础上新增 c140、c280、c411、c580，均按精确 Sprite 编号与当前角色目录交叉确认，不从名称或邻近编号猜测。人物珍藏品背景的解锁规则不变。

`character-artwork/` 不再从网页或 Live2D 可视化器截图。`npm run sync:character-artwork` 只读取相邻素材工作区的正式输出层：常规立绘读取 `output/static_art/<素材编号>/`，珍藏品背景读取 `output/treasure_backgrounds/<角色编号>/`，技能动画静态图读取 `output/lobby_burst_static/<角色与版本编号>/`。默认映射以源码 `src/data/characterArtworkCatalog.json` 为允许清单；多余 NPC、技术变体和未核验编号不会自动进入产品。透明人物图只做等比缩放、居中补边和 WebP 压缩；技能动画保持 `1105 × 1300` 正式构图转换为 WebP，不重新截图、拉伸或补画。三类 manifest 必须分别通过当前发布门禁，旧包体、旧渲染契约、缺少逐图证据或图片哈希不一致都会令整次同步在写入前失败。`--asset-library=` 可覆盖素材库位置，`--output-dir=` 可先输出到暂存目录。插件运行时只读取打包后的本地 WebP，不依赖素材库路径，也不包含 Spine Runtime、骨骼或纹理图集。

`skill-icons/` 由 `node scripts/sync-character-objects.mjs` 统一导入；`npm run sync:character-objects` 是统一入口，`npm run check:character-objects` 只读校验；旧 npm 命令仅直接指向同一脚本，不保留旧包装脚本。只读正式 `output/character_card_objects`，不再下载 Wiki/GameWith，不做阈值抠图、中央圆形裁切或重采样。200 角色、238 唯一技能 PNG 的当前来源与逐图 SHA 见 `objects/extracted-sources.json`；public 和源码技能映射同步生成。新增/改变的 icon 字段须核对公开 roledata 或当前游戏配置，再由素材库绑定源 Sprite，不能为了补齐空值套其他角色。

## 使用规则

1. 通过 `manifest.json`、`character-artwork/catalog.json` 和 `/ui-assets/nikke/` 基础路径引用，不在组件中散落远程图标 URL。角色卡只使用本地全身图或已验收的大厅背景；素材不可用时显示中性占位，不允许退回并放大 128×128 头像。
2. 保留原始透明边距和宽高比；视觉尺寸通过固定容器、`object-fit: contain` 和独立的 optical-size 参数统一，不直接裁坏原图。
3. 企业、职业和武器中存在白色单色图标，应放在有对比度的表面上，或作为 CSS mask 使用；不要为单一页面覆盖源文件。
4. 新增、替换或删除素材时，同时更新本文件、`manifest.json` 和仓库根目录的 `ASSET_SOURCES.md`。
5. 游戏美术、名称和商标归 SHIFT UP、Level Infinite 及相关权利人所有，不包含在本项目 GPL-3.0-or-later 代码许可的授权范围内。

本项目是非官方玩家工具；Wiki 与 GitHub 仓库仅作为素材索引及核对来源，不代表其作者为本项目背书。

## 国服独占默认立绘（2026-08-31）

画皮与婴宁使用用户下载的 The Spriters Resource 静态 PNG 原件，而非头像放大或 Live2D 截帧。来源分别为 [Huapi](https://www.spriters-resource.com/pc_computer/goddessofvictorynikke/asset/595578/) 与 [Ying Ning](https://www.spriters-resource.com/pc_computer/goddessofvictorynikke/asset/551050/)，提交者均为 Redtarp；包内路径为 `角色英文目录/Standing/Idle/Idle (Default).png`，原始尺寸分别为 `1378 × 2276` 和 `1298 × 1982`。只确认默认服装 `00`，表情差分不作为皮肤。

输出为 `character-artwork/cn-exclusive-huapi.webp`、`character-artwork/cn-exclusive-yingning.webp`，两者都是完整等比缩放、透明补边的 `1600 × 1600` WebP，未裁切／补画；新文件合计 633,600 字节。`china-exclusive-sources.json` 保存包名、来源模型、原图／输出哈希及转换参数，`scripts/prepare-china-exclusive-artwork.mjs` 可从提取后的两个默认 PNG 复现。旧头像与 PNG 原件保留。

标准角色 `catalog.json` 现为 609 项；这两个国服默认背景由清单 `chinaExclusiveDefaults` 及本地角色的 `artwork_url` 单独登记，正式选择合计 611 项。运行时仅请求插件内文件；不得填造国际服资源 ID 或将国服表情图自动扩展成皮肤选项。

权利属于游戏原权利人，不属于 GPL 代码许可；公开可下载不等于取得商业或再分发授权。本次仅接入本地验收目录，外部分发前单独核对授权；详情见仓库根目录 `ASSET_SOURCES.md`。

## 皇冠静态技能背景（2026-08-30）

皇冠新增两张独立静态背景：`skill_c330_00.webp`（默认服装，499,046 字节）和 `skill_c330_01.webp`（国王的新衣，325,652 字节）。原件分别来自 [The Spriters Resource · Crown Burst](https://www.spriters-resource.com/pc_computer/goddessofvictorynikke/asset/592557/) 与 [Crown — Naked King Burst](https://www.spriters-resource.com/pc_computer/goddessofvictorynikke/asset/592923/)。用户已核对动画与静态样例；从 Spine 4.1.20 的 `idle` 动画 5% 位置离线渲染为 1600×1600 透明 WebP（质量 94），不从低清视频放大、不补画原素材缺失的身体或独立场景。插件仅携带两张 WebP，不携带视频、骨骼、图集或 Spine Runtime。

下拉项为“技能背景 · 默认服装”和“技能背景 · 国王的新衣”，ID 分别为 `skill-default`、`skill-skin-1`，追加于原有三套立绘之后；不替换普通皮肤、不受 SSR 珍藏品门槛限制，构图按背景独立保存。同步器使用显式人工核验清单保护这两张图，`--force` 不重新渲染或覆盖。SHA-256 固定在 `scripts/character-skill-backgrounds.mjs` 并由测试核验。

游戏美术权利属于原权利人；资源站可下载不代表取得额外商业再分发授权。此次仅按用户要求接入本地插件验收，未执行 ZIP 或 GitHub 发布，外部分发仍须单独核对素材授权。
