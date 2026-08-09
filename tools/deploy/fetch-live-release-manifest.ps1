#requires -Version 7
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [uri]$Uri,

    [Parameter(Mandatory)]
    [string]$OutputPath,

    [Parameter(Mandatory)]
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]{5,79}$')]
    [string]$CacheBust,

    [ValidateSet('sigua-unified-public-release/v1', 'sigua-cdn-release/v1')]
    [string]$SchemaVersion = 'sigua-unified-public-release/v1'
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

$builder = [UriBuilder]$Uri
$query = $builder.Query.TrimStart('?')
$releaseParameter = 'release=' + [Uri]::EscapeDataString($CacheBust)
$builder.Query = if ([string]::IsNullOrEmpty($query)) {
    $releaseParameter
} else {
    $query + '&' + $releaseParameter
}

$response = Invoke-WebRequest `
    -Uri $builder.Uri `
    -Headers @{ 'Cache-Control' = 'no-cache'; Pragma = 'no-cache' } `
    -UseBasicParsing

$memory = [IO.MemoryStream]::new()
try {
    if ($response.RawContentStream.CanSeek) {
        $response.RawContentStream.Position = 0
    }
    $response.RawContentStream.CopyTo($memory)
    $bytes = $memory.ToArray()
} finally {
    $memory.Dispose()
}

$document = [Text.Encoding]::UTF8.GetString($bytes) | ConvertFrom-Json
if ($document.schemaVersion -ne $SchemaVersion) {
    throw "unexpected manifest schema: $($document.schemaVersion)"
}
if (-not ($document.entries -is [array]) -or $document.entryCount -ne $document.entries.Count) {
    throw 'live manifest entry count is invalid'
}

$resolvedOutput = [IO.Path]::GetFullPath($OutputPath)
$parent = Split-Path -Parent $resolvedOutput
[IO.Directory]::CreateDirectory($parent) | Out-Null
[IO.File]::WriteAllBytes($resolvedOutput, $bytes)

$hash = [Security.Cryptography.SHA256]::HashData($bytes)
[ordered]@{
    uri = $builder.Uri.AbsoluteUri
    status = [int]$response.StatusCode
    outputPath = $resolvedOutput
    bytes = $bytes.Length
    sha256 = ([Convert]::ToHexString($hash)).ToLowerInvariant()
    schemaVersion = $document.schemaVersion
    entryCount = $document.entryCount
    totalBytes = $document.totalBytes
} | ConvertTo-Json -Depth 6 -Compress
