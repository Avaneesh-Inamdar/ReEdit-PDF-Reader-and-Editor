# Windows installer

`installer.nsi` is the Tauri NSIS template from the `tauri-cli-v2.12.2`
tag, licensed under MIT or Apache-2.0:
https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.12.2/crates/tauri-bundler/src/bundle/windows/nsis/installer.nsi

The Finish callback uses asynchronous NSIS `Exec` for `currentUser` installs.
This installer already runs without elevation, so launching through Explorer's
COM interface is unnecessary and can hang on systems without a responsive
Explorer shell. Other install modes retain Tauri's unelevated launch helper.

Preserve this change when updating the upstream template. Validate install,
Finish dismissal and launch, normal app shutdown, and uninstall on an isolated
Windows runner before publishing a replacement installer.
