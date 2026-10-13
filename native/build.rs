use std::{io::Read, path::PathBuf};
fn normalize(input: &[u8]) -> Vec<u8> {
    if &input[..4] != b"wOFF" {
        return input.to_vec();
    }
    let u16be = |i| u16::from_be_bytes(input[i..i + 2].try_into().unwrap());
    let u32be = |i| u32::from_be_bytes(input[i..i + 4].try_into().unwrap());
    let n = u16be(12) as usize;
    let mut out = vec![0; 12 + n * 16];
    out[..4].copy_from_slice(&input[4..8]);
    out[4..6].copy_from_slice(&(n as u16).to_be_bytes());
    let power = 2usize.pow((n as f32).log2().floor() as u32);
    out[6..8].copy_from_slice(&((power * 16) as u16).to_be_bytes());
    out[8..10].copy_from_slice(&((power as f32).log2() as u16).to_be_bytes());
    out[10..12].copy_from_slice(&((n * 16 - power * 16) as u16).to_be_bytes());
    for i in 0..n {
        let record = 44 + i * 20;
        let offset = u32be(record + 4) as usize;
        let compressed = u32be(record + 8) as usize;
        let length = u32be(record + 12) as usize;
        let table = if compressed == length {
            input[offset..offset + length].to_vec()
        } else {
            let mut d = flate2::read::ZlibDecoder::new(&input[offset..offset + compressed]);
            let mut bytes = Vec::new();
            d.read_to_end(&mut bytes).unwrap();
            assert_eq!(bytes.len(), length);
            bytes
        };
        let at = out.len();
        let dest = 12 + i * 16;
        out[dest..dest + 4].copy_from_slice(&input[record..record + 4]);
        out[dest + 4..dest + 8].copy_from_slice(&input[record + 16..record + 20]);
        out[dest + 8..dest + 12].copy_from_slice(&(at as u32).to_be_bytes());
        out[dest + 12..dest + 16].copy_from_slice(&(length as u32).to_be_bytes());
        out.extend(table);
        while out.len() % 4 != 0 {
            out.push(0);
        }
    }
    out
}
fn main() {
    let root = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap());
    let fonts = root.join("../src/renderer/src/assets/fonts");
    println!("cargo:rerun-if-changed={}", fonts.display());
    let output = PathBuf::from(std::env::var("OUT_DIR").unwrap());
    let mut paths = std::fs::read_dir(&fonts)
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| p.extension().is_some_and(|e| e == "woff"))
        .collect::<Vec<_>>();
    paths.sort();
    let mut catalog = String::from("pub static BUNDLED: &[(&str, &[u8])] = &[\n");
    for path in paths {
        println!("cargo:rerun-if-changed={}", path.display());
        let name = path
            .file_stem()
            .unwrap()
            .to_string_lossy()
            .replace("-latin", "");
        let data = normalize(&std::fs::read(&path).unwrap());
        let file = output.join(format!("{name}.sfnt"));
        std::fs::write(&file, data).unwrap();
        catalog.push_str(&format!(
            "({name:?}, include_bytes!({:?})),\n",
            file.to_string_lossy()
        ));
    }
    catalog.push_str("];\n");
    std::fs::write(output.join("fonts.rs"), catalog).unwrap();
}
