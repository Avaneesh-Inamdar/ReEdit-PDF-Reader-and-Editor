$ErrorActionPreference = "Stop"
if ($env:CI -ne "true") { throw "Run installer validation on the isolated CI runner." }
$version = (Get-Content -Raw -LiteralPath "package.json" | ConvertFrom-Json).version
$installer = Get-Item -LiteralPath "release/native-packages/Re-Edit-PDF-$version-windows-x64-setup.exe"
$installPath = Join-Path $env:TEMP ("ReEditPDF-Native-Installer-Test-" + [guid]::NewGuid().ToString("N"))
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class InstallerWizardTest {
  public delegate bool EnumProc(IntPtr hwnd, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr data);
  [DllImport("user32.dll")] static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr data);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr hwnd, StringBuilder text, int count);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsWindowEnabled(IntPtr hwnd);
  [DllImport("user32.dll", SetLastError=true)] static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, IntPtr w, IntPtr l, uint flags, uint timeout, out IntPtr result);
  [DllImport("user32.dll", SetLastError=true)] static extern bool PostMessage(IntPtr hwnd, uint msg, IntPtr w, IntPtr l);
  public static string Text(IntPtr hwnd) { var text=new StringBuilder(1024);GetWindowText(hwnd,text,1024);return text.ToString(); }
  public static IntPtr Window(int process) { IntPtr found=IntPtr.Zero;EnumWindows((h,d)=>{uint pid;GetWindowThreadProcessId(h,out pid);if(pid==process && Text(h).Contains("Re-Edit PDF"))found=h;return true;},IntPtr.Zero);return found; }
  public static IntPtr Button(IntPtr parent,string label) { IntPtr found=IntPtr.Zero;EnumChildWindows(parent,(h,d)=>{if(Text(h).Replace("&","").Trim()==label && IsWindowEnabled(h))found=h;return true;},IntPtr.Zero);return found; }
  public static void Click(IntPtr hwnd) { if(!PostMessage(hwnd,0xF5,IntPtr.Zero,IntPtr.Zero))throw new Exception("Installer click could not be queued"); }
}
'@
$setup = Start-Process -FilePath $installer.FullName -ArgumentList "/D=$installPath" -WindowStyle Hidden -PassThru
$deadline = (Get-Date).AddMinutes(3)
$finishAt = $null
while ((Get-Date) -lt $deadline) {
  $setup.Refresh()
  if ($setup.HasExited) { throw "Installer exited before Finish: $($setup.ExitCode)" }
  $wizard = [InstallerWizardTest]::Window($setup.Id)
  if ($wizard -ne [IntPtr]::Zero) {
    $finish = [InstallerWizardTest]::Button($wizard, 'Finish')
    if ($finish -ne [IntPtr]::Zero) {
      $finishAt = Get-Date
      [InstallerWizardTest]::Click($finish)
      break
    }
    foreach ($label in @('Next >', 'I Agree', 'Install')) {
      $button = [InstallerWizardTest]::Button($wizard, $label)
      if ($button -ne [IntPtr]::Zero) { [InstallerWizardTest]::Click($button); break }
    }
  }
  Start-Sleep -Milliseconds 300
}
if (!$finishAt) { throw 'Installer never reached its Finish page' }
if (!$setup.WaitForExit(10000)) { throw 'Finish did not dismiss the installer promptly' }
$elapsed = ((Get-Date) - $finishAt).TotalSeconds
# The assisted installer deliberately adds the product subdirectory when the
# selected directory does not already include its name. Discover that installed
# executable inside this test's own directory rather than assuming silent-mode paths.
$installed = @(Get-ChildItem -LiteralPath $installPath -Filter 'Re-Edit-PDF.exe' -File -Recurse)
if ($installed.Count -ne 1) { throw 'Expected one installed app in the test directory' }
$binary = $installed[0].FullName
$installedDirectory = $installed[0].DirectoryName
$docIcon = (Get-Item -LiteralPath 'HKCU:/Software/Classes/ReEditPDF.Document/DefaultIcon').GetValue('')
if ($docIcon -ne "$installedDirectory\document.ico,0") { throw 'PDF document icon was not registered' }
$capabilities = (Get-Item -LiteralPath 'HKCU:/Software/RegisteredApplications').GetValue('Re-Edit PDF')
if ($capabilities -ne 'Software\ReEditPDF\Capabilities') { throw 'Windows Default Apps registration is missing' }
foreach ($runtime in @('vcruntime140.dll','msvcp140.dll')) {
  if (!(Test-Path -LiteralPath (Join-Path $installedDirectory $runtime))) { throw "Missing app-local runtime $runtime" }
}
$deadline = (Get-Date).AddSeconds(40)
$started = $null
while ((Get-Date) -lt $deadline) {
  $started = Get-CimInstance Win32_Process -Filter "Name = 'Re-Edit-PDF.exe'" | Where-Object { $_.ExecutablePath -eq $binary -and $_.CommandLine -notmatch '--type=' } | Select-Object -First 1
  if ($started) { break }
  Start-Sleep -Milliseconds 200
}
if (!$started) { throw 'Finish did not launch the installed app' }
$application = Get-Process -Id $started.ProcessId
$deadline = (Get-Date).AddSeconds(30)
while (!$application.MainWindowHandle -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 200; $application.Refresh() }
if (!$application.MainWindowHandle) { throw 'Launched app did not show its window' }
$application.CloseMainWindow() | Out-Null
if (!$application.WaitForExit(10000)) { throw 'Test app did not close' }
$uninstaller = @(Get-ChildItem -LiteralPath $installedDirectory -Filter '*Uninstall*.exe' -File)
if ($uninstaller.Count -ne 1) { throw 'Expected one test uninstaller' }
$cleanup = Start-Process -FilePath $uninstaller[0].FullName -ArgumentList '/S' -WindowStyle Hidden -PassThru -Wait
if ($cleanup.ExitCode -ne 0) { throw "Test uninstaller failed: $($cleanup.ExitCode)" }
@{ passed=$true; version=$version; finishDismissSeconds=$elapsed; checks=@('assisted wizard reaches Finish', 'Finish dismisses promptly', 'Finish launches installed app', 'app shows its window', 'test app closes', 'test uninstall exits successfully') } | ConvertTo-Json | Set-Content -LiteralPath 'release/native-validation/tauri/windows-installer-result.json'
