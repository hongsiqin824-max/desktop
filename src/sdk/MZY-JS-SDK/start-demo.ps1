param(
  [int]$PreferredPort = 18180,
  [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Test-PortAvailable {
  param([int]$Port)
  $tcp = $null
  try {
    $tcp = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
    $tcp.Start()
    return $true
  }
  catch { return $false }
  finally { if ($null -ne $tcp) { $tcp.Stop() } }
}

function Get-AvailablePort {
  param([int]$StartPort)
  for ($port = $StartPort; $port -lt ($StartPort + 100); $port++) {
    if (Test-PortAvailable -Port $port) { return $port }
  }
  throw "No available localhost port found from $StartPort to $($StartPort + 99)."
}

function Get-ContentType {
  param([string]$Path)
  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".html" { "text/html; charset=utf-8" }
    ".htm"  { "text/html; charset=utf-8" }
    ".js"   { "text/javascript; charset=utf-8" }
    ".mjs"  { "text/javascript; charset=utf-8" }
    ".css"  { "text/css; charset=utf-8" }
    ".json" { "application/json; charset=utf-8" }
    ".map"  { "application/json; charset=utf-8" }
    ".txt"  { "text/plain; charset=utf-8" }
    ".md"   { "text/markdown; charset=utf-8" }
    ".svg"  { "image/svg+xml" }
    ".png"  { "image/png" }
    ".jpg"  { "image/jpeg" }
    ".jpeg" { "image/jpeg" }
    ".gif"  { "image/gif" }
    ".webp" { "image/webp" }
    ".ico"  { "image/x-icon" }
    ".wasm" { "application/wasm" }
    default { "application/octet-stream" }
  }
}

function Write-HttpHeader {
  param(
    [System.IO.Stream]$Stream,
    [int]$StatusCode,
    [string]$StatusText,
    [string]$ContentType,
    [int]$ContentLength
  )
  $header = "HTTP/1.1 $StatusCode $StatusText`r`nContent-Type: $ContentType`r`nContent-Length: $ContentLength`r`nCache-Control: no-cache`r`nConnection: close`r`n`r`n"
  $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
  $Stream.Write($headerBytes, 0, $headerBytes.Length)
}

function Send-TextResponse {
  param(
    [System.IO.Stream]$Stream,
    [int]$StatusCode,
    [string]$StatusText,
    [string]$Text,
    [bool]$HeadOnly = $false
  )
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
  Write-HttpHeader -Stream $Stream -StatusCode $StatusCode -StatusText $StatusText -ContentType "text/plain; charset=utf-8" -ContentLength $bytes.Length
  if (-not $HeadOnly) { $Stream.Write($bytes, 0, $bytes.Length) }
}

function Resolve-RequestPath {
  param([string]$UrlPath)
  $relativePath = [System.Uri]::UnescapeDataString($UrlPath).TrimStart("/")
  if ([string]::IsNullOrWhiteSpace($relativePath)) { $relativePath = "index.html" }
  $relativePath = $relativePath -replace "/", [System.IO.Path]::DirectorySeparatorChar
  $fullPath = [System.IO.Path]::GetFullPath((Join-Path $Root $relativePath))
  $rootPath = [System.IO.Path]::GetFullPath($Root)
  $rootWithSeparator = $rootPath.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
  if (($fullPath -ne $rootPath) -and (-not $fullPath.StartsWith($rootWithSeparator, [System.StringComparison]::OrdinalIgnoreCase))) {
    throw "Request path is outside the SDK directory."
  }
  if ([System.IO.Directory]::Exists($fullPath)) { $fullPath = Join-Path $fullPath "index.html" }
  return $fullPath
}

$port = Get-AvailablePort -StartPort $PreferredPort
$url = "http://localhost:$port/"
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
$listener.Start()

Write-Host ""
Write-Host "MZY JS SDK demo server is running."
Write-Host "URL: $url"
Write-Host "Root: $Root"
Write-Host "Press Ctrl+C to stop."
Write-Host ""

if (-not $NoBrowser) { Start-Process $url }

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    $stream = $null
    try {
      $client.ReceiveTimeout = 1000
      $client.SendTimeout = 5000
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 8192, $true)
      $requestLine = $reader.ReadLine()
      if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }
      while ($true) {
        $line = $reader.ReadLine()
        if ([string]::IsNullOrEmpty($line)) { break }
      }
      $parts = $requestLine.Split(" ")
      if ($parts.Length -lt 2) {
        Send-TextResponse -Stream $stream -StatusCode 400 -StatusText "Bad Request" -Text "400 Bad Request"
        continue
      }
      $method = $parts[0].ToUpperInvariant()
      $pathOnly = (($parts[1]) -split "\?", 2)[0]
      if (($method -ne "GET") -and ($method -ne "HEAD")) {
        Send-TextResponse -Stream $stream -StatusCode 405 -StatusText "Method Not Allowed" -Text "405 Method Not Allowed" -HeadOnly ($method -eq "HEAD")
        continue
      }
      $filePath = Resolve-RequestPath -UrlPath $pathOnly
      if (-not [System.IO.File]::Exists($filePath)) {
        Send-TextResponse -Stream $stream -StatusCode 404 -StatusText "Not Found" -Text "404 Not Found" -HeadOnly ($method -eq "HEAD")
        continue
      }
      $bytes = [System.IO.File]::ReadAllBytes($filePath)
      Write-HttpHeader -Stream $stream -StatusCode 200 -StatusText "OK" -ContentType (Get-ContentType -Path $filePath) -ContentLength $bytes.Length
      if ($method -ne "HEAD") { $stream.Write($bytes, 0, $bytes.Length) }
    }
    catch {
      if ($null -ne $stream) {
        Send-TextResponse -Stream $stream -StatusCode 500 -StatusText "Internal Server Error" -Text $_.Exception.Message
      }
    }
    finally { $client.Close() }
  }
}
finally { $listener.Stop() }
