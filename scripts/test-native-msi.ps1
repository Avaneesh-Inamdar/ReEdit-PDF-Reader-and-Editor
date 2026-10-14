$ErrorActionPreference='Stop'
if ($env:CI -ne 'true') { throw 'Run MSI validation on the isolated CI runner.' }
$version=(Get-Content -Raw package.json | ConvertFrom-Json).version
$msi=(Get-Item -LiteralPath "release/native-packages/Re-Edit-PDF-$version-windows-x64.msi").FullName
$folder=Join-Path $env:TEMP ('ReEditPDF-MSI-Test-'+[guid]::NewGuid().ToString('N'))
$log=Join-Path $env:TEMP ('ReEditPDF-MSI-Log-'+[guid]::NewGuid().ToString('N')+'.txt')
$install=Start-Process msiexec.exe -ArgumentList @('/i',('"'+$msi+'"'),'/qn','/norestart',('INSTALLDIR="'+$folder+'"'),'/L*v',('"'+$log+'"')) -WindowStyle Hidden -PassThru -Wait
if ($install.ExitCode -notin @(0,3010)) { Get-Content -LiteralPath $log -Tail 60; throw "MSI install failed: $($install.ExitCode)" }
$binary=Join-Path $folder 'Re-Edit-PDF.exe'
if (!(Test-Path -LiteralPath $binary)) {
  # Tauri deliberately restores the last NSIS/MSI location. Only accept this
  # runner's isolated test directories; never inspect or uninstall a host app.
  $remembered=(Get-Item -LiteralPath 'HKCU:/Software/Avaneesh Inamdar/Re-Edit PDF').GetValue('InstallDir')
  $resolved=[IO.Path]::GetFullPath($remembered).TrimEnd('\')
  $parent=[IO.Path]::GetDirectoryName($resolved)
  $leaf=[IO.Path]::GetFileName($resolved)
  if ($parent -ne [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') -or $leaf -notmatch '^ReEditPDF-(Native-Installer|MSI)-Test-[a-f0-9]{32}$') { throw "MSI restored a location outside the isolated test directories: $resolved" }
  $folder=$resolved
  $binary=Join-Path $folder 'Re-Edit-PDF.exe'
  if (!(Test-Path -LiteralPath $binary)) { throw 'MSI executable is absent from its registered installation directory' }
}
foreach($runtime in @('vcruntime140.dll','msvcp140.dll')) { if (!(Test-Path -LiteralPath (Join-Path $folder $runtime))) { throw "MSI omitted $runtime" } }
$app=Start-Process -FilePath $binary -WindowStyle Hidden -PassThru
$deadline=(Get-Date).AddSeconds(35)
while (!$app.MainWindowHandle -and !$app.HasExited -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 200; $app.Refresh() }
if (!$app.MainWindowHandle) { throw 'MSI-installed application did not show its window' }
$app.WaitForInputIdle(15000) | Out-Null
# The native window appears before the system WebView has mounted its close handler.
Start-Sleep -Seconds 5
$closeDeadline=(Get-Date).AddSeconds(30)
while (!$app.HasExited -and (Get-Date) -lt $closeDeadline) {
  $app.CloseMainWindow() | Out-Null
  if ($app.WaitForExit(2000)) { break }
  $app.Refresh()
}
if (!$app.HasExited) { throw 'MSI-installed application did not close normally' }
$uninstall=Start-Process msiexec.exe -ArgumentList @('/x',('"'+$msi+'"'),'/qn','/norestart') -WindowStyle Hidden -PassThru -Wait
if ($uninstall.ExitCode -notin @(0,3010)) { throw "MSI uninstall failed: $($uninstall.ExitCode)" }
if (Test-Path -LiteralPath $binary) { throw 'MSI uninstall left the installed executable behind' }
@{passed=$true;version=$version;checks=@('MSI installs','runtime DLLs present','installed app opens','installed app closes','MSI uninstalls')} | ConvertTo-Json | Set-Content -LiteralPath release/native-validation/tauri/windows-msi-result.json
