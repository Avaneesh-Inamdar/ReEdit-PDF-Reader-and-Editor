param(
  [ValidateSet('check','test','dev','build','run')][string]$Action='check',
  [switch]$DebugBuild,
  [Parameter(ValueFromRemainingArguments=$true)][string[]]$DesktopArguments
)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'rust-env.ps1')
Push-Location (Split-Path $PSScriptRoot -Parent)
try {
  if ($Action -in @('dev','build')) {
    $desktopArgs=@('tauri',$Action)
    if ($Action -eq 'build' -and $DebugBuild) { $desktopArgs+='--debug' }
    if ($DesktopArguments) { $desktopArgs+=$DesktopArguments }
    & npx.cmd @desktopArgs
  } else {
    if ($Action -eq 'run') {
      & npm.cmd run build:ui
      if ($LASTEXITCODE -ne 0) { throw 'Renderer build failed.' }
    }
    $desktopArgs=@($Action,'--locked','-p','re-edit-pdf-desktop','-j','4')
    if ($Action -eq 'run') { $desktopArgs+='--features'; $desktopArgs+='custom-protocol' }
    if ($DesktopArguments) { $desktopArgs+='--'; $desktopArgs+=$DesktopArguments }
    & $rustCargo @desktopArgs
  }
  if ($LASTEXITCODE -ne 0) { throw "Desktop $Action failed ($LASTEXITCODE)." }
} finally { Pop-Location }
