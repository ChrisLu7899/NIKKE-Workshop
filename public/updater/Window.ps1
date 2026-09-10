# SPDX-License-Identifier: GPL-3.0-or-later
# Window activation only; never starts installation or terminates another process.
if (!('WorkshopUpdaterWindow' -as [type])) {
    Add-Type -TypeDefinition @'
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class WorkshopUpdaterWindow {
    private delegate bool EnumCallback(IntPtr window, IntPtr parameter);
    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumCallback callback, IntPtr parameter);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr window, out uint process);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern int GetWindowText(IntPtr window, StringBuilder text, int count);
    [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr window);
    [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
    [DllImport("user32.dll")] private static extern bool ShowWindowAsync(IntPtr window, int command);
    [DllImport("user32.dll")] private static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] private static extern bool FlashWindow(IntPtr window, bool invert);
    [DllImport("user32.dll", CharSet=CharSet.Unicode, SetLastError=true)] private static extern bool SetProp(IntPtr window, string name, IntPtr value);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern IntPtr GetProp(IntPtr window, string name);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] private static extern IntPtr RemoveProp(IntPtr window, string name);
    public static bool HasTarget(IntPtr window) { return GetProp(window, "NIKKEWorkshopUpdaterTarget") != IntPtr.Zero; }
    public static bool MatchesTarget(IntPtr window, string key) { return GetProp(window, key) != IntPtr.Zero; }
    public static void BindTarget(IntPtr window, string oldKey, string newKey) {
        if (!SetProp(window, newKey, new IntPtr(1))) throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        if (!SetProp(window, "NIKKEWorkshopUpdaterTarget", new IntPtr(1))) {
            if (oldKey != newKey) RemoveProp(window, newKey);
            throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
        }
        if (!String.IsNullOrEmpty(oldKey) && oldKey != newKey) RemoveProp(window, oldKey);
    }
    public static IntPtr Find(int process) {
        IntPtr found = IntPtr.Zero;
        EnumWindows(delegate(IntPtr window, IntPtr parameter) {
            uint owner; GetWindowThreadProcessId(window, out owner);
            if (owner != process) return true;
            var text = new StringBuilder(256); GetWindowText(window, text, text.Capacity);
            if (text.ToString() != "NIKKE Workshop \u00b7 \u66f4\u65b0\u5668") return true;
            found = window; return false;
        }, IntPtr.Zero);
        return found;
    }
    public static void Activate(IntPtr window) {
        if (window == IntPtr.Zero) return;
        // Explicitly show AFTER startup: the launcher's SW_HIDE also affects
        // the first GUI ShowWindow call, not just the PowerShell console.
        ShowWindowAsync(window, IsIconic(window) ? 9 : 5);
        if (!SetForegroundWindow(window)) FlashWindow(window, true);
    }
}
'@
}
function Get-UpdaterWindowKey([string]$Target) {
    $normalized = [IO.Path]::GetFullPath($Target).TrimEnd('\').ToLowerInvariant()
    $hash = [Security.Cryptography.SHA256]::Create()
    try { return 'NIKKEWorkshopUpdater-' + [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($normalized))).Replace('-', '') }
    finally { $hash.Dispose() }
}
function Show-ExistingUpdater([string]$Target) {
    $key = Get-UpdaterWindowKey $Target
    $expected = [regex]::Escape([IO.Path]::GetFullPath((Join-Path $Target 'updater\Updater.ps1')))
    $pattern = '(?i)(?:^|\s)-File\s+(?:"' + $expected + '"|' + $expected + ')(?:\s|$)'
    # New windows identify their selected installation, which can differ from
    # the launcher's directory. Untagged older versions use the exact script path.
    try {
        $candidates = @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" | Where-Object { $_.ProcessId -ne $PID })
        foreach ($candidate in $candidates) {
            $window = [WorkshopUpdaterWindow]::Find($candidate.ProcessId)
            if ($window -eq [IntPtr]::Zero) { continue }
            $matches = if ([WorkshopUpdaterWindow]::HasTarget($window)) { [WorkshopUpdaterWindow]::MatchesTarget($window, $key) } else { $candidate.CommandLine -match $pattern }
            if ($matches) { [WorkshopUpdaterWindow]::Activate($window); return $true }
        }
    } catch { return $false }
    return $false
}
