use anyhow::{Result, ensure};
use mupdf::{
    Point, Quad, Rect,
    pdf::{
        PdfDocument, PdfWriteOptions,
        annotation::{
            PdfAnnotationType, PdfRedactImageMethod, PdfRedactLineArtMethod, PdfRedactOptions,
        },
    },
};
use serde::{Deserialize, Serialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Region {
    pub page: usize,
    pub annotation_id: Option<String>,
    pub remove_image_text: Option<bool>,
    pub quad: Option<[f32; 8]>,
    pub x: Option<f32>,
    pub y: Option<f32>,
    pub w: Option<f32>,
    pub h: Option<f32>,
}
pub fn remove(bytes: &[u8], regions: &[Region], secure: bool) -> Result<Vec<u8>> {
    let mut document = PdfDocument::from_bytes(bytes)?;
    ensure!(
        !document.needs_password()?,
        "Unlock the PDF before removing content"
    );
    if secure {
        document.bake(false, true)?;
    }
    let count = document.page_count()? as usize;
    for r in regions {
        ensure!(
            r.page > 0 && r.page <= count,
            "Content removal page is outside this PDF"
        );
        let mut page = document.load_pdf_page((r.page - 1) as i32)?;
        ensure!(
            !page
                .annotations()
                .any(|a| a.r#type().ok() == Some(PdfAnnotationType::Redact)),
            "This page contains pending redactions; apply or remove them first"
        );
        if let Some(reference) = &r.annotation_id {
            let (n, generation) = reference
                .split_once('R')
                .ok_or_else(|| anyhow::anyhow!("Invalid PDF annotation reference"))?;
            ensure!(
                !n.is_empty()
                    && n.bytes().all(|c| c.is_ascii_digit())
                    && generation.bytes().all(|c| c.is_ascii_digit()),
                "Invalid PDF annotation reference"
            );
            let id = n.parse::<i32>()?;
            if let Some(a) = page.annotations().find(|a| {
                a.xref().ok() == Some(id) && a.r#type().ok() == Some(PdfAnnotationType::FreeText)
            }) {
                page.delete_annotation(a)?;
            }
            continue;
        }
        let mut paper_patch = None;
        if let Some(q) = r.quad {
            ensure!(
                q.iter().all(|p| p.is_finite()),
                "Invalid removal coordinates"
            );
            let m = page.ctm()?;
            let point = |i| Point::new(q[i], q[i + 1]).transform(&m);
            if !secure && r.remove_image_text.unwrap_or(false) {
                paper_patch = Some(crate::ocr_background::capture(
                    &page,
                    [point(0), point(2), point(4), point(6)],
                )?);
            }
            page.add_redact_annotation(vec![Quad::new(point(0), point(2), point(4), point(6))])?;
        } else {
            let (x, y, w, h) = (
                r.x.unwrap_or_default(),
                r.y.unwrap_or_default(),
                r.w.unwrap_or_default(),
                r.h.unwrap_or_default(),
            );
            ensure!(
                [x, y, w, h].iter().all(|v| v.is_finite())
                    && w > 0.
                    && h > 0.
                    && x >= 0.
                    && y >= 0.
                    && x + w <= 1.001
                    && y + h <= 1.001,
                "Invalid normalized removal rectangle"
            );
            let b = page.bounds()?;
            let target = Rect::new(
                b.x0 + x * b.width(),
                b.y0 + y * b.height(),
                b.x0 + (x + w) * b.width(),
                b.y0 + (y + h) * b.height(),
            );
            if !secure && r.remove_image_text.unwrap_or(false) {
                paper_patch = Some(crate::ocr_background::capture(
                    &page,
                    [
                        Point::new(target.x0, target.y0),
                        Point::new(target.x1, target.y0),
                        Point::new(target.x0, target.y1),
                        Point::new(target.x1, target.y1),
                    ],
                )?);
            }
            if secure {
                let annotations: Vec<_> = page
                    .annotations()
                    .filter(|a| {
                        a.bounds().is_ok_and(|r| {
                            r.x0 < target.x1
                                && r.x1 > target.x0
                                && r.y0 < target.y1
                                && r.y1 > target.y0
                        })
                    })
                    .collect();
                for a in annotations {
                    page.delete_annotation(a)?;
                }
            }
            page.add_redact_annotation(target)?;
        }
        page.apply_redactions_with_options(PdfRedactOptions {
            black_boxes: secure,
            image_method: if secure || r.remove_image_text.unwrap_or(false) {
                PdfRedactImageMethod::Pixels
            } else {
                PdfRedactImageMethod::None
            },
            line_art: if secure {
                PdfRedactLineArtMethod::RemoveIfTouched
            } else {
                PdfRedactLineArtMethod::None
            },
            ..Default::default()
        })?;
        if let Some(patch) = paper_patch {
            crate::ocr_background::insert(&mut document, &mut page, patch)?;
        }
    }
    if secure {
        document.trailer()?.dict_delete("Info")?;
        let mut root = document.catalog()?;
        root.dict_delete("Metadata")?;
        root.dict_delete("OpenAction")?;
        if let Some(mut names) = root.get_dict("Names")? {
            names.dict_delete("EmbeddedFiles")?;
            names.dict_delete("JavaScript")?;
        }
    }
    let mut options = PdfWriteOptions::default();
    options
        .set_compress(true)
        .set_garbage_level(4)
        .set_clean(true);
    let mut output = Vec::new();
    document.write_to_with_options(&mut output, options)?;
    Ok(output)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn removes_selected_text_with_round_trip() {
        let bytes = std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../test-fixtures/simple-text.pdf"
        ))
        .unwrap();
        let doc = PdfDocument::from_bytes(&bytes).unwrap();
        let page = doc.load_page(0).unwrap();
        let text = page.to_text_page(mupdf::TextPageFlags::empty()).unwrap();
        let word = text
            .words()
            .into_iter()
            .find(|w| w.text == "quick")
            .unwrap();
        let b = word.bounds;
        let bounds = page.bounds().unwrap();
        let out = remove(
            &bytes,
            &[Region {
                page: 1,
                annotation_id: None,
                remove_image_text: None,
                quad: None,
                x: Some(b.x0 / bounds.width()),
                y: Some(b.y0 / bounds.height()),
                w: Some(b.width() / bounds.width()),
                h: Some(b.height() / bounds.height()),
            }],
            false,
        )
        .unwrap();
        let doc = PdfDocument::from_bytes(&out).unwrap();
        let text = doc.load_page(0).unwrap().text(Default::default()).unwrap();
        assert_eq!(text.matches("quick").count(), 19);
        assert!(text.contains("Line 20"));
    }
    #[test]
    fn invalid_page_or_geometry_is_rejected() {
        let bytes = std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../test-fixtures/simple-text.pdf"
        ))
        .unwrap();
        let mut r = Region {
            page: 0,
            annotation_id: None,
            remove_image_text: None,
            quad: None,
            x: Some(10.),
            y: Some(10.),
            w: Some(20.),
            h: Some(20.),
        };
        assert!(remove(&bytes, &[r.clone()], false).is_err());
        r.page = 1;
        r.w = Some(f32::NAN);
        assert!(remove(&bytes, &[r], false).is_err());
    }
}
