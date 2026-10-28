# The updater's file swap (docs/updates.md). The app writes an op list (plan.ts, planSwap),
# starts this script and quits; this waits for the app to close, runs the list, and
# starts the app again. Every move before `commit` is undone, newest first, if any op
# fails, so the install is either the old version or the new one, never half of each.
# `Roll back to previous version.cmd` runs this too, with updates\rollback-ops.txt.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File apply.ps1 -AppRoot <install folder> -Ops <op list> [-WaitPid <pid>]
param(
    [Parameter(Mandatory = $true)][string]$AppRoot,
    [Parameter(Mandatory = $true)][string]$Ops,
    [int]$WaitPid = 0
)
$ErrorActionPreference = 'Stop'
$AppRoot = [IO.Path]::GetFullPath($AppRoot)
$updates = Join-Path $AppRoot 'updates'
[void][IO.Directory]::CreateDirectory($updates)
$logFile = Join-Path $updates 'apply.log'

function Log([string]$message) {
    [IO.File]::AppendAllText($logFile, ('{0} {1}' -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $message) + "`r`n")
}

function Full([string]$relative) {
    return [IO.Path]::Combine($AppRoot, $relative.Replace('/', '\'))
}

# A file can stay locked for a moment after the app exits (its helper processes, a virus scanner).
function Retry([scriptblock]$action) {
    for ($i = 0; ; $i++) {
        try { & $action; return }
        catch {
            if ($i -ge 40) { throw }
            Start-Sleep -Milliseconds 250
        }
    }
}

function Move-Path([string]$from, [string]$to) {
    $source = Full $from
    $target = Full $to
    $isDir = [IO.Directory]::Exists($source)
    if (-not $isDir -and -not [IO.File]::Exists($source)) { throw "missing: $from" }
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($target))
    # An empty folder in the way (a file replaces a folder the old version had) goes.
    if ([IO.Directory]::Exists($target) -and @([IO.Directory]::GetFileSystemEntries($target)).Count -eq 0) {
        [IO.Directory]::Delete($target)
    }
    if ($isDir) { Retry { [IO.Directory]::Move($source, $target) } }
    else { Retry { [IO.File]::Move($source, $target) } }
}

$lines = New-Object System.Collections.ArrayList
$launch = $null
foreach ($line in [IO.File]::ReadAllLines($Ops)) {
    if ($line -eq '') { continue }
    $op = [string[]]($line -split "`t")
    [void]$lines.Add($op)
    if ($op[0] -eq 'launch' -and $null -eq $launch) { $launch = $op }
}
Log "start: $Ops ($($lines.Count) ops)"

# Wait for the app (and, for the .cmd, any copy of it the user left open) to close.
if ($WaitPid -gt 0) {
    try { [void](Get-Process -Id $WaitPid -ErrorAction Stop).WaitForExit(60000) } catch { }
}
if ($null -ne $launch) {
    $exe = [IO.Path]::GetFullPath($launch[1])
    $name = [IO.Path]::GetFileNameWithoutExtension($exe)
    $deadline = (Get-Date).AddSeconds(60)
    while ((Get-Date) -lt $deadline) {
        $running = @(Get-Process -Name $name -ErrorAction SilentlyContinue | Where-Object { try { $_.Path -eq $exe } catch { $false } })
        if ($running.Count -eq 0) { break }
        Start-Sleep -Milliseconds 250
    }
}

$done = New-Object System.Collections.ArrayList
$committed = $false
$ok = $true
$errorText = $null
try {
    foreach ($op in $lines) {
        switch ($op[0]) {
            'move' {
                if ($committed) {
                    try { Move-Path $op[1] $op[2] } catch { Log "clean-up: could not move $($op[1]): $_" }
                } else {
                    Move-Path $op[1] $op[2]
                    [void]$done.Add($op)
                }
            }
            'delete' {
                $path = Full $op[1]
                if ([IO.File]::Exists($path)) {
                    if ($committed) {
                        try { Retry { [IO.File]::Delete($path) } } catch { Log "clean-up: could not delete $($op[1]): $_" }
                    } else {
                        Retry { [IO.File]::Delete($path) }
                    }
                }
            }
            'rmdir' {
                $path = Full $op[1]
                if ([IO.Directory]::Exists($path)) {
                    try { Retry { [IO.Directory]::Delete($path, $true) } } catch { Log "clean-up: could not remove $($op[1]): $_" }
                }
            }
            'commit' { $committed = $true; Log "swapped ($($done.Count) moves)" }
            'launch' { }
            default { throw "unknown op: $($op[0])" }
        }
    }
} catch {
    $ok = $false
    $errorText = "$_"
    Log "FAILED: $errorText"
    if (-not $committed) {
        for ($i = $done.Count - 1; $i -ge 0; $i--) {
            $op = $done[$i]
            try { Move-Path $op[2] $op[1] } catch { Log "could not undo the move of $($op[1]): $_" }
        }
        Log "undid $($done.Count) moves"
    }
}

# Read by the app on its next launch (src/main/updater/index.ts).
$result = @{ ok = $ok; committed = $committed; error = $errorText; ops = [IO.Path]::GetFileName($Ops); at = (Get-Date).ToString('o') }
[IO.File]::WriteAllText((Join-Path $updates 'last-result.json'), ($result | ConvertTo-Json -Compress))
Log "done: ok=$ok committed=$committed"

if ($null -ne $launch) {
    $exe = $launch[1]
    $arguments = @($launch | Select-Object -Skip 2 | ForEach-Object { '"' + $_.Replace('"', '\"') + '"' }) -join ' '
    if ($arguments) { Start-Process -FilePath $exe -WorkingDirectory $AppRoot -ArgumentList $arguments }
    else { Start-Process -FilePath $exe -WorkingDirectory $AppRoot }
}
