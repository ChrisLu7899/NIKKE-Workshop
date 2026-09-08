# NIKKE Workshop 更新器

Windows 10/11，使用系统自带 Windows PowerShell 5.1 与 Windows Forms，无须下载额外运行环境。

1. 完整解压安装包到固定目录，按原流程加载扩展。
2. 双击安装目录根层的 `Workshop-Updater.vbs`，窗口中核对安装目录，并勾选确认。
3. 点击“启用插件唤起”，在当前 Windows 用户下注册 `nikke-workshop` 协议，不需绑定扩展 ID，也没有后台常驻服务。此后插件页眉的“版本更新 → 打开更新器”可唤起该窗口；浏览器可能询问是否打开外部程序。
4. 点击“检查更新”。只有 GitHub 有更高的稳定版本和带 SHA-256 的安装 ZIP 时才允许安装；点击“下载并更新”后仍需确认。
5. 完成后到 `chrome://extensions/` 或 `edge://extensions/` 重新加载 NIKKE Workshop，再刷新插件页面。不要卸载扩展，以免影响本地数据。

## 文件与数据保护

- `snapshots` 和 `screenshots` 整个目录不覆盖、不删除、不移动，大小写变体同样保护；更新包里的同名条目跳过，回滚也不触碰。
- 不扫描或改写浏览器账号数据。不清理安装目录中未被新版替换的旧文件。
- 下载、解压、备份及恢复日志存放在 `%LOCALAPPDATA%\NIKKE-Workshop-Updater\<安装目录标识>\txn-...`，不位于受保护目录。暂不自动清理备份。
- 只接受官方仓库当前稳定 Release 的安装 ZIP，拒绝源码包、降级、摘要或版本不符、路径穿越、重复条目、链接及特殊路径。
- 安装前备份所有待覆盖文件，写入恢复日志，最后更新 manifest。普通失败自动回滚；意外关闭／断电后重新打开更新器，先点击“恢复未完成更新”。遇到备份损坏时停止恢复并保留记录，不能保证故障磁盘上的文件可恢复。
- 安装过程中不要修改安装目录、移动文件夹或关闭更新器。先保存插件内未保存的编辑。

## 首次打开与故障处理

- 未注册协议或取消浏览器提示：手动双击 `Workshop-Updater.vbs`。插件只能发出唤起请求，无法确认本地程序是否已打开。
- 移动安装目录后：在新位置重新运行更新器并启用插件唤起。多个安装副本共用该协议，以最近一次手动启用的位置为准，每次更新前请核对目录。
- 企业策略禁用 VBScript／脚本时：不要绕过组织策略，联系管理员或继续手动下载 ZIP。若只是没有 VBS 文件关联，可在 Windows PowerShell 中运行以下命令（替换为你的实际路径）：

```powershell
powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "D:\你的安装目录\updater\Updater.ps1"
```

- 该命令只对本次进程设置脚本执行策略，不更改系统全局策略。首次注册写入 `HKCU\Software\Classes\nikke-workshop`，链接参数不会被传递执行；只打开窗口，不启动安装。
- 网络失败可重试；GitHub 限流需等待后再检查。没有可校验安装包时不允许自动安装。
- 当前仅支持这一种完整安装包；轻量版／按需素材下载是后续独立任务。

源码与更新程序采用项目 GPL-3.0-or-later 许可。发布和安装来源请核对 `https://github.com/ChrisLu7899/NIKKE-Workshop/releases/latest`。
