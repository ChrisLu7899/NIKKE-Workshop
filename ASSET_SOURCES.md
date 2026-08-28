# 素材来源说明

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

上述游戏界面、美术和文字素材的权利归 SHIFT UP 及相关权利人所有，不包含在本项目 GPL-3.0-or-later 代码许可的授权范围内。

## 国服独占角色头像

- 素材：国服角色“画皮”和“婴宁”的官方角色图
- 来源：用户提供的《胜利女神：新的希望》官方角色素材；角色资料可参见官方社区发布的[画皮介绍](https://www.taptap.cn/moment/736536122837962341)与[婴宁战斗演示](https://www.bilibili.com/video/BV17hCTBxE6L/)
- 原图位置：`public/images/characters/cn-exclusive-huapi.png`、`cn-exclusive-yingning.png`
- 使用位置：同目录下 `cn-exclusive-huapi-thumb.png`、`cn-exclusive-yingning-thumb.png`
- 处理：仅进行固定比例裁切和高质量缩放，用于图鉴卡片、角色详情及 Excel 头像

上述角色美术、名称和相关商标的权利归 SHIFT UP、Tencent 及相关权利人所有，不包含在本项目 GPL-3.0-or-later 代码许可的授权范围内。

## 本地 NIKKE UI 素材库

- 素材：企业、职业、代码属性、武器类型、爆裂阶段、装备部位、常用属性、OVERLOAD 装备图标和角色卡身份标识
- 使用位置：`public/ui-assets/nikke/`
- 清单：`public/ui-assets/nikke/manifest.json`
- 详细来源与使用约束：`public/ui-assets/nikke/SOURCES.md`
- 在线索引：[NIKKE International Wiki Icons](https://nikke-goddess-of-victory-international.fandom.com/wiki/Category:Icons)、[Code Chips](https://nikke-goddess-of-victory-international.fandom.com/wiki/Code_Chips)、[Mi2O-nikke/Nikke-db](https://github.com/Mi2O-nikke/Nikke-db)
- 获取日期：基础 UI 图标为 2026-08-27，OVERLOAD 装备原图为 2026-08-28；所有在线素材均已本地化，产品运行时不会热链第三方站点

`equipment/overload/` 使用 NIKKE International Wiki 收录的 12 张原始 `128 × 128` 透明 PNG：`V Matter`、`Pattern 99` 和 `Code XXX` 各四个部位。国服“v金属”对应 `V Matter`，不是 `Rare Metallic`。OCR 装备图标继续独立保留在 `public/ocr/equipment-icons/`，展示组件不依赖识别模板。相关游戏界面、美术、名称和商标的权利归 SHIFT UP、Level Infinite 及相关权利人所有，不包含在本项目 GPL-3.0-or-later 代码许可的授权范围内。

`character-card/` 中的 SSR、单星、核心突破外框和 OVERLOAD 徽章裁切源来自用户提供的游戏内 UI 截图，经校正后用于本地角色卡。标准角色与皮肤立绘使用 [NIKKE DB Live2D Visualiser](https://nikke-db.pages.dev/visualiser) 的透明截图功能批量导出，并压缩为 `1600 × 1600` 本地 WebP；当前覆盖 Blablalink 目录中的 199 个角色和 178 套正式皮肤，共 377 套可选立绘。NIKKE DB 清单中的 7 个无本地化名称技术变体会在同步时排除，不进入皮肤下拉框。`scripts/sync-character-artwork.mjs` 负责增量同步与生成静态索引；插件不包含或分发 Spine Runtime，也不在运行时热链立绘。
