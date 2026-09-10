# SPDX-License-Identifier: GPL-3.0-or-later
# Exercise the shipped VBS launcher, not an in-process ShowDialog replacement.
$ErrorActionPreference = 'Stop'
$source = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\public'))
. (Join-Path $source 'updater\Window.ps1')
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class WorkshopWindowFixture {
    [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr window, int command);
    [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);
}
'@
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('nikke-window-' + [char]0x56fe + '-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($fixture) | Out-Null
Copy-Item -LiteralPath (Join-Path $source 'updater') -Destination (Join-Path $fixture 'updater') -Recurse
Copy-Item -LiteralPath (Join-Path $source 'Workshop-Updater.vbs') -Destination $fixture
[IO.File]::WriteAllText((Join-Path $fixture 'manifest.json'), '{"name":"NIKKE Workshop","manifest_version":3,"version":"1.0.10"}')
$scriptPath = Join-Path $fixture 'updater\Updater.ps1'
$match = '(?i)(?:^|\s)-File\s+"' + [regex]::Escape($scriptPath) + '"(?:\s|$)'
function Fixture-Processes { return @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" | Where-Object { $_.CommandLine -match $match }) }
function Start-Fixture { return Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\wscript.exe') -ArgumentList ('"' + (Join-Path $fixture 'Workshop-Updater.vbs') + '"') -WindowStyle Hidden -PassThru }
$window = [IntPtr]::Zero; $launchers = @()
try {
    $launchers += Start-Fixture
    $deadline = [datetime]::UtcNow.AddSeconds(20)
    do {
        foreach ($process in @(Fixture-Processes)) { $window = [WorkshopUpdaterWindow]::Find($process.ProcessId); if ($window -ne [IntPtr]::Zero) { break } }
        if ($window -eq [IntPtr]::Zero -or ![WorkshopUpdaterWindow]::IsWindowVisible($window)) { Start-Sleep -Milliseconds 100 }
    } while (($window -eq [IntPtr]::Zero -or ![WorkshopUpdaterWindow]::IsWindowVisible($window)) -and [datetime]::UtcNow -lt $deadline)
    if ($window -eq [IntPtr]::Zero -or ![WorkshopUpdaterWindow]::IsWindowVisible($window)) { throw 'VBS did not show the main window.' }
    $primary = @(Fixture-Processes)[0].ProcessId
    if (Show-ExistingUpdater (Join-Path $fixture 'different-install')) { throw 'Activation crossed installation boundary.' }
    $selectedTarget = Join-Path $fixture 'selected-install'
    [WorkshopUpdaterWindow]::BindTarget($window, (Get-UpdaterWindowKey $fixture), (Get-UpdaterWindowKey $selectedTarget))
    if (!(Show-ExistingUpdater $selectedTarget)) { throw 'Selected directory could not restore its existing window.' }
    if (Show-ExistingUpdater $fixture) { throw 'Original launcher path overrode selected directory identity.' }
    [WorkshopUpdaterWindow]::BindTarget($window, (Get-UpdaterWindowKey $selectedTarget), (Get-UpdaterWindowKey $fixture))
    $null = [WorkshopWindowFixture]::ShowWindowAsync($window, 6)
    $deadline = [datetime]::UtcNow.AddSeconds(5)
    while (![WorkshopUpdaterWindow]::IsIconic($window) -and [datetime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 50 }
    if (![WorkshopUpdaterWindow]::IsIconic($window)) { throw 'Could not prepare minimized fixture.' }
    $second = Start-Fixture; $launchers += $second
    if (!$second.WaitForExit(15000)) { throw 'Duplicate launch did not exit.' }
    $deadline = [datetime]::UtcNow.AddSeconds(5)
    while ([WorkshopUpdaterWindow]::IsIconic($window) -and [datetime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 50 }
    $remaining = @(Fixture-Processes)
    if ($remaining.Count -ne 1 -or $remaining[0].ProcessId -ne $primary) { throw 'Duplicate updater process remained.' }
    if (![WorkshopUpdaterWindow]::IsWindowVisible($window) -or [WorkshopUpdaterWindow]::IsIconic($window)) { throw 'Duplicate launch did not restore the original window.' }
    [PSCustomObject]@{passed=$true;realVbsLaunch=$true;visible=$true;duplicateRestored=$true;sameProcess=$true;differentInstallRejected=$true;realInstallationModified=$false} | ConvertTo-Json -Compress
} finally {
    if ($window -ne [IntPtr]::Zero) { $null = [WorkshopWindowFixture]::PostMessage($window, 0x10, [IntPtr]::Zero, [IntPtr]::Zero) }
    foreach ($launcher in $launchers) { $null = $launcher.WaitForExit(3000) }
    # Only our unique fixture processes, never the user's running updater.
    foreach ($process in @(Fixture-Processes)) { Stop-Process -Id $process.ProcessId -ErrorAction SilentlyContinue }
}
