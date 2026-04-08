function global:claude-dan {
    param([string]$Prompt)
    if ($Prompt) {
        claude --dangerously-skip-permissions --continue $Prompt
    } else {
        claude --dangerously-skip-permissions --continue
    }
}
