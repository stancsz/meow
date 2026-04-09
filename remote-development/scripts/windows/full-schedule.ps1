# full-schedule.ps1 — Install all Meow scheduled tasks (Windows)
#
# Schedule:
#   :00 - KillAgents (hourly, kills only >2h old processes)
#   :00 - FeatureDev (implements top TODO item, commits)
#   :15 - QA (validates commits, runs tests, commits fixes)
#   :30 - FeatureDev2 + Cleanup (cleans temp files, commits cleanup)
#   :45 - TODOUpdater (reviews state, updates TODO.md, commits)
#
# All agents use --dangerously-skip-permissions --continue

$killScriptPath = "C:\Users\stanc\github\meow\local-dev\kill-agents.ps1"
$featurePromptPath = "C:\Users\stanc\github\meow\local-dev\feature-prompt.txt"
$qaPromptPath = "C:\Users\stanc\github\meow\local-dev\qa-prompt.txt"
$cleanupPromptPath = "C:\Users\stanc\github\meow\local-dev\cleanup-prompt.txt"
$todoPromptPath = "C:\Users\stanc\github\meow\local-dev\TODO-prompt.txt"
$projectDir = "C:\Users\stanc\github\meow"

Write-Host "=== Installing Meow scheduled tasks ==="

# Create prompts if missing
if (!(Test-Path $cleanupPromptPath)) {
    @"
You are the Cleanup agent for the Meow project ($projectDir). Your job is to find and fix messy files, then commit your cleanup work.

WORKFLOW:
1. Find temp files: run `find . -name "*.tmp" -o -name "*.bak" -o -name "*~" -o -name "*.log" | grep -v node_modules | grep -v meowpaw | head -20`
2. Check for files in wrong locations (e.g. root .ts files that should be in meow/src/)
3. Check for empty directories: `find . -type d -empty | grep -v node_modules`
4. Look for merge conflicts: `grep -r "<<<<<< HEAD" --include="*.ts" --include="*.js" . | grep -v node_modules`
5. Clean any .trash folders or temp directories
6. Run `git status` and `git log --oneline -5` to see the state

RULES:
- For each cleanup action, commit with: `git add -A && git commit -m "chore: cleanup <description>"`
- Never exit with uncommitted changes
- Your last action MUST be a committed change
- If nothing needs cleaning, do nothing and exit cleanly (no commit needed)
"@ | Out-File -FilePath $cleanupPromptPath -Encoding UTF8
}

if (!(Test-Path $todoPromptPath)) {
    @"
You are the TODO Updater agent for the Meow project ($projectDir). Your job is to review the current state of the project and update docs/TODO.md.

WORKFLOW:
1. Read the current docs/TODO.md
2. Read git log --oneline -20 to see what was recently completed
3. Read meow/src/ and meow/tests/ directory structure to understand what exists
4. Review any uncommitted changes: git status
5. Check meow/cli/index.ts for major features not in TODO
6. Check docs/ directory for features marked done but not committed

RULES:
- Add any MISSING completed items to TODO.md with today's date
- Remove any items that are NO LONGER RELEVANT
- Add NEW items discovered from recent work that should be tracked
- Mark items as done [x] or remove completed items from active lists
- Commit your TODO changes: git add -A && git commit -m "docs: update TODO from agent review"
- Your last action MUST be a committed change
"@ | Out-File -FilePath $todoPromptPath -Encoding UTF8
}

# Delete old tasks
Get-ScheduledTask | Where-Object { $_.TaskName -like "Meow-*" } | ForEach-Object {
    schtasks /Delete /TN $_.TaskName /F 2>$null
}

# KillAgents - hourly at :00 (kills only >2h old processes)
$killCmd = "powershell.exe -ExecutionPolicy Bypass -File `"$killScriptPath`""
Write-Host "Creating Meow-KillAgents (hourly at :00)..."
schtasks /Create /TN "Meow-KillAgents" /TR $killCmd /SC HOURLY /MO 1 /ST 00:00 /F

# FeatureDev - :00
$featureCmd = "powershell.exe -ExecutionPolicy Bypass -NoProfile -Command cd `'" + $projectDir + "`'; Get-Content `'" + $featurePromptPath + "`' | claude --dangerously-skip-permissions --continue --input-format text"
Write-Host "Creating Meow-FeatureDevAgent (hourly at :00)..."
schtasks /Create /TN "Meow-FeatureDevAgent" /TR $featureCmd /SC HOURLY /MO 1 /ST 00:00 /F

# FeatureDev2 - :30
Write-Host "Creating Meow-FeatureDevAgent2 (hourly at :30)..."
schtasks /Create /TN "Meow-FeatureDevAgent2" /TR $featureCmd /SC HOURLY /MO 1 /ST 00:30 /F

# QA - :15
$qaCmd = "powershell.exe -ExecutionPolicy Bypass -NoProfile -Command cd `'" + $projectDir + "`'; Get-Content `'" + $qaPromptPath + "`' | claude --dangerously-skip-permissions --continue --input-format text"
Write-Host "Creating Meow-QAUxAgent (hourly at :15)..."
schtasks /Create /TN "Meow-QAUxAgent" /TR $qaCmd /SC HOURLY /MO 1 /ST 00:15 /F

# Cleanup - :30
$cleanupCmd = "powershell.exe -ExecutionPolicy Bypass -NoProfile -Command cd `'" + $projectDir + "`'; Get-Content `'" + $cleanupPromptPath + "`' | claude --dangerously-skip-permissions --continue --input-format text"
Write-Host "Creating Meow-CleanupAgent (hourly at :30)..."
schtasks /Create /TN "Meow-CleanupAgent" /TR $cleanupCmd /SC HOURLY /MO 1 /ST 00:30 /F

# TODOUpdater - :45
$todoCmd = "powershell.exe -ExecutionPolicy Bypass -NoProfile -Command cd `'" + $projectDir + "`'; Get-Content `'" + $todoPromptPath + "`' | claude --dangerously-skip-permissions --continue --input-format text"
Write-Host "Creating Meow-TodoUpdaterAgent (hourly at :45)..."
schtasks /Create /TN "Meow-TodoUpdaterAgent" /TR $todoCmd /SC HOURLY /MO 1 /ST 00:45 /F

Write-Host ""
Write-Host "=== Final Schedule ==="
Get-ScheduledTask | Where-Object { $_.TaskName -like "Meow-*" } | ForEach-Object {
    $info = Get-ScheduledTaskInfo -TaskName $_.TaskName
    Write-Host "$($_.TaskName): NextRun=$($info.NextRunTime)"
}
