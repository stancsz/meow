$killScriptPath = "C:\Users\stanc\github\meow\local-dev\kill-agents.ps1"
$featurePromptPath = "C:\Users\stanc\github\meow\local-dev\feature-prompt.txt"
$qaPromptPath = "C:\Users\stanc\github\meow\local-dev\qa-prompt.txt"
$cleanupPromptPath = "C:\Users\stanc\github\meow\local-dev\cleanup-prompt.txt"
$projectDir = "C:\Users\stanc\github\meow"

# Delete ALL existing Meow tasks
Write-Host "=== Deleting all existing Meow tasks ==="
Get-ScheduledTask | Where-Object { $_.TaskName -like "Meow-*" } | ForEach-Object {
    Write-Host "Deleting $($_.TaskName)..."
    schtasks /Delete /TN $_.TaskName /F 2>$null
}

# Create cleanup prompt if not exists
if (!(Test-Path $cleanupPromptPath)) {
    $cleanupPrompt = @"
You are the Cleanup agent for the Meow project ($projectDir). Your job is to find and fix messy files.
1. Find temp files: Get-ChildItem . -Recurse -Include "*.tmp","*.test.ts" | Where-Object { `$_.FullName -notmatch "node_modules" -and `$_.FullName -notmatch "meowpaw" } | Select-Object -First 20
2. Check for files in wrong locations (e.g. root .ts files that should be in meow/src/)
3. Check for empty directories
4. Look for merge conflicts: Get-Content (Get-ChildItem . -Recurse -Include "*.ts","*.js" | Select-Object -First 50) -Raw | Select-String "<<<<<< HEAD"
5. Clean any .trash folders
6. Commit each cleanup with: git add -A -and git commit -m "chore: cleanup <description>"
Never exit with uncommitted changes. Your last action must be a committed change.
"@
    $cleanupPrompt | Out-File -FilePath $cleanupPromptPath -Encoding UTF8
    Write-Host "Created cleanup-prompt.txt"
}

Write-Host ""
Write-Host "=== Creating new schedule ==="
Write-Host "  KillAgents: :00 (hourly, kills only >2h old processes)"
Write-Host "  QA:         :00 (hourly)"
Write-Host "  FeatureDev: :30 (hourly)"
Write-Host "  Cleanup:    :30 (hourly)"

# KillAgents - hourly at :00
$killCmd = "powershell.exe -ExecutionPolicy Bypass -File `"$killScriptPath`""
Write-Host "Creating Meow-KillAgents..."
schtasks /Create /TN "Meow-KillAgents" /TR $killCmd /SC HOURLY /MO 1 /ST 00:00 /F

# QA - hourly at :00
$qaCmd = "powershell.exe -ExecutionPolicy Bypass -NoProfile -Command cd `'" + $projectDir + "`'; Get-Content `'" + $qaPromptPath + "`' | claude --dangerously-skip-permissions --print"
Write-Host "Creating Meow-QAUxAgent..."
schtasks /Create /TN "Meow-QAUxAgent" /TR $qaCmd /SC HOURLY /MO 1 /ST 00:00 /F

# FeatureDev - hourly at :30
$featureCmd = "powershell.exe -ExecutionPolicy Bypass -NoProfile -Command cd `'" + $projectDir + "`'; Get-Content `'" + $featurePromptPath + "`' | claude --dangerously-skip-permissions --print"
Write-Host "Creating Meow-FeatureDevAgent..."
schtasks /Create /TN "Meow-FeatureDevAgent" /TR $featureCmd /SC HOURLY /MO 1 /ST 00:30 /F

# Cleanup - hourly at :30
$cleanupCmd = "powershell.exe -ExecutionPolicy Bypass -NoProfile -Command cd `'" + $projectDir + "`'; Get-Content `'" + $cleanupPromptPath + "`' | claude --dangerously-skip-permissions --print"
Write-Host "Creating Meow-CleanupAgent..."
schtasks /Create /TN "Meow-CleanupAgent" /TR $cleanupCmd /SC HOURLY /MO 1 /ST 00:30 /F

Write-Host ""
Write-Host "=== Final schedule ==="
Get-ScheduledTask | Where-Object { $_.TaskName -like "Meow-*" } | ForEach-Object {
    $info = Get-ScheduledTaskInfo -TaskName $_.TaskName
    Write-Host "$($_.TaskName): NextRun=$($info.NextRunTime)"
}
