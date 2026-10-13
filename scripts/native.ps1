param(
  [ValidateSet('check','test','build','run','clippy')][string]$Action='check',
  [switch]$Release,
  [Parameter(ValueFromRemainingArguments=$true)][string[]]$AppArguments
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'rust-env.ps1')
$cargoArgs=@($Action,'--locked','-p','re-edit-pdf-native','-j','4')
if ($Release) { $cargoArgs+='--release' }
if ($Action -eq 'run' -and $AppArguments) { $cargoArgs+='--'; $cargoArgs+=$AppArguments }
& $rustCargo @cargoArgs
if ($LASTEXITCODE -ne 0) { throw "Native $Action failed ($LASTEXITCODE)." }
