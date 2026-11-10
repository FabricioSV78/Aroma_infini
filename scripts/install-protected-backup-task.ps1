$ErrorActionPreference = 'Stop'
if ($args.Count -ne 0) { throw 'This installer accepts no arguments.' }
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$launcher = Join-Path $projectRoot 'scripts\run-protected-backups.ps1'
$nodeExecutable = (Get-Command node.exe -CommandType Application -ErrorAction Stop).Source
$powershellExecutable = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
if (-not [IO.Path]::IsPathRooted($projectRoot) -or -not (Test-Path -LiteralPath $launcher -PathType Leaf) -or -not [IO.Path]::IsPathRooted($nodeExecutable)) { throw 'Backup runtime unavailable.' }
if ((Get-TimeZone).Id -ne 'SA Pacific Standard Time') { throw 'The approved schedule requires the Lima timezone (SA Pacific Standard Time).' }
$taskName = 'Aroma Infini - Respaldos locales protegidos'
$existing = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$arguments = '-NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $launcher + '"'
if ($existing -and ($existing.Actions.Count -ne 1 -or $existing.Actions[0].Execute -ne $powershellExecutable -or $existing.Actions[0].Arguments -ne $arguments)) { throw 'A different scheduled task already uses this name.' }
$action = New-ScheduledTaskAction -Execute $powershellExecutable -Argument $arguments -WorkingDirectory $projectRoot
$trigger = New-ScheduledTaskTrigger -Daily -At '02:00'
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1) -StartWhenAvailable -RunOnlyIfNetworkAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -Hidden
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Backups locales cifrados y ensayos aislados de desarrollo y producción. Requiere equipo encendido, sesión iniciada y sesiones CLI vigentes. Sin contraseña almacenada, sin retención/borrado automático y sin servicios de pago.' -Force | Out-Null
$verified = Get-ScheduledTask -TaskName $taskName
if ($verified.State -eq 'Disabled' -or $verified.Principal.LogonType -ne 'Interactive' -or $verified.Settings.MultipleInstances -ne 'IgnoreNew') { throw 'Task registration verification failed.' }
Write-Output 'Tarea habilitada: diaria a las 02:00 (Lima), solo con sesión iniciada; sin credenciales de Windows almacenadas.'
