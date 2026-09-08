# OCR 优化记录（1.0.10，2026-09-07）

本轮目标是识别与导入安全、失败恢复、局部字段和重复工作优化，不包含非 T10 装备支持。不更新 ZIP 或 GitHub，不删除旧文件。

## 修改文件与用途

| 文件 | 本轮用途 |
| --- | --- |
| src/domain/equipmentScreenshotOcr.js | 拒绝短词／含混词条；校验词条类型、档位和锁定；保留未识别的原有物理行 |
| src/domain/trainingOcrFieldContract.js | 保留原始置信度；严格数值格式和范围 |
| src/domain/trainingScreenshotOcr.js | 独立字段路由、排除字段、收藏品星级观测与精确等级分离 |
| src/domain/screenshotOcrReview.js | 新增人工编辑校验、跨图冲突、整批重复部位校验及原值映射 |
| src/domain/trainingOcrCore.js | 技能徽章与大图标区分、两技能局部布局、局部锚点、小尺寸魔方定位 |
| src/domain/trainingOcrDigits.js | 新增保守数字笔画分类，不以数值范围冒充识别证据 |
| src/domain/trainingOcrFields/limitBreak.js | 模糊核心数字回退 OCR，零突破无证据时待确认 |
| src/domain/trainingOcrFields/skillLevelShared.js | 技能数字 OCR 回退，各技能独立返回结果 |
| src/domain/localCharacterRoster.js | 保存与传递收藏品星级观测，兼容已有记录 |
| src/domain/characterCard.js | 将星级观测传递给角色卡 |
| src/services/ocrTask.js | 新增逐图失败隔离、超时／取消、Worker 缓存与失败重试 |
| src/services/localScreenshotOcr.js | 未知类型不强制装备；共享解码、语言模型按需初始化；逐图回传、重试 |
| src/services/trainingScreenshotOcr.js | 共享图像、严格数字回退、取消检查、缓存空魔方结果 |
| src/services/equipmentValueTemplateMatcher.js | 失败模板缓存可重试 |
| src/components/management/ScreenshotOcrImportDialog.jsx | 逐图勾选、取消、重试、冲突拦截、保存忙碌与失败恢复、窄屏装备表单 |
| src/components/management/TrainingOcrResultCard.jsx | 新增逐字段编辑／勾选、原值对照与原始置信度展示 |
| src/components/management/CharacterGalleryTabContent.jsx | 移除打开图鉴就预热中文模型的开销 |
| src/components/management/CharacterCard.jsx | 精确等级未知时显示有来源的星级观测 |
| tests/ocr-hardening.test.mjs | 新增 10 项数值、排除、冲突、星级、局部技能、失败、取消与缓存回归 |
| tests/training-screenshot-ocr.test.mjs | 更新独立字段／星级语义及全图魔方定位测试 |
| tests/ocr-review-smoke.html | 隔离 UI 验收夹具，无账号数据或网络识别服务 |
| MODIFICATIONS.md | 版本内增量说明 |
| E:/NIKKE_workshop/skills/roadmap.md | 保留本轮尚未解决的 OCR 校准任务，不改变优先级 |

临时验收脚本在 `.tmp/ocr-smoke.cjs`、`.tmp/ocr-acceptance.cjs`，交付校验复用 `.tmp/deliver-breakthrough.ps1`；它们不是插件运行时依赖。用户截图未修改、未上传，测试使用独立 Edge 配置和合成存储。

## 实际验证

- Lint、295 项自动测试、生产构建、差异空白检查通过。构建仍有既有大分块警告。
- UI：逐图损坏不影响后图；同角色不同等级阻止保存；排除冲突图后可保存；模拟保存失败后原结果保留并成功重试；390px 窄屏无页面横向溢出。
- 灰姑娘 PC 技能图：等级 616、好感 40、战斗力 409238、职业 202、企业 186、技能 10/10/10。
- 灰姑娘 PC 魔方图：战术巨熊魔方、等级 15；没有误填技能字段。
- 红莲·暗影图：等级 431、好感 10、战斗力 186293、职业 136、企业 118、技能 10/10/10。
- 灰姑娘 T10 白色弹窗仍走装备分支；完整技能面板裁切定位 10/10/10，仅两个左侧技能的裁切定位 10/10/未知。
- 本地验收目录实际加载为 1.0.10 扩展，在隔离配置内识别灰姑娘两张实图并保存；存储核对等级、战斗力、好感、技能、魔方 15 级及收藏品星级观测通过，页面无脚本错误。
- 源码构建同步到 `E:/NIKKE_workshop/线上版/NIKKE-Workshop`，逐文件 SHA256 核对；未同步 ZIP／GitHub。

## 不宣称解决的范围

- 灰姑娘核心 03 的 OCR 返回低置信数字，暂待人工填写；未直接恢复旧版“按宽高猜 3”的规则。
- 无黄色星不能区分零突破与缺失／遮挡，暂待确认，不自动写零。
- 技能 1～9 有严格数字与字段回退测试，但缺乏足够不同等级真实样本，不能用全 10 样本宣称全覆盖。
- 缺少 SSR／核心锚点的战斗力、职业／企业等级，以及单个技能徽章身份，仍可能需要补图；不会猜测缺失字段。
- 本轮未将全部像素运算搬到后台 Worker，也未声称所有分辨率或任意裁切均可识别。
