param([string]$Executable='target/debug/Re-Edit-PDF.exe',[string]$Fixture='test-fixtures/simple-text.pdf')
$ErrorActionPreference='Stop'
$testRoot=Split-Path $PSScriptRoot -Parent
$testExecutable=(Resolve-Path -LiteralPath (Join-Path $testRoot $Executable)).Path
$testFixture=(Resolve-Path -LiteralPath (Join-Path $testRoot $Fixture)).Path
$env:REEDIT_TEST_OUTPUT=Join-Path $testRoot 'release/native-validation/tauri'
New-Item -ItemType Directory -Path $env:REEDIT_TEST_OUTPUT -Force | Out-Null
$testProcess=Start-Process -FilePath $testExecutable -ArgumentList ('"'+$testFixture+'"') -WindowStyle Hidden -PassThru
$testSamples=[System.Collections.Generic.List[object]]::new()
$testStart=Get-Date
while (!$testProcess.HasExited -and ((Get-Date)-$testStart).TotalSeconds -lt 90) {
  $testProcesses=Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId
  $testIds=[System.Collections.Generic.HashSet[int]]::new()
  [void]$testIds.Add($testProcess.Id)
  do {
    $testBefore=$testIds.Count
    foreach($testChild in $testProcesses){if($testIds.Contains([int]$testChild.ParentProcessId)){[void]$testIds.Add([int]$testChild.ProcessId)}}
  } while($testIds.Count -gt $testBefore)
  [long]$testPrivate=0; [long]$testWorking=0; [int]$testHandles=0
  foreach($testId in $testIds){
    $testItem=Get-Process -Id $testId -ErrorAction SilentlyContinue
    if($testItem){$testPrivate+=$testItem.PrivateMemorySize64; $testWorking+=$testItem.WorkingSet64; $testHandles+=$testItem.HandleCount; $testItem.Dispose()}
  }
  $testSamples.Add([pscustomobject]@{seconds=[math]::Round(((Get-Date)-$testStart).TotalSeconds,2);privateBytes=$testPrivate;workingBytes=$testWorking;handles=$testHandles;processes=$testIds.Count})
  Start-Sleep -Milliseconds 750
  $testProcess.Refresh()
}
$testMemoryPath=Join-Path $env:REEDIT_TEST_OUTPUT 'process-memory.json'
[System.IO.File]::WriteAllText($testMemoryPath,($testSamples | ConvertTo-Json -Depth 5))
if(!$testProcess.HasExited){throw 'The local harness exceeded 90 seconds; inspect the test app before stopping it.'}
$testResultPath=Join-Path $env:REEDIT_TEST_OUTPUT 'result.json'
if((Get-Item -LiteralPath $testResultPath).LastWriteTime -lt $testStart){throw 'The test app did not produce a new result.'}
$testResult=Get-Content -Raw -LiteralPath $testResultPath | ConvertFrom-Json
if($testResult.errors.Count -gt 0){throw ($testResult.errors -join [Environment]::NewLine)}
$testResult.checks | ConvertTo-Json
$testProcess.Dispose()
