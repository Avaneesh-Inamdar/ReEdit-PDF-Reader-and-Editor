$rustCargo=Join-Path $env:USERPROFILE '.cargo\bin\cargo.exe'
if (!(Test-Path -LiteralPath $rustCargo)) { throw 'Install Rust from https://rustup.rs first.' }
$clangFolder=Join-Path $env:ProgramFiles 'LLVM\bin'
if (Test-Path -LiteralPath (Join-Path $clangFolder 'libclang.dll')) { $env:LIBCLANG_PATH=$clangFolder }
# mupdf-sys 0.8 defaults to the VS 2019 toolset when VS 2026 is installed.
# Select an installed toolset without editing the Cargo registry or dependency.
$vsLocator=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
if (Test-Path -LiteralPath $vsLocator) {
  $vsRoot=& $vsLocator -latest -products '*' -property installationPath
  $toolsetRoot=Join-Path $vsRoot 'MSBuild\Microsoft\VC'
  $toolsets=Get-ChildItem -LiteralPath $toolsetRoot -Directory | ForEach-Object {
    $platform=Join-Path $_.FullName 'Platforms\x64\PlatformToolsets'
    if (Test-Path -LiteralPath $platform) { Get-ChildItem -LiteralPath $platform -Directory }
  }
  $toolset=$toolsets | Sort-Object Name -Descending | Select-Object -First 1
  if ($toolset) { $env:MUPDF_MSVC_PLATFORM_TOOLSET=$toolset.Name }
}
