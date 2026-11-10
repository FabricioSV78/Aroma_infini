$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'This launcher accepts no arguments.' }
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$backupScript = Join-Path $projectRoot 'scripts\backup-scheduled.mjs'
$nodeExecutable = (Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
if (-not [IO.Path]::IsPathRooted($nodeExecutable) -or -not (Test-Path -LiteralPath $backupScript -PathType Leaf)) { throw 'Backup runtime unavailable.' }
$env:DO_NOT_TRACK = '1'
$env:WRANGLER_SEND_METRICS = 'false'
$env:NODE_OPTIONS = '--use-system-ca'
$hash = [Security.Cryptography.SHA256]::Create()
$mutexHash = [BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot))).Replace('-', '')
$mutex = New-Object Threading.Mutex($false, ('Local\AromaInfiniProtectedBackup-' + $mutexHash))
$locked = $false
try {
    try { $locked = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
    if (-not $locked) { exit 0 }
    $process = Start-Process -FilePath $nodeExecutable -ArgumentList @(('"' + $backupScript + '"')) -WorkingDirectory $projectRoot -WindowStyle Hidden -Wait -PassThru
    exit $process.ExitCode
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
    $hash.Dispose()
}
