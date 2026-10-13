//! Repair only the scanned lettering being edited. Pixel redaction uses white;
//! restore the paper from nearby pixels instead of leaving rectangular patches.
use anyhow::{Result, ensure};
use mupdf::{
    Colorspace, Device, IRect, Image, Matrix, Pixmap, Point, Rect,
    pdf::{PdfDocument, PdfPage},
};

pub struct Patch {
    pixels: Pixmap,
    scale: f32,
}

pub fn capture(page: &PdfPage, points: [Point; 4]) -> Result<Patch> {
    let scale = 3.;
    let bounds = page.bounds()?;
    let mut target = Rect::new(f32::MAX, f32::MAX, f32::MIN, f32::MIN);
    for p in points {
        target.x0 = target.x0.min(p.x);
        target.x1 = target.x1.max(p.x);
        target.y0 = target.y0.min(p.y);
        target.y1 = target.y1.max(p.y);
    }
    // OCR baseline/font boxes do not always match the scanned ascenders. Leave
    // a small margin for their antialiasing and for sampling unchanged paper.
    let area = IRect::new(
        ((target.x0 - 4.).max(bounds.x0) * scale).floor() as i32,
        ((target.y0 - 4.).max(bounds.y0) * scale).floor() as i32,
        ((target.x1 + 4.).min(bounds.x1) * scale).ceil() as i32,
        ((target.y1 + 4.).min(bounds.y1) * scale).ceil() as i32,
    );
    ensure!(
        area.width() > 0
            && area.height() > 0
            && i64::from(area.width()) * i64::from(area.height()) <= 4_000_000,
        "OCR edit region is too large; edit a smaller text block"
    );
    let mut pixels = Pixmap::new_with_rect(&Colorspace::device_rgb(), area, false)?;
    pixels.clear_with(255)?;
    let device = Device::from_pixmap(&pixels)?;
    page.run_contents(&device, &Matrix::new_scale(scale, scale))?;
    drop(device);
    let polygon = [points[0], points[1], points[3], points[2]];
    repair(
        pixels.samples_mut(),
        area.width() as usize,
        area.height() as usize,
        &polygon.map(|p| Point::new(p.x * scale - area.x0 as f32, p.y * scale - area.y0 as f32)),
        6.,
    );
    Ok(Patch { pixels, scale })
}

fn inside(p: Point, polygon: &[Point; 4], margin: f32) -> bool {
    let mut sign = 0.;
    for i in 0..4 {
        let a = polygon[i];
        let b = polygon[(i + 1) % 4];
        let cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        if cross.abs() <= margin * ((b.x - a.x).hypot(b.y - a.y)) {
            continue;
        }
        if sign == 0. {
            sign = cross.signum()
        } else if sign != cross.signum() {
            return false;
        }
    }
    true
}

