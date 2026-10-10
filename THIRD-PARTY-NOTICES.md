# Third-party software

Re-Edit PDF is distributed under AGPL-3.0-only. Complete corresponding source is available in this repository and in GitHub's source archives for each release tag.

The PDF content-removal engine uses MuPDF.js 1.28.1, Copyright Artifex Software, Inc., under AGPL-3.0. Its license is included with the packaged dependency. See https://github.com/ArtifexSoftware/mupdf.js.

Other dependencies include Electron (MIT), React (MIT), PDF.js (Apache-2.0), pdf-lib (MIT), Tesseract.js (Apache-2.0), Lucide (ISC), and Zustand (MIT). Dependency license files are retained in the application package where distributed. See package-lock.json for exact versions and upstream package metadata.

## Bundled fonts

Font embedding uses @pdf-lib/fontkit (MIT), by Andrew Dillon and Devon Govett. Its notice is installed in `resources/font-licenses/fontkit-LICENSE.txt`; the source copy is `build/fontkit-LICENSE.txt`. Upstream: https://github.com/Hopding/fontkit.

Lato, Libre Baskerville, Noto Sans, Noto Serif, Open Sans, Roboto, Source Code Pro and Ubuntu are bundled through Fontsource. Their authors' copyright and license texts are in `resources/font-licenses` in installed builds and `src/renderer/src/assets/fonts/*-LICENSE.txt` in the source. Most use the SIL Open Font License; Ubuntu uses the Ubuntu Font License. Imported fonts remain the user's responsibility to license.
