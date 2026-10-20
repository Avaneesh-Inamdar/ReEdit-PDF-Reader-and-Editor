param(
  [Parameter(Mandatory)][ValidateSet('updates','smoke','interactions','selection','layout-stability','editing-regression','ocr-recognition','fonts-dialog','ocr-edit')][string]$Suite,
  [string]$Fixture='test-fixtures/simple-text.pdf',
  [string]$Executable='target/debug/Re-Edit-PDF.exe',
  [string]$OutputRoot='release/native-validation/regressions'
)
$ErrorActionPreference='Stop'
$testWorkspace=Split-Path $PSScriptRoot -Parent
$testOutput=Join-Path $testWorkspace "$OutputRoot/$Suite"
New-Item -ItemType Directory -Force $testOutput | Out-Null
if($Suite -eq 'interactions') {
  Copy-Item -LiteralPath (Join-Path $testWorkspace 'tests/fixtures/updater/update-fixture.bin'),(Join-Path $testWorkspace 'tests/fixtures/updater/update-fixture.bin.sig') -Destination $testOutput
}
$env:REEDIT_TEST_OUTPUT=$testOutput
$env:REEDIT_TEST_SUITE=$Suite
$env:WEBVIEW2_USER_DATA_FOLDER=Join-Path $testOutput 'webview-profile'
$testBinary=(Resolve-Path -LiteralPath (Join-Path $testWorkspace $Executable)).Path
$testFixture=(Resolve-Path -LiteralPath (Join-Path $testWorkspace $Fixture)).Path
$testStart=Get-Date
$testApp=Start-Process -FilePath $testBinary -ArgumentList ('"'+$testFixture+'"') -WindowStyle Hidden -PassThru -RedirectStandardError (Join-Path $testOutput 'stderr.txt')
if(!$testApp.WaitForExit(90000)){throw "Isolated $Suite test exceeded its timeout (PID $($testApp.Id))."}
$testReport=Get-Item -LiteralPath (Join-Path $testOutput 'result.json')
if($testReport.LastWriteTime -lt $testStart){throw 'The test application did not produce a new report.'}
$testResult=Get-Content -Raw -LiteralPath $testReport.FullName | ConvertFrom-Json
$testResult | ConvertTo-Json -Depth 8
if($testResult.errors.Count -or @($testResult.checks.PSObject.Properties | Where-Object {$_.Value -ne $true}).Count){throw "$Suite failed. See $testOutput"}
$testApp.Dispose()
