# setup.ps1 — Install scheduled tasks for local-dev agents (Windows)
#
# Usage: .\setup.ps1
#   Or:  powershell -ExecutionPolicy Bypass -File setup.ps1
#
# Installs 3 scheduled tasks:
#   1. Meow-KillAgents      — every 30 min (graceful then force kill)
#   2. Meow-FeatureDevAgent — every hour (:01)
#   3. Meow-QAUxAgent       — every hour (:31)

$ErrorActionPreference = "Continue"

$ProjectDir = $PSScriptRoot | Split-Path -Parent
$ScriptsDir = $PSScriptRoot
$KillScriptPath = Join-Path $ScriptsDir "kill-agents.ps1"
$FeaturePromptPath = Join-Path $ScriptsDir "feature-prompt.txt"
$QAPromptPath = Join-Path $ScriptsDir "qa-prompt.txt"

# Ensure prompt files exist
if (!(Test-Path $FeaturePromptPath)) {
    @"
You are the Feature Development agent for the Meow project ($ProjectDir). Read docs/TODO.md, pick the top unchecked meow CLI item, implement it fully, test it, commit with a meaningful message (git add -A -and git commit -m `"feat(cli): <description>`"), mark the TODO item done. If no meow CLI tasks left, move to meowpaw. Make meaningful commits. Your last action before exiting must be a committed change.
"@ | Out-File -FilePath $FeaturePromptPath -Encoding UTF8
}

if (!(Test-Path $QAPromptPath)) {
    @"
You are the QA/UI-UX agent for the Meow project ($ProjectDir). Read docs/TODO.md and git log --oneline -10. Validate recent commits work by reading code and running tests. For any uncommitted changes, verify and commit. Update docs/TODO.md with completed items. Check for build errors: bun test. Report what you validated, committed, and what's pending.
"@ | Out-File -FilePath $QAPromptPath -Encoding UTF8
}

if (!(Test-Path $KillScriptPath)) {
    @"
cd '$ProjectDir'
Get-Process -Name node -ErrorAction SilentlyContinue | ForEach-Object { \$_.CloseMainWindow() | Out-Null }
Start-Sleep -Seconds 3
Get-Process -Name node -ErrorAction SilentlyContinue | ForEach-Object { \$_.Kill() | Out-Null }
Get-Process -Name bun -ErrorAction SilentlyContinue | ForEach-Object { \$_.CloseMainWindow() | Out-Null }
Start-Sleep -Seconds 3
Get-Process -Name bun -ErrorAction SilentlyContinue | ForEach-Object { \$_.Kill() | Out-Null }
\$logDir = "`$env:USERPROFILE\.meow"
if (!(Test-Path \$logDir)) { New-Item -ItemType Directory -Path \$logDir | Out-Null }
Add-Content "`$logDir\agent.log" "Agents killed at \$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
"@ | Out-File -FilePath $KillScriptPath -Encoding UTF8
}

# Delete old tasks
Write-Host "Removing old tasks..."
schtasks /Delete /TN "Meow-KillAgents" /F 2>$null
schtasks /Delete /TN "Meow-FeatureDevAgent" /F 2>$null
schtasks /Delete /TN "Meow-QAUxAgent" /F 2>$null

# Create tasks using schtasks.exe
Write-Host "Creating Meow-KillAgents..."
$killCmd = "powershell.exe -ExecutionPolicy Bypass -File `"$KillScriptPath`""
schtasks /Create /TN "Meow-KillAgents" /TR $killCmd /SC MINUTE /MO 30 /F

Write-Host "Creating Meow-FeatureDevAgent..."
$featureCmd = "powershell.exe -ExecutionPolicy Bypass -NoProfile -Command cd `"" + $ProjectDir + "`"; Get-Content `"" + $FeaturePromptPath + "`" | claude --dangerously-skip-permissions --print"
schtasks /Create /TN "Meow-FeatureDevAgent" /TR $featureCmd /SC HOURLY /MO 1 /ST 00:01 /F

Write-Host "Creating Meow-QAUxAgent..."
$qaCmd = "powershell.exe -ExecutionPolicy Bypass -NoProfile -Command cd `"" + $ProjectDir + "`"; Get-Content `"" + $QAPromptPath + "`" | claude --dangerously-skip-permissions --print"
schtasks /Create /TN "Meow-QAUxAgent" /TR $qaCmd /SC HOURLY /MO 1 /ST 00:31 /F

Write-Host ""
Write-Host "Installed 3 scheduled tasks:"
Get-ScheduledTask | Where-Object { $_.TaskName -like "Meow-*" } | Select-Object TaskName, State
