# SPDX-License-Identifier: GPL-3.0-or-later
# UTF-8 BOM is required for Chinese UI under Windows PowerShell 5.1.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
try {
    . (Join-Path $PSScriptRoot 'Core.ps1')
    $script:target = [IO.Path]::GetDirectoryName($PSScriptRoot)
    $script:stateRoot = Get-UpdateStateRoot $script:target
    $script:initialPending = @(Get-PendingTransactions $script:stateRoot)
    try { $script:current = Read-InstallManifest $script:target }
    catch {
        if ($script:initialPending.Count -eq 0) { throw }
        # A crash while replacing manifest.json must not prevent recovery UI.
        $script:current = [PSCustomObject]@{ version = '0.0.0' }
    }
} catch {
    [Windows.Forms.MessageBox]::Show("无法识别插件安装目录。请完整解压安装包后再打开更新器。`r`n$($_.Exception.Message)", 'NIKKE Workshop 更新器') | Out-Null
    exit 1
}
$mutex = New-Object Threading.Mutex($false, ('Local\NIKKEWorkshopUpdater-' + [IO.Path]::GetFileName($script:stateRoot)))
try { $ownsMutex = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $ownsMutex = $true }
if (!$ownsMutex) {
    [Windows.Forms.MessageBox]::Show('此安装目录的更新器已经打开，请返回已有窗口。', 'NIKKE Workshop 更新器') | Out-Null
    $mutex.Dispose(); exit
}
$script:worker = $null; $script:handle = $null; $script:release = $null; $script:pending = $script:initialPending
$script:events = New-Object 'Collections.Concurrent.ConcurrentQueue[object]'
$form = New-Object Windows.Forms.Form
$form.Text = 'NIKKE Workshop · 更新器'
$form.Size = New-Object Drawing.Size(790, 690)
$form.MinimumSize = New-Object Drawing.Size(650, 620)
$form.StartPosition = 'CenterScreen'
$form.Font = New-Object Drawing.Font('Microsoft YaHei UI', 10)
$form.BackColor = [Drawing.Color]::White
$layout = New-Object Windows.Forms.TableLayoutPanel
$layout.Dock = 'Fill'; $layout.Padding = New-Object Windows.Forms.Padding(24)
$layout.ColumnCount = 1; $layout.RowCount = 9
foreach ($height in @(46, 30, 58, 30, 54, 0, 30, 40, 52)) {
    $style = New-Object Windows.Forms.RowStyle
    if ($height -eq 0) { $style.SizeType = 'Percent'; $style.Height = 100 } else { $style.SizeType = 'Absolute'; $style.Height = $height }
    $layout.RowStyles.Add($style) | Out-Null
}
$form.Controls.Add($layout)
function Add-Label([string]$Text, [int]$Row) {
    $label = New-Object Windows.Forms.Label
    $label.Text = $Text; $label.Dock = 'Fill'; $label.TextAlign = 'MiddleLeft'; $label.AutoEllipsis = $true
    $layout.Controls.Add($label, 0, $Row)
    return $label
}
$heading = Add-Label 'NIKKE Workshop 更新器' 0
$heading.Font = New-Object Drawing.Font('Microsoft YaHei UI', 18, [Drawing.FontStyle]::Bold)
$versions = Add-Label ("当前版本：{0}    GitHub 正式版：尚未检测" -f $script:current.version) 1
$targetBox = New-Object Windows.Forms.TextBox
$targetBox.Multiline = $true; $targetBox.ReadOnly = $true; $targetBox.Dock = 'Fill'; $targetBox.Text = "安装目录：`r`n$script:target"
$targetBox.BackColor = [Drawing.Color]::WhiteSmoke; $layout.Controls.Add($targetBox, 0, 2)
$confirmed = New-Object Windows.Forms.CheckBox
$confirmed.Text = '已确认这是需要更新的插件安装目录'; $confirmed.Dock = 'Fill'; $layout.Controls.Add($confirmed, 0, 3)
$protect = Add-Label "snapshots 与 screenshots 不覆盖、不删除，回滚也不触碰。`r`n更新前备份程序文件；不清理旧文件，不修改浏览器中的账号数据。" 4
$protect.ForeColor = [Drawing.Color]::FromArgb(35, 93, 52)
$notes = New-Object Windows.Forms.TextBox
$notes.Multiline = $true; $notes.ReadOnly = $true; $notes.ScrollBars = 'Vertical'; $notes.Dock = 'Fill'; $notes.BackColor = [Drawing.Color]::White
$notes.Text = "点击「检查更新」读取官方发布信息。`r`n`r`n首次使用：确认安装目录后，点击「启用插件唤起」。以后可以在插件内点击「打开更新器」。移动安装文件夹后，在新位置重新启用。`r`n`r`n下载及覆盖需要你再次确认，不会静默安装。"
$layout.Controls.Add($notes, 0, 5)
$bar = New-Object Windows.Forms.ProgressBar
$bar.Dock = 'Fill'; $bar.Style = 'Continuous'; $layout.Controls.Add($bar, 0, 6)
$status = Add-Label '尚未检测。可以先启用插件唤起，或直接检查更新。' 7
$buttons = New-Object Windows.Forms.FlowLayoutPanel
$buttons.Dock = 'Fill'; $buttons.FlowDirection = 'LeftToRight'; $buttons.WrapContents = $true
$layout.Controls.Add($buttons, 0, 8)
function Add-Button([string]$Text) {
    $button = New-Object Windows.Forms.Button
    $button.Text = $Text; $button.AutoSize = $true; $button.Height = 36; $button.MinimumSize = New-Object Drawing.Size(130, 36)
    $buttons.Controls.Add($button); return $button
}
$register = Add-Button '启用插件唤起'
$check = Add-Button '检查更新'
$install = Add-Button '下载并更新'
$install.BackColor = [Drawing.Color]::FromArgb(25, 118, 210); $install.ForeColor = [Drawing.Color]::White
$install.FlatStyle = 'Flat'; $install.FlatAppearance.BorderSize = 0
function Refresh-Buttons {
    $busy = $null -ne $script:worker
    $register.Enabled = !$busy -and $confirmed.Checked
    $check.Enabled = !$busy -and $script:pending.Count -eq 0
    $install.Enabled = !$busy -and $confirmed.Checked -and ($script:pending.Count -gt 0 -or ($script:release -and $script:release.asset -and (Get-Version $script:release.version) -gt (Get-Version $script:current.version)))
    if ($script:pending.Count -gt 0) { $install.Text = '恢复未完成更新' } else { $install.Text = '下载并更新' }
    if ($install.Enabled) { $install.BackColor = [Drawing.Color]::FromArgb(25, 118, 210) }
    else { $install.BackColor = [Drawing.Color]::FromArgb(230, 230, 230) }
    $confirmed.Enabled = !$busy
}
function Start-Work([string]$Action) {
    if ($script:worker) { return }
    $script:worker = [PowerShell]::Create()
    $job = {
        param($core, $action, $target, $release, $queue)
        try {
            . $core
            $progress = { param($event) $queue.Enqueue($event) }
            if ($action -eq 'check') {
                $raw = Get-LatestRelease
                $version = $raw.tag_name.TrimStart('v')
                $allowed = @('NIKKE-Workshop.zip', "NIKKE-Workshop-$($raw.tag_name).zip", "NIKKE-Workshop-$version.zip")
                $asset = $raw.assets | Where-Object { $_.name -cin $allowed } | Sort-Object { $_.name -cne 'NIKKE-Workshop.zip' } | Select-Object -First 1
                if ($asset -and $asset.digest -notmatch '^sha256:[a-fA-F0-9]{64}$') { $asset = $null }
                $queue.Enqueue(@{ status = 'release'; version = $version; asset = $asset; notes = [string]$raw.body; published = $raw.published_at })
            } elseif ($action -eq 'recover') {
                foreach ($transaction in @(Get-PendingTransactions (Get-UpdateStateRoot $target))) { Restore-Transaction $transaction $target }
                $queue.Enqueue(@{ status = 'recovered' })
            } else {
                Invoke-ReleaseInstall $release.version $release.asset.id $target $progress
            }
        } catch { $queue.Enqueue(@{ status = 'error'; message = $_.Exception.Message }) }
    }
    $null = $script:worker.AddScript($job).AddArgument((Join-Path $PSScriptRoot 'Core.ps1')).AddArgument($Action).AddArgument($script:target).AddArgument($script:release).AddArgument($script:events)
    $script:handle = $script:worker.BeginInvoke()
    $bar.Style = 'Marquee'; $status.Text = '正在处理，请稍候…'; Refresh-Buttons
}
$confirmed.Add_CheckedChanged({ Refresh-Buttons })
$register.Add_Click({
    try {
        Register-UpdateProtocol $script:target
        $status.Text = '已启用：现在可以从插件中点击“打开更新器”。'
    } catch { $status.Text = '注册失败；仍可手动打开更新器。'; $notes.Text = $_.Exception.Message }
})
$check.Add_Click({ Start-Work 'check' })
$install.Add_Click({
    $action = 'install'
    $message = "即将下载并覆盖此目录的程序文件：`r`n$script:target`r`n`r`nsnapshots 和 screenshots 保持不变。请先保存插件内未保存的编辑。是否继续？"
    if ($script:pending.Count -gt 0) { $action = 'recover'; $message = '检测到未完成更新，将恢复更新前的程序文件。snapshots 和 screenshots 保持不变。是否继续？' }
    if ([Windows.Forms.MessageBox]::Show($form, $message, '确认操作', 'YesNo', 'Question') -eq 'Yes') { Start-Work $action }
})
$timer = New-Object Windows.Forms.Timer
$timer.Interval = 200
$timer.Add_Tick({
    $event = $null
    while ($script:events.TryDequeue([ref]$event)) {
        switch ($event.status) {
            'release' {
                $script:release = $event
                $versions.Text = "当前版本：$($script:current.version)    GitHub 正式版：$($event.version)"
                $notes.Text = ("发布时间：$($event.published)`r`n`r`n$($event.notes)").Replace("`r`n", "`n").Replace("`n", "`r`n")
                $comparison = (Get-Version $event.version).CompareTo((Get-Version $script:current.version))
                if ($comparison -gt 0) {
                    if ($event.asset) { $status.Text = '发现新版本。确认安装目录后，可以下载并更新。' } else { $status.Text = '有新版本，但缺少可校验的安装包，暂不能安装。' }
                } elseif ($comparison -lt 0) { $status.Text = '本地版本高于已发布版本，无需降级。' } else { $status.Text = '当前已是最新正式版。' }
                $bar.Style = 'Continuous'; $bar.Value = 0
            }
            'downloading' { $bar.Style = 'Continuous'; $bar.Value = [math]::Min(100, [int](100 * $event.received / $event.total)); $status.Text = "正在下载：$($bar.Value)%" }
            'verifying' { $bar.Style = 'Marquee'; $status.Text = '校验 SHA-256、检查安装包与保护目录…' }
            'backingUp' { $bar.Style = 'Marquee'; $status.Text = '正在备份将被替换的程序文件…' }
            'installing' { $bar.Style = 'Continuous'; $bar.Value = [math]::Min(100, [int](100 * $event.received / $event.total)); $status.Text = "正在安装：$($bar.Value)%" }
            'complete' { $bar.Style = 'Continuous'; $bar.Value = 100; $status.Text = '更新完成。请到浏览器扩展管理页重新加载 NIKKE Workshop。'; $script:release = $null }
            'recovered' { $bar.Style = 'Continuous'; $bar.Value = 0; $status.Text = '已恢复更新前的程序文件，可以重新检查更新。'; $script:release = $null }
            'error' { $bar.Style = 'Continuous'; $bar.Value = 0; $status.Text = '操作失败。请查看说明区中的原因，处理后重试。'; $notes.Text = "$($event.message)`r`n`r`n备份及事务记录保留在：$script:stateRoot`r`n如有未完成事务，请先点击恢复。" }
        }
    }
    if ($script:worker -and $script:handle.IsCompleted) {
        try { $null = $script:worker.EndInvoke($script:handle) } catch { $status.Text = '任务异常退出，请关闭并重新打开更新器检查恢复状态。' }
        $script:worker.Dispose(); $script:worker = $null
        try { $script:current = Read-InstallManifest $script:target; $script:pending = @(Get-PendingTransactions $script:stateRoot) }
        catch { $status.Text = '安装状态异常，请保留备份并联系维护者。'; $check.Enabled = $false; return }
        Refresh-Buttons
    }
})
$form.Add_FormClosing({ param($sender, $event) if ($script:worker) { $event.Cancel = $true; $status.Text = '任务进行中，请等待完成后关闭，避免打断文件更新。' } })
$form.Add_Shown({ $check.Focus() | Out-Null })
try {
    $script:pending = @(Get-PendingTransactions $script:stateRoot)
    if ($script:pending.Count -gt 0) { $status.Text = '发现未完成更新。请确认目录后先恢复，再检查新版本。'; $versions.Text = '当前版本：待恢复后确认' }
    Refresh-Buttons; $timer.Start(); $form.ShowDialog() | Out-Null
} finally {
    $timer.Stop(); $timer.Dispose(); $form.Dispose()
    $mutex.ReleaseMutex(); $mutex.Dispose()
}
