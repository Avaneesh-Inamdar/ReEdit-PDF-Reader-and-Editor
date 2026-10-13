# Local MuPDF Rust wrapper patch

Source: crates.io `mupdf` 0.8.0, upstream revision
`deaacc87c4cea6a2146e90e00e0d5658c911277b` from messense/mupdf-rs.
The original AGPL license and source notices are retained.

The one local change is the native-device alignment check in
`src/device/native.rs`. Bindgen does not produce `max_align_t` from the MSVC
headers, causing a compilation error when the generic device code is
monomorphized. On MSVC the C scalar alignment ceiling is that of `double`.
Other targets continue to use the generated C `max_align_t` type. This does
not increase permitted alignment or change allocation behavior.

The Cargo registry is untouched. Remove the patch once the upstream package
provides this platform fix and the native regression suite passes.
