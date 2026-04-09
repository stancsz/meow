if (!(Test-Path 'HKCU:\Software\Microsoft\Command Processor')) {
    New-Item -Path 'HKCU:\Software\Microsoft\Command Processor' -Force | Out-Null
}
Set-ItemProperty -Path 'HKCU:\Software\Microsoft\Command Processor' -Name 'Autorun' -Value 'doskey claude-dan=claude --dangerously-skip-permissions --continue $*'
