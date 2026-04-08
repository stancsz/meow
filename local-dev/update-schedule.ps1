$killScriptPath = "C:\Users\stanc\github\meow\local-dev\kill-agents.ps1"
$featurePromptPath = "C:\Users\stanc\github\meow\local-dev\feature-prompt.txt"
$qaPromptPath = "C:\Users\stanc\github\meow\local-dev\qa-prompt.txt"
$cleanupPromptPath = "C:\Users\stanc\github\meow\local-dev\cleanup-prompt.txt"
$projectDir = "C:\Users\stanc\github\meow"

Write-Host "=== Updating schedule ==="
Write-Host "  KillAgents: :00 (hourly, kills only >2h old processes)"
Write-Host "  QA:         :00 (hourly)"
Write-Host "  FeatureDev: :30 (hourly)"
Write-Host "  Cleanup:    :30 (hourly, cleans stale files and commits)"

# Create cleanup prompt if not exists
if (!(Test-Path $cleanupPromptPath)) {
    $cleanupPrompt = @"
You are the Cleanup agent for the Meow project ($projectDir). Your job is to find and fix messy files.
1. Find temporary/test/debug files: find . -name "*.tmp" -o -name "*.test.ts" -path "*/tests/*" | head -20
2. Check for files in wrong locations (e.g. root .ts files that should be in meow/src/)
3. Check for empty directories
4. Look for merge conflicts unresolved: grep -r "<<<<<< HEAD" .
5. Remove any .trash folders with old content
6. For any cleanup action taken, commit with message: "chore: cleanup <what was cleaned>"
Your last action must be a committed change. Never exit with uncommitted changes.
"@
    $cleanupPrompt | Out-File -FilePath $cleanupPromptPath -Encoding UTF8
    Write-Host "Created cleanup-prompt.txt"
}

# KillAgents - hourly at :00
$killCmd = "powershell.exe -ExecutionPolicy Bypass -File `"$killScriptPath`""
schtasks /Delete /TN "Meow-KillAgents" /F 2>$null
Write-Host "Creating Meow-KillAgents at :00..."
schtasks /Create /TN "Meow-KillAgents" /TR $killCmd /SC HOURLY /MO 1 /ST 00:00 /F

# QA - hourly at :00
$qaCmd = "powershell.exe -ExecutionPolicy Bypass -NoProfile -Command cd `'" + $projectDir + "`'; Get-Content `'" + $qaPromptPath + "`' | claude --dangerously-skip-permissions --print"
schtasks /Delete /TN "Meow-QAUxAgent" /F 2>$null
Write-Host "Creating Meow-QAUxAgent at :00..."
schtasks /Create /TN "Meow-QAUxAgent" /TR $qaCmd /SC HOURLY /MO 1 /ST 00:00 /F

# FeatureDev - hourly at :30
$featureCmd = "powershell.exe -ExecutionPolicy Bypass -NoProfile -Command cd `'" + $projectDir + "`'; Get-Content `'" + $featurePromptPath + "`' | claude --dangerously-skip-permissions --print"
schtasks /Delete /TN "Meow-FeatureDevAgent" /F 2>$null
Write-Host "Creating Meow-FeatureDevAgent at :30..."
schtasks /Create /TN "Meow-FeatureDevAgent" /TR $featureCmd /SC HOURLY /MO 1 /ST 00:30 /F

# Cleanup - hourly at :30
$cleanupCmd = "powershell.exe -ExecutionPolicy Bypass -NoProfile -Command cd `'" + $projectDir + "`'; Get-Content `'" + $cleanupPromptPath + "`' | claude --dangerously-skip-permissions --print"
schtasks /Delete /TN "Meow-CleanupAgent" /F 2>$null
Write-Host "Creating Meow-CleanupAgent at :30..."
schtasks /Create /TN "Meow-CleanupAgent" /TR $cleanupCmd /SC HOURLY /MO 1 /ST 00:30 /F

Write-Host ""
Write-Host "=== Final schedule ==="
Get-ScheduledTask | Where-Object { $_.TaskName -like "Meow-*" } | ForEach-Object {
    $info = Get-ScheduledTaskInfo -TaskName $_.TaskName
    Write-Host "$($_.TaskName): NextRun=$($info.NextRunTime)"
}
