$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root 'release\win-unpacked'
$version = (Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json).version
$zip = Join-Path $root "release\OpenClaw-Model-Config-$version-win-x64.zip"

if (-not (Test-Path $src)) {
  Write-Error "未找到打包目录: $src，请先运行 npm run pack"
}

if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $src '*') -DestinationPath $zip -CompressionLevel Optimal
Write-Host "已生成: $zip"
