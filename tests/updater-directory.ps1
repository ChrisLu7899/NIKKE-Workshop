# SPDX-License-Identifier: GPL-3.0-or-later
param([string]$ScreenshotDirectory)
$ErrorActionPreference = 'Stop'
$publicRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\public'))
$script:fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) ('nikke-directory-' + [guid]::NewGuid().ToString('N'))
$script:checks = 0
function Assert-Fixture([bool]$Value, [string]$Message) { if (!$Value) { throw $Message }; $script:checks++ }
function Reject-Fixture([scriptblock]$Action, [string]$Message) {
    $failed = $false
    try { & $Action } catch { $failed = $true }
    Assert-Fixture $failed $Message
}
function New-Installation([string]$Name, [string]$Version) {
    $dir = Join-Path $script:fixtureRoot $Name
    [IO.Directory]::CreateDirectory($dir) | Out-Null
    [IO.File]::WriteAllText((Join-Path $dir 'manifest.json'), ('{"name":"NIKKE Workshop","manifest_version":3,"version":"' + $Version + '"}'))
    foreach ($file in @('index.html', 'management.html', 'background.js')) { [IO.File]::WriteAllText((Join-Path $dir $file), 'fixture') }
    return $dir
}
$script:first = New-Installation 'first' '1.0.10'
$script:second = New-Installation ('second ' + [char]0x56fe) '1.0.9'
$script:third = New-Installation 'third' '1.0.8'
$script:invalid = Join-Path $script:fixtureRoot 'invalid'
[IO.Directory]::CreateDirectory($script:invalid) | Out-Null
$script:development = New-Installation 'development' '1.0.10'
[IO.Directory]::CreateDirectory((Join-Path $script:development '.git')) | Out-Null
$script:incomplete = Join-Path $script:fixtureRoot 'incomplete'
[IO.Directory]::CreateDirectory($script:incomplete) | Out-Null
[IO.File]::WriteAllText((Join-Path $script:incomplete 'manifest.json'), '{"name":"NIKKE Workshop","manifest_version":3,"version":"1.0.10"}')
$script:wrongApp = New-Installation 'wrong-app' '1.0.10'
[IO.File]::WriteAllText((Join-Path $script:wrongApp 'manifest.json'), '{"name":"Other App","manifest_version":3,"version":"1.0.10"}')
Copy-Item -LiteralPath (Join-Path $publicRoot 'updater') -Destination (Join-Path $script:first 'updater') -Recurse
Add-Type -TypeDefinition @'
using System;
using System.Threading;
using System.Text;
using System.Runtime.InteropServices;
public static class DirectoryMutexFixture {
    delegate bool WindowCallback(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")] static extern bool EnumWindows(WindowCallback callback, IntPtr parameter);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr window, uint command);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr window, StringBuilder text, int count);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
    public static bool CancelOwnedDialog(IntPtr owner) {
        bool found = false;
        EnumWindows((window, parameter) => {
            if (GetWindow(window, 4) != owner) return true;
            var name = new StringBuilder(128); GetClassName(window, name, name.Capacity);
            if (name.ToString() != "#32770") return true;
            found = PostMessage(window, 0x111, new IntPtr(2), IntPtr.Zero); return false;
        }, IntPtr.Zero);
        return found;
    }
    static Thread holder;
    static ManualResetEvent ready, release;
    public static bool Available(string name) {
        bool available = false;
        var thread = new Thread(() => {
            using (var mutex = new Mutex(false, name)) {
                try { available = mutex.WaitOne(0); } catch (AbandonedMutexException) { available = true; }
                if (available) mutex.ReleaseMutex();
            }
        });
        thread.Start(); thread.Join(); return available;
    }
    public static void Hold(string name) {
        ready = new ManualResetEvent(false); release = new ManualResetEvent(false);
        holder = new Thread(() => {
            using (var mutex = new Mutex(false, name)) {
                mutex.WaitOne(); ready.Set(); release.WaitOne(); mutex.ReleaseMutex();
            }
        });
        holder.Start(); if (!ready.WaitOne(5000)) throw new Exception("Fixture lock timeout");
    }
    public static void Stop() { release.Set(); holder.Join(); ready.Dispose(); release.Dispose(); }
}
'@
$qa = @'
$form.Show()
[Windows.Forms.Application]::DoEvents()
$firstMutexName = 'Local\NIKKEWorkshopUpdater-' + [IO.Path]::GetFileName((Get-UpdateStateRoot $script:first))
$secondMutexName = 'Local\NIKKEWorkshopUpdater-' + [IO.Path]::GetFileName((Get-UpdateStateRoot $script:second))
Assert-Fixture $chooseDirectory.Enabled 'Directory chooser unavailable'
Assert-Fixture ([WorkshopUpdaterWindow]::MatchesTarget($form.Handle, (Get-UpdaterWindowKey $script:first))) 'Initial window identity missing'
$cancelTimer = New-Object Windows.Forms.Timer
$cancelTimer.Interval = 100; $script:pickerOpened = $false
$cancelTimer.Add_Tick({ if ([DirectoryMutexFixture]::CancelOwnedDialog($form.Handle)) { $script:pickerOpened = $true; $cancelTimer.Stop() } })
try { $cancelTimer.Start(); $chooseDirectory.PerformClick() } finally { $cancelTimer.Stop(); $cancelTimer.Dispose() }
Assert-Fixture $script:pickerOpened 'Native folder picker did not open'
Assert-Fixture ($script:target -eq $script:first) 'Cancelling picker changed the installation'
$script:release = @{ version = '1.0.11'; asset = @{ id = 1 } }
$confirmed.Checked = $true
$script:events.Enqueue(@{ status = 'release'; version = 'stale' })
Select-UpdateDirectory $script:second
Assert-Fixture ($script:target -eq $script:second) 'Directory did not switch'
Assert-Fixture ($script:current.version -eq '1.0.9') 'Version did not refresh'
Assert-Fixture ($targetBox.Text.Contains($script:second)) 'Displayed directory stale'
Assert-Fixture (!$confirmed.Checked -and !$install.Enabled) 'Confirmation carried to another directory'
Assert-Fixture ($null -eq $script:release -and $script:events.Count -eq 0) 'Previous release/events carried over'
Assert-Fixture ([DirectoryMutexFixture]::Available($firstMutexName)) 'Old installation lock retained'
Assert-Fixture (![DirectoryMutexFixture]::Available($secondMutexName)) 'New installation is not locked'
Assert-Fixture (![WorkshopUpdaterWindow]::MatchesTarget($form.Handle, (Get-UpdaterWindowKey $script:first))) 'Old window identity retained'
Assert-Fixture ([WorkshopUpdaterWindow]::MatchesTarget($form.Handle, (Get-UpdaterWindowKey $script:second))) 'New window identity missing'
Reject-Fixture { Select-UpdateDirectory $script:invalid } 'Empty directory accepted'
Reject-Fixture { Select-UpdateDirectory $script:development } 'Source directory accepted'
Reject-Fixture { Select-UpdateDirectory $script:wrongApp } 'Other application accepted'
Reject-Fixture { Select-UpdateDirectory $script:incomplete } 'Incomplete installation accepted'
Assert-Fixture ($script:target -eq $script:second -and ![DirectoryMutexFixture]::Available($secondMutexName)) 'Invalid selection changed target or lock'
Select-UpdateDirectory ($script:second + '\')
Assert-Fixture ($script:target -eq $script:second) 'Same directory was not normalized'
[DirectoryMutexFixture]::Hold($firstMutexName)
try {
    Select-UpdateDirectory $script:first
    Assert-Fixture ($script:target -eq $script:second) 'Switched into locked installation'
    Assert-Fixture (![DirectoryMutexFixture]::Available($secondMutexName)) 'Failed switch released active lock'
} finally { [DirectoryMutexFixture]::Stop() }
$script:worker = [PowerShell]::Create()
try {
    Refresh-Buttons
    Assert-Fixture (!$chooseDirectory.Enabled) 'Directory chooser enabled during work'
    Reject-Fixture { Select-UpdateDirectory $script:first } 'Busy switch accepted'
} finally { $script:worker.Dispose(); $script:worker = $null }
Refresh-Buttons
$script:pending = @('fixture-pending')
Refresh-Buttons
Assert-Fixture (!$chooseDirectory.Enabled) 'Chooser enabled before recovery'
Reject-Fixture { Select-UpdateDirectory $script:first } 'Pending recovery abandoned'
$script:pending = @()
$script:recoveryState = Get-UpdateStateRoot $script:third
# UI recovery state fixture, without creating a real LocalAppData transaction.
function Get-PendingTransactions([string]$StateRoot) { if ($StateRoot -eq $script:recoveryState) { return @('fixture-pending') }; return @() }
Select-UpdateDirectory $script:third
Assert-Fixture ($script:pending.Count -eq 1 -and !$check.Enabled -and !$chooseDirectory.Enabled) 'Selected recovery state not applied'
$confirmed.Checked = $true
Assert-Fixture ($install.Enabled -and $install.Text -eq '恢复未完成更新') 'Recovery action unavailable'
$script:pending = @(); Refresh-Buttons
Select-UpdateDirectory $script:second
if ($ScreenshotDirectory) {
    [IO.Directory]::CreateDirectory($ScreenshotDirectory) | Out-Null
    foreach ($size in @(@(790, 690), @(650, 620))) {
        $form.Size = New-Object Drawing.Size($size[0], $size[1])
        [Windows.Forms.Application]::DoEvents()
        Assert-Fixture ($chooseDirectory.Bounds.Right -le $directoryRow.ClientSize.Width) 'Directory button clipped'
        $bitmap = New-Object Drawing.Bitmap($form.Width, $form.Height)
        try {
            $form.DrawToBitmap($bitmap, (New-Object Drawing.Rectangle(0, 0, $form.Width, $form.Height)))
            $bitmap.Save((Join-Path $ScreenshotDirectory ('directory-' + $size[0] + '.png')))
        } finally { $bitmap.Dispose() }
    }
}
$form.Close()
[PSCustomObject]@{passed=$script:checks;selection=$true;versionRefreshed=$true;confirmationReset=$true;invalidRejected=$true;busyProtected=$true;recoveryProtected=$true;mutexTransferred=$true;windowIdentityUpdated=$true;realInstallationModified=$false;protocolChanged=$false} | ConvertTo-Json -Compress
'@
$text = [IO.File]::ReadAllText((Join-Path $script:first 'updater\Updater.ps1'))
$text = $text.Replace('$PSScriptRoot', ("'" + (Join-Path $script:first 'updater').Replace("'", "''") + "'"))
if (!$text.Contains('$form.ShowDialog() | Out-Null')) { throw 'Updater UI entry point changed' }
# Replace only the modal loop in the isolated fixture; exercise shipped controls and handlers.
$text = $text.Replace('$form.ShowDialog() | Out-Null', $qa)
. ([scriptblock]::Create($text))
