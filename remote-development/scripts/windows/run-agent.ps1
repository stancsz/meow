param([string]$PromptFile)
$projectDir = "C:\Users\stanc\github\meow"
Set-Location $projectDir
$prompt = Get-Content "$projectDir\local-dev\$PromptFile" -Raw
# Pass prompt as direct argument to avoid stdin/TTY issues with piped input
# Escape double quotes for shell safety
$escaped = $prompt -replace '"', '`"'
$env:CLAUDE_PRINT_PROMPT = $prompt
claude --dangerously-skip-permissions --continue
