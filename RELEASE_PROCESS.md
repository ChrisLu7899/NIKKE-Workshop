# NIKKE Workshop 标准发布流程

本流程用于发布或重新发布 NIKKE Workshop，覆盖源码、版本号、README、图文指南、构建、压缩包、Git 标签和 GitHub Release。默认在 Windows PowerShell 中执行。

## 1. 发布原则

- `package.json` 是程序版本号的主来源。
- `scripts/sync-version.mjs` 会把版本同步到 `public/manifest.json`。
- README、修改说明和图文指南中的可见版本号必须人工同步。
- Git 标签必须指向包含本次全部代码和文档的最终提交。
- Release 安装包必须从全新 `dist/` 构建，ZIP 根目录必须直接包含 `manifest.json`。
- GitHub 自动生成的 Source code 压缩包不能替代可安装的 `NIKKE-Workshop.zip`。
- 发布后必须从 GitHub 重新下载附件并复核哈希和 Manifest，不能只检查本地文件。
- 不得将账号、密码、Cookie、完整日志、未脱敏截图或 GitHub 令牌提交进仓库或打包上传。

## 2. 发布前准备

设置本次路径与版本；不要复用 `$HOME` 等系统变量：

```powershell
$workshopRepo = "C:\Users\Lucifer\Desktop\NIKKE\线上版\NIKKE-Workshop-source"
$workshopReleaseRoot = "C:\Users\Lucifer\Desktop\NIKKE\线上版"
$workshopVersion = "1.0.5"
Set-Location -LiteralPath $workshopRepo
```

检查工作区、远端和运行环境：

```powershell
git status --short
git fetch origin
git log --oneline --left-right HEAD...origin/main
node --version
npm --version
```

要求：

- 没有不明来源的未提交修改。
- 本地主分支没有落后或意外分叉。
- Node.js 版本符合 `.nvmrc`。
- 本次功能已经在浏览器中手动验收。

## 3. 版本和文档检查

发布新版本前统一检查：

- `package.json` 和 `package-lock.json` 根版本。
- `public/manifest.json` 的 `version`、`version_name` 和 `description`。
- `README.md` 的“当前版本”、功能列表、安装和首次使用说明。
- `MODIFICATIONS.md` 的“当前项目版本”和主要差异。
- `PRODUCT.md` 是否仍描述已经删除的功能。
- `docs/guide/index.html` 的“适用版本”和安装成功提示。
- 本地操作指南副本是否与 `docs/guide/index.html` 一致。
- Release 更新内容是否覆盖自上一个标签以来的全部用户可见变化。

查找旧版本号时要排除 `node_modules`、`dist` 和依赖自身的版本字段。

文档应先单独提交，因为 `npm version` 的发布脚本要求工作区干净：

```powershell
git add README.md MODIFICATIONS.md PRODUCT.md docs/guide/index.html
git commit -m "docs: prepare v$workshopVersion release"
```

## 4. 新版本升级

仅在发布一个尚不存在的新版本时执行：

```powershell
npm version $workshopVersion
```

项目脚本会自动：

1. 检查工作区干净且标签不存在。
2. 运行 ESLint 和完整自动化测试。
3. 更新 `package.json`、`package-lock.json` 和 `public/manifest.json`。
4. 创建版本提交和带说明的 `vX.Y.Z` 标签。

执行后检查：

```powershell
git status --short
git log -3 --oneline --decorate
git show "v$workshopVersion`:public/manifest.json"
```

## 5. 同版本重新发布

只有明确需要修订同一个版本时使用。不要再次运行 `npm version`。

1. 完成功能和文档修改并提交。
2. 确认 `package.json` 与 Manifest 仍是目标版本。
3. 将现有标签移动到最终提交：

```powershell
git tag -fa "v$workshopVersion" -m "$workshopVersion"
```

4. 推送主分支后，明确强制更新这一个标签：

```powershell
git push origin main
git push origin "refs/tags/v$workshopVersion" --force
```

同版本重发会改变标签指向，必须在 Release 说明中写清修订内容，并替换旧附件。不要对其他标签使用批量强制推送。

## 6. 质量检查

```powershell
npm run lint
npm test
npm audit --omit=dev
```

- lint 必须通过。
- 自动化测试必须全部通过。
- `npm audit` 的结果必须人工判断；禁止不看结果直接运行 `npm audit fix --force`。
- 如果修复会导致主要依赖降级或破坏兼容性，应记录上游依赖、影响范围和暂缓原因。

再做一次敏感信息检查：

- 搜索邮箱、账号、Cookie 键、密码、令牌和本机临时路径。
- 检查新增截图是否已经脱敏。
- 检查 Git 暂存区，不要只检查工作目录。

## 7. 干净构建

为避免 Vite 或手工操作留下旧哈希文件，不在旧 `dist/` 上直接打包。先验证路径，再把旧目录移入可恢复备份：

```powershell
$workshopRepoResolved = (Resolve-Path -LiteralPath $workshopRepo).Path
$workshopDist = Join-Path $workshopRepoResolved "dist"
$workshopTemp = Join-Path $workshopRepoResolved ".tmp"
New-Item -ItemType Directory -Path $workshopTemp -Force | Out-Null

