[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Url,
  [string]$Output = "outputs/perf/runtime-viewer-igpu.json",
  [double]$MaxReadyMs = 20000,
  [double]$MaxDragP95Ms = 34,
  [double]$MaxDragMaxMs = 100,
  [int]$MaxLongTasks = 1,
  [int]$MinCompatibilityAssets = 8,
  [string]$ExpectedRenderer = "Intel.*UHD.*770"
)

$ErrorActionPreference = "Stop"
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$edgeExe = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path -LiteralPath $edgeExe -PathType Leaf)) {
  throw "Microsoft Edge was not found at $edgeExe"
}
$profileParent = [IO.Path]::GetFullPath((Join-Path $repoRoot ".local\perf"))
$profilePath = [IO.Path]::GetFullPath((Join-Path $profileParent ("edge-igpu-" + [guid]::NewGuid().ToString("N"))))
if (-not $profilePath.StartsWith(($profileParent + [IO.Path]::DirectorySeparatorChar), [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to use unscoped Edge profile path: $profilePath"
}
New-Item -ItemType Directory -Path $profilePath -Force | Out-Null

$listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = ([Net.IPEndPoint]$listener.LocalEndpoint).Port
$listener.Stop()

$registryPath = "HKCU:\Software\Microsoft\DirectX\UserGpuPreferences"
$registryName = $edgeExe
$previousValue = $null
$hadPreviousValue = $false
try {
  $previousValue = Get-ItemPropertyValue -Path $registryPath -Name $registryName -ErrorAction Stop
  $hadPreviousValue = $true
} catch [System.Management.Automation.PSArgumentException] {
  $hadPreviousValue = $false
} catch [System.Management.Automation.ItemNotFoundException] {
  New-Item -Path $registryPath -Force | Out-Null
}

try {
  Set-ItemProperty -Path $registryPath -Name $registryName -Value "GpuPreference=1;"
  $arguments = @(
    "--user-data-dir=$profilePath",
    "--remote-debugging-port=$port",
    "--no-first-run",
    "--disable-extensions",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    "--window-size=1440,1000",
    "--window-position=-32000,-32000",
    "--use-angle=d3d11",
    "about:blank"
  )
  $edgeProcess = Start-Process -FilePath $edgeExe -ArgumentList $arguments -WindowStyle Hidden -PassThru
  $deadline = [DateTime]::UtcNow.AddSeconds(20)
  do {
    try {
      $null = Invoke-RestMethod -Uri "http://127.0.0.1:$port/json/version" -TimeoutSec 1
      $ready = $true
    } catch {
      $ready = $false
      Start-Sleep -Milliseconds 200
    }
  } while (-not $ready -and [DateTime]::UtcNow -lt $deadline)
  if (-not $ready) { throw "Edge DevTools endpoint did not become ready on port $port" }

  & node (Join-Path $repoRoot "tools\perf\runtime-viewer-browser-probe.mjs") `
    --port $port `
    --url $Url `
    --output (Join-Path $repoRoot $Output) `
    --expected-renderer $ExpectedRenderer `
    --min-compatibility-assets $MinCompatibilityAssets `
    --max-ready-ms $MaxReadyMs `
    --max-drag-p95-ms $MaxDragP95Ms `
    --max-drag-max-ms $MaxDragMaxMs `
    --max-long-tasks $MaxLongTasks
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} finally {
  if ($edgeProcess -and -not $edgeProcess.HasExited) {
    Stop-Process -Id $edgeProcess.Id -Force -ErrorAction SilentlyContinue
  }
  Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($profilePath, [StringComparison]::OrdinalIgnoreCase) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  if ($hadPreviousValue) {
    Set-ItemProperty -Path $registryPath -Name $registryName -Value $previousValue
  } else {
    Remove-ItemProperty -Path $registryPath -Name $registryName -ErrorAction SilentlyContinue
  }
  if (Test-Path -LiteralPath $profilePath) {
    $deleteDeadline = [DateTime]::UtcNow.AddSeconds(10)
    do {
      try {
        Remove-Item -LiteralPath $profilePath -Recurse -Force -ErrorAction Stop
      } catch [System.IO.IOException] {
        Start-Sleep -Milliseconds 250
      }
    } while ((Test-Path -LiteralPath $profilePath) -and [DateTime]::UtcNow -lt $deleteDeadline)
    if (Test-Path -LiteralPath $profilePath) {
      Write-Warning "The isolated Edge profile is still locked and was retained: $profilePath"
    }
  }
}
