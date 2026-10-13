//! OCR adds an invisible text layer to the original PDF. The original image
//! streams and existing text are preserved; recognised duplicates are skipped.
use anyhow::{Context, Result, ensure};
use mupdf::{DocumentWriter, Font, Matrix, Rect, TextPageFlags, pdf::PdfDocument};

pub fn recognize(doc: &mut PdfDocument, pages: &[usize], accurate: bool) -> Result<usize> {
    let dir = tempfile::tempdir()?;
    let data_dir = dir.path().join("tessdata");
    std::fs::create_dir(&data_dir)?;
    let model = if accurate {
        include_bytes!("../../src/renderer/public/tessdata/best/eng.traineddata").as_slice()
    } else {
        include_bytes!("../../src/renderer/public/tessdata/eng.traineddata").as_slice()
    };
    std::fs::write(data_dir.join("eng.traineddata"), model)?;
    let font = Font::new("Helvetica")?;
    let mut count = 0;
    for &index in pages {
        let p = doc.load_page(index as i32)?;
        let bounds = p.bounds()?;
        ensure!(
            bounds.width() * bounds.height() * (300. / 72f32).powi(2) < 80_000_000.,
            "Page {} is too large for 300 DPI OCR",
            index + 1
        );
        let text = p.to_text_page(TextPageFlags::empty())?;
        let native_boxes: Vec<_> = text.words().into_iter().map(|w| w.bounds).collect();
        let output = dir.path().join("recognized.pdf");
        {
            let options = format!(
                "ocr-language=eng,ocr-datadir={},compression=flate,resolution=300",
                data_dir.to_string_lossy()
            );
            let mut writer = DocumentWriter::with_ocr(
                output.to_str().context("OCR output path is not UTF-8")?,
                &options,
            )?;
            let device = writer.begin_page(bounds)?;
            p.run_contents(&device, &Matrix::IDENTITY)?;
            writer.end_page(device)?;
        }
        let recognized = PdfDocument::from_bytes(&std::fs::read(output)?)?;
        let rp = recognized.load_page(0)?;
        let result = rp.to_text_page(TextPageFlags::empty())?;
        let mut p = doc.load_pdf_page(index as i32)?;
        let inv = p.ctm()?.invert().context("Cannot transform this page")?;
        let font_obj = doc.add_font(&font)?;
        let name = format!("ReEditOCR{}", font_obj.as_indirect()?);
        let mut resources = p.resources()?;
        let mut fonts = resources.get_dict("Font")?.unwrap_or(doc.new_dict()?);
        fonts.dict_put(name.as_str(), font_obj)?;
        resources.dict_put("Font", fonts)?;
        p.object().dict_put("Resources", resources)?;
        let mut stream = format!("q\nBT /{name} 1 Tf 3 Tr\n");
        for block in result.blocks() {
            for line in block.lines() {
                for c in line.chars() {
                    let Some(ch) = c.char() else { continue };
                    let q = c.quad();
                    let b = Rect::new(
                        q.ul.x.min(q.ll.x),
                        q.ul.y.min(q.ur.y),
                        q.ur.x.max(q.lr.x),
                        q.ll.y.max(q.lr.y),
                    );
                    if native_boxes.iter().any(|n| overlap(*n, b) > 0.25) {
                        continue;
                    }
                    let gid = font.encode_character(ch as i32)?;
                    if gid <= 0 {
                        continue;
                    }
                    let origin = c.origin().transform(&inv);
                    let size = c.size().max(1.);
                    let advance = font.advance_glyph(gid)?.max(0.01);
                    let width = (b.width() / advance).max(size * 0.2);
                    stream.push_str(&format!(
                        "{width} 0 0 {size} {} {} Tm <{gid:04X}> Tj\n",
                        origin.x, origin.y
                    ));
                    count += 1;
                }
            }
        }
        stream.push_str("ET\nQ\n");
        p.insert_contents(doc, stream.as_bytes(), true)?;
        p.update()?;
    }
    Ok(count)
}
fn overlap(a: Rect, b: Rect) -> f32 {
    let w = (a.x1.min(b.x1) - a.x0.max(b.x0)).max(0.);
    let h = (a.y1.min(b.y1) - a.y0.max(b.y0)).max(0.);
    w * h / (b.width() * b.height()).max(0.01)
}
#[cfg(test)]
mod tests {
    use super::*;
    use mupdf::{
        Colorspace, Point, Size,
        shape::{Shape, TextOptions},
    };
    #[test]
    fn ocr_preserves_images_and_native_text() {
        let mut text_source = PdfDocument::new();
        let mut page = text_source.new_page(Size::A4).unwrap();
        let mut shape = Shape::new(&mut page).unwrap();
        shape
            .insert_text(
                Point::new(72., 200.),
                "Reliable offline recognition",
                &TextOptions {
                    fontsize: 24.,
                    ..Default::default()
                },
            )
            .unwrap()
            .commit(&mut text_source, true)
            .unwrap();
        let image = page
            .to_pixmap(
                &Matrix::new_scale(2., 2.),
                &Colorspace::device_rgb(),
                false,
                true,
            )
            .unwrap();
        let mut scanned = PdfDocument::new();
        let mut page = scanned.new_page(Size::A4).unwrap();
        page.insert_image(
            &mut scanned,
            Rect::new(0., 0., 595., 842.),
            mupdf::pdf::page::PageImageSource::Pixmap(&image),
            Default::default(),
        )
        .unwrap();
        let mut shape = Shape::new(&mut page).unwrap();
        shape
            .insert_text(
                Point::new(72., 100.),
                "Keep this native heading",
                &TextOptions::default(),
            )
            .unwrap()
            .commit(&mut scanned, true)
            .unwrap();
        let before = page
            .to_pixmap(
                &Matrix::new_scale(0.5, 0.5),
                &Colorspace::device_rgb(),
                false,
                true,
            )
            .unwrap()
            .samples()
            .to_vec();
        let count = recognize(&mut scanned, &[0], false).unwrap();
        assert!(count > 10);
        let page = scanned.load_page(0).unwrap();
        let text = page.text(Default::default()).unwrap();
        assert!(text.contains("Reliable"), "{text}");
        assert!(text.contains("recognition"), "{text}");
        assert_eq!(
            text.matches("Keep this native heading").count(),
            1,
            "{text}"
        );
        let after = page
            .to_pixmap(
                &Matrix::new_scale(0.5, 0.5),
                &Colorspace::device_rgb(),
                false,
                true,
            )
            .unwrap()
            .samples()
            .to_vec();
        assert_eq!(before, after, "OCR changed visible page pixels");
    }
}
