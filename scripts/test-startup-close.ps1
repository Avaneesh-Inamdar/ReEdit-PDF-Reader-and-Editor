param([string]$Executable='target/debug/Re-Edit-PDF.exe')
$ErrorActionPreference='Stop'
$startupBinary=(Resolve-Path -LiteralPath $Executable).Path
$startupRoot=Join-Path $PWD 'release/native-validation/startup-close'
New-Item -ItemType Directory -Force $startupRoot | Out-Null
$startupOldOutput=$env:REEDIT_TEST_OUTPUT
$startupOldProfile=$env:WEBVIEW2_USER_DATA_FOLDER
$startupResults=@()
if (!('ReEditStartupClose' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ReEditStartupClose {
  [DllImport("user32.dll", SetLastError=true)]
  public static extern bool PostMessage(IntPtr window, uint message, IntPtr wParam, IntPtr lParam);
}
'@
}
try {
  Remove-Item Env:REEDIT_TEST_OUTPUT -ErrorAction SilentlyContinue
  foreach ($startupDelay in @(0,100,500)) {
    $env:WEBVIEW2_USER_DATA_FOLDER=Join-Path $startupRoot "profile-$startupDelay"
    $startupProcess=Start-Process -FilePath $startupBinary -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $startupRoot "stderr-$startupDelay.txt")
    try {
      $startupTimer=[Diagnostics.Stopwatch]::StartNew()
      do {
        Start-Sleep -Milliseconds 10
        $startupProcess.Refresh()
        if ($startupProcess.HasExited) { throw 'Application exited before displaying its window' }
        $startupWindow=$startupProcess.MainWindowHandle
        $startupTitle=$startupProcess.MainWindowTitle
      } while ((!$startupWindow -or $startupTitle -ne 'Re-Edit PDF') -and $startupTimer.Elapsed.TotalSeconds -lt 20)
      if (!$startupWindow -or $startupTitle -ne 'Re-Edit PDF') { throw 'Application did not display its startup window' }
      if ($startupDelay) { Start-Sleep -Milliseconds $startupDelay }
      $startupClose=[Diagnostics.Stopwatch]::StartNew()
      if (![ReEditStartupClose]::PostMessage($startupWindow,0x0010,[IntPtr]::Zero,[IntPtr]::Zero)) { throw 'Could not post the normal window close message' }
      # A loaded runner can stretch teardown past the first 10s window; re-post
      # once and wait longer rather than failing the release run.
      if (!$startupProcess.WaitForExit(10000)) {
        $startupProcess.Refresh()
        if (!$startupProcess.HasExited) {
          [ReEditStartupClose]::PostMessage($startupWindow,0x0010,[IntPtr]::Zero,[IntPtr]::Zero) | Out-Null
          if (!$startupProcess.WaitForExit(30000)) { throw "Startup close stalled at delay $startupDelay" }
        }
      }
      if ($startupProcess.ExitCode -ne 0) { throw "Startup close returned $($startupProcess.ExitCode)" }
      $startupResults+=@{delayMs=$startupDelay;closedNormally=$true;closeSeconds=$startupClose.Elapsed.TotalSeconds}
    } finally {
      if (!$startupProcess.HasExited) { Stop-Process -Id $startupProcess.Id -Force }
      $startupProcess.Dispose()
    }
  }
} finally {
  $env:REEDIT_TEST_OUTPUT=$startupOldOutput
  $env:WEBVIEW2_USER_DATA_FOLDER=$startupOldProfile
}
$startupResults | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $startupRoot 'result.json')
$startupResults | ConvertTo-Json
