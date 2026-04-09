$projectDir = "C:\Users\stanc\github\meow"
Set-Location $projectDir
$prompt = Get-Content "$projectDir\local-dev\feature-prompt.txt" -Raw
$env:CLAUDE_PRINT_PROMPT = $prompt
claude --dangerously-skip-permissions --continue
