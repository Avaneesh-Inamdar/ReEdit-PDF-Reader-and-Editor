use anyhow::{Context, Result, ensure};
use serde::{Deserialize, Serialize};
use std::{
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};
use wait_timeout::ChildExt;

pub const RELEASES: &str =
    "https://github.com/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/releases";
pub fn quiet(command: &mut Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000);
    }
    let _ = command;
}
pub fn open_url(url: &str) -> Result<()> {
    #[cfg(windows)]
    let mut command = {
        let mut c = Command::new("explorer.exe");
        c.arg(url);
        c
    };
    #[cfg(target_os = "linux")]
    let mut command = {
        let mut c = Command::new("xdg-open");
        c.arg(url);
        c
    };
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut c = Command::new("open");
        c.arg(url);
        c
    };
    quiet(&mut command);
    command.spawn()?;
    Ok(())
}
pub fn import_office(source: &Path) -> Result<Vec<u8>> {
    #[cfg(windows)]
    let candidates = vec![
        PathBuf::from(std::env::var("ProgramFiles").unwrap_or("C:/Program Files".into()))
            .join("LibreOffice/program/soffice.exe"),
        PathBuf::from(
            std::env::var("ProgramFiles(x86)").unwrap_or("C:/Program Files (x86)".into()),
        )
        .join("LibreOffice/program/soffice.exe"),
    ];
    #[cfg(not(windows))]
    let candidates = vec![
        PathBuf::from("/usr/bin/libreoffice"),
        PathBuf::from("/usr/bin/soffice"),
        PathBuf::from("/Applications/LibreOffice.app/Contents/MacOS/soffice"),
    ];
    let executable = candidates.into_iter().find(|p| p.is_file()).context(
        "Office conversion requires LibreOffice. Install it from libreoffice.org and try again",
    )?;
    let dir = tempfile::tempdir()?;
    let output = dir.path().join("output");
    std::fs::create_dir(&output)?;
    let extension = source
        .extension()
        .context("Source document has no extension")?
        .to_string_lossy();
    let input = dir.path().join(format!("input.{extension}"));
    std::fs::copy(source, &input)?;
    let profile = url::Url::from_directory_path(dir.path().join("profile"))
        .map_err(|_| anyhow::anyhow!("Cannot create Office profile path"))?;
    let mut command = Command::new(executable);
    command
        .arg(format!("-env:UserInstallation={profile}"))
        .args(["--headless", "--convert-to", "pdf", "--outdir"])
        .arg(&output)
        .arg(&input)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    quiet(&mut command);
    let mut child = command.spawn()?;
    let status = child.wait_timeout(Duration::from_secs(120))?;
    if status.is_none() {
        let _ = child.kill();
        let _ = child.wait();
        anyhow::bail!("Office conversion timed out after two minutes");
    }
    ensure!(
        status.unwrap().success(),
        "LibreOffice could not convert this document"
    );
    let pdf = std::fs::read_dir(output)?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .find(|p| p.extension().is_some_and(|e| e == "pdf"))
        .context("LibreOffice did not produce a PDF")?;
    Ok(std::fs::read(pdf)?)
}
#[derive(Debug, Serialize)]
pub struct UpdateResult {
    pub current: String,
    pub latest: Option<String>,
    pub available: bool,
    pub message: String,
}
pub fn check_updates() -> Result<UpdateResult> {
    let config = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(15)))
        .build();
    let agent = ureq::Agent::new_with_config(config);
    let mut response=agent.get("https://api.github.com/repos/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/releases/latest").header("User-Agent","Re-Edit-PDF").call()?;
    let json: serde_json::Value = response.body_mut().read_json()?;
    let tag = json["tag_name"]
        .as_str()
        .context("Release response has no version")?
        .trim_start_matches('v')
        .to_owned();
    let current = env!("CARGO_PKG_VERSION");
    let available = newer(&tag, current);
    Ok(UpdateResult {
        current: current.into(),
        latest: Some(tag.clone()),
        available,
        message: if available {
            format!("Re-Edit PDF {tag} is available")
        } else {
            format!("No newer stable release is available. Current version: {current}")
        },
    })
}
fn newer(a: &str, b: &str) -> bool {
    let parse = |value: &str| -> Option<[u32; 3]> {
        let mut parts = value.split('.');
        let result = [
            parts.next()?.parse().ok()?,
            parts.next()?.parse().ok()?,
            parts.next()?.parse().ok()?,
        ];
        parts.next().is_none().then_some(result)
    };
    let Some(latest) = parse(a.trim_start_matches('v')) else {
        return false;
    };
    let Some(current) = parse(b.split('-').next().unwrap_or(b)) else {
        return false;
    };
    latest > current || (latest == current && b.contains('-'))
}
#[derive(Deserialize)]
pub struct WordLine {
    pub text: String,
    pub size: f32,
}
pub fn export_word(pages: Vec<Vec<WordLine>>) -> Result<Vec<u8>> {
    let mut doc = docx_rs::Docx::new();
    for (index, lines) in pages.into_iter().enumerate() {
        for (i, line) in lines.into_iter().enumerate() {
            let run = docx_rs::Run::new()
                .add_text(line.text)
                .size((line.size * 2.).round().clamp(12., 144.) as usize);
            let mut p = docx_rs::Paragraph::new().add_run(run);
            if index > 0 && i == 0 {
                p = p.page_break_before(true)
            }
            doc = doc.add_paragraph(p);
        }
    }
    let mut cursor = std::io::Cursor::new(Vec::new());
    doc.build().pack(&mut cursor)?;
    Ok(cursor.into_inner())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn versions_do_not_offer_an_older_electron_build() {
        assert!(!newer("1.4.4", "2.0.0-alpha.1"));
        assert!(newer("2.1.0", "2.0.0"));
    }
    #[test]
    fn word_export_contains_a_real_docx_zip() {
        let out = export_word(vec![vec![WordLine {
            text: "Example".into(),
            size: 12.,
        }]])
        .unwrap();
        assert_eq!(&out[..2], b"PK");
    }
}

#[cfg(test)]
mod signing_tests {
    #[test]
    fn signing_keeps_source_and_rejects_tampering_and_wrong_password() {
        let source = pdf_signer::testkit::sample_pdf();
        let certificate = pdf_signer::testkit::self_signed_p256_p12("local-test-only");
        let signed = pdf_signer::sign_pdf_bytes(
            &source,
            &certificate,
            "local-test-only",
            &Default::default(),
        )
        .unwrap();
        assert!(signed.starts_with(&source));
        let report = pdf_signer::verify_pdf_bytes(&signed).unwrap();
        assert_eq!(report.signatures.len(), 1);
        assert!(report.signatures[0].valid && report.signatures[0].covers_whole_document);
        assert!(
            pdf_signer::sign_pdf_bytes(&source, &certificate, "incorrect", &Default::default())
                .is_err()
        );
        let mut changed = signed.clone();
        let index = changed
            .windows(6)
            .position(|text| text == b"sample")
            .unwrap();
        changed[index] = b'X';
        let invalid = pdf_signer::verify_pdf_bytes(&changed).unwrap();
        assert!(!invalid.signatures[0].valid);
    }
}
