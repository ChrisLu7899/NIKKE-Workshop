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
    Write-Fixture "$root\snapshots\keep.txt" 'old-program-fixture'
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
            'assets/new.js' = 'new-code'; 'snapshots/keep.txt' = 'new-program-fixture'
            'ScReEnShOtS/keep.txt' = 'ATTACK'; 'screenshots/new.txt' = 'ATTACK'; 'SCREENSHOTS/nested/new.txt' = 'ATTACK'
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
    Check ((Get-Content "$Root\screenshots\keep.txt" -Raw) -eq 'private-screenshot') 'screenshots changed'
    Check (!(Test-Path "$Root\screenshots\new.txt")) 'screenshots file added'
    Check (!(Test-Path "$Root\screenshots\nested")) 'screenshots directory added'
    Check ((Get-Content "$Root\unrelated.txt" -Raw) -eq 'user-file') 'unrelated file changed'
}
$package = New-Package 'valid'
Check (Test-Protected 'SCREENSHOTS\nested\image.png') 'case-insensitive protection failed'
Check (!(Test-Protected 'snapshots\keep.txt')) 'obsolete directory name is still special-cased'
Check (!(Test-Protected 'screenshots-old\keep.txt')) 'similar directory name incorrectly protected'
$digest = (Get-UpdateHash $package -Algorithm SHA256).Hash
$target = New-Fixture 'successful'
Install-ValidatedPackage $package $digest '1.0.11' $target (Join-Path $suiteRoot 'txn-success')
Check ((Read-InstallManifest $target).version -eq '1.0.11') 'version not updated'
Check ((Get-Content "$target\index.html" -Raw).Trim() -eq 'new-index') 'new file missing'
Assert-Protected $target
Check ((Get-Content "$target\snapshots\keep.txt" -Raw).Trim() -eq 'new-program-fixture') 'ordinary package file not updated'
Reject { Install-ValidatedPackage $package $digest '1.0.11' $target (Join-Path $suiteRoot 'txn-same') } 'same-version update allowed'
$target = New-Fixture 'rollback'
Reject { Install-ValidatedPackage $package $digest '1.0.11' $target (Join-Path $suiteRoot 'txn-rollback') {} 3 } 'failure not injected'
Check ((Read-InstallManifest $target).version -eq '1.0.10') 'rollback version failed'
Check ((Get-Content "$target\index.html" -Raw) -eq 'old-index') 'rollback failed'
Check (!(Test-Path "$target\assets\new.js")) 'new file left after rollback'
Check ((Get-Content "$target\snapshots\keep.txt" -Raw) -eq 'old-program-fixture') 'ordinary package file not restored'
Assert-Protected $target
Reject { Install-ValidatedPackage $package ('0' * 64) '1.0.11' $target (Join-Path $suiteRoot 'txn-bad-hash') } 'checksum accepted'
Reject { Install-ValidatedPackage $package $digest '1.0.12' $target (Join-Path $suiteRoot 'txn-bad-version') } 'wrong version accepted'
Reject { Install-ValidatedPackage $package $digest '1.0.9' $target (Join-Path $suiteRoot 'txn-downgrade') } 'downgrade accepted'
foreach ($path in @('../escaped.txt', '/absolute.txt', 'C:/absolute.txt', 'screenshots/../escape.txt', 'file:stream', 'folder/NUL.txt', 'SCREEN~1/hack.txt', 'folder./file', 'folder/../file', 'folder\\..\\file')) {
    Reject { Get-SafeRelative $path } "accepted unsafe path: $path"
}
# A previous lite candidate can update to the single complete distribution.
$fullZip = New-Package 'full-artwork' @{ 'installation.json'='{"schemaVersion":1,"variant":"full"}'; 'artwork-installed.json'='{"schemaVersion":1,"files":[{"path":"ui-assets/nikke/character-artwork/c100.webp"}]}'; 'ui-assets/nikke/character-artwork/c100.webp'='complete-art-image' }
foreach ($oldVariant in @('lite', 'full', 'legacy')) {
    $migrationTarget = New-Fixture ('migrate-' + $oldVariant)
    if ($oldVariant -ne 'legacy') { Write-Fixture "$migrationTarget\installation.json" ('{"schemaVersion":1,"variant":"' + $oldVariant + '"}') }
    Install-ValidatedPackage $fullZip (Get-UpdateHash $fullZip).Hash '1.0.11' $migrationTarget (Join-Path $suiteRoot ('txn-migrate-' + $oldVariant))
    Check ((Get-InstallationVariant $migrationTarget) -eq 'full') 'full installation marker not applied'
    Check ((Get-Content "$migrationTarget\ui-assets\nikke\character-artwork\c100.webp" -Raw) -eq 'complete-art-image') 'complete artwork missing'
    Assert-Protected $migrationTarget
}
$lightZip = New-Package 'rejected-light' @{ 'installation.json'='{"schemaVersion":1,"variant":"lite"}' }
$rejectTarget = New-Fixture 'reject-light'
Reject { Install-ValidatedPackage $lightZip (Get-UpdateHash $lightZip).Hash '1.0.11' $rejectTarget (Join-Path $suiteRoot 'txn-reject-light') } 'obsolete lite package accepted'
Check ((Read-InstallManifest $rejectTarget).version -eq '1.0.10') 'rejected package changed installation'
Assert-Protected $rejectTarget
$rollbackTarget = New-Fixture 'artwork-rollback'
Write-Fixture "$rollbackTarget\installation.json" '{"schemaVersion":1,"variant":"lite"}'
Write-Fixture "$rollbackTarget\ui-assets\nikke\character-artwork\c100.webp" 'original-art'
Reject { Install-ValidatedPackage $fullZip (Get-UpdateHash $fullZip).Hash '1.0.11' $rollbackTarget (Join-Path $suiteRoot 'txn-artwork-rollback') {} 8 } 'artwork failure not injected'
Check ((Get-InstallationVariant $rollbackTarget) -eq 'lite') 'rollback lost old installation marker'
Check ((Get-Content "$rollbackTarget\ui-assets\nikke\character-artwork\c100.webp" -Raw) -eq 'original-art') 'rollback lost original artwork'
Assert-Protected $rollbackTarget

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
New-Item -ItemType HardLink -Path "$target\alias.txt" -Target "$target\screenshots\keep.txt" | Out-Null
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
