# SPDX-License-Identifier: GPL-3.0-or-later
param([Parameter(Mandatory=$true)][string]$BuildDirectory, [Parameter(Mandatory=$true)][string]$OutputDirectory, [Parameter(Mandatory=$true)][string]$CharacterTable)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$build = (Resolve-Path -LiteralPath $BuildDirectory).Path.TrimEnd('\')
$table = (Resolve-Path -LiteralPath $CharacterTable).Path
$output = [IO.Path]::GetFullPath($OutputDirectory).TrimEnd('\')
if ((Test-Path -LiteralPath $output) -or $output.StartsWith($build + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Use a new output directory outside the build.' }
$manifest = Get-Content -LiteralPath (Join-Path $build 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$art = Get-Content -LiteralPath (Join-Path $build 'artwork-manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($manifest.name -ne 'NIKKE Workshop' -or $manifest.version -ne $art.appVersion) { throw 'Build/artwork version mismatch.' }
$installation = Get-Content -LiteralPath (Join-Path $build 'installation.json') -Raw -Encoding UTF8 | ConvertFrom-Json
if ($installation.schemaVersion -ne 1 -or $installation.variant -ne 'full' -or @($art.files).Count -eq 0) { throw 'A complete build with all artwork is required.' }
& node (Join-Path $PSScriptRoot 'check-character-artwork-coverage.mjs') "--character-table=$table" "--build-directory=$build"
if ($LASTEXITCODE -ne 0) { throw 'Character artwork coverage check failed; packaging stopped.' }
$images = @{}
foreach ($entry in $art.files) {
    if ($entry.path -cnotmatch '^ui-assets/nikke/character-artwork/[a-z0-9_-]+\.webp$' -or $images.ContainsKey($entry.path)) { throw 'Invalid artwork manifest.' }
    $file = Join-Path $build $entry.path
    if ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash -ne $entry.sha256 -or (Get-Item -LiteralPath $file).Length -ne $entry.bytes) { throw 'Build artwork hash mismatch.' }
    $images[$entry.path] = $true
}
[IO.Directory]::CreateDirectory($output) | Out-Null
$results = @()
foreach ($variant in @('full')) {
    $target = Join-Path $output $variant
    [IO.Directory]::CreateDirectory($target) | Out-Null
    foreach ($file in (Get-ChildItem -LiteralPath $build -File -Recurse)) {
        $rel = $file.FullName.Substring($build.Length + 1).Replace('\', '/')
        if ($rel -match '(^|/)(\.git|node_modules|\.tmp|tests|screenshots)(/|$)' -or $rel -match '\.(log|map)$') { throw 'Non-distributable file in build.' }
        $isImage = $images.ContainsKey($rel)
        if ($rel.StartsWith('ui-assets/nikke/character-artwork/') -and $rel.EndsWith('.webp') -and !$isImage) { throw 'Uncatalogued artwork.' }
        $destination = Join-Path $target $rel
        [IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination)) | Out-Null
        [IO.File]::Copy($file.FullName, $destination, $false)
    }
    foreach ($folder in (Get-ChildItem -LiteralPath (Join-Path $build 'screenshots') -Directory -ErrorAction SilentlyContinue)) {
        [IO.Directory]::CreateDirectory((Join-Path $target ('screenshots/' + $folder.Name))) | Out-Null
    }
    $name = 'NIKKE-Workshop.zip'
    $zip = Join-Path $output $name
    [IO.Compression.ZipFile]::CreateFromDirectory($target, $zip, [IO.Compression.CompressionLevel]::Optimal, $false)
    # Read every entry back and compare bytes with the candidate directory.
    $archive = [IO.Compression.ZipFile]::OpenRead($zip)
    $count = 0
    try {
        foreach ($entry in $archive.Entries) {
            if ($entry.FullName.EndsWith('/') -or $entry.FullName.EndsWith('\')) { continue }
            $stream = $entry.Open(); $sha = [Security.Cryptography.SHA256]::Create()
            try { $digest = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') } finally { $sha.Dispose(); $stream.Dispose() }
            if ($digest -ne (Get-FileHash -LiteralPath (Join-Path $target $entry.FullName) -Algorithm SHA256).Hash) { throw 'ZIP verification failed.' }
            $count++
        }
    } finally { $archive.Dispose() }
    $results += @{ variant=$variant; zip=$zip; bytes=(Get-Item -LiteralPath $zip).Length; sha256=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash; files=$count }
}
$report = @{ version=$manifest.version; artworkRevision=$art.revision; sourceRef=$art.sourceRef; packages=$results; githubUpdated=$false; deletedFiles=0 }
$report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $output 'package-report.json') -Encoding UTF8
$report | ConvertTo-Json -Depth 6
