# Third-party software

Re-Edit PDF is distributed under AGPL-3.0-only. Complete corresponding source is available in this repository and in GitHub's source archives for each release tag.

The PDF content-removal engine uses MuPDF.js 1.28.1, Copyright Artifex Software, Inc., under AGPL-3.0. Its license is included with the packaged dependency. See https://github.com/ArtifexSoftware/mupdf.js.

Other dependencies include Electron (MIT), React (MIT), PDF.js (Apache-2.0), pdf-lib (MIT), Tesseract.js (Apache-2.0), Lucide (ISC), and Zustand (MIT). Dependency license files are retained in the application package where distributed. See package-lock.json for exact versions and upstream package metadata.

## Local Rust migration

The unreleased Tauri build uses Tauri (MIT/Apache-2.0), the MuPDF Rust wrapper
0.8.0 (AGPL-3.0), and MuPDF 1.27.2 from mupdf-sys 0.8.0 (AGPL-3.0).
The wrapper source and its license are retained in `native/vendor/mupdf`;
`PATCHES.md` records the local MSVC fix. MuPDF's corresponding native engine
source must accompany a future release, separately from the MuPDF.js source
used by the Electron release.

Native certificate signing uses pdf_signer 0.2.0 (GPL-3.0-or-later), and native
Word export uses docx-rs 0.4.22 (MIT). Exact Rust dependency versions are recorded
in `Cargo.lock`. Distribution license collection and Windows runtime dependency
packaging remain release validation gates.

## Bundled fonts

WOFF2 import uses wawoff2 2.0.1, a WebAssembly build of Google's WOFF2 decoder (MIT, Copyright 2013–2017 the WOFF2 Authors). Its complete license is retained in the packaged dependency. The decoder loads only when importing WOFF2; font outlines are reconstructed before embedding.

The Windows installer includes a bounded shell-path copy backported from electron-builder (MIT), Copyright (c) 2015 Loopline Systems. The full notice is installed as `resources/installer-LICENSE.txt`; its source is `build/electron-builder-LICENSE.txt`.

Font embedding uses @pdf-lib/fontkit (MIT), by Andrew Dillon and Devon Govett. Its notice is installed in `resources/font-licenses/fontkit-LICENSE.txt`; the source copy is `build/fontkit-LICENSE.txt`. Upstream: https://github.com/Hopding/fontkit.

Lato, Libre Baskerville, Noto Sans, Noto Serif, Open Sans, Roboto, Source Code Pro, Source Sans 3, Source Serif 4 and Ubuntu are bundled through Fontsource. Their authors' copyright and license texts are in `resources/font-licenses` in installed builds and `src/renderer/src/assets/fonts/*-LICENSE.txt` in the source. Most use the SIL Open Font License; Ubuntu uses the Ubuntu Font License. Imported fonts remain the user's responsibility to license.

Full regular, italic, bold and bold italic OTF faces for Source Sans 3 and Source Serif 4 are also included under SIL OFL-1.1. Upstream repositories: https://github.com/adobe-fonts/source-sans and https://github.com/adobe-fonts/source-serif. Proprietary Adobe Fonts are not redistributed.

Arimo, Tinos, Cousine, Carlito, Caladea, Roboto Condensed and Montserrat are also
bundled through Fontsource under SIL OFL-1.1, including regular, italic, bold and
bold italic faces. Their complete notices are retained with the other bundled
font licenses. The font chooser identifies open-source alternatives to common
proprietary faces. These alternatives may differ in appearance or metrics;
the original embedded font is kept unless the user chooses another font.

## Offline OCR models

English trained data is provided by the Tesseract project under Apache-2.0. The accurate model comes from https://github.com/tesseract-ocr/tessdata_best at commit `e12c65a915945e4c28e237a9b52bc4a8f39a0cec`. Its SHA-256 is `8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba`; its license is included beside the model in `src/renderer/public/tessdata/best/LICENSE`. The standard model remains available for fast recognition.
