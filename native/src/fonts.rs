use anyhow::{Context, Result, ensure};
use std::{io::Read, path::Path};
include!(concat!(env!("OUT_DIR"), "/fonts.rs"));
pub fn import(path: &Path) -> Result<Vec<u8>> {
    let input = std::fs::read(path)?;
    normalize(&input)
}
pub fn normalize(input: &[u8]) -> Result<Vec<u8>> {
    ensure!(
        input.len() >= 12 && input.len() <= 64 * 1024 * 1024,
        "Invalid font size"
    );
    if &input[..4] == b"wOFF" {
        decode_woff(&input)
    } else {
        ensure!(
            &input[..4] == b"OTTO" || input[..4] == [0, 1, 0, 0] || &input[..4] == b"true",
            "Import a TTF, OTF or WOFF font; WOFF2 is not supported by the native build yet"
        );
        Ok(input.to_vec())
    }
}
fn decode_woff(input: &[u8]) -> Result<Vec<u8>> {
    ensure!(input.len() >= 44, "Incomplete WOFF header");
    let u16be = |i| u16::from_be_bytes(input[i..i + 2].try_into().unwrap());
    let u32be = |i| u32::from_be_bytes(input[i..i + 4].try_into().unwrap());
    let n = u16be(12) as usize;
    ensure!(
        (1..=256).contains(&n) && 44 + n * 20 <= input.len(),
        "Invalid WOFF table directory"
    );
    let mut out = vec![0; 12 + n * 16];
    out[..4].copy_from_slice(&input[4..8]);
    out[4..6].copy_from_slice(&(n as u16).to_be_bytes());
    let power = 1usize << (usize::BITS - 1 - n.leading_zeros());
    out[6..8].copy_from_slice(&((power * 16) as u16).to_be_bytes());
    out[8..10].copy_from_slice(&(power.trailing_zeros() as u16).to_be_bytes());
    out[10..12].copy_from_slice(&((n * 16 - power * 16) as u16).to_be_bytes());
    for i in 0..n {
        let record = 44 + i * 20;
        let offset = u32be(record + 4) as usize;
        let compressed = u32be(record + 8) as usize;
        let length = u32be(record + 12) as usize;
        ensure!(
            compressed <= length
                && offset
                    .checked_add(compressed)
                    .is_some_and(|end| end <= input.len())
                && length <= 64 * 1024 * 1024,
            "Invalid WOFF table bounds"
        );
        let table = if compressed == length {
            input[offset..offset + length].to_vec()
        } else {
            let mut bytes = Vec::new();
            flate2::read::ZlibDecoder::new(&input[offset..offset + compressed])
                .take(length as u64 + 1)
                .read_to_end(&mut bytes)?;
            ensure!(bytes.len() == length, "Incorrect WOFF table length");
            bytes
        };
        ensure!(
            out.len() + table.len() <= 64 * 1024 * 1024,
            "Font is too large"
        );
        let at = out.len();
        let dest = 12 + i * 16;
        out[dest..dest + 4].copy_from_slice(&input[record..record + 4]);
        out[dest + 4..dest + 8].copy_from_slice(&input[record + 16..record + 20]);
        out[dest + 8..dest + 12].copy_from_slice(&(at as u32).to_be_bytes());
        out[dest + 12..dest + 16].copy_from_slice(&(length as u32).to_be_bytes());
        out.extend(table);
        while out.len() % 4 != 0 {
            out.push(0)
        }
    }
    Ok(out)
}
pub fn bytes_for(name: &str) -> Result<Vec<u8>> {
    if let Some((_, bytes)) = BUNDLED.iter().find(|(n, _)| *n == name) {
        return Ok(bytes.to_vec());
    }
    let handle = font_kit::source::SystemSource::new()
        .select_family_by_name(name)
        .with_context(|| format!("Font {name} is unavailable"))?
        .fonts()
        .first()
        .cloned()
        .context("Font family has no faces")?;
    let font = handle.load()?;
    Ok(font
        .copy_font_data()
        .context("Font data cannot be exported")?
        .to_vec())
}
pub fn names() -> Vec<String> {
    let mut out = BUNDLED
        .iter()
        .map(|(n, _)| n.to_string())
        .collect::<Vec<_>>();
    if let Ok(installed) = font_kit::source::SystemSource::new().all_families() {
        out.extend(installed)
    }
    out.sort();
    out.dedup();
    out
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn bundled_fonts_are_real_font_programs() {
        assert!(BUNDLED.len() >= 68);
        for family in [
            "arimo",
            "tinos",
            "cousine",
            "carlito",
            "caladea",
            "roboto-condensed",
            "montserrat",
        ] {
            assert!(
                BUNDLED
                    .iter()
                    .any(|(name, _)| *name == format!("{family}-400-normal"))
            );
        }
        for (name, data) in BUNDLED {
            let font = mupdf::Font::from_bytes(name, data).unwrap();
            assert!(font.encode_character('A' as i32).unwrap() > 0, "{name}");
        }
    }
    #[test]
    fn invalid_font_is_rejected_without_panicking() {
        for b in [vec![0; 44], b"wOFFbad".to_vec(), vec![b'x'; 100]] {
            let dir = tempfile::tempdir().unwrap();
            let p = dir.path().join("font.woff");
            std::fs::write(&p, b).unwrap();
            assert!(import(&p).is_err());
        }
    }
}
