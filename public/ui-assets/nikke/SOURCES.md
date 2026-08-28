# NIKKE UI 素材库

本目录收录 NIKKE Workshop 界面可复用的本地游戏素材，涵盖角色元数据、角色卡身份标识、角色立绘、装备部位、OVERLOAD 装备和常用属性。除未本地化的旧角色立绘外，角色卡运行时只读取本地 UI 素材，不热链第三方图标。

## 目录与用途

- `metadata/manufacturer/`：5 个企业图标。
- `metadata/class/`：3 个职业图标。
- `metadata/element/`：5 个代码属性图标。
- `metadata/weapon/`：6 个武器类型图标。
- `metadata/burst/`：4 个爆裂阶段图标。
- `character-card/`：SSR、单颗实心／空心星、核心突破外框和 OVERLOAD 徽章裁切源。
- `character-artwork/`：NIKKE DB 可视化器导出的透明全身立绘；当前覆盖 Blablalink 目录中的 199 个角色及其 NIKKE DB 已收录正式皮肤，共 377 套可选本地 WebP，并附带 `catalog.json`。NIKKE DB 清单中的 7 个无本地化名称技术变体会在同步时排除，不进入皮肤下拉框。
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

`equipment/overload/` 使用 Wiki 收录的游戏原始 `128 × 128` 透明 PNG，不再复制 OCR 截图裁片。固定映射如下：

| 本地键 | 头部 | 身躯 | 臂部 | 腿部 |
| --- | --- | --- | --- | --- |
| `vmetal` | V Matter Visor | V Matter Vest | V Matter Armguard | V Matter Boots |
| `99` | Pattern 99 Helmet | Pattern 99 Gear | Pattern 99 Gauntlets | Pattern 99 Gaiters |
| `code` | Code XXX Goggles | Code XXX Jacket | Code XXX Gloves | Code XXX Shoes |

国服“v金属”对应英文 `V Matter`，不能映射为 `Rare Metallic`。OCR 原件继续保留在 `public/ocr/equipment-icons/`，UI 不直接依赖 OCR 目录。

`character-card/` 中的身份与改造标识由用户提供的游戏内界面截图裁切、校正并保留透明安全边距，仅用于还原本地角色卡 UI。它们不包含动态角色数据；星级、核心数字和装备词条仍由组件按本地数据生成。

`character-artwork/` 中的 WebP 来自 [NIKKE DB Live2D Visualiser](https://nikke-db.pages.dev/visualiser) 的透明截图导出功能，原始 Spine 数据由 NIKKE DB 提供。`npm run sync:character-artwork` 会将当前 Blablalink 角色目录与 NIKKE DB 的 L2D 清单求交集，增量导出 `1600 × 1600` 透明画布并生成本地角色／皮肤索引。导出文件只保留角色静态全身画面并压缩为带透明通道的 WebP；插件不包含 Spine Runtime，也不会在运行时下载 `.skel`、`.atlas` 或纹理图集。

## 使用规则

1. 通过 `manifest.json`、`character-artwork/catalog.json` 和 `/ui-assets/nikke/` 基础路径引用，不在组件中散落远程图标 URL。角色卡只使用本地透明全身图；全身图不可用时显示中性占位，不允许退回并放大 128×128 头像。
2. 保留原始透明边距和宽高比；视觉尺寸通过固定容器、`object-fit: contain` 和独立的 optical-size 参数统一，不直接裁坏原图。
3. 企业、职业和武器中存在白色单色图标，应放在有对比度的表面上，或作为 CSS mask 使用；不要为单一页面覆盖源文件。
4. 新增、替换或删除素材时，同时更新本文件、`manifest.json` 和仓库根目录的 `ASSET_SOURCES.md`。
5. 游戏美术、名称和商标归 SHIFT UP、Level Infinite 及相关权利人所有，不包含在本项目 GPL-3.0-or-later 代码许可的授权范围内。

本项目是非官方玩家工具；Wiki 与 GitHub 仓库仅作为素材索引及核对来源，不代表其作者为本项目背书。
