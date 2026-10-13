use crate::printing::{Duplex, PrintOptions};
#[cfg(target_os = "linux")]
use anyhow::Context;
use anyhow::{Result, ensure};
use std::path::Path;
#[derive(Debug, Clone)]
pub struct Printer {
    pub name: String,
    pub default: bool,
    pub available: bool,
    pub virtual_printer: bool,
}

#[cfg(target_os = "linux")]
pub fn printers() -> Result<Vec<Printer>> {
    let output = std::process::Command::new("lpstat")
        .args(["-p", "-d"])
        .output()
        .context("Install CUPS client tools to list printers")?;
    ensure!(
        output.status.success(),
        "CUPS: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    let text = String::from_utf8_lossy(&output.stdout);
    let default = text
        .lines()
        .find_map(|l| l.strip_prefix("system default destination: "))
        .unwrap_or("");
    Ok(text
        .lines()
        .filter_map(|l| {
            l.strip_prefix("printer ")
                .and_then(|v| v.split_whitespace().next())
                .map(|name| Printer {
                    name: name.into(),
                    default: name == default,
                    available: !l.contains("disabled"),
                    virtual_printer: name.to_lowercase().contains("pdf"),
                })
        })
        .collect())
}
#[cfg(target_os = "linux")]
pub fn submit(path: &Path, o: &PrintOptions) -> Result<()> {
    ensure!(!o.printer.is_empty(), "Choose a printer");
    let sides = match o.duplex {
        Duplex::Off => "one-sided",
        Duplex::LongEdge => "two-sided-long-edge",
        Duplex::ShortEdge => "two-sided-short-edge",
    };
    let mut command = std::process::Command::new("lp");
    command
        .arg("-d")
        .arg(&o.printer)
        .arg("-n")
        .arg(o.copies.to_string())
        .arg("-o")
        .arg(format!("sides={sides}"))
        .arg("-o")
        .arg(format!("Collate={}", o.collate))
        .arg("-o")
        .arg(if o.color {
            "print-color-mode=color"
        } else {
            "print-color-mode=monochrome"
        })
        .arg("-o")
        .arg("print-scaling=none")
        .arg("-o")
        .arg(format!(
            "media=Custom.{}x{}pt",
            if o.landscape { o.paper[1] } else { o.paper[0] },
            if o.landscape { o.paper[0] } else { o.paper[1] }
        ))
        .arg("--")
        .arg(path);
    let output = command.output().context("Cannot submit job to CUPS")?;
    ensure!(
        output.status.success(),
        "CUPS rejected print job: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    Ok(())
}
#[cfg(windows)]
mod win {
    use super::*;
    use windows::{
        Win32::{
            Graphics::{Gdi::*, Printing::*},
            Storage::Xps::*,
        },
        core::{PCWSTR, PWSTR},
    };
    fn usb_present() -> bool {
        use windows::Win32::Devices::DeviceAndDriverInstallation::*;
        unsafe {
            let enumerator = wide("USBPRINT");
            let Ok(devices) = SetupDiGetClassDevsW(
                None,
                PCWSTR(enumerator.as_ptr()),
                None,
                DIGCF_PRESENT | DIGCF_ALLCLASSES,
            ) else {
                return false;
            };
            let mut item = SP_DEVINFO_DATA {
                cbSize: std::mem::size_of::<SP_DEVINFO_DATA>() as u32,
                ..Default::default()
            };
            let present = SetupDiEnumDeviceInfo(devices, 0, &mut item).is_ok();
            let _ = SetupDiDestroyDeviceInfoList(devices);
            present
        }
    }
    fn wide(s: &str) -> Vec<u16> {
        s.encode_utf16().chain(Some(0)).collect()
    }
    pub fn printers() -> Result<Vec<Printer>> {
        unsafe {
            let mut needed = 0;
            let mut count = 0;
            let _ = EnumPrintersW(
                PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS,
                PCWSTR::null(),
                2,
                None,
                &mut needed,
                &mut count,
            );
            if needed == 0 {
                return Ok(vec![]);
            }
            // Allocate with pointer alignment because the spooler returns structs.
            let mut storage =
                vec![0usize; (needed as usize).div_ceil(std::mem::size_of::<usize>())];
            let bytes =
                std::slice::from_raw_parts_mut(storage.as_mut_ptr().cast::<u8>(), needed as usize);
            EnumPrintersW(
                PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS,
                PCWSTR::null(),
                2,
                Some(bytes),
                &mut needed,
                &mut count,
            )?;
            let mut len = 0;
            let _ = GetDefaultPrinterW(None, &mut len);
            let mut default = vec![0u16; len as usize];
            if len > 0 {
                let _ = GetDefaultPrinterW(Some(PWSTR(default.as_mut_ptr())), &mut len);
            }
            let default = String::from_utf16_lossy(
                &default[..default
                    .iter()
                    .position(|v| *v == 0)
                    .unwrap_or(default.len())],
            );
            let infos = std::slice::from_raw_parts(
                storage.as_ptr().cast::<PRINTER_INFO_2W>(),
                count as usize,
            );
            let usb = usb_present();
            infos
                .iter()
                .map(|p| {
                    let name = p.pPrinterName.to_string()?;
                    let port = p.pPortName.to_string().unwrap_or_default();
                    let lower = name.to_lowercase();
                    let virtual_printer = ["pdf", "xps", "onenote", "fax"]
                        .iter()
                        .any(|kind| lower.contains(kind));
                    let offline = (p.Status
                        & (PRINTER_STATUS_OFFLINE
                            | PRINTER_STATUS_NOT_AVAILABLE
                            | PRINTER_STATUS_ERROR))
                        != 0
                        || (p.Attributes & PRINTER_ATTRIBUTE_WORK_OFFLINE) != 0;
                    Ok(Printer {
                        default: name == default,
                        available: !offline && (!port.to_uppercase().starts_with("USB") || usb),
                        virtual_printer,
                        name,
                    })
                })
                .collect()
        }
    }
    struct Device(HDC);
    impl Drop for Device {
        fn drop(&mut self) {
            unsafe {
                let _ = DeleteDC(self.0);
            }
        }
    }
    struct PrinterHandle(PRINTER_HANDLE);
    impl Drop for PrinterHandle {
        fn drop(&mut self) {
            unsafe {
                let _ = ClosePrinter(self.0);
            }
        }
    }
    pub fn submit(path: &Path, o: &PrintOptions) -> Result<()> {
        unsafe {
            ensure!(!o.printer.is_empty(), "Choose a printer");
            let name = wide(&o.printer);
            let mut handle = PRINTER_HANDLE::default();
            OpenPrinterW(PCWSTR(name.as_ptr()), &mut handle, None)?;
            let _handle = PrinterHandle(handle);
            let n = DocumentPropertiesW(None, handle, PCWSTR(name.as_ptr()), None, None, 0);
            ensure!(n > 0, "Printer did not return settings");
            let mut storage = vec![0usize; (n as usize).div_ceil(std::mem::size_of::<usize>())];
            let dev = storage.as_mut_ptr().cast::<DEVMODEW>();
            ensure!(
                DocumentPropertiesW(
                    None,
                    handle,
                    PCWSTR(name.as_ptr()),
                    Some(dev),
                    None,
                    DM_OUT_BUFFER.0 as u32
                ) >= 0,
                "Cannot read printer settings"
            );
            (*dev).dmFields |= DM_ORIENTATION
                | DM_PAPERLENGTH
                | DM_PAPERWIDTH
                | DM_PAPERSIZE
                | DM_DUPLEX
                | DM_COLOR
                | DM_COPIES
                | DM_COLLATE;
            (*dev).Anonymous1.Anonymous1.dmOrientation = if o.landscape { 2 } else { 1 };
            (*dev).Anonymous1.Anonymous1.dmPaperSize = 0;
            (*dev).Anonymous1.Anonymous1.dmPaperWidth = (o.paper[0] * 254. / 72.).round() as i16;
            (*dev).Anonymous1.Anonymous1.dmPaperLength = (o.paper[1] * 254. / 72.).round() as i16;
            (*dev).Anonymous1.Anonymous1.dmCopies = 1; // Application expands copies consistently.
            (*dev).dmDuplex = match o.duplex {
                Duplex::Off => DMDUP_SIMPLEX,
                Duplex::LongEdge => DMDUP_VERTICAL,
                Duplex::ShortEdge => DMDUP_HORIZONTAL,
            };
            (*dev).dmColor = if o.color {
                DMCOLOR_COLOR
            } else {
                DMCOLOR_MONOCHROME
            };
            (*dev).dmCollate = DMCOLLATE_FALSE;
            let input = storage.clone();
            ensure!(
                DocumentPropertiesW(
                    None,
                    handle,
                    PCWSTR(name.as_ptr()),
                    Some(dev),
                    Some(input.as_ptr().cast()),
                    (DM_IN_BUFFER | DM_OUT_BUFFER).0 as u32
                ) == 1,
                "Printer rejected the chosen settings"
            );
            let driver = wide("WINSPOOL");
            let mut dc = CreateDCW(
                PCWSTR(driver.as_ptr()),
                PCWSTR(name.as_ptr()),
                PCWSTR::null(),
                Some(dev),
            );
            ensure!(!dc.is_invalid(), "Cannot connect to selected printer");
            let mut owned_dc = Device(dc);
            let title = wide("Re-Edit PDF");
            let info = DOCINFOW {
                cbSize: std::mem::size_of::<DOCINFOW>() as i32,
                lpszDocName: PCWSTR(title.as_ptr()),
                ..Default::default()
            };
            ensure!(StartDocW(dc, &info) > 0, "Printer rejected document");
            let result = (|| -> Result<()> {
                let document = crate::engine::Engine::open(path)?;
                let sizes = document.info()?.sizes;
                let count = document.doc.page_count()? as usize;
                let order: Vec<_> = if o.collate {
                    (0..o.copies).flat_map(|_| 0..count).collect()
                } else {
                    (0..count)
                        .flat_map(|p| std::iter::repeat_n(p, o.copies))
                        .collect()
                };
                let dpi = GetDeviceCaps(Some(dc), LOGPIXELSX).max(72) as f32;
                for page in order {
                    if o.original_paper {
                        let size = sizes[page];
                        let landscape = size[0] > size[1];
                        (*dev).Anonymous1.Anonymous1.dmOrientation = if landscape { 2 } else { 1 };
                        let width = size[0].min(size[1]) * 254. / 72.;
                        let height = size[0].max(size[1]) * 254. / 72.;
                        ensure!(
                            width <= i16::MAX as f32 && height <= i16::MAX as f32,
                            "Page exceeds the printer's supported paper dimensions"
                        );
                        (*dev).Anonymous1.Anonymous1.dmPaperWidth = width.round() as i16;
                        (*dev).Anonymous1.Anonymous1.dmPaperLength = height.round() as i16;
                        let input = storage.clone();
                        ensure!(
                            DocumentPropertiesW(
                                None,
                                handle,
                                PCWSTR(name.as_ptr()),
                                Some(dev),
                                Some(input.as_ptr().cast()),
                                (DM_IN_BUFFER | DM_OUT_BUFFER).0 as u32
                            ) == 1,
                            "Printer rejected the original page size"
                        );
                        let updated = ResetDCW(dc, dev);
                        ensure!(
                            !updated.is_invalid(),
                            "Printer cannot switch to the original page size"
                        );
                        dc = updated;
                        owned_dc.0 = updated;
                    }
                    ensure!(StartPage(dc) > 0, "Cannot start printed sheet");
                    let image = document.render(page, (dpi / 72.).min(300. / 72.))?;
                    let mut pixels = Vec::with_capacity(image.width * image.height * 4);
                    for p in image.rgb.chunks_exact(3) {
                        let p = if o.color {
                            [p[2], p[1], p[0]]
                        } else {
                            let y = (0.2126 * p[0] as f32
                                + 0.7152 * p[1] as f32
                                + 0.0722 * p[2] as f32) as u8;
                            [y, y, y]
                        };
                        pixels.extend_from_slice(&[p[0], p[1], p[2], 0]);
                    }
                    let bitmap = BITMAPINFO {
                        bmiHeader: BITMAPINFOHEADER {
                            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                            biWidth: image.width as i32,
                            biHeight: -(image.height as i32),
                            biPlanes: 1,
                            biBitCount: 32,
                            biCompression: BI_RGB.0,
                            ..Default::default()
                        },
                        ..Default::default()
                    };
                    let w = GetDeviceCaps(Some(dc), PHYSICALWIDTH);
                    let h = GetDeviceCaps(Some(dc), PHYSICALHEIGHT);
                    let x = -GetDeviceCaps(Some(dc), PHYSICALOFFSETX);
                    let y = -GetDeviceCaps(Some(dc), PHYSICALOFFSETY);
                    ensure!(
                        StretchDIBits(
                            dc,
                            x,
                            y,
                            w,
                            h,
                            0,
                            0,
                            image.width as i32,
                            image.height as i32,
                            Some(pixels.as_ptr().cast()),
                            &bitmap,
                            DIB_RGB_COLORS,
                            SRCCOPY
                        ) > 0,
                        "Printer failed to render sheet"
                    );
                    ensure!(EndPage(dc) > 0, "Printer failed to finish sheet");
                }
                ensure!(EndDoc(dc) > 0, "Printer failed to finish job");
                Ok(())
            })();
            if result.is_err() {
                let _ = AbortDoc(dc);
            }
            result
        }
    }
}
#[cfg(windows)]
pub use win::{printers, submit};
#[cfg(not(any(windows, target_os = "linux")))]
pub fn printers() -> Result<Vec<Printer>> {
    Ok(vec![])
}
#[cfg(not(any(windows, target_os = "linux")))]
pub fn submit(_: &Path, _: &PrintOptions) -> Result<()> {
    anyhow::bail!("Printing is not implemented for this platform")
}
