cd 'C:\Users\stanc\github\meow'

# Graceful kill first (CloseMainWindow sends WM_CLOSE - lets apps clean up)
$nodeProcs = Get-Process -Name node -ErrorAction SilentlyContinue
foreach ($proc in $nodeProcs) {
    Write-Host "Graceful kill node PID $($proc.Id)"
    $proc.CloseMainWindow() | Out-Null
}
Start-Sleep -Seconds 3

# Force kill ONLY if still running (graceful failed or app didn't close)
foreach ($proc in $nodeProcs) {
    if (!$proc.HasExited) {
        Write-Host "Force kill node PID $($proc.Id) (graceful failed)"
        $proc.Kill() | Out-Null
    } else {
        Write-Host "Node PID $($proc.Id) exited gracefully"
    }
}

$bunProcs = Get-Process -Name bun -ErrorAction SilentlyContinue
foreach ($proc in $bunProcs) {
    Write-Host "Graceful kill bun PID $($proc.Id)"
    $proc.CloseMainWindow() | Out-Null
}
Start-Sleep -Seconds 3

foreach ($proc in $bunProcs) {
    if (!$proc.HasExited) {
        Write-Host "Force kill bun PID $($proc.Id) (graceful failed)"
        $proc.Kill() | Out-Null
    } else {
        Write-Host "Bun PID $($proc.Id) exited gracefully"
    }
}

$logDir = "C:\Users\stanc\.meow"
if (!(Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
Add-Content "$logDir\agent.log" "Agents killed at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
