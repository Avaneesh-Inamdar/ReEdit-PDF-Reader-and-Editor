param([string]$Directory='release/github-packages',[string]$Notes='Native preview: stable certificate sizing, automatic font matching, connected-line editing, improved OCR, existing-object removal and startup update notifications.')
$ErrorActionPreference='Stop'
$assetDirectory=(Resolve-Path -LiteralPath $Directory).Path
$version=(Get-Content -Raw -LiteralPath package.json | ConvertFrom-Json).version
$keyDirectory=Join-Path $env:USERPROFILE '.tauri'
$privateKey=Join-Path $keyDirectory 're-edit-pdf-updater.key'
$passwordFile=Join-Path $keyDirectory 're-edit-pdf-updater.password.dpapi'
$publicKey=(Get-Content -Raw -LiteralPath (Join-Path $keyDirectory 're-edit-pdf-updater.key.pub')).Trim()
$configured=(Get-Content -Raw -LiteralPath src-tauri/tauri.conf.json | ConvertFrom-Json).plugins.updater.pubkey
if ($publicKey -ne $configured) { throw 'Release key does not match the application updater identity' }
$assets=@(Get-ChildItem -LiteralPath $assetDirectory -File | Where-Object { $_.Name -match '\.(exe|msi|deb|rpm|AppImage|tar\.gz|zip)$' })
if ($assets.Count -lt 4) { throw 'Expected Windows and Linux packages before signing' }
$secret=Get-Content -Raw -LiteralPath $passwordFile | ConvertTo-SecureString
$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
try {
  $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  foreach ($asset in $assets) {
    & node node_modules/@tauri-apps/cli/tauri.js signer sign -f $privateKey --app-version $version $asset.FullName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Signing failed for $($asset.Name)" }
    $signature=(Get-Content -Raw -LiteralPath ($asset.FullName+'.sig')).Trim()
    $classic=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($signature))
    [IO.File]::WriteAllText($asset.FullName+'.minisig',$classic)
  }
} finally {
  Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD -ErrorAction SilentlyContinue
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  $secret.Dispose()
}
[IO.File]::WriteAllText((Join-Path $assetDirectory 're-edit-pdf-updater.pub'),[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($publicKey)))
$base="https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/releases/download/v$version/"
function UpdateAsset($pattern) {
  $asset=@($assets | Where-Object Name -Like $pattern)
  if ($asset.Count -ne 1) { throw "Expected one update artifact for $pattern" }
  return @{url=$base+[Uri]::EscapeDataString($asset[0].Name);signature=(Get-Content -Raw -LiteralPath ($asset[0].FullName+'.sig')).Trim()}
}
$nsis=UpdateAsset '*windows-x64-setup.exe'
$linux=UpdateAsset '*linux-x86_64.AppImage'
$manifest=@{version=$version;notes=$Notes;pub_date=(Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ');platforms=@{'windows-x86_64'=$nsis;'windows-x86_64-nsis'=$nsis;'linux-x86_64'=$linux}}
if (@($assets | Where-Object Name -Like '*windows-x64.msi').Count -eq 1) {$manifest.platforms['windows-x86_64-msi']=UpdateAsset '*windows-x64.msi'}
# Keep manual DEB/RPM/source verification in the same public metadata instead
# of adding detached signature clutter to the release's download list.
$downloads=@{}
foreach($asset in $assets) {
  $downloads[$asset.Name]=@{
    url=$base+[Uri]::EscapeDataString($asset.Name)
    signature=(Get-Content -Raw -LiteralPath ($asset.FullName+'.sig')).Trim()
    sha256=(Get-FileHash -LiteralPath $asset.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
  }
}
$manifest.downloads=$downloads
[IO.File]::WriteAllText((Join-Path $assetDirectory 'latest.json'),($manifest | ConvertTo-Json -Depth 8))
Write-Output "Signed $($assets.Count) package/source artifacts for $version. No Windows publisher certificate was used."
