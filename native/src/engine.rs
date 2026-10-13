use crate::{
    printing::{Box2, PrintOptions, Sheet, plan},
    selection::{Glyph, PageText},
};
use anyhow::{Context, Result, bail, ensure};
use crossbeam_channel::{Receiver, Sender, bounded, unbounded};
use mupdf::{
    Colorspace, DocumentWriter, Matrix, Path as DrawPath, Rect, TextPageFlags,
    pdf::{
        PdfDocument, PdfWriteOptions,
        annotation::{PdfAnnotationType, PdfRedactImageMethod, PdfRedactOptions},
    },
};
use std::{
    collections::VecDeque,
    path::{Path, PathBuf},
    sync::{
        Arc,
        atomic::{AtomicU64, Ordering},
    },
};

#[derive(Debug, Clone)]
pub struct Info {
    pub path: PathBuf,
    pub sizes: Vec<[f32; 2]>,
    pub dirty: bool,
    pub undo: bool,
    pub redo: bool,
    pub bookmarks: Vec<(String, usize)>,
    pub attachments: Vec<String>,
}
#[derive(Debug, Clone)]
pub struct Raster {
    pub width: usize,
    pub height: usize,
    pub rgb: Vec<u8>,
}
#[derive(Debug, Clone)]
pub struct Annotation {
    pub id: i32,
    pub bounds: Box2,
    pub kind: String,
    pub text: String,
}
#[derive(Debug, Clone)]
pub struct FormField {
    pub id: i32,
    pub name: String,
    pub value: String,
    pub kind: String,
    pub readonly: bool,
    pub bounds: Box2,
}
pub enum Command {
    Open(PathBuf),
    Close,
    Render {
        page: usize,
        scale: f32,
        token: u64,
    },
    Text(usize),
    Fields(usize),
    SetField {
        page: usize,
        id: i32,
        value: String,
    },
    Extract {
        pages: Vec<usize>,
        path: PathBuf,
    },
    ExportAttachment {
        name: String,
        path: PathBuf,
    },
    ExportWord(PathBuf),
    Search {
        query: String,
        generation: u64,
    },
    Save(PathBuf),
    Undo,
    Redo,
    Edit {
        page: usize,
        first: usize,
        last: usize,
        text: String,
    },
    EditWithFont {
        page: usize,
        first: usize,
        last: usize,
        text: String,
        font: Option<String>,
        font_file: Option<PathBuf>,
    },
    Annotate {
        page: usize,
        rect: Box2,
        text: String,
        kind: String,
    },
    DeleteAnnotation {
        page: usize,
        id: i32,
    },
    UpdateAnnotation {
        page: usize,
        id: i32,
        text: String,
    },
    PlaceText {
        page: usize,
        rect: Box2,
        text: String,
        font: String,
        size: f32,
    },
    PlaceImage {
        page: usize,
        rect: Box2,
        path: PathBuf,
    },
    Rotate(usize, i32),
    DeletePage(usize),
    Move(usize, usize),
    Combine(Vec<PathBuf>),
    PrintPreview {
        options: PrintOptions,
        sheet: usize,
        token: u64,
    },
    Print(PrintOptions),
    ExportPrint {
        options: PrintOptions,
        path: PathBuf,
    },
    ExportText(PathBuf),
    CopySelection {
        anchor: (usize, usize),
        end: (usize, usize),
    },
    Ocr {
        pages: Vec<usize>,
        accurate: bool,
        save: Option<PathBuf>,
    },
}
pub enum Event {
    Info(Info),
    Closed,
    Raster {
        page: usize,
        token: u64,
        image: Raster,
    },
    Text {
        page: usize,
        text: PageText,
        annotations: Vec<Annotation>,
    },
    Search {
        generation: u64,
        hits: Vec<(usize, Box2)>,
    },
    Preview {
        token: u64,
        image: Raster,
        sheets: usize,
    },
    Error(String),
    Status(String),
    Clipboard(String),
    Fields {
        page: usize,
        fields: Vec<FormField>,
    },
}
pub struct Worker {
    pub tx: Sender<Command>,
    pub rx: Receiver<Event>,
    pub generation: Arc<AtomicU64>,
}
impl Worker {
    #[cfg(feature = "native-ui")]
    pub fn spawn(ctx: eframe::egui::Context) -> Self {
        Self::spawn_with_repaint(move || ctx.request_repaint())
    }
    pub fn spawn_with_repaint(repaint: impl Fn() + Send + 'static) -> Self {
        // Render requests are bounded by the UI. Commands that save or mutate
        // a PDF must never be silently lost because rendering filled a queue.
        let (tx, commands) = unbounded();
        let (events, rx) = bounded(16);
        let generation = Arc::new(AtomicU64::new(0));
        let gen_copy = generation.clone();
        std::thread::spawn(move || {
            let mut state: Option<Engine> = None;
            while let Ok(cmd) = commands.recv() {
                let result = (|| -> Result<Vec<Event>> {
                    match cmd {
                        Command::Open(path) => {
                            let e = Engine::open(&path)?;
                            let info = e.info()?;
                            state = Some(e);
                            Ok(vec![Event::Info(info)])
                        }
                        Command::Close => {
                            state = None;
                            Ok(vec![Event::Closed])
                        }
                        command => state
                            .as_mut()
                            .context("Open a PDF first")?
                            .execute(command, &gen_copy),
                    }
                })();
                let out = match result {
                    Ok(out) => out,
                    Err(e) => vec![Event::Error(format!("{e:#}"))],
                };
                for e in out {
                    if events.send(e).is_err() {
                        return;
                    }
                    repaint();
                }
            }
        });
        Self { tx, rx, generation }
    }
}
pub struct Engine {
    pub doc: PdfDocument,
    pub path: PathBuf,
    pub dirty: bool,
    undo: VecDeque<Vec<u8>>,
    redo: VecDeque<Vec<u8>>,
}
impl Engine {
    pub fn open(path: &Path) -> Result<Self> {
        let doc = PdfDocument::from_bytes(&std::fs::read(path)?)?;
        ensure!(
            !doc.needs_password()?,
            "This PDF needs a password; encrypted-file UI is not migrated yet"
        );
        Ok(Self {
            doc,
            path: path.into(),
            dirty: false,
            undo: VecDeque::new(),
            redo: VecDeque::new(),
        })
    }
    pub fn info(&self) -> Result<Info> {
        let sizes = (0..self.doc.page_count()?)
            .map(|i| {
                let b = self.doc.load_page(i)?.bounds()?;
                Ok([b.width(), b.height()])
            })
            .collect::<Result<Vec<_>>>()?;
        let mut bookmarks = Vec::new();
        fn flatten(outlines: Vec<mupdf::Outline>, depth: usize, out: &mut Vec<(String, usize)>) {
            for o in outlines {
                if let Some(dest) = o.dest {
                    out.push((
                        format!("{}{}", "  ".repeat(depth), o.title),
                        dest.loc.page_number as usize,
                    ));
                }
                flatten(o.down, depth + 1, out);
            }
        }
        flatten(self.doc.outlines()?, 0, &mut bookmarks);
        let attachments = self
            .doc
            .embedded_files()?
            .into_iter()
            .map(|a| a.name)
            .collect();
        Ok(Info {
            path: self.path.clone(),
            sizes,
            dirty: self.dirty,
            undo: !self.undo.is_empty(),
            redo: !self.redo.is_empty(),
            bookmarks,
            attachments,
        })
    }
    pub fn bytes(&self) -> Result<Vec<u8>> {
        let mut out = Vec::new();
        let mut o = PdfWriteOptions::default();
        o.set_compress(true).set_garbage_level(4);
        self.doc.write_to_with_options(&mut out, o)?;
        Ok(out)
    }
    pub fn save(&mut self, path: &Path) -> Result<()> {
        let data = self.bytes()?;
        atomic_write(path, &data)?;
        self.path = path.into();
        self.dirty = false;
        Ok(())
    }
    fn transact(&mut self, f: impl FnOnce(&mut PdfDocument) -> Result<()>) -> Result<()> {
        let before = self.bytes()?;
        let mut copy = PdfDocument::from_bytes(&before)?;
        f(&mut copy)?;
        self.doc = copy;
        self.undo.push_back(before);
        self.redo.clear();
        self.dirty = true;
        // Bounded history prevents large PDFs retaining unbounded full copies.
        while self.undo.len() > 20
            || self.undo.iter().map(Vec::len).sum::<usize>() > 128 * 1024 * 1024
        {
            if self.undo.len() <= 1 {
                break;
            }
            self.undo.pop_front();
        }
        Ok(())
    }
    fn history(&mut self, undo: bool) -> Result<()> {
        let current = self.bytes()?;
        let history = if undo { &mut self.undo } else { &mut self.redo };
        if let Some(previous) = history.pop_back() {
            self.doc = PdfDocument::from_bytes(&previous)?;
            if undo {
                self.redo.push_back(current)
            } else {
                self.undo.push_back(current)
            }
            self.dirty = true;
        }
        Ok(())
    }
    pub fn text(&self, page: usize) -> Result<(PageText, Vec<Annotation>)> {
        let page = self.doc.load_pdf_page(page as i32)?;
        let text = page.to_text_page(TextPageFlags::empty())?;
        let mut glyphs = Vec::new();
        let mut line_id = 0;
        for block in text.blocks() {
            for line in block.lines() {
                for c in line.chars() {
                    if let Some(ch) = c.char() {
                        let q = c.quad();
                        let x = q.ul.x.min(q.ll.x).min(q.ur.x).min(q.lr.x);
                        let y = q.ul.y.min(q.ll.y).min(q.ur.y).min(q.lr.y);
                        let w = q.ul.x.max(q.ll.x).max(q.ur.x).max(q.lr.x) - x;
                        let h = q.ul.y.max(q.ll.y).max(q.ur.y).max(q.lr.y) - y;
                        glyphs.push(Glyph {
                            ch,
                            bounds: Box2 { x, y, w, h },
                            origin: [c.origin().x, c.origin().y],
                            size: c.size(),
                            argb: c.argb(),
                            font: c.font().map(|f| f.name().to_owned()).unwrap_or_default(),
                            line: line_id,
                        });
                    }
                }
                line_id += 1;
            }
        }
        let annotations = page
            .annotations()
            .map(|a| -> Result<Annotation> {
                let r = a.bounds()?;
                Ok(Annotation {
                    id: a.xref()?,
                    bounds: Box2 {
                        x: r.x0,
                        y: r.y0,
                        w: r.width(),
                        h: r.height(),
                    },
                    kind: format!("{:?}", a.r#type()?),
                    text: a.contents()?.unwrap_or("").into(),
                })
            })
            .collect::<Result<Vec<_>>>()?;
        Ok((PageText { glyphs }, annotations))
    }
    pub fn render(&self, page: usize, scale: f32) -> Result<Raster> {
        ensure!(scale.is_finite() && scale > 0., "Invalid zoom");
        let page = self.doc.load_page(page as i32)?;
        let b = page.bounds()?;
        let scale = scale.min((24_000_000. / (b.width() * b.height())).sqrt());
        let pix = page.to_pixmap(
            &Matrix::new_scale(scale, scale),
            &Colorspace::device_rgb(),
            false,
            true,
        )?;
        Ok(raster(&pix))
    }
    pub fn edit(
        &mut self,
        page_index: usize,
        first: usize,
        last: usize,
        replacement: &str,
    ) -> Result<()> {
        self.edit_with_font(page_index, first, last, replacement, None, None)
    }
    pub fn edit_with_font(
        &mut self,
        page_index: usize,
        first: usize,
        last: usize,
        replacement: &str,
        font_name: Option<&str>,
        font_file: Option<&Path>,
    ) -> Result<()> {
        self.transact(|doc| {
            let mut page = doc.load_pdf_page(page_index as i32)?;
            ensure!(
                page.rotation()? == 0,
                "Rotate this page upright before editing text"
            );
            let text = page.to_text_page(TextPageFlags::empty())?;
            let a = first.min(last);
            let b = first.max(last);
            let mut chars = Vec::new();
            let mut original_font = None;
            let mut scanned_text = false;
            for block in text.blocks() {
                for line in block.lines() {
                    for c in line.chars() {
                        if c.char().is_some() {
                            if chars.len() == a {
                                original_font = c.font();
                                scanned_text = !c.flags().intersects(
                                    mupdf::TextCharFlags::FILLED | mupdf::TextCharFlags::STROKED,
                                );
                            }
                            chars.push((
                                c.quad(),
                                c.size(),
                                c.argb(),
                                c.origin(),
                                c.font().map(|f| f.name().to_owned()),
                            ));
                        }
                    }
                }
            }
            ensure!(b < chars.len(), "The text changed; select it again");
            let original_font = original_font.context("This text has no editable font")?;
            let size = chars[a].1;
            let color = chars[a].2;
            let origin = chars[a].3;
            ensure!(
                chars[a..=b]
                    .iter()
                    .all(|c| c.4.as_deref() == Some(original_font.name())
                        && (c.1 - size).abs() < 0.05
                        && c.2 == color),
                "Select a run with one font, size and color"
            );
            let font = if let Some(path) = font_file {
                let bytes = crate::fonts::import(path)?;
                mupdf::Font::from_bytes("ImportedFont", &bytes)?
            } else if let Some(name) = font_name {
                let bytes = crate::fonts::bytes_for(name)?;
                mupdf::Font::from_bytes(name, &bytes)?
            } else {
                original_font
            };
            let mut encoded = Vec::new();
            for ch in replacement.chars() {
                if ch == '\n' {
                    encoded.push(None);
                    continue;
                }
                let gid = font.encode_character(ch as i32)?;
                ensure!(
                    gid > 0 || ch.is_whitespace(),
                    "The original font lacks '{ch}'. Import a compatible font before replacing it"
                );
                encoded.push(Some((gid, ch)));
            }
            // Never apply a user's pending redactions as a side effect of editing.
            ensure!(
                !page
                    .annotations()
                    .any(|a| a.r#type().ok() == Some(PdfAnnotationType::Redact)),
                "Apply or remove pending redactions before editing"
            );
            for c in &chars[a..=b] {
                let q = &c.0;
                let r = Rect::new(
                    q.ul.x.min(q.ll.x) + 0.05,
                    q.ul.y.min(q.ur.y) + 0.05,
                    q.ur.x.max(q.lr.x) - 0.05,
                    q.ll.y.max(q.lr.y) - 0.05,
                );
                page.add_redact_annotation(r)?;
            }
            page.apply_redactions_with_options(PdfRedactOptions {
                image_method: if scanned_text {
                    PdfRedactImageMethod::Pixels
                } else {
                    PdfRedactImageMethod::None
                },
                ..Default::default()
            })?;
            // Redaction rewrites and cleans the page resource dictionary. Add
            // the replacement font after that operation so it is not pruned
            // as an unused resource before our content stream references it.
            let mut resources = page.resources()?;
            let mut fonts = resources.get_dict("Font")?.unwrap_or(doc.new_dict()?);
            let font_obj = doc.add_font(&font)?;
            let name = format!("ReEditFont{}", font_obj.as_indirect()?);
            fonts.dict_put(name.as_str(), font_obj)?;
            resources.dict_put("Font", fonts)?;
            page.object().dict_put("Resources", resources)?;
            let inv = page
                .ctm()?
                .invert()
                .context("Page transform is not invertible")?;
            let baseline = origin.transform(&inv);
            let r = ((color >> 16) & 255) as f32 / 255.;
            let g = ((color >> 8) & 255) as f32 / 255.;
            let blue = (color & 255) as f32 / 255.;
            let mut content = format!("q\nBT /{name} {size} Tf {r} {g} {blue} rg\n");
            let mut x = baseline.x;
            let mut y = baseline.y;
            for glyph in encoded {
                match glyph {
                    None => {
                        x = baseline.x;
                        y -= size * 1.2
                    }
                    Some((gid, _)) => {
                        content.push_str(&format!("1 0 0 1 {x} {y} Tm <{gid:04X}> Tj\n"));
                        x += font.advance_glyph(gid)? * size;
                    }
                }
            }
            content.push_str("ET\nQ\n");
            page.insert_contents(doc, content.as_bytes(), true)?;
            page.update()?;
            Ok(())
        })
    }
    pub fn print_pdf(&self, options: &PrintOptions, path: &Path) -> Result<Vec<Sheet>> {
        let sheets = plan(options, &self.info()?.sizes)?;
        self.write_print_sheets(options, &sheets, path)?;
        Ok(sheets)
    }
    pub fn write_print_sheets(
        &self,
        options: &PrintOptions,
        sheets: &[Sheet],
        path: &Path,
    ) -> Result<()> {
        let mut writer = DocumentWriter::new(
            path.to_str().context("PDF output path is not UTF-8")?,
            "pdf",
            "compress=yes",
        )?;
        for sheet in sheets {
            let device = writer.begin_page(Rect::new(0., 0., sheet.size[0], sheet.size[1]))?;
            for item in &sheet.placements {
                let p = self.doc.load_page(item.page as i32)?;
                let b = p.bounds()?;
                let mut clip = DrawPath::new()?;
                clip.rect(
                    item.clip.x,
                    item.clip.y,
                    item.clip.x + item.clip.w,
                    item.clip.y + item.clip.h,
                )?;
                device.clip_path(&clip, false, &Matrix::IDENTITY)?;
                let t = item.target;
                let m = if item.rotate {
                    Matrix {
                        a: 0.,
                        b: t.h / b.width(),
                        c: -t.w / b.height(),
                        d: 0.,
                        e: t.x + t.w,
                        f: t.y,
                    }
                } else {
                    Matrix {
                        a: t.w / b.width(),
                        b: 0.,
                        c: 0.,
                        d: t.h / b.height(),
                        e: t.x - b.x0 * t.w / b.width(),
                        f: t.y - b.y0 * t.h / b.height(),
                    }
                };
                if options.print_annotations {
                    p.run(&device, &m)?
                } else {
                    p.run_contents(&device, &m)?
                }
                device.pop_clip()?;
            }
            writer.end_page(device)?;
        }
        drop(writer);
        Ok(())
    }
    fn execute(&mut self, command: Command, generation: &AtomicU64) -> Result<Vec<Event>> {
        match command {
            Command::Fields(page) => {
                let page_handle = self.doc.load_pdf_page(page as i32)?;
                let fields = page_handle
                    .widgets()
                    .map(|w| -> Result<FormField> {
                        let r = w.annotation().bounds()?;
                        Ok(FormField {
                            id: w.xref()?,
                            name: w.label()?.or(w.name()?).unwrap_or("Field".into()),
                            value: w.value()?.unwrap_or_default(),
                            kind: format!("{:?}", w.r#type()?),
                            readonly: w.is_readonly()?,
                            bounds: Box2 {
                                x: r.x0,
                                y: r.y0,
                                w: r.width(),
                                h: r.height(),
                            },
                        })
                    })
                    .collect::<Result<Vec<_>>>()?;
                Ok(vec![Event::Fields { page, fields }])
            }
            Command::SetField { page, id, value } => {
                self.transact(|doc| {
                    let p = doc.load_pdf_page(page as i32)?;
                    let mut w = p.load_widget(id)?.context("Form field no longer exists")?;
                    ensure!(!w.is_readonly()?, "This form field is read-only");
                    ensure!(
                        w.set_value(doc, &value, true)?,
                        "The PDF rejected this field value"
                    );
                    w.update()?;
                    Ok(())
                })?;
                Ok(vec![Event::Info(self.info()?)])
            }
            Command::Extract { pages, path } => {
                let mut copy = PdfDocument::from_bytes(&self.bytes()?)?;
                copy.select_pages(pages)?;
                let mut data = Vec::new();
                copy.write_to(&mut data)?;
                atomic_write(&path, &data)?;
                Ok(vec![Event::Status("Pages extracted".into())])
            }
            Command::ExportAttachment { name, path } => {
                let data = self
                    .doc
                    .load_embedded_file(&name)?
                    .context("Attachment no longer exists")?;
                atomic_write(&path, &data)?;
                Ok(vec![Event::Status("Attachment exported".into())])
            }
            Command::ExportWord(path) => {
                let dir = tempfile::tempdir()?;
                let target = dir.path().join("document.docx");
                {
                    let mut writer = DocumentWriter::new(
                        target.to_str().context("Export path is not UTF-8")?,
                        "docx",
                        "",
                    )?;
                    for i in 0..self.doc.page_count()? {
                        let p = self.doc.load_page(i)?;
                        let device = writer.begin_page(p.bounds()?)?;
                        p.run_contents(&device, &Matrix::IDENTITY)?;
                        writer.end_page(device)?;
                    }
                }
                atomic_write(&path, &std::fs::read(target)?)?;
                Ok(vec![Event::Status("Word document exported".into())])
            }
            Command::Render { page, scale, token } => Ok(vec![Event::Raster {
                page,
                token,
                image: self.render(page, scale)?,
            }]),
            Command::Text(page) => {
                let (text, annotations) = self.text(page)?;
                Ok(vec![Event::Text {
                    page,
                    text,
                    annotations,
                }])
            }
            Command::Search {
                query,
                generation: search_generation,
            } => {
                let mut hits = Vec::new();
                if !query.trim().is_empty() {
                    for i in 0..self.doc.page_count()? {
                        if generation.load(Ordering::Relaxed) != search_generation {
                            return Ok(vec![]);
                        }
                        for q in self
                            .doc
                            .load_page(i)?
                            .to_text_page(TextPageFlags::empty())?
                            .search(&query)?
                        {
                            let r = Rect::new(
                                q.ul.x.min(q.ll.x),
                                q.ul.y.min(q.ur.y),
                                q.ur.x.max(q.lr.x),
                                q.ll.y.max(q.lr.y),
                            );
                            hits.push((
                                i as usize,
                                Box2 {
                                    x: r.x0,
                                    y: r.y0,
                                    w: r.width(),
                                    h: r.height(),
                                },
                            ));
                        }
                    }
                }
                Ok(vec![Event::Search {
                    generation: search_generation,
                    hits,
                }])
            }
            Command::Save(path) => {
                self.save(&path)?;
                Ok(vec![
                    Event::Info(self.info()?),
                    Event::Status("Saved".into()),
                ])
            }
            Command::Undo => {
                self.history(true)?;
                Ok(vec![Event::Info(self.info()?)])
            }
            Command::Redo => {
                self.history(false)?;
                Ok(vec![Event::Info(self.info()?)])
            }
            Command::Edit {
                page,
                first,
                last,
                text,
            } => {
                self.edit(page, first, last, &text)?;
                Ok(vec![Event::Info(self.info()?)])
            }
            Command::EditWithFont {
                page,
                first,
                last,
                text,
                font,
                font_file,
            } => {
                self.edit_with_font(
                    page,
                    first,
                    last,
                    &text,
                    font.as_deref(),
                    font_file.as_deref(),
                )?;
                Ok(vec![Event::Info(self.info()?)])
            }
            Command::Rotate(i, amount) => {
                self.transact(|doc| {
                    let mut p = doc.load_pdf_page(i as i32)?;
                    p.set_rotation(p.rotation()? + amount)?;
                    Ok(())
                })?;
                Ok(vec![Event::Info(self.info()?)])
            }
            Command::DeletePage(i) => {
                ensure!(self.doc.page_count()? > 1, "Cannot delete the only page");
                self.transact(|d| {
                    d.delete_page(i as i32)?;
                    Ok(())
                })?;
                Ok(vec![Event::Info(self.info()?)])
            }
            Command::Move(a, b) => {
                self.transact(|d| {
                    d.move_page(a, b)?;
                    Ok(())
                })?;
                Ok(vec![Event::Info(self.info()?)])
            }
            Command::Combine(paths) => {
                self.transact(|d| {
                    for p in paths {
                        let mut src = PdfDocument::from_bytes(&std::fs::read(p)?)?;
                        d.insert_pdf(&mut src, Default::default())?;
                    }
                    Ok(())
                })?;
                Ok(vec![Event::Info(self.info()?)])
            }
            Command::Annotate {
                page,
                rect,
                text,
                kind,
            } => {
                self.transact(|d| {
                    let mut p = d.load_pdf_page(page as i32)?;
                    let r = Rect::new(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
                    match kind.as_str() {
                        "Highlight" => {
                            p.add_highlight_annotation(vec![r.quad()])?;
                        }
                        "Note" => {
                            p.add_text_annotation(r, &text)?;
                        }
                        "Rectangle" => {
                            p.add_rect_annotation(r)?;
                        }
                        "Redact" => {
                            p.add_redact_annotation(r)?;
                            p.apply_redactions_with_options(PdfRedactOptions {
                                black_boxes: true,
                                ..PdfRedactOptions::pymupdf_default()
                            })?;
                        }
                        _ => bail!("Unknown annotation tool"),
                    };
                    p.update()?;
                    Ok(())
                })?;
                Ok(vec![Event::Info(self.info()?)])
            }
            Command::DeleteAnnotation { page, id } => {
                self.transact(|d| {
                    let mut p = d.load_pdf_page(page as i32)?;
                    let a = p
                        .annotations()
                        .find(|a| a.xref().ok() == Some(id))
                        .context("Annotation no longer exists")?;
                    p.delete_annotation(a)?;
                    Ok(())
                })?;
                Ok(vec![Event::Info(self.info()?)])
            }
            Command::UpdateAnnotation { page, id, text } => {
                self.transact(|doc| {
                    let mut p = doc.load_pdf_page(page as i32)?;
                    let mut a = p
                        .annotations()
                        .find(|a| a.xref().ok() == Some(id))
                        .context("Annotation no longer exists")?;
                    a.set_contents(&text)?;
                    a.update()?;
                    p.update()?;
                    Ok(())
                })?;
                Ok(vec![Event::Info(self.info()?)])
            }
            Command::PlaceText {
                page,
                rect,
                text,
                font,
                size,
            } => {
                self.transact(|doc| {
                    let mut p = doc.load_pdf_page(page as i32)?;
                    let data = crate::fonts::bytes_for(&font)?;
                    let f = mupdf::Font::from_bytes(&font, &data)?;
                    for c in text.chars().filter(|c| !c.is_whitespace()) {
                        ensure!(
                            f.encode_character(c as i32)? > 0,
                            "This font does not support '{c}'"
                        );
                    }
                    let mut shape = mupdf::shape::Shape::new(&mut p)?;
                    shape
                        .insert_text(
                            mupdf::Point::new(rect.x, rect.y + size),
                            &text,
                            &mupdf::shape::TextOptions {
                                fontname: font,
                                fontfile: Some(&data),
                                fontsize: size,
                                simple: false,
                                ..Default::default()
                            },
                        )?
                        .commit(doc, true)?;
                    Ok(())
                })?;
                Ok(vec![Event::Info(self.info()?)])
            }
            Command::PlaceImage { page, rect, path } => {
                self.transact(|doc| {
                    let data = std::fs::read(path)?;
                    let mut p = doc.load_pdf_page(page as i32)?;
                    p.insert_image(
                        doc,
                        Rect::new(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h),
                        mupdf::pdf::page::PageImageSource::Bytes {
                            data: &data,
                            format_hint: None,
                        },
                        Default::default(),
                    )?;
                    Ok(())
                })?;
                Ok(vec![Event::Info(self.info()?)])
            }
            Command::PrintPreview {
                options,
                sheet,
                token,
            } => {
                let dir = tempfile::tempdir()?;
                let path = dir.path().join("preview.pdf");
                let sheets = self.print_pdf(&options, &path)?;
                let preview = Engine::open(&path)?;
                Ok(vec![Event::Preview {
                    token,
                    image: preview.render(sheet.min(sheets.len() - 1), 0.7)?,
                    sheets: sheets.len(),
                }])
            }
            Command::ExportPrint { options, path } => {
                let dir = tempfile::tempdir()?;
                let temp = dir.path().join("print.pdf");
                self.print_pdf(&options, &temp)?;
                atomic_write(&path, &std::fs::read(temp)?)?;
                Ok(vec![Event::Status("Print layout exported".into())])
            }
            Command::Print(options) => {
                let dir = tempfile::tempdir()?;
                let file = dir.path().join("print.pdf");
                self.print_pdf(&options, &file)?;
                crate::platform_print::submit(&file, &options)?;
                Ok(vec![Event::Status("Print job submitted".into())])
            }
            Command::Ocr {
                pages,
                accurate,
                save,
            } => {
                let mut count = 0;
                self.transact(|doc| {
                    count = crate::ocr::recognize(doc, &pages, accurate)?;
                    ensure!(
                        count > 0,
                        "OCR found no additional text. The original PDF is unchanged"
                    );
                    Ok(())
                })?;
                if let Some(path) = save {
                    self.save(&path)?;
                }
                Ok(vec![
                    Event::Info(self.info()?),
                    Event::Status(format!("OCR added {count} recognised characters")),
                ])
            }
            Command::CopySelection { anchor, end } => {
                let (a, b) = if anchor <= end {
                    (anchor, end)
                } else {
                    (end, anchor)
                };
                let mut result = Vec::new();
                for page in a.0..=b.0 {
                    let (text, _) = self.text(page)?;
                    if text.glyphs.is_empty() {
                        continue;
                    }
                    let first = if page == a.0 { a.1 } else { 0 };
                    let last = if page == b.0 {
                        b.1
                    } else {
                        text.glyphs.len() - 1
                    };
                    result.push(text.selected_text(first, last));
                }
                Ok(vec![Event::Clipboard(result.join("\n"))])
            }
            Command::ExportText(path) => {
                let mut text = String::new();
                for i in 0..self.doc.page_count()? {
                    text.push_str(&self.doc.load_page(i)?.text(Default::default())?);
                    text.push('\n');
                }
                atomic_write(&path, text.as_bytes())?;
                Ok(vec![Event::Status("Text exported".into())])
            }
            Command::Open(_) | Command::Close => unreachable!(),
        }
    }
}
pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<()> {
    use std::io::Write;
    let parent = path
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .unwrap_or(Path::new("."));
    let mut temp = tempfile::NamedTempFile::new_in(parent)?;
    temp.write_all(bytes)?;
    temp.as_file().sync_all()?;
    temp.persist(path).map_err(|e| e.error)?;
    Ok(())
}
fn raster(p: &mupdf::Pixmap) -> Raster {
    let mut rgb = Vec::with_capacity(p.width() as usize * p.height() as usize * 3);
    let row = p.width() as usize * p.n() as usize;
    for r in p
        .samples()
        .chunks(p.stride() as usize)
        .take(p.height() as usize)
    {
        rgb.extend_from_slice(&r[..row]);
    }
    Raster {
        width: p.width() as usize,
        height: p.height() as usize,
        rgb,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mupdf::{
        Point, Size,
        shape::{PdfColor, Shape, TextOptions},
    };
    fn fixture() -> (tempfile::TempDir, PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("input.pdf");
        let mut doc = PdfDocument::new();
        for i in 0..4 {
            let mut page = doc.new_page(Size::A4).unwrap();
            let mut shape = Shape::new(&mut page).unwrap();
            shape
                .insert_text(
                    Point::new(72., 100.),
                    &format!("Original text page {}", i + 1),
                    &TextOptions {
                        fontsize: 16.,
                        fontname: "Helvetica".into(),
                        fill: Some(PdfColor::rgb(0.2, 0.3, 0.5)),
                        ..Default::default()
                    },
                )
                .unwrap()
                .commit(&mut doc, true)
                .unwrap();
        }
        doc.save(path.to_str().unwrap()).unwrap();
        (dir, path)
    }
    #[test]
    fn edits_remove_old_text_retain_style_and_can_be_edited_again() {
        let (_dir, path) = fixture();
        let mut e = Engine::open(&path).unwrap();
        let (before, _) = e.text(0).unwrap();
        let original_text = e
            .doc
            .load_page(0)
            .unwrap()
            .to_text_page(TextPageFlags::empty())
            .unwrap();
        let original_font = original_text
            .blocks()
            .next()
            .unwrap()
            .lines()
            .next()
            .unwrap()
            .chars()
            .next()
            .unwrap()
            .font()
            .unwrap();
        let end = before.glyphs.len() - 1;
        e.edit(0, 0, end, "Replacement text").unwrap();
        let (after, _) = e.text(0).unwrap();
        let text = after.selected_text(0, after.glyphs.len() - 1);
        assert!(!text.contains("Original"), "{text}");
        assert!(text.contains("Replacement"), "{text}");
        assert!((after.glyphs[0].size - before.glyphs[0].size).abs() < 0.1);
        assert_eq!(after.glyphs[0].argb, before.glyphs[0].argb);
        // A Base-14 alias becomes the fallback program's PostScript name once
        // that program is embedded. Verify actual glyph metrics, not aliases.
        let edited_text = e
            .doc
            .load_page(0)
            .unwrap()
            .to_text_page(TextPageFlags::empty())
            .unwrap();
        let edited_font = edited_text
            .blocks()
            .next()
            .unwrap()
            .lines()
            .next()
            .unwrap()
            .chars()
            .next()
            .unwrap()
            .font()
            .unwrap();
        for ch in "Replacement text".chars() {
            let a = original_font
                .advance_glyph(original_font.encode_character(ch as i32).unwrap())
                .unwrap();
            let b = edited_font
                .advance_glyph(edited_font.encode_character(ch as i32).unwrap())
                .unwrap();
            assert!((a - b).abs() < 0.001);
        }
        e.edit(0, 0, after.glyphs.len() - 1, "Second replacement")
            .unwrap();
        let (t, _) = e.text(0).unwrap();
        assert!(
            t.selected_text(0, t.glyphs.len() - 1)
                .contains("Second replacement")
        );
        e.history(true).unwrap();
        let (t, _) = e.text(0).unwrap();
        assert!(
            t.selected_text(0, t.glyphs.len() - 1)
                .contains("Replacement")
        );
        e.history(false).unwrap();
        e.save(&path).unwrap();
        let reopened = Engine::open(&path).unwrap();
        assert!(
            reopened
                .doc
                .load_page(0)
                .unwrap()
                .text(Default::default())
                .unwrap()
                .contains("Second replacement")
        );
    }
    #[test]
    fn missing_glyph_does_not_destroy_document() {
        let (_dir, path) = fixture();
        let mut e = Engine::open(&path).unwrap();
        let before = e.bytes().unwrap();
        let (t, _) = e.text(0).unwrap();
        assert!(e.edit(0, 0, t.glyphs.len() - 1, "🦀").is_err());
        assert_eq!(e.bytes().unwrap(), before);
        assert!(!e.dirty);
    }
    #[test]
    fn print_layout_preserves_searchable_text_and_page_counts() {
        let (dir, path) = fixture();
        let e = Engine::open(&path).unwrap();
        for handling in [
            crate::printing::Handling::Size,
            crate::printing::Handling::Multiple {
                columns: 2,
                rows: 1,
            },
            crate::printing::Handling::Booklet,
            crate::printing::Handling::Poster {
                percent: 150.,
                overlap: 12.,
            },
        ] {
            let output = dir.path().join("print.pdf");
            let options = PrintOptions {
                handling,
                ..Default::default()
            };
            let sheets = e.print_pdf(&options, &output).unwrap();
            let doc = Engine::open(&output).unwrap();
            assert_eq!(doc.doc.page_count().unwrap() as usize, sheets.len());
            let text = doc
                .doc
                .load_page(0)
                .unwrap()
                .text(Default::default())
                .unwrap();
            assert!(text.contains("Original"), "{handling:?}: {text}");
            assert!(doc.render(0, 0.4).unwrap().rgb.iter().any(|p| *p < 200));
        }
    }
    #[test]
    fn failed_save_keeps_original_document() {
        let (_dir, path) = fixture();
        let mut e = Engine::open(&path).unwrap();
        let (t, _) = e.text(0).unwrap();
        e.edit(0, 0, t.glyphs.len() - 1, "Changed").unwrap();
        assert!(
            e.save(Path::new("Z:/no-such-native-test-folder/a.pdf"))
                .is_err()
        );
        assert!(e.dirty);
        assert!(
            Engine::open(&path)
                .unwrap()
                .doc
                .load_page(0)
                .unwrap()
                .text(Default::default())
                .unwrap()
                .contains("Original")
        );
    }
    #[test]
    fn zoom_capped_and_repeated_open_close() {
        let (_dir, path) = fixture();
        for _ in 0..12 {
            let e = Engine::open(&path).unwrap();
            let image = e.render(0, 100.).unwrap();
            assert!(image.width * image.height <= 24_050_000);
            assert_eq!(image.rgb.len(), image.width * image.height * 3);
        }
    }
}