if (Test-Path -LiteralPath $workshopDist) {
  $workshopDistResolved = (Resolve-Path -LiteralPath $workshopDist).Path
  if (-not $workshopDistResolved.StartsWith($workshopRepoResolved + [IO.Path]::DirectorySeparatorChar)) {
    throw "dist 路径不在仓库内，停止操作"
  }
  $workshopDistBackup = Join-Path $workshopTemp ("dist-before-v" + $workshopVersion + "-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
  Move-Item -LiteralPath $workshopDistResolved -Destination $workshopDistBackup
}

npm run build
```

构建后必须检查：

- `dist/manifest.json` 是目标版本。
- `side_panel.default_path`、`options_ui.page`、后台脚本和图标都存在。
- 三个 HTML 引用的哈希 JS/CSS 均存在。
- `dist/assets` 只有本次 HTML 实际引用的文件，没有旧哈希残留。
- 构建警告已经人工确认，不影响扩展运行。

## 8. 生成本地安装包和源码包

先将已有同名压缩包移入 `.tmp/release-backups`，不要直接无备份覆盖。

安装包必须压缩 `dist` 的内容，而不是把 `dist` 文件夹本身作为 ZIP 第一层：

```powershell
$workshopDist = (Resolve-Path -LiteralPath (Join-Path $workshopRepo "dist")).Path
$workshopInstallZip = Join-Path $workshopReleaseRoot "NIKKE-Workshop.zip"
$workshopSourceZip = Join-Path $workshopReleaseRoot "NIKKE-Workshop-source.zip"

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory(
  $workshopDist,
  $workshopInstallZip,
  [System.IO.Compression.CompressionLevel]::Optimal,
  $false
)

git archive --format=zip --output="$workshopSourceZip" "v$workshopVersion"
Get-FileHash -Algorithm SHA256 -LiteralPath $workshopInstallZip, $workshopSourceZip
```

安装包结构至少应包含：

```text
manifest.json
index.html
management.html
calculator.html
background.js
assets/
images/
LICENSE
```

同时建立 `版本归档/vX.Y.Z/` 本地归档，保存本次安装包和源码包。正式版本不得与 `Old/` 中的开发阶段备份混放。

## 9. 推送源码和标签

新版本：

```powershell
git push origin main
git push origin "v$workshopVersion"
```

同版本重发使用第 5 节的单标签强制更新命令。

推送后确认：

```powershell
git fetch origin
git status --branch --short
git rev-parse HEAD
git rev-parse "v$workshopVersion"
git rev-parse origin/main
```

三个提交值应符合本次发布预期。

## 10. 创建或更新 GitHub Release

Release 标题统一为：

```text
NIKKE Workshop X.Y.Z
```

Release 说明至少包含：

- 用户可见的新功能与修复。
- 安装方法。
- 图文操作指南链接。
- `NIKKE-Workshop.zip` 的 SHA-256。
- lint、测试、构建和包结构检查结果。
- 必要的已知问题或依赖风险。

新版本创建新的 Release；同版本重发则更新现有 Release 说明，删除旧的 `NIKKE-Workshop.zip` 附件，再上传新包。上传 GitHub API 时从 Git Credential Manager 临时读取凭据，不输出、不写入文件，并在请求结束后清空变量。

## 11. 远端复核

发布不以“上传成功”为结束。必须执行：

1. 检查 `/releases/latest` 指向目标版本。
2. 检查 Release 页面显示正确标题和更新内容。
3. 检查附件的更新时间、大小和下载地址。
4. 从 GitHub 重新下载 `NIKKE-Workshop.zip`。
5. 对比本地与下载文件的 SHA-256。
6. 打开下载 ZIP 内的 `manifest.json`，确认版本号。
7. 确认 ZIP 根目录没有多余的 `dist/` 或 `NIKKE-Workshop/` 包装层。
8. 确认远端 README 已显示目标版本。
9. 确认 GitHub Pages 图文指南已部署目标版本，图片和目录跳转正常。

## 12. 最终交付记录

每次发布记录以下信息：

- 版本号和 Git 提交。
- Release 地址与附件直链。
- 发布时间和附件更新时间。
- 安装包大小与 SHA-256。
- 测试数量与结果。
- 构建警告和依赖审计结论。
- 本地安装包、源码包和备份路径。

## 发布完成检查表

- [ ] 代码与 UI 已手动验收
- [ ] README、修改说明、产品说明和指南已更新
- [ ] Manifest、package 和可见版本号一致
- [ ] lint 通过
- [ ] 全部自动化测试通过
- [ ] 依赖审计已人工复核
- [ ] 敏感信息与截图已检查
- [ ] 从干净 `dist` 构建
- [ ] 安装包根目录和 Manifest 引用通过检查
- [ ] 源码包基于最终标签生成
- [ ] main 与目标标签已推送
- [ ] Release 说明与 SHA-256 已更新
- [ ] GitHub 附件已重新下载并通过哈希复核
- [ ] 远端 README 与图文指南已部署