fn repair(rgb: &mut [u8], width: usize, height: usize, polygon: &[Point; 4], margin: f32) {
    let length = width * height;
    let original = rgb.to_vec();
    let mut samples = [Vec::new(), Vec::new(), Vec::new()];
    for y in 0..height {
        for x in 0..width {
            if !inside(Point::new(x as f32 + 0.5, y as f32 + 0.5), polygon, margin) {
                for c in 0..3 {
                    samples[c].push(original[(y * width + x) * 3 + c]);
                }
            }
        }
    }
    if samples[0].len() < 12 {
        return;
    }
    let background = samples.map(|mut values| {
        let n = values.len() / 2;
        *values.select_nth_unstable(n).1
    });
    let mut masked = vec![false; length];
    for y in 0..height {
        for x in 0..width {
            let i = y * width + x;
            if inside(Point::new(x as f32 + 0.5, y as f32 + 0.5), polygon, margin) {
                masked[i] = (0..3).any(|c| {
                    (i16::from(original[i * 3 + c]) - i16::from(background[c])).abs() > 12
                });
            }
        }
    }
    // Include antialiasing immediately around ink, while retaining the original
    // texture everywhere else. Never paint the whole OCR bounding rectangle.
    let ink = masked.clone();
    for y in 1..height.saturating_sub(1) {
        for x in 1..width.saturating_sub(1) {
            let i = y * width + x;
            if inside(Point::new(x as f32 + 0.5, y as f32 + 0.5), polygon, margin)
                && (ink[i - 1] || ink[i + 1] || ink[i - width] || ink[i + width])
            {
                masked[i] = true
            }
        }
    }
    // Nearest unchanged paper, with bounded linear-time work and memory.
    let mut distance = vec![u32::MAX / 2; length];
    let mut nearest = vec![0usize; length];
    for i in 0..length {
        if !masked[i]
            && (0..3)
                .all(|c| (i16::from(original[i * 3 + c]) - i16::from(background[c])).abs() <= 12)
        {
            distance[i] = 0;
            nearest[i] = i;
        }
    }
    for i in 0..length {
        if i % width > 0 && distance[i - 1] + 1 < distance[i] {
            distance[i] = distance[i - 1] + 1;
            nearest[i] = nearest[i - 1];
        }
        if i >= width && distance[i - width] + 1 < distance[i] {
            distance[i] = distance[i - width] + 1;
            nearest[i] = nearest[i - width];
        }
    }
    for i in (0..length).rev() {
        if i % width + 1 < width && distance[i + 1] + 1 < distance[i] {
            distance[i] = distance[i + 1] + 1;
            nearest[i] = nearest[i + 1];
        }
        if i + width < length && distance[i + width] + 1 < distance[i] {
            distance[i] = distance[i + width] + 1;
            nearest[i] = nearest[i + width];
        }
    }
    for i in 0..length {
        if masked[i] && distance[i] < u32::MAX / 2 {
            rgb[i * 3..i * 3 + 3].copy_from_slice(&original[nearest[i] * 3..nearest[i] * 3 + 3]);
        }
    }
}

