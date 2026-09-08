# SPDX-License-Identifier: GPL-3.0-or-later
# Windows PowerShell 5.1; no downloaded executable or external runtime required.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
function Get-UpdateHash([string]$LiteralPath, [ValidateSet('SHA256')][string]$Algorithm = 'SHA256') {
    $stream = [IO.File]::OpenRead($LiteralPath)
    $hasher = [Security.Cryptography.SHA256]::Create()
    try { return [PSCustomObject]@{ Hash = [BitConverter]::ToString($hasher.ComputeHash($stream)).Replace('-', '') } }
    finally { $hasher.Dispose(); $stream.Dispose() }
}
if (!('WorkshopFileSafety' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;
public static class WorkshopFileSafety {
    [StructLayout(LayoutKind.Sequential)] public struct Info {
        public uint Attr; public System.Runtime.InteropServices.ComTypes.FILETIME Created, Accessed, Written;
        public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
    }
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle handle, out Info info);
    public static void Check(string path) {
        if (!File.Exists(path)) return;
        using (var stream = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite)) {
            Info info;
            if (!GetFileInformationByHandle(stream.SafeFileHandle, out info) || info.Links != 1)
                throw new IOException("Hard-linked files are not allowed in update paths.");
        }
    }
}
'@
}
function Assert-PlainPath([string]$Path) {
    $full = [IO.Path]::GetFullPath($Path)
    $node = $full
    while ($node) {
        if (Test-Path -LiteralPath $node) {
            if ((Get-Item -LiteralPath $node -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse points are not allowed in update paths.' }
        }
        $parent = [IO.Path]::GetDirectoryName($node)
        if ($parent -eq $node) { break }; $node = $parent
    }
    [WorkshopFileSafety]::Check($full)
    return $full
}
function Get-SafeRelative([string]$Name) {
    $name = $Name.Replace('\', '/')
    if ($name.Length -gt 220 -or $name.StartsWith('/') -or $name.Contains(':')) { throw 'Unsafe ZIP path.' }
    $parts = $name.TrimEnd('/').Split('/')
    foreach ($part in $parts) {
        if (!$part -or $part -in @('.', '..') -or $part -match '[\x00-\x1f<>"|?*~]' -or $part -match '[. ]$' -or $part -match '^(?i:CON|PRN|AUX|NUL|COM[0-9]|LPT[0-9])(?:\.|$)') { throw 'Unsafe ZIP path component.' }
    }
    return ($parts -join '\')
}
function Test-Protected([string]$Relative) {
    # snapshots is an explicit user invariant. screenshots also contains user inputs.
    return (($Relative -split '[\\/]')[0] -in @('snapshots', 'screenshots'))
}
function Join-Safe([string]$Root, [string]$Relative) {
    $rootPath = (Assert-PlainPath $Root).TrimEnd('\')
    $rel = Get-SafeRelative $Relative
    $full = [IO.Path]::GetFullPath((Join-Path $rootPath $rel))
    if (!$full.StartsWith($rootPath + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Target escaped installation root.' }
    return (Assert-PlainPath $full)
}
function Read-InstallManifest([string]$Root) {
    $rootPath = Assert-PlainPath $Root
    if ($rootPath -eq [IO.Path]::GetPathRoot($rootPath) -or $rootPath -eq $env:USERPROFILE -or $rootPath.StartsWith('\\')) { throw 'Invalid installation directory.' }
    $manifest = Get-Content -LiteralPath (Join-Safe $rootPath 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ((Test-Path -LiteralPath (Join-Path $rootPath '.git')) -or (Test-Path -LiteralPath (Join-Path $rootPath 'node_modules'))) { throw 'Refusing to update a development/source directory.' }
    if ($manifest.name -ne 'NIKKE Workshop' -or $manifest.manifest_version -ne 3 -or $manifest.version -notmatch '^\d+\.\d+\.\d+(\.\d+)?$') { throw 'Not a NIKKE Workshop installation.' }
    return $manifest
}
function Get-Version([string]$Value) {
    if ($Value -notmatch '^v?\d+\.\d+\.\d+(\.\d+)?$') { throw 'Unsupported stable version.' }
    $parts = $Value.TrimStart('v').Split('.')
    foreach ($part in $parts) { if ([long]$part -gt 65535) { throw 'Unsupported stable version component.' } }
    if ($parts.Count -eq 3) { $Value = $Value.TrimStart('v') + '.0' } else { $Value = $Value.TrimStart('v') }
    return [version]$Value
}
function Write-JsonAtomic([string]$Path, $Value) {
    $null = Assert-PlainPath $Path
    $temp = $Path + '.next'
    $null = Assert-PlainPath $temp
    [IO.File]::WriteAllText($temp, ($Value | ConvertTo-Json -Depth 12 -Compress), (New-Object Text.UTF8Encoding($false)))
    if (Test-Path -LiteralPath $Path) { [IO.File]::Replace($temp, $Path, [NullString]::Value) } else { [IO.File]::Move($temp, $Path) }
}
function Restore-Transaction([string]$Transaction, [string]$Target) {
    $journalPath = Join-Safe $Transaction 'journal.json'
    if (!(Test-Path -LiteralPath $journalPath)) { return }
    $journal = Get-Content -LiteralPath $journalPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($journal.target -ne [IO.Path]::GetFullPath($Target)) { throw 'Recovery target mismatch.' }
    if ($journal.state -ne 'applying') { return }
    # Validate ALL recovery paths and backup hashes before changing any files.
    foreach ($entry in $journal.entries) {
        if (Test-Protected $entry.relative) { throw 'Protected path in recovery journal.' }
        $null = Join-Safe $Target $entry.relative
        if ($entry.existed) {
            $backup = Join-Safe (Join-Path $Transaction 'backup') $entry.relative
            if ((Get-UpdateHash -LiteralPath $backup -Algorithm SHA256).Hash -ne $entry.hash) { throw 'Backup checksum mismatch; recovery stopped.' }
        }
    }
    foreach ($entry in ($journal.entries | Sort-Object { $_.relative -eq 'manifest.json' })) {
        if (Test-Protected $entry.relative) { throw 'Protected path in recovery journal.' }
        $destination = Join-Safe $Target $entry.relative
        if ($entry.existed) {
            $backup = Join-Safe (Join-Path $Transaction 'backup') $entry.relative
            if ((Get-UpdateHash -LiteralPath $backup -Algorithm SHA256).Hash -ne $entry.hash) { throw 'Backup checksum mismatch; recovery stopped.' }
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
            [IO.File]::Copy($backup, $destination, $true)
        } elseif (Test-Path -LiteralPath $destination -PathType Leaf) {
            # Exact file created by this transaction, never a directory or recursive delete.
            [IO.File]::Delete($destination)
        }
    }
    $journal.state = 'rolledBack'
    Write-JsonAtomic $journalPath $journal
}
function Expand-ValidatedPackage([string]$Zip, [string]$Stage, [string]$Version) {
    $archive = [IO.Compression.ZipFile]::OpenRead($Zip)
    try {
        $seen = New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
        $files = New-Object 'Collections.Generic.List[object]'
        [long]$total = 0
        if ($archive.Entries.Count -gt 40000) { throw 'Too many ZIP entries.' }
        foreach ($entry in $archive.Entries) {
            $relative = Get-SafeRelative $entry.FullName
            if (!$seen.Add($relative)) { throw 'Duplicate ZIP path.' }
            # Unix symlink/file-type bits: only normal files or directories.
            $kind = ($entry.ExternalAttributes -shr 16) -band 0xF000
            if ($kind -notin @(0, 0x8000, 0x4000) -or ($entry.ExternalAttributes -band 0x400)) { throw 'ZIP links are not allowed.' }
            if (Test-Protected $relative) { continue }
            if ($entry.FullName.EndsWith('/') -or $entry.FullName.EndsWith('\')) { continue }
            $total += $entry.Length
            if ($total -gt 16GB -or $entry.Length -gt 2GB) { throw 'Expanded ZIP exceeds size limit.' }
            $files.Add(@{ entry = $entry; relative = $relative })
        }
        Assert-FreeSpace $Stage ($total + 64MB)
        foreach ($file in $files) {
            $destination = Join-Safe $Stage $file.relative
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
            [IO.Compression.ZipFileExtensions]::ExtractToFile($file.entry, $destination, $false)
        }
        $manifest = Read-InstallManifest $Stage
        if ((Get-Version $manifest.version) -ne (Get-Version $Version)) { throw 'Package version differs from release.' }
        foreach ($required in @('index.html', 'management.html', 'background.js')) {
            if (!(Test-Path -LiteralPath (Join-Safe $Stage $required) -PathType Leaf)) { throw 'Incomplete installation ZIP.' }
        }
        return @($files | ForEach-Object { $_.relative })
    } finally { $archive.Dispose() }
}
function Install-ValidatedPackage([string]$Zip, [string]$Digest, [string]$Version, [string]$Target, [string]$Transaction, [scriptblock]$Progress = {}, [int]$FailAfter = -1) {
    $current = Read-InstallManifest $Target
    if ((Get-Version $Version) -le (Get-Version $current.version)) { throw 'Downgrade or same-version install is not allowed.' }
    if ($Digest -notmatch '^[a-fA-F0-9]{64}$' -or (Get-UpdateHash -LiteralPath $Zip -Algorithm SHA256).Hash -ne $Digest) { throw 'ZIP SHA-256 mismatch.' }
    $stage = Join-Safe $Transaction 'stage'
    [IO.Directory]::CreateDirectory($stage) | Out-Null
    $files = @(Expand-ValidatedPackage $Zip $stage $Version)
    & $Progress @{ status = 'backingUp' }
    [long]$backupBytes = 0
    [long]$installBytes = 0
    foreach ($relative in $files) {
        $destination = Join-Safe $Target $relative
        if (Test-Path -LiteralPath $destination -PathType Leaf) { $backupBytes += (Get-Item -LiteralPath $destination).Length }
        $installBytes += (Get-Item -LiteralPath (Join-Safe $stage $relative)).Length
    }
    Assert-FreeSpace $Transaction ($backupBytes + $installBytes + 64MB)
    Assert-FreeSpace $Target ($installBytes + 64MB)
    $entries = @()
    foreach ($relative in $files) {
        $destination = Join-Safe $Target $relative
        $existed = Test-Path -LiteralPath $destination -PathType Leaf
        if ((Test-Path -LiteralPath $destination) -and !$existed) { throw 'File/directory conflict at install target.' }
        $hash = $null
        if ($existed) {
            $backup = Join-Safe (Join-Path $Transaction 'backup') $relative
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($backup)) | Out-Null
            [IO.File]::Copy($destination, $backup, $false)
            $hash = (Get-UpdateHash -LiteralPath $backup -Algorithm SHA256).Hash
        }
        $entries += @{ relative = $relative; existed = $existed; hash = $hash }
    }
    $journalPath = Join-Safe $Transaction 'journal.json'
    Write-JsonAtomic $journalPath @{ target = [IO.Path]::GetFullPath($Target); state = 'applying'; entries = $entries }
    try {
        $count = 0
        # Manifest last: a partial update must never advertise the new version.
        foreach ($relative in ($files | Sort-Object { $_ -eq 'manifest.json' })) {
            if (Test-Protected $relative) { throw 'Protected path reached installer.' }
            $destination = Join-Safe $Target $relative
            [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
            $source = Join-Safe $stage $relative
            [IO.File]::Copy($source, $destination, $true)
            if ((Get-UpdateHash -LiteralPath $source -Algorithm SHA256).Hash -ne (Get-UpdateHash -LiteralPath $destination -Algorithm SHA256).Hash) { throw 'Installed file checksum mismatch.' }
            $count++
            if ($count % 20 -eq 0 -or $count -eq $files.Count) { & $Progress @{ status = 'installing'; received = $count; total = $files.Count } }
            if ($FailAfter -eq $count) { throw 'Injected transaction failure.' }
        }
        Write-JsonAtomic $journalPath @{ target = [IO.Path]::GetFullPath($Target); state = 'complete'; entries = $entries }
    } catch {
        $reason = $_.Exception.Message
        Restore-Transaction $Transaction $Target
        throw "Installation failed and was rolled back: $reason"
    }
    & $Progress @{ status = 'complete'; version = $Version; message = 'Update installed. snapshots and screenshots were not changed. Reload the extension.' }
}
function Get-ReleasePackage([string]$Version, [long]$AssetId) {
    $release = Get-LatestRelease
    if ($release.draft -or $release.prerelease -or (Get-Version $release.tag_name) -ne (Get-Version $Version) -or $release.html_url -cne "https://github.com/ChrisLu7899/NIKKE-Workshop/releases/tag/$($release.tag_name)") { throw 'Latest stable release changed. Check again in the extension.' }
    $asset = @($release.assets | Where-Object { $_.id -eq $AssetId })
    $names = @('NIKKE-Workshop.zip', "NIKKE-Workshop-$($release.tag_name).zip", "NIKKE-Workshop-$Version.zip")
    if ($asset.Count -ne 1 -or $asset[0].name -cnotin $names) { throw 'Not an approved installation ZIP.' }
    $asset = $asset[0]
    if ($asset.browser_download_url -cne "https://github.com/ChrisLu7899/NIKKE-Workshop/releases/download/$($release.tag_name)/$($asset.name)" -or $asset.digest -notmatch '^sha256:[a-fA-F0-9]{64}$' -or $asset.size -le 0 -or $asset.size -gt 8GB) { throw 'Missing checksum or invalid release asset.' }
    return $asset
}
function Get-LatestRelease {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $release = Invoke-RestMethod 'https://api.github.com/repos/ChrisLu7899/NIKKE-Workshop/releases/latest' -Headers @{ 'User-Agent' = 'NIKKE-Workshop-Updater'; Accept = 'application/vnd.github+json' } -TimeoutSec 30
    $null = Get-Version $release.tag_name
    if ($release.draft -or $release.prerelease -or $release.html_url -cne "https://github.com/ChrisLu7899/NIKKE-Workshop/releases/tag/$($release.tag_name)") { throw 'Untrusted stable release.' }
    return $release
}
function Get-UpdateStateRoot([string]$Target) {
    $hash = [Security.Cryptography.SHA256]::Create()
    try { $key = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes([IO.Path]::GetFullPath($Target).ToLowerInvariant()))).Replace('-', '').Substring(0, 20) }
    finally { $hash.Dispose() }
    return Join-Safe (Join-Path $env:LOCALAPPDATA 'NIKKE-Workshop-Updater') $key
}
function Get-PendingTransactions([string]$StateRoot) {
    if (!(Test-Path -LiteralPath $StateRoot)) { return @() }
    $null = Assert-PlainPath $StateRoot
    return @(Get-ChildItem -LiteralPath $StateRoot -Directory | Where-Object { $_.Name -match '^txn-[a-f0-9]{32}$' } | ForEach-Object {
        $journal = Join-Safe $_.FullName 'journal.json'
        if (Test-Path -LiteralPath $journal) {
            $data = Get-Content -LiteralPath $journal -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($data.state -eq 'applying') { $_.FullName }
        }
    })
}
function Invoke-ReleaseInstall([string]$Version, [long]$AssetId, [string]$Target, [scriptblock]$Progress) {
    $null = Read-InstallManifest $Target
    $stateRoot = Get-UpdateStateRoot $Target
    if (@(Get-PendingTransactions $stateRoot).Count -gt 0) { throw 'Unfinished transaction exists; recover it before updating.' }
    $asset = Get-ReleasePackage $Version $AssetId
    $transaction = Join-Safe $stateRoot ('txn-' + [guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($transaction) | Out-Null
    Assert-FreeSpace $transaction ([long]$asset.size + 64MB)
    $zip = Join-Safe $transaction 'package.zip'
    Save-ReleasePackage $asset $zip $Progress
    & $Progress @{ status = 'verifying' }
    Install-ValidatedPackage $zip $asset.digest.Substring(7) $Version $Target $transaction $Progress
}
function Assert-FreeSpace([string]$Path, [long]$Required) {
    $drive = New-Object IO.DriveInfo([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Path)))
    if ($drive.AvailableFreeSpace -lt $Required) { throw 'Insufficient disk space. Free disk space and retry.' }
}
function Register-UpdateProtocol([string]$Target, [string]$Scheme = 'nikke-workshop') {
    if ($Scheme -notmatch '^nikke-workshop(?:-test-[a-f0-9]+)?$') { throw 'Invalid protocol name.' }
    $null = Read-InstallManifest $Target
    $launcher = Join-Safe $Target 'Workshop-Updater.vbs'
    if (!(Test-Path -LiteralPath $launcher -PathType Leaf)) { throw 'Updater launcher not found.' }
    $base = "Software\Classes\$Scheme"
    $old = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($base)
    if ($old) {
        try { if ($old.GetValue('WorkshopUpdater') -ne '1') { throw 'Protocol is owned by another application; registration stopped.' } }
        finally { $old.Dispose() }
    }
    $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($base)
    try { $key.SetValue('', 'URL:NIKKE Workshop Updater'); $key.SetValue('URL Protocol', ''); $key.SetValue('WorkshopUpdater', '1') }
    finally { $key.Dispose() }
    $command = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey("$base\shell\open\command")
    # Deliberately DO NOT interpolate or pass the URI (%1). It can only open UI.
    try { $command.SetValue('', ('"{0}" "{1}"' -f (Join-Path $env:SystemRoot 'System32\wscript.exe'), $launcher)) }
    finally { $command.Dispose() }
}
function Save-ReleasePackage($Asset, [string]$Destination, [scriptblock]$Progress) {
    $url = [uri]$Asset.browser_download_url
    $response = $null
    for ($redirect = 0; $redirect -lt 6; $redirect++) {
        if ($url.Scheme -ne 'https' -or $url.Host -notin @('github.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com')) { throw 'Untrusted download redirect.' }
        $request = [Net.HttpWebRequest]::Create($url)
        $request.AllowAutoRedirect = $false; $request.Timeout = 30000; $request.ReadWriteTimeout = 30000
        $request.UserAgent = 'NIKKE-Workshop-Updater'
        $response = $request.GetResponse()
        if ([int]$response.StatusCode -in @(301, 302, 303, 307, 308)) {
            $next = New-Object uri($url, $response.Headers['Location']); $response.Close(); $response = $null; $url = $next; continue
        }
        break
    }
    if (!$response -or [int]$response.StatusCode -ne 200) { throw 'Download failed.' }
    $inputStream = $null; $outputStream = $null
    try {
        $inputStream = $response.GetResponseStream()
        $outputStream = [IO.File]::Open($Destination, [IO.FileMode]::CreateNew)
        $buffer = New-Object byte[] 1048576
        [long]$received = 0; $last = [datetime]::MinValue
        while (($read = $inputStream.Read($buffer, 0, $buffer.Length)) -gt 0) {
            $received += $read
            if ($received -gt $Asset.size) { throw 'Download exceeds declared size.' }
            $outputStream.Write($buffer, 0, $read)
            if (([datetime]::UtcNow - $last).TotalMilliseconds -gt 500) {
                & $Progress @{ status = 'downloading'; received = $received; total = $Asset.size }
                $last = [datetime]::UtcNow
            }
        }
        if ($received -ne $Asset.size) { throw 'Download is incomplete.' }
    } finally {
        if ($outputStream) { $outputStream.Dispose() }; if ($inputStream) { $inputStream.Dispose() }; $response.Close()
    }
}
