# SPDX-License-Identifier: GPL-3.0-or-later
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot '..\public\updater\Core.ps1')
$suiteRoot = Join-Path ([IO.Path]::GetTempPath()) ('nikke-updater-test-' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($suiteRoot) | Out-Null
$script:passed = 0
function Check([bool]$Condition, [string]$Message) { if (!$Condition) { throw $Message }; $script:passed++ }
function Reject([scriptblock]$Action, [string]$Message) {
    $rejected = $false
    try { & $Action | Out-Null } catch { $rejected = $true }
    Check $rejected $Message
}
function Write-Fixture([string]$Path, [string]$Text) {
    [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($Path)) | Out-Null
    [IO.File]::WriteAllText($Path, $Text, (New-Object Text.UTF8Encoding($false)))
}
function New-Fixture([string]$Name) {
    $root = Join-Path $suiteRoot $Name
    Write-Fixture "$root\manifest.json" '{"name":"NIKKE Workshop","manifest_version":3,"version":"1.0.10"}'
    Write-Fixture "$root\index.html" 'old-index'
    Write-Fixture "$root\management.html" 'old-management'
    Write-Fixture "$root\background.js" 'old-background'
    Write-Fixture "$root\snapshots\keep.txt" 'private-snapshot'
    Write-Fixture "$root\screenshots\keep.txt" 'private-screenshot'
    Write-Fixture "$root\unrelated.txt" 'user-file'
    return $root
}
function New-Package([string]$Name, [hashtable]$Extra = @{}, [string]$Version = '1.0.11') {
    $path = Join-Path $suiteRoot "$Name.zip"
    $zip = [IO.Compression.ZipFile]::Open($path, 'Create')
    try {
        $entries = @{
            'manifest.json' = ('{"name":"NIKKE Workshop","manifest_version":3,"version":"' + $Version + '"}')
            'index.html' = 'new-index'; 'management.html' = 'new-management'; 'background.js' = 'new-background'
            'assets/new.js' = 'new-code'; 'SNAPSHOTS/keep.txt' = 'ATTACK'; 'snapshots/new.txt' = 'ATTACK'; 'screenshots/keep.txt' = 'ATTACK'
        }
        foreach ($key in $Extra.Keys) { $entries[$key] = $Extra[$key] }
        foreach ($key in $entries.Keys) {
            $entry = $zip.CreateEntry($key)
            $stream = New-Object IO.StreamWriter($entry.Open())
            try { $stream.Write($entries[$key]) } finally { $stream.Dispose() }
        }
    } finally { $zip.Dispose() }
    return $path
}
function Assert-Protected([string]$Root) {
    Check ((Get-Content "$Root\snapshots\keep.txt" -Raw) -eq 'private-snapshot') 'snapshots changed'
    Check ((Get-Content "$Root\screenshots\keep.txt" -Raw) -eq 'private-screenshot') 'screenshots changed'
    Check (!(Test-Path "$Root\snapshots\new.txt")) 'snapshots file added'
    Check ((Get-Content "$Root\unrelated.txt" -Raw) -eq 'user-file') 'unrelated file changed'
}
$package = New-Package 'valid'
$digest = (Get-UpdateHash $package -Algorithm SHA256).Hash
$target = New-Fixture 'successful'
Install-ValidatedPackage $package $digest '1.0.11' $target (Join-Path $suiteRoot 'txn-success')
Check ((Read-InstallManifest $target).version -eq '1.0.11') 'version not updated'
Check ((Get-Content "$target\index.html" -Raw).Trim() -eq 'new-index') 'new file missing'
Assert-Protected $target
Reject { Install-ValidatedPackage $package $digest '1.0.11' $target (Join-Path $suiteRoot 'txn-same') } 'same-version update allowed'
$target = New-Fixture 'rollback'
Reject { Install-ValidatedPackage $package $digest '1.0.11' $target (Join-Path $suiteRoot 'txn-rollback') {} 3 } 'failure not injected'
Check ((Read-InstallManifest $target).version -eq '1.0.10') 'rollback version failed'
Check ((Get-Content "$target\index.html" -Raw) -eq 'old-index') 'rollback failed'
Check (!(Test-Path "$target\assets\new.js")) 'new file left after rollback'
Assert-Protected $target
Reject { Install-ValidatedPackage $package ('0' * 64) '1.0.11' $target (Join-Path $suiteRoot 'txn-bad-hash') } 'checksum accepted'
Reject { Install-ValidatedPackage $package $digest '1.0.12' $target (Join-Path $suiteRoot 'txn-bad-version') } 'wrong version accepted'
Reject { Install-ValidatedPackage $package $digest '1.0.9' $target (Join-Path $suiteRoot 'txn-downgrade') } 'downgrade accepted'
foreach ($path in @('../escaped.txt', '/absolute.txt', 'C:/absolute.txt', 'snapshots/../escape.txt', 'file:stream', 'folder/NUL.txt', 'SNAPSH~1/hack.txt', 'folder./file', 'folder/../file', 'folder\\..\\file')) {
    Reject { Get-SafeRelative $path } "accepted unsafe path: $path"
}
$badZip = New-Package 'bad-path' @{ '../escaped.txt' = 'attack' }
Reject { Install-ValidatedPackage $badZip (Get-UpdateHash $badZip).Hash '1.0.11' $target (Join-Path $suiteRoot 'txn-bad-path') } 'ZIP traversal accepted'
Check (!(Test-Path (Join-Path $suiteRoot 'escaped.txt'))) 'escaped file created'
Reject { Assert-FreeSpace $suiteRoot ([long]::MaxValue) } 'disk space gate failed'
# Simulated crash journal: recover on next launch, including idempotent retry.
$crash = Join-Path $suiteRoot 'txn-crash'
Write-Fixture "$crash\backup\index.html" 'old-index'
Write-JsonAtomic "$crash\journal.json" @{ target = $target; state = 'applying'; entries = @(@{relative='index.html';existed=$true;hash=(Get-UpdateHash "$crash\backup\index.html").Hash}) }
Write-Fixture "$target\index.html" 'interrupted-write'
Restore-Transaction $crash $target
Restore-Transaction $crash $target
Check ((Get-Content "$target\index.html" -Raw) -eq 'old-index') 'crash recovery failed'
Assert-Protected $target
# Hard-link alias cannot redirect an update into a protected file.
New-Item -ItemType HardLink -Path "$target\alias.txt" -Target "$target\snapshots\keep.txt" | Out-Null
Reject { Join-Safe $target 'alias.txt' } 'hardlink accepted'
$external = Join-Path $suiteRoot 'external'
[IO.Directory]::CreateDirectory($external) | Out-Null
New-Item -ItemType Junction -Path "$target\redirect" -Target $external | Out-Null
Reject { Join-Safe $target 'redirect\outside.txt' } 'junction accepted'
# Register ONLY a unique test scheme, restore by deleting that exact test key.
$scheme = 'nikke-workshop-test-' + [guid]::NewGuid().ToString('N')
try {
    $marker = Join-Path $suiteRoot 'protocol-launched.txt'
    $vbs = 'Set f = CreateObject("Scripting.FileSystemObject")' + "`r`n" + 'Set o = f.CreateTextFile("' + $marker + '", True)' + "`r`n" + 'o.Write CStr(WScript.Arguments.Count)' + "`r`n" + 'o.Close'
    Write-Fixture "$target\Workshop-Updater.vbs" $vbs
    Register-UpdateProtocol $target $scheme
    $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("Software\Classes\$scheme\shell\open\command")
    try { $command = $key.GetValue('') } finally { $key.Dispose() }
    Check ($command.Contains('wscript.exe') -and $command.Contains('Workshop-Updater.vbs') -and !$command.Contains('%1')) 'unsafe protocol command'
    Start-Process -FilePath ($scheme + '://update?ignored=not-a-command') -WindowStyle Hidden
    $deadline = [datetime]::UtcNow.AddSeconds(10)
    while (!(Test-Path -LiteralPath $marker) -and [datetime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 100 }
    Check ((Test-Path -LiteralPath $marker) -and (Get-Content -LiteralPath $marker -Raw) -eq '0') 'Windows protocol launch failed or forwarded arguments'
} finally { [Microsoft.Win32.Registry]::CurrentUser.DeleteSubKeyTree("Software\Classes\$scheme", $false) }
[PSCustomObject]@{ passed = $script:passed; fixtures = $suiteRoot; realInstallationModified = $false; realProtocolRegistered = $false } | ConvertTo-Json -Compress
