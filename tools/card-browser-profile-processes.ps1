#requires -Version 7
Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

$mode = [string]$env:SIGUA_CARD_BROWSER_PROCESS_MODE
$profilePath = [string]$env:SIGUA_CARD_BROWSER_PROFILE
if ($mode -notin @('count', 'stop')) {
    throw 'SIGUA_CARD_BROWSER_PROCESS_MODE must be count or stop'
}
if ([string]::IsNullOrWhiteSpace($profilePath)) {
    throw 'SIGUA_CARD_BROWSER_PROFILE is required'
}

$items = @(
    Get-CimInstance -ClassName Win32_Process -Filter "Name='msedge.exe' OR Name='chrome.exe'" |
        Where-Object {
            -not [string]::IsNullOrWhiteSpace($_.CommandLine) -and
            $_.CommandLine.Contains($profilePath, [StringComparison]::OrdinalIgnoreCase)
        }
)

$stopped = 0
if ($mode -eq 'stop') {
    foreach ($item in $items) {
        Stop-Process -Id $item.ProcessId -Force -ErrorAction SilentlyContinue
        $stopped += 1
    }
}

[ordered]@{
    mode = $mode
    count = $items.Count
    stopped = $stopped
} | ConvertTo-Json -Depth 6 -Compress