pub fn insert(document: &mut PdfDocument, page: &mut PdfPage, patch: Patch) -> Result<()> {
    let inverse = page
        .ctm()?
        .invert()
        .ok_or_else(|| anyhow::anyhow!("Page transform is not invertible"))?;
    let bounds = patch.pixels.rect();
    let scale = patch.scale;
    let p = Point::new(bounds.x0 as f32 / scale, bounds.y1 as f32 / scale).transform(&inverse);
    let right = Point::new(bounds.x1 as f32 / scale, bounds.y1 as f32 / scale).transform(&inverse);
    let top = Point::new(bounds.x0 as f32 / scale, bounds.y0 as f32 / scale).transform(&inverse);
    let image = document.add_image(&Image::from_pixmap(&patch.pixels)?)?;
    let name = format!("ReEditOCRPatch{}", image.as_indirect()?);
    let mut resources = page.resources()?;
    let mut images = resources
        .get_dict("XObject")?
        .unwrap_or(document.new_dict()?);
    images.dict_put(name.as_str(), image)?;
    resources.dict_put("XObject", images)?;
    page.object().dict_put("Resources", resources)?;
    page.insert_contents(
        document,
        format!(
            "q\n{} {} {} {} {} {} cm\n/{} Do\nQ\n",
            right.x - p.x,
            right.y - p.y,
            top.x - p.x,
            top.y - p.y,
            p.x,
            p.y,
            name
        )
        .as_bytes(),
        true,
    )?;
    page.update()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::content_removal::{Region, remove};
    use mupdf::{Font, SimpleFontEncoding, Size, pdf::PdfWriteOptions};

    fn fixture(paper: [u8; 3], rotation: i32) -> Vec<u8> {
        let mut image = Pixmap::new_with_w_h(&Colorspace::device_rgb(), 400, 200, false).unwrap();
        for y in 0..200usize {
            for x in 0..400usize {
                let noise = ((x * 13 + y * 7) % 3) as u8;
                let pixel = &mut image.samples_mut()[(y * 400 + x) * 3..(y * 400 + x) * 3 + 3];
                for c in 0..3 {
                    pixel[c] = paper[c].saturating_sub(noise);
                }
                if (90..160).contains(&x) && (70..90).contains(&y)
                    || (240..285).contains(&x) && (70..90).contains(&y)
                {
                    pixel.fill(20);
                }
            }
        }
        let mut doc = PdfDocument::new();
        let mut page = doc.new_page(Size::new(200., 100.)).unwrap();
        let image = doc.add_image(&Image::from_pixmap(&image).unwrap()).unwrap();
        let font = doc
            .add_simple_font(&Font::new("Helvetica").unwrap(), SimpleFontEncoding::Latin)
            .unwrap();
        let mut resources = doc.new_dict().unwrap();
        let mut images = doc.new_dict().unwrap();
        let mut fonts = doc.new_dict().unwrap();
        images.dict_put("Scan", image).unwrap();
        fonts.dict_put("OCR", font).unwrap();
        resources.dict_put("XObject", images).unwrap();
        resources.dict_put("Font", fonts).unwrap();
        page.object().dict_put("Resources", resources).unwrap();
        page.insert_contents(&mut doc,b"q 200 0 0 100 0 0 cm /Scan Do Q\nBT /OCR 12 Tf 3 Tr 1 0 0 1 40 55 Tm (REMOVE) Tj 1 0 0 1 120 55 Tm (KEEP) Tj ET\n",true).unwrap();
        page.set_rotation(rotation).unwrap();
        let mut bytes = Vec::new();
        doc.write_to_with_options(&mut bytes, PdfWriteOptions::default())
            .unwrap();
        bytes
    }

    #[test]
    fn ocr_edits_remove_ink_without_white_patches_and_preserve_adjacent_content() {
        for paper in [[242, 231, 210], [214, 220, 225], [255, 255, 255]] {
            for rotation in [0, 90, 180, 270] {
                let input = fixture(paper, rotation);
                let region = Region {
                    page: 1,
                    annotation_id: None,
                    remove_image_text: Some(true),
                    quad: Some([40., 68., 100., 68., 40., 52., 100., 52.]),
                    x: None,
                    y: None,
                    w: None,
                    h: None,
                };
                let output = remove(&input, &[region.clone()], false).unwrap();
                let doc = PdfDocument::from_bytes(&output).unwrap();
                let page = doc.load_pdf_page(0).unwrap();
                let text = page.text(Default::default()).unwrap();
                assert!(!text.contains("REMOVE"), "{text}");
                assert!(text.contains("KEEP"));
                let pixels = page
                    .to_pixmap(
                        &Matrix::new_scale(2., 2.),
                        &Colorspace::device_rgb(),
                        false,
                        true,
                    )
                    .unwrap();
                let location = |x: f32, y: f32| {
                    let p = Point::new(x, 100. - y).transform(&page.ctm().unwrap());
                    (p.y as usize * 2) * pixels.stride() as usize + (p.x as usize * 2) * 3
                };
                let clean = location(50., 40.);
                let keep = location(130., 40.);
                for c in 0..3 {
                    assert!(
                        (i16::from(pixels.samples()[clean + c]) - i16::from(paper[c])).abs() <= 5,
                        "Paper changed at rotation {rotation}: {:?}",
                        &pixels.samples()[clean..clean + 3]
                    );
                }
                assert!(pixels.samples()[keep] < 40, "Adjacent scan text was erased");
                // A second pass must not introduce a patch or recover old lettering.
                let again = remove(&output, &[region], false).unwrap();
                let doc = PdfDocument::from_bytes(&again).unwrap();
                let page = doc.load_pdf_page(0).unwrap();
                let second = page
                    .to_pixmap(
                        &Matrix::new_scale(2., 2.),
                        &Colorspace::device_rgb(),
                        false,
                        true,
                    )
                    .unwrap();
                assert_eq!(
                    pixels.samples(),
                    second.samples(),
                    "Repeated repair changed the page"
                );
            }
        }
    }

    #[test]
    fn secure_redaction_stays_black_and_does_not_reconstruct_scanned_content() {
        let input = fixture([242, 231, 210], 0);
        let output = remove(
            &input,
            &[Region {
                page: 1,
                annotation_id: None,
                remove_image_text: Some(true),
                quad: None,
                x: Some(0.2),
                y: Some(0.3),
                w: Some(0.3),
                h: Some(0.2),
            }],
            true,
        )
        .unwrap();
        let doc = PdfDocument::from_bytes(&output).unwrap();
        let page = doc.load_page(0).unwrap();
        let pixels = page
            .to_pixmap(
                &Matrix::new_scale(2., 2.),
                &Colorspace::device_rgb(),
                false,
                true,
            )
            .unwrap();
        let i = 80 * pixels.stride() as usize + 100 * 3;
        assert_eq!(&pixels.samples()[i..i + 3], &[0, 0, 0]);
    }
}
