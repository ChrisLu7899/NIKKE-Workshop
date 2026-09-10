# SPDX-License-Identifier: GPL-3.0-or-later
# UTF-8 BOM is required for Chinese UI under Windows PowerShell 5.1.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
try {
    . (Join-Path $PSScriptRoot 'Core.ps1')
    . (Join-Path $PSScriptRoot 'Window.ps1')
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
    $activated = $false
    $deadline = [datetime]::UtcNow.AddSeconds(5)
    do {
        $activated = Show-ExistingUpdater $script:target
        if (!$activated) { Start-Sleep -Milliseconds 200 }
    } while (!$activated -and [datetime]::UtcNow -lt $deadline)
    if (!$activated) {
        [Windows.Forms.MessageBox]::Show('另一个更新器进程正在启动或没有响应，暂未找到可显示的窗口。请稍后重试；若仍无法打开，请联系维护者检查进程。为保护正在进行的更新，不会强制结束进程。', 'NIKKE Workshop 更新器') | Out-Null
    }
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
$layout.ColumnCount = 1; $layout.RowCount = 8
foreach ($height in @(46, 30, 58, 30, 0, 30, 40, 52)) {
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
$targetBox.ReadOnly = $true; $targetBox.Anchor = 'Left,Right'; $targetBox.Text = $script:target
$targetBox.AccessibleName = '插件安装目录'; $targetBox.WordWrap = $false
$targetBox.BackColor = [Drawing.Color]::WhiteSmoke
$directoryRow = New-Object Windows.Forms.TableLayoutPanel
$directoryRow.Dock = 'Fill'; $directoryRow.Margin = New-Object Windows.Forms.Padding(0)
$directoryRow.ColumnCount = 3; $directoryRow.RowCount = 1
$null = $directoryRow.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Absolute', 78)))
$null = $directoryRow.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Percent', 100)))
$null = $directoryRow.ColumnStyles.Add((New-Object Windows.Forms.ColumnStyle('Absolute', 120)))
$directoryLabel = New-Object Windows.Forms.Label
$directoryLabel.Text = '目录：'; $directoryLabel.Dock = 'Fill'; $directoryLabel.TextAlign = 'MiddleLeft'
$directoryRow.Controls.Add($directoryLabel, 0, 0); $directoryRow.Controls.Add($targetBox, 1, 0)
$chooseDirectory = New-Object Windows.Forms.Button
$chooseDirectory.Text = '选择目录'; $chooseDirectory.Anchor = 'Left,Right'; $chooseDirectory.Height = 36; $chooseDirectory.AccessibleName = '选择插件安装目录'
$directoryRow.Controls.Add($chooseDirectory, 2, 0); $layout.Controls.Add($directoryRow, 0, 2)
$confirmed = New-Object Windows.Forms.CheckBox
$confirmed.Text = '已确认这是需要更新的插件安装目录'; $confirmed.Dock = 'Fill'; $layout.Controls.Add($confirmed, 0, 3)
$notes = New-Object Windows.Forms.TextBox
$notes.Multiline = $true; $notes.ReadOnly = $true; $notes.ScrollBars = 'Vertical'; $notes.Dock = 'Fill'; $notes.BackColor = [Drawing.Color]::White
$notes.Text = "点击「检查更新」读取官方发布信息。`r`n`r`n目录不正确时，点击「选择目录」，选择含 manifest.json 的插件安装文件夹。切换后需重新确认目录并检查版本；不会移动插件文件。`r`n`r`n要让插件以后打开这个目录的更新器，请确认目录后点击「启用插件唤起」。下载及覆盖需要你再次确认，不会静默安装。"
$layout.Controls.Add($notes, 0, 4)
$bar = New-Object Windows.Forms.ProgressBar
$bar.Dock = 'Fill'; $bar.Style = 'Continuous'; $layout.Controls.Add($bar, 0, 5)
$status = Add-Label '尚未检测。可以先启用插件唤起，或直接检查更新。' 6
$buttons = New-Object Windows.Forms.FlowLayoutPanel
$buttons.Dock = 'Fill'; $buttons.FlowDirection = 'LeftToRight'; $buttons.WrapContents = $true
$layout.Controls.Add($buttons, 0, 7)
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
    $chooseDirectory.Enabled = !$busy -and $script:pending.Count -eq 0
}
function Select-UpdateDirectory([string]$Directory) {
    if ($script:worker -or $script:pending.Count -gt 0) { throw '请先完成当前任务或恢复未完成更新，再切换目录。' }
    # Validate and lock the new installation before changing any active state.
    $nextTarget = (Assert-PlainPath $Directory).TrimEnd('\')
    $nextCurrent = Read-InstallManifest $nextTarget
    $null = Get-Version $nextCurrent.version
    foreach ($required in @('index.html', 'management.html', 'background.js')) {
        if (!(Test-Path -LiteralPath (Join-Safe $nextTarget $required) -PathType Leaf)) { throw '目录缺少插件程序文件。请选择完整解压、含 manifest.json 的 NIKKE Workshop 根目录。' }
    }
    if ($nextTarget -eq $script:target) { return }
    $nextStateRoot = Get-UpdateStateRoot $nextTarget
    $nextPending = @(Get-PendingTransactions $nextStateRoot)
    $nextMutex = New-Object Threading.Mutex($false, ('Local\NIKKEWorkshopUpdater-' + [IO.Path]::GetFileName($nextStateRoot)))
    $acquired = $false; $transferred = $false
    try {
        try { $acquired = $nextMutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $acquired = $true }
        if (!$acquired) {
            $activated = Show-ExistingUpdater $nextTarget
            if ($activated) { $status.Text = '该目录的更新器已打开，已切换到已有窗口；本窗口目录保持不变。' }
            else { $status.Text = '该目录已有更新器正在运行，请稍后重试。本窗口目录保持不变。' }
            return
        }
        # A different updater may have finished between validation and locking.
        $nextCurrent = Read-InstallManifest $nextTarget
        $null = Get-Version $nextCurrent.version
        $nextPending = @(Get-PendingTransactions $nextStateRoot)
        [WorkshopUpdaterWindow]::BindTarget($form.Handle, (Get-UpdaterWindowKey $script:target), (Get-UpdaterWindowKey $nextTarget))
        $previousMutex = $script:mutex
        $script:mutex = $nextMutex; $transferred = $true
        $script:target = $nextTarget; $script:current = $nextCurrent
        $script:stateRoot = $nextStateRoot; $script:pending = $nextPending; $script:release = $null
        $previousMutex.ReleaseMutex(); $previousMutex.Dispose()
        $queued = $null
        while ($script:events.TryDequeue([ref]$queued)) { }
        $confirmed.Checked = $false
        $targetBox.Text = $script:target
        $bar.Style = 'Continuous'; $bar.Value = 0
        $versions.Text = "当前版本：$($script:current.version)    GitHub 正式版：尚未检测"
        $status.Text = '已切换目录。请重新确认安装目录，再检查更新。'
        if ($script:pending.Count -gt 0) { $status.Text = '此目录有未完成更新。请确认目录后先恢复。'; $versions.Text = '当前版本：待恢复后确认' }
        $notes.Text = "本次操作使用所选目录，不会移动插件文件。`r`n`r`n如果需要让插件以后唤起这个目录，请确认后点击「启用插件唤起」。选择目录本身不会修改唤起设置。"
        Refresh-Buttons
    } finally {
        if (!$transferred) { if ($acquired) { $nextMutex.ReleaseMutex() }; $nextMutex.Dispose() }
    }
}
$chooseDirectory.Add_Click({
    if (!$chooseDirectory.Enabled) { return }
    $picker = New-Object Windows.Forms.FolderBrowserDialog
    $picker.Description = '选择 NIKKE Workshop 安装目录（根目录中应包含 manifest.json）'
    $picker.ShowNewFolderButton = $false; $picker.SelectedPath = $script:target
    try {
        if ($picker.ShowDialog($form) -eq [Windows.Forms.DialogResult]::OK) { Select-UpdateDirectory $picker.SelectedPath }
    } catch { [Windows.Forms.MessageBox]::Show($form, "无法切换目录，原目录保持不变。`r`n$($_.Exception.Message)", '选择安装目录', 'OK', 'Warning') | Out-Null }
    finally { $picker.Dispose() }
})
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
                $asset = $raw.assets | Where-Object { $_.name -cin $allowed } | Sort-Object { $allowed.IndexOf($_.name) } | Select-Object -First 1
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
    $message = "即将下载并覆盖此目录的程序文件：`r`n$script:target`r`n`r`nscreenshots 截图目录保持不变。请先保存插件内未保存的编辑。是否继续？"
    if ($script:pending.Count -gt 0) { $action = 'recover'; $message = '检测到未完成更新，将恢复更新前的程序文件。screenshots 截图目录保持不变。是否继续？' }
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
$form.Add_HandleCreated({ [WorkshopUpdaterWindow]::BindTarget($form.Handle, $null, (Get-UpdaterWindowKey $script:target)) })
$form.Add_Shown({ [WorkshopUpdaterWindow]::Activate($form.Handle); $check.Focus() | Out-Null })
try {
    $script:pending = @(Get-PendingTransactions $script:stateRoot)
    if ($script:pending.Count -gt 0) { $status.Text = '发现未完成更新。请确认目录后先恢复，再检查新版本。'; $versions.Text = '当前版本：待恢复后确认' }
    Refresh-Buttons; $timer.Start(); $form.ShowDialog() | Out-Null
} finally {
    $timer.Stop(); $timer.Dispose(); $form.Dispose()
    $mutex.ReleaseMutex(); $mutex.Dispose()
}
