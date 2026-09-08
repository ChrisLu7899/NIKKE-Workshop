' SPDX-License-Identifier: GPL-3.0-or-later
Option Explicit
Dim files, shell, root, script, exe, result
Set files = CreateObject("Scripting.FileSystemObject")
Set shell = CreateObject("WScript.Shell")
root = files.GetParentFolderName(WScript.ScriptFullName)
script = files.BuildPath(root, "updater\Updater.ps1")
exe = shell.ExpandEnvironmentStrings("%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe")
If Not files.FileExists(script) Then
  MsgBox "Updater files are missing. Please extract the complete NIKKE Workshop package.", 16, "NIKKE Workshop"
  WScript.Quit 1
End If
' Ignore all incoming arguments; never pass a URL or shell command to PowerShell.
result = shell.Run("""" & exe & """ -NoProfile -STA -ExecutionPolicy Bypass -File """ & script & """", 0, True)
If result <> 0 Then MsgBox "Updater could not start. See updater\README.md for manual startup instructions.", 16, "NIKKE Workshop"
