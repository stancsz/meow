cd 'C:\Users\stanc\github\meow'

# Only kill processes older than 2 hours (allows short agents to finish work)
$cutoff = (Get-Date).AddHours(-2)

$logDir = "C:\Users\stanc\.meow"
if (!(Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

# Graceful kill node processes older than 2 hours
$nodeProcs = Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -lt $cutoff }
foreach ($proc in $nodeProcs) {
    $age = ((Get-Date) - $proc.StartTime).TotalMinutes
    Write-Host "Graceful kill node PID $($proc.Id) (age: $([math]::Round($age,1)) min)"
    $proc.CloseMainWindow() | Out-Null
}

Start-Sleep -Seconds 3

# Force kill only if still running after graceful
foreach ($proc in $nodeProcs) {
    if (!$proc.HasExited) {
        Write-Host "Force kill node PID $($proc.Id)"
        $proc.Kill() | Out-Null
    }
}

# Graceful kill bun processes older than 2 hours
$bunProcs = Get-Process -Name bun -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -lt $cutoff }
foreach ($proc in $bunProcs) {
    $age = ((Get-Date) - $proc.StartTime).TotalMinutes
    Write-Host "Graceful kill bun PID $($proc.Id) (age: $([math]::Round($age,1)) min)"
    $proc.CloseMainWindow() | Out-Null
}

Start-Sleep -Seconds 3

foreach ($proc in $bunProcs) {
    if (!$proc.HasExited) {
        Write-Host "Force kill bun PID $($proc.Id)"
        $proc.Kill() | Out-Null
    }
}

$remaining = Get-Process -Name node,bun -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -lt $cutoff }
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$nodeCount = $nodeProcs.Count
$bunCount = $bunProcs.Count
$remCount = $remaining.Count
$logMsg = "KillAgents ran at $timestamp - killed $nodeCount node, $bunCount bun - $remCount stale still running"
Add-Content "$logDir\agent.log" $logMsg
