use crate::{
    engine::{Annotation, Command, Event, FormField, Info, Raster, Worker},
    icons::{self, Icon},
    input::{Action, shortcut},
    platform_print::Printer,
    printing::{Box2, Duplex, Handling, Parity, PrintOptions, Scale},
    selection::PageText,
    settings::Settings,
};
use eframe::egui::{self, IconData, *};
use std::{
    collections::{HashMap, HashSet},
    path::PathBuf,
    sync::atomic::Ordering,
    time::{Duration, Instant},
};

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Tool {
    Select,
    Hand,
    Edit,
    Highlight,
    Note,
    Rectangle,
    Redact,
    AddText,
    Image,
}
#[derive(Clone, Copy, Debug)]
struct Selection {
    anchor: (usize, usize),
    end: (usize, usize),
}
struct Tab {
    worker: Worker,
    info: Option<Info>,
    name: String,
    page: usize,
    zoom: f32,
    fit: bool,
    fit_width: bool,
    textures: HashMap<(usize, u32), TextureHandle>,
    pending: HashMap<u64, (usize, u32)>,
    texts: HashMap<usize, PageText>,
    annotations: HashMap<usize, Vec<Annotation>>,
    text_pending: HashSet<usize>,
    fields: HashMap<usize, Vec<FormField>>,
    fields_pending: HashSet<usize>,
    selection: Option<Selection>,
    selected_annotation: Option<(usize, i32)>,
    selecting: bool,
    scroll: Vec2,
    jump: Option<usize>,
    serial: u64,
    search: String,
    search_open: bool,
    search_focus: bool,
    hits: Vec<(usize, Box2)>,
    hit: usize,
}
impl Tab {
    fn new(ctx: &Context, path: PathBuf) -> Self {
        let worker = Worker::spawn(ctx.clone());
        let name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into();
        let _ = worker.tx.send(Command::Open(path));
        Self {
            worker,
            info: None,
            name,
            page: 0,
            zoom: 1.,
            fit: true,
            fit_width: false,
            textures: HashMap::new(),
            pending: HashMap::new(),
            texts: HashMap::new(),
            annotations: HashMap::new(),
            text_pending: HashSet::new(),
            fields: HashMap::new(),
            fields_pending: HashSet::new(),
            selection: None,
            selected_annotation: None,
            selecting: false,
            scroll: Vec2::ZERO,
            jump: Some(0),
            serial: 0,
            search: String::new(),
            search_open: false,
            search_focus: false,
            hits: vec![],
            hit: 0,
        }
    }
    fn send(&self, c: Command) {
        let _ = self.worker.tx.try_send(c);
    }
    fn texture(&mut self, ctx: &Context, page: usize, scale: f32) -> Option<TextureHandle> {
        let key = (page, (scale * 100.).round() as u32);
        if let Some(t) = self.textures.get(&key) {
            return Some(t.clone());
        }
        if !self.pending.values().any(|k| *k == key) && self.pending.len() < 8 {
            self.serial += 1;
            let token = self.serial;
            if self
                .worker
                .tx
                .try_send(Command::Render {
                    page,
                    scale: key.1 as f32 / 100.,
                    token,
                })
                .is_ok()
            {
                self.pending.insert(token, key);
            }
        }
        let _ = ctx;
        self.textures
            .iter()
            .find(|((p, _), _)| *p == page)
            .map(|(_, t)| t.clone())
    }
    fn invalidate(&mut self) {
        self.textures.clear();
        self.pending.clear();
        self.texts.clear();
        self.annotations.clear();
        self.text_pending.clear();
        self.fields.clear();
        self.fields_pending.clear();
        self.selection = None;
        self.selected_annotation = None;
        self.hits.clear();
    }
    fn clear_find(&mut self) {
        self.search_open = false;
        self.search.clear();
        self.hits.clear();
        self.hit = 0;
        self.worker.generation.fetch_add(1, Ordering::Relaxed);
    }
    fn find(&mut self) {
        let generation = self.worker.generation.fetch_add(1, Ordering::Relaxed) + 1;
        self.hits.clear();
        self.hit = 0;
        self.send(Command::Search {
            query: self.search.clone(),
            generation,
        });
    }
    fn copy(&self) -> String {
        let Some(sel) = self.selection else {
            return String::new();
        };
        let (a, b) = if sel.anchor <= sel.end {
            (sel.anchor, sel.end)
        } else {
            (sel.end, sel.anchor)
        };
        (a.0..=b.0)
            .filter_map(|page| {
                self.texts.get(&page).map(|t| {
                    let first = if page == a.0 { a.1 } else { 0 };
                    let last = if page == b.0 {
                        b.1
                    } else {
                        t.glyphs.len().saturating_sub(1)
                    };
                    t.selected_text(first, last)
                })
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
}
struct EditDialog {
    page: usize,
    first: usize,
    last: usize,
    text: String,
    font: String,
    size: f32,
    chosen_font: Option<String>,
    font_file: Option<PathBuf>,
}
struct OcrDialog {
    range: String,
    accurate: bool,
    overwrite: bool,
}
pub struct PrintDialog {
    pub options: PrintOptions,
    printers: Vec<Printer>,
    preview: Option<TextureHandle>,
    preview_token: u64,
    pub sheet: usize,
    sheets: usize,
    changed: Instant,
    pub pending: bool,
    error: String,
}
pub struct App {
    tabs: Vec<Tab>,
    active: usize,
    home_visible: bool,
    settings: Settings,
    sidebar: bool,
    navigation_tab: usize,
    tool: Tool,
    status: String,
    error: String,
    print: Option<PrintDialog>,
    edit: Option<EditDialog>,
    ocr: Option<OcrDialog>,
    preferences: bool,
    closing: Option<bool>,
    allow_close: bool,
    drawing: Option<(usize, Pos2)>,
    note_text: String,
    annotate: Option<(usize, Box2, String)>,
    comment: Option<(usize, i32, String)>,
    printer_rx: crossbeam_channel::Receiver<anyhow::Result<Vec<Printer>>>,
    printers: Vec<Printer>,
    update_rx: Option<crossbeam_channel::Receiver<String>>,
    fullscreen: bool,
    font_names: Vec<String>,
    pub test_mode: Option<PathBuf>,
    test_stage: usize,
    test_started: Instant,
}
impl App {
    pub fn new(
        cc: &eframe::CreationContext<'_>,
        paths: Vec<PathBuf>,
        test_mode: Option<PathBuf>,
    ) -> Self {
        Self::with_context(&cc.egui_ctx, paths, test_mode)
    }
    pub fn with_context(ctx: &Context, paths: Vec<PathBuf>, test_mode: Option<PathBuf>) -> Self {
        let settings = Settings::load();
        theme(ctx, settings.dark);
        let (tx, printer_rx) = crossbeam_channel::bounded(1);
        let repaint = ctx.clone();
        std::thread::spawn(move || {
            let _ = tx.send(crate::platform_print::printers());
            repaint.request_repaint();
        });
        let tabs: Vec<_> = paths.into_iter().map(|p| Tab::new(ctx, p)).collect();
        let home_visible = tabs.is_empty();
        Self {
            tabs,
            active: 0,
            home_visible,
            settings,
            sidebar: true,
            navigation_tab: 0,
            tool: Tool::Select,
            status: String::new(),
            error: String::new(),
            print: None,
            edit: None,
            ocr: None,
            preferences: false,
            closing: None,
            allow_close: false,
            drawing: None,
            note_text: String::new(),
            annotate: None,
            comment: None,
            printer_rx,
            printers: vec![],
            update_rx: None,
            fullscreen: false,
            font_names: crate::fonts::names(),
            test_mode,
            test_stage: 0,
            test_started: Instant::now(),
        }
    }
    fn tab(&mut self) -> Option<&mut Tab> {
        self.tabs.get_mut(self.active)
    }
    fn open(&mut self, ctx: &Context, path: PathBuf) {
        self.home_visible = false;
        if let Some(i) = self
            .tabs
            .iter()
            .position(|t| t.info.as_ref().is_some_and(|i| i.path == path))
        {
            self.active = i;
            return;
        }
        self.settings.remember(&path);
        if let Err(e) = self.settings.save() {
            self.error = e.to_string();
        }
        self.tabs.push(Tab::new(ctx, path));
        self.active = self.tabs.len() - 1;
    }
    fn pick_open(&mut self, ctx: &Context) {
        if let Some(paths) = rfd::FileDialog::new()
            .add_filter("PDF document", &["pdf"])
            .pick_files()
        {
            for p in paths {
                self.open(ctx, p);
            }
        }
    }
    fn save(&mut self, save_as: bool) {
        let Some(t) = self.tab() else { return };
        let Some(info) = &t.info else { return };
        let path = if save_as {
            rfd::FileDialog::new()
                .add_filter("PDF document", &["pdf"])
                .set_file_name(&t.name)
                .save_file()
        } else {
            Some(info.path.clone())
        };
        if let Some(p) = path {
            t.send(Command::Save(p));
        }
    }
    fn close_tab(&mut self) {
        if self
            .tab()
            .is_some_and(|t| t.info.as_ref().is_some_and(|i| i.dirty))
        {
            self.closing = Some(false);
        } else {
            self.remove_tab();
        }
    }
    fn remove_tab(&mut self) {
        if self.active < self.tabs.len() {
            self.tabs.remove(self.active);
        }
        self.active = self.active.min(self.tabs.len().saturating_sub(1));
        self.home_visible = self.tabs.is_empty();
        self.print = None;
        self.edit = None;
    }
    fn action(&mut self, ctx: &Context, a: Action) {
        match a {
            Action::Open => self.pick_open(ctx),
            Action::Save => self.save(false),
            Action::SaveAs => self.save(true),
            Action::CloseTab => self.close_tab(),
            Action::Print => self.show_print(),
            Action::Find => {
                if let Some(t) = self.tab() {
                    t.search_open = true;
                    t.search_focus = true;
                }
            }
            Action::NextTab | Action::PreviousTab => {
                self.home_visible = false;
                if !self.tabs.is_empty() {
                    self.active = (self.active
                        + if a == Action::NextTab {
                            1
                        } else {
                            self.tabs.len() - 1
                        })
                        % self.tabs.len();
                }
            }
            Action::Undo | Action::Redo => {
                if let Some(t) = self.tab() {
                    t.send(if a == Action::Undo {
                        Command::Undo
                    } else {
                        Command::Redo
                    });
                }
            }
            Action::FitPage | Action::FitWidth => {
                if let Some(t) = self.tab() {
                    t.fit = true;
                    t.fit_width = a == Action::FitWidth;
                    t.jump = Some(t.page);
                }
            }
            Action::Actual => {
                if let Some(t) = self.tab() {
                    t.zoom = 1.;
                    t.fit = false;
                }
            }
            Action::ZoomIn | Action::ZoomOut => {
                if let Some(t) = self.tab() {
                    t.zoom =
                        (t.zoom * if a == Action::ZoomIn { 1.2 } else { 1. / 1.2 }).clamp(0.1, 8.);
                    t.fit = false;
                }
            }
            Action::NextPage | Action::PreviousPage | Action::FirstPage | Action::LastPage => {
                if let Some(t) = self.tab() {
                    let n = t.info.as_ref().map_or(1, |i| i.sizes.len());
                    t.page = match a {
                        Action::NextPage => (t.page + 1).min(n - 1),
                        Action::PreviousPage => t.page.saturating_sub(1),
                        Action::FirstPage => 0,
                        _ => n - 1,
                    };
                    t.jump = Some(t.page);
                }
            }
            Action::FindNext | Action::FindPrevious => {
                if let Some(t) = self.tab() {
                    if !t.hits.is_empty() {
                        t.hit = (t.hit
                            + if a == Action::FindNext {
                                1
                            } else {
                                t.hits.len() - 1
                            })
                            % t.hits.len();
                        t.page = t.hits[t.hit].0;
                        t.jump = Some(t.page);
                    }
                }
            }
            Action::FullScreen => {
                self.fullscreen = !self.fullscreen;
                ctx.send_viewport_cmd(ViewportCommand::Fullscreen(self.fullscreen));
            }
            Action::Select => self.tool = Tool::Select,
            Action::Hand => self.tool = Tool::Hand,
            Action::Highlight => self.tool = Tool::Highlight,
            Action::Edit => self.begin_edit(),
            Action::Preferences => self.preferences = true,
            Action::Copy => {
                if let Some(t) = self.tab() {
                    if let Some(s) = t.selection {
                        t.send(Command::CopySelection {
                            anchor: s.anchor,
                            end: s.end,
                        });
                    }
                }
            }
            Action::Escape => {
                if !self.error.is_empty() {
                    self.error.clear();
                } else if self.comment.is_some() {
                    self.comment = None;
                } else if self.closing.is_some() {
                    self.closing = None;
                } else if self.print.is_some() {
                    self.print = None
                } else if self.edit.is_some() {
                    self.edit = None
                } else if self.ocr.is_some() {
                    self.ocr = None
                } else if self.preferences {
                    self.preferences = false
                } else if self.annotate.is_some() {
                    self.annotate = None
                } else if let Some(t) = self.tab() {
                    if t.search_open {
                        t.clear_find();
                    } else {
                        t.selection = None;
                        self.tool = Tool::Select;
                    }
                }
            }
        }
    }
    fn begin_edit(&mut self) {
        let Some(t) = self.tab() else { return };
        let Some(sel) = t.selection else { return };
        if sel.anchor.0 != sel.end.0 {
            self.error = "Edit one text run on one page at a time".into();
            return;
        }
        let Some(text) = t.texts.get(&sel.anchor.0) else {
            return;
        };
        let a = sel.anchor.1.min(sel.end.1);
        let b = sel.anchor.1.max(sel.end.1);
        if let Some(g) = text.glyphs.get(a) {
            self.edit = Some(EditDialog {
                page: sel.anchor.0,
                first: a,
                last: b,
                text: text.selected_text(a, b),
                font: g.font.clone(),
                size: g.size,
                chosen_font: None,
                font_file: None,
            });
        }
    }
    fn show_print(&mut self) {
        if self.tab().and_then(|t| t.info.as_ref()).is_none() {
            return;
        }
        let printer = self
            .printers
            .iter()
            .find(|p| p.default)
            .or(self.printers.first())
            .map(|p| p.name.clone())
            .unwrap_or_default();
        self.print = Some(PrintDialog {
            options: PrintOptions {
                printer,
                ..Default::default()
            },
            printers: self.printers.clone(),
            preview: None,
            preview_token: 0,
            sheet: 0,
            sheets: 0,
            changed: Instant::now() - Duration::from_secs(1),
            pending: false,
            error: String::new(),
        });
    }
    fn poll(&mut self, ctx: &Context) {
        if let Ok(result) = self.printer_rx.try_recv() {
            match result {
                Ok(p) => self.printers = p,
                Err(e) => self.status = e.to_string(),
            }
        }
        if let Some(rx) = &self.update_rx {
            if let Ok(msg) = rx.try_recv() {
                self.status = msg;
                self.update_rx = None;
            }
        }
        for i in 0..self.tabs.len() {
            while let Ok(event) = self.tabs[i].worker.rx.try_recv() {
                let t = &mut self.tabs[i];
                match event {
                    Event::Info(info) => {
                        t.name = info
                            .path
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .into();
                        t.page = t.page.min(info.sizes.len().saturating_sub(1));
                        t.invalidate();
                        t.info = Some(info);
                        if t.search_open && !t.search.is_empty() {
                            t.find();
                        }
                    }
                    Event::Raster {
                        page: _,
                        token,
                        image,
                    } => {
                        if let Some(key) = t.pending.remove(&token) {
                            let tex =
                                load_texture(ctx, format!("page-{i}-{}-{token}", key.0), &image);
                            t.textures.insert(key, tex);
                            while t.textures.len() > 12
                                || t.textures
                                    .values()
                                    .map(|v| v.size()[0] * v.size()[1] * 4)
                                    .sum::<usize>()
                                    > 128 * 1024 * 1024
                            {
                                let victim = t
                                    .textures
                                    .keys()
                                    .filter(|k| **k != key)
                                    .max_by_key(|k| k.0.abs_diff(t.page))
                                    .copied();
                                if let Some(k) = victim {
                                    t.textures.remove(&k);
                                } else {
                                    break;
                                }
                            }
                        }
                    }
                    Event::Text {
                        page,
                        text,
                        annotations,
                    } => {
                        t.text_pending.remove(&page);
                        t.texts.insert(page, text);
                        t.annotations.insert(page, annotations);
                        if t.texts.len() > 64 {
                            if let Some(p) =
                                t.texts.keys().max_by_key(|p| p.abs_diff(t.page)).copied()
                            {
                                t.texts.remove(&p);
                                t.annotations.remove(&p);
                            }
                        }
                    }
                    Event::Search { generation, hits } => {
                        if t.worker.generation.load(Ordering::Relaxed) == generation {
                            t.hits = hits;
                            if let Some((p, _)) = t.hits.first() {
                                t.page = *p;
                                t.jump = Some(*p);
                            }
                        }
                    }
                    Event::Preview {
                        token,
                        image,
                        sheets,
                    } => {
                        if i == self.active {
                            if let Some(p) = &mut self.print {
                                if p.preview_token == token {
                                    p.preview =
                                        Some(load_texture(ctx, "print-preview".into(), &image));
                                    p.sheets = sheets;
                                    p.pending = false;
                                }
                            }
                        }
                    }
                    Event::Status(msg) => self.status = msg,
                    Event::Clipboard(text) => ctx.copy_text(text),
                    Event::Fields { page, fields } => {
                        t.fields_pending.remove(&page);
                        t.fields.insert(page, fields);
                    }
                    Event::Error(e) => {
                        self.error = e.clone();
                        if let Some(p) = &mut self.print {
                            p.error = e;
                            p.pending = false;
                        }
                    }
                    Event::Closed => {}
                }
            }
        }
    }
    fn header(&mut self, ctx: &Context) {
        TopBottomPanel::top("workspace-header").show(ctx,|ui|{
        egui::MenuBar::new().ui(ui,|ui|{
            ui.menu_button("File",|ui|{for(label,a)in[("Open…       Ctrl+O",Action::Open),("Save         Ctrl+S",Action::Save),("Save as…    Ctrl+Shift+S",Action::SaveAs),("Print…        Ctrl+P",Action::Print),("Close PDF   Ctrl+W",Action::CloseTab)]{if ui.button(label).clicked(){ui.close();self.action(ctx,a);}}
                ui.separator();if ui.button("Combine files…").clicked(){ui.close();if let Some(files)=rfd::FileDialog::new().add_filter("PDF",&["pdf"]).pick_files(){if let Some(t)=self.tab(){t.send(Command::Combine(files));}}}
                if ui.button("Export text…").clicked(){ui.close();if let Some(p)=rfd::FileDialog::new().add_filter("Text document",&["txt"]).save_file(){if let Some(t)=self.tab(){t.send(Command::ExportText(p));}}}
            });
            ui.menu_button("Edit",|ui|{for(label,a)in[("Undo    Ctrl+Z",Action::Undo),("Redo    Ctrl+Shift+Z",Action::Redo),("Copy     Ctrl+C",Action::Copy),("Find…    Ctrl+F",Action::Find),("Preferences…",Action::Preferences)]{if ui.button(label).clicked(){ui.close();self.action(ctx,a);}}});
            ui.menu_button("View",|ui|{for(label,a)in[("Fit page    Ctrl+0",Action::FitPage),("Actual size    Ctrl+1",Action::Actual),("Fit width    Ctrl+2",Action::FitWidth),("Full screen    F11",Action::FullScreen)]{if ui.button(label).clicked(){ui.close();self.action(ctx,a);}}if ui.checkbox(&mut self.sidebar,"Page navigation").changed(){ui.close();}});
            ui.menu_button("Help",|ui|{if ui.button("Check for updates").clicked(){ui.close();let(tx,rx)=crossbeam_channel::bounded(1);self.update_rx=Some(rx);let c=ctx.clone();std::thread::spawn(move||{let result=(||->anyhow::Result<String>{let mut response=ureq::get("https://api.github.com/repos/Avaneesh-Inamdar/ReEdit-PDF-Reader-and-Editor/releases/latest").header("User-Agent","Re-Edit-PDF-native").call()?;let value:serde_json::Value=response.body_mut().read_json()?;Ok(format!("Latest published release: {}. Native version: {}",value["tag_name"].as_str().unwrap_or("unknown"),env!("CARGO_PKG_VERSION")))} )();let _=tx.send(result.unwrap_or_else(|e|format!("Update check failed: {e}")));c.request_repaint();});}if ui.button("Keyboard shortcuts").clicked(){ui.close();self.status="Ctrl+O Open • Ctrl+S Save • Ctrl+P Print • Ctrl+F Find • Ctrl+Tab Next tab • Ctrl+W Close • Ctrl+0 Fit • F11 Full screen • Esc Cancel".into();}});
        });
        ui.horizontal(|ui|{
            if ui.selectable_label(self.home_visible,"Home").clicked(){self.home_visible=true;}
            let mut activate=None;let mut close=None;
            for(i,t)in self.tabs.iter().enumerate(){ui.push_id(i,|ui|{let label=format!("{}{}",t.name,if t.info.as_ref().is_some_and(|i|i.dirty){" *"}else{""});if ui.selectable_label(i==self.active,label).clicked(){activate=Some(i)}if icons::button(ui,Icon::Close,"Close document").clicked(){close=Some(i)}});}
            if let Some(i)=activate{self.active=i;self.home_visible=false;}if let Some(i)=close{self.active=i;self.close_tab();}
        });
        ui.separator();ui.horizontal(|ui|{
            if icons::button(ui,Icon::Open,"Open PDF (Ctrl+O)").clicked(){self.pick_open(ctx);}
            let has=self.tab().is_some_and(|t|t.info.is_some());ui.add_enabled_ui(has,|ui|{
                if icons::button(ui,Icon::Save,"Save (Ctrl+S)").clicked(){self.save(false)}
                if icons::button(ui,Icon::Print,"Print (Ctrl+P)").clicked(){self.show_print()}
                if icons::button(ui,Icon::Search,"Find (Ctrl+F)").clicked(){self.action(ctx,Action::Find)}
                ui.separator();if icons::button(ui,Icon::Sidebar,"Toggle page navigation").clicked(){self.sidebar=!self.sidebar}
                if icons::button(ui,Icon::Select,"Select text").clicked(){self.tool=Tool::Select}if icons::button(ui,Icon::Hand,"Hand tool (hold Space to pan)").clicked(){self.tool=Tool::Hand}
                if let Some(t)=self.tab(){if icons::button(ui,Icon::Previous,"Previous page").clicked(){t.page=t.page.saturating_sub(1);t.jump=Some(t.page)}let n=t.info.as_ref().map_or(1,|i|i.sizes.len());let mut value=t.page+1;if ui.add(DragValue::new(&mut value).range(1..=n).speed(0.1)).changed(){t.page=value-1;t.jump=Some(t.page)}ui.label(format!("/ {n}"));if icons::button(ui,Icon::Next,"Next page").clicked(){t.page=(t.page+1).min(n-1);t.jump=Some(t.page)}
                    let mut percent=(t.zoom*100.).round();if ui.add(DragValue::new(&mut percent).range(10. ..=800.).suffix("%")).changed(){t.zoom=percent/100.;t.fit=false;}if ui.button("Fit").clicked(){t.fit=true;t.jump=Some(t.page)}}
            });
        });
    });
    }
    fn home(&mut self, ctx: &Context, ui: &mut Ui) {
        ui.add_space(28.);
        ui.heading("Re-Edit PDF");
        ui.label("Read and edit your documents");
        ui.add_space(16.);
        if ui.button("Open a PDF…").clicked() {
            self.pick_open(ctx)
        }
        ui.separator();
        ui.heading("Recent files");
        let mut open = None;
        let mut remove = None;
        let mut persist = false;
        for (i, r) in self.settings.recent.iter_mut().enumerate() {
            ui.horizontal(|ui| {
                if icons::button(
                    ui,
                    Icon::Star(r.starred),
                    if r.starred {
                        "Remove favourite"
                    } else {
                        "Add favourite"
                    },
                )
                .clicked()
                {
                    r.starred = !r.starred;
                    persist = true
                }
                if ui
                    .button(r.path.file_name().unwrap_or_default().to_string_lossy())
                    .on_hover_text(r.path.display().to_string())
                    .clicked()
                {
                    open = Some(r.path.clone())
                }
                if icons::button(ui, Icon::Close, "Remove from recent files").clicked() {
                    remove = Some(i)
                }
            });
        }
        if let Some(i) = remove {
            self.settings.recent.remove(i);
            persist = true
        }
        if persist {
            if let Err(e) = self.settings.save() {
                self.error = e.to_string();
            }
        }
        if let Some(p) = open {
            self.open(ctx, p)
        }
    }
    fn navigation(&mut self, ctx: &Context) {
        if !self.sidebar || self.tabs.is_empty() || self.home_visible {
            return;
        }
        SidePanel::left("page-navigation")
            .default_width(155.)
            .width_range(110. ..=280.)
            .show(ctx, |ui| {
                ui.horizontal(|ui| {
                    ui.selectable_value(&mut self.navigation_tab, 0, "Pages");
                    ui.selectable_value(&mut self.navigation_tab, 1, "Bookmarks");
                });
                if ui
                    .selectable_label(self.navigation_tab == 2, "Attachments")
                    .clicked()
                {
                    self.navigation_tab = 2;
                }
                ui.separator();
                let nav = self.navigation_tab;
                let Some(t) = self.tab() else { return };
                let Some(info) = &t.info else {
                    ui.spinner();
                    return;
                };
                let sizes = info.sizes.clone();
                if nav == 1 {
                    let bookmarks = info.bookmarks.clone();
                    if bookmarks.is_empty() {
                        ui.label("This PDF has no bookmarks.");
                    }
                    for (title, page) in bookmarks {
                        if ui.button(title).clicked() {
                            t.page = page.min(sizes.len() - 1);
                            t.jump = Some(t.page);
                        }
                    }
                    return;
                }
                if nav == 2 {
                    let attachments = info.attachments.clone();
                    if attachments.is_empty() {
                        ui.label("This PDF has no attachments.");
                    }
                    for name in attachments {
                        if ui.button(&name).clicked() {
                            if let Some(path) =
                                rfd::FileDialog::new().set_file_name(&name).save_file()
                            {
                                t.send(Command::ExportAttachment { name, path });
                            }
                        }
                    }
                    return;
                }
                ScrollArea::vertical().show(ui, |ui| {
                    for (p, size) in sizes.iter().enumerate() {
                        let w = ui.available_width() - 12.;
                        let h = w * size[1] / size[0];
                        let (r, response) =
                            ui.allocate_exact_size(vec2(w, h + 24.), Sense::click());
                        if ui.is_rect_visible(r) {
                            let page_rect = Rect::from_min_size(r.min, vec2(w, h));
                            if let Some(tex) = t.texture(ctx, p, 0.35 * ctx.pixels_per_point()) {
                                ui.painter().image(
                                    tex.id(),
                                    page_rect,
                                    Rect::from_min_max(Pos2::ZERO, pos2(1., 1.)),
                                    Color32::WHITE,
                                );
                            } else {
                                ui.painter().rect_filled(page_rect, 0., Color32::WHITE);
                            }
                            if p == t.page {
                                ui.painter().rect_stroke(
                                    page_rect,
                                    1.,
                                    Stroke::new(2.0_f32, Color32::from_rgb(20, 115, 230)),
                                    StrokeKind::Outside,
                                );
                            }
                            ui.painter().text(
                                pos2(r.center().x, r.bottom() - 12.),
                                Align2::CENTER_CENTER,
                                format!("{}", p + 1),
                                FontId::proportional(12.),
                                ui.visuals().text_color(),
                            );
                        }
                        if response.clicked() {
                            t.page = p;
                            t.jump = Some(p);
                        }
                    }
                });
            });
    }
    fn tools(&mut self, ctx: &Context) {
        if self.tabs.is_empty() || self.home_visible {
            return;
        }
        SidePanel::right("all-tools")
            .default_width(190.)
            .width_range(160. ..=240.)
            .show(ctx, |ui| {
                ui.heading("All tools");
                ui.separator();
                for (tool, label) in [
                    (Tool::Edit, "Edit a PDF"),
                    (Tool::Highlight, "Highlight text"),
                    (Tool::Note, "Add a comment"),
                    (Tool::Rectangle, "Draw a rectangle"),
                    (Tool::Redact, "Redact content"),
                    (Tool::AddText, "Add text"),
                    (Tool::Image, "Add image"),
                ] {
                    if ui.selectable_label(self.tool == tool, label).clicked() {
                        self.tool = tool;
                        if tool == Tool::Edit {
                            self.begin_edit();
                        }
                    }
                }
                ui.separator();
                ui.label("Organize pages");
                if ui.button("Scan & OCR…").clicked() {
                    self.ocr = Some(OcrDialog {
                        range: String::new(),
                        accurate: true,
                        overwrite: false,
                    });
                }
                if ui.button("Rotate clockwise").clicked() {
                    if let Some(t) = self.tab() {
                        t.send(Command::Rotate(t.page, 90));
                    }
                }
                if ui.button("Delete current page").clicked() {
                    if let Some(t) = self.tab() {
                        t.send(Command::DeletePage(t.page));
                    }
                }
                if ui.button("Move page earlier").clicked() {
                    if let Some(t) = self.tab() {
                        if t.page > 0 {
                            t.send(Command::Move(t.page, t.page - 1));
                        }
                    }
                }
                ui.separator();
                ui.label("Comments");
                let mut edit_comment = None;
                let mut delete = None;
                if let Some(t) = self.tab() {
                    if let Some(ann) = t.annotations.get(&t.page) {
                        for a in ann {
                            ui.horizontal(|ui| {
                                if ui
                                    .selectable_label(
                                        t.selected_annotation == Some((t.page, a.id)),
                                        if a.text.is_empty() { &a.kind } else { &a.text },
                                    )
                                    .clicked()
                                {
                                    t.selected_annotation = Some((t.page, a.id));
                                }
                                if ui.button("Edit").clicked() {
                                    edit_comment = Some((t.page, a.id, a.text.clone()));
                                }
                                if icons::button(ui, Icon::Close, "Delete annotation").clicked() {
                                    delete = Some((t.page, a.id))
                                }
                            });
                        }
                    }
                    if let Some((page, id)) = delete {
                        t.send(Command::DeleteAnnotation { page, id });
                    }
                }
                if let Some((page, id, text)) = edit_comment {
                    self.comment = Some((page, id, text));
                }
                ui.separator();
                ui.label("Form fields");
                if let Some(t) = self.tab() {
                    let page = t.page;
                    if !t.fields.contains_key(&page) && t.fields_pending.insert(page) {
                        t.send(Command::Fields(page));
                    }
                    let mut changed = None;
                    if let Some(fields) = t.fields.get_mut(&page) {
                        for field in fields {
                            ui.push_id(field.id, |ui| {
                                ui.label(&field.name);
                                ui.add_enabled_ui(!field.readonly, |ui| {
                                    if field.kind == "CheckBox" {
                                        let mut checked =
                                            field.value != "Off" && !field.value.is_empty();
                                        if ui.checkbox(&mut checked, "Checked").changed() {
                                            changed = Some((
                                                field.id,
                                                if checked { "Yes" } else { "Off" }.to_string(),
                                            ));
                                        }
                                    } else if field.kind != "Signature" {
                                        let r = ui.add(
                                            TextEdit::singleline(&mut field.value)
                                                .desired_width(ui.available_width()),
                                        );
                                        if r.lost_focus() {
                                            changed = Some((field.id, field.value.clone()));
                                        }
                                    } else {
                                        ui.label("Signature field");
                                    }
                                });
                            });
                        }
                    }
                    if let Some((id, value)) = changed {
                        t.send(Command::SetField { page, id, value });
                    }
                }
            });
    }
    fn find_bar(&mut self, ctx: &Context) {
        if !self.tab().is_some_and(|t| t.search_open) {
            return;
        }
        TopBottomPanel::top("find").show(ctx, |ui| {
            let t = self.tab().unwrap();
            ui.horizontal(|ui| {
                ui.label("Find");
                let response = ui.add(
                    TextEdit::singleline(&mut t.search)
                        .desired_width(280.)
                        .hint_text("Search this document"),
                );
                if t.search_focus {
                    response.request_focus();
                    t.search_focus = false;
                }
                if response.changed() {
                    t.find();
                }
                if response.lost_focus() && ui.input(|i| i.key_pressed(Key::Enter)) {
                    if !t.hits.is_empty() {
                        t.hit = (t.hit + 1) % t.hits.len();
                        t.jump = Some(t.hits[t.hit].0);
                    }
                }
                ui.label(if t.hits.is_empty() {
                    "No matches".into()
                } else {
                    format!("{} of {}", t.hit + 1, t.hits.len())
                });
                if icons::button(ui, Icon::Previous, "Previous match (Shift+F3)").clicked()
                    && !t.hits.is_empty()
                {
                    t.hit = (t.hit + t.hits.len() - 1) % t.hits.len();
                    t.jump = Some(t.hits[t.hit].0);
                }
                if icons::button(ui, Icon::Next, "Next match (F3)").clicked() && !t.hits.is_empty()
                {
                    t.hit = (t.hit + 1) % t.hits.len();
                    t.jump = Some(t.hits[t.hit].0);
                }
                if icons::button(ui, Icon::Close, "Close Find and clear highlights").clicked() {
                    t.clear_find();
                }
            });
        });
    }
    fn document(&mut self, ctx: &Context, ui: &mut Ui) {
        let tool = self.tool;
        let active = self.active;
        let smooth_scroll = self.settings.smooth_scroll;
        let mut edit = false;
        let mut annotation = None;
        let mut comment = None;
        let mut drawing = self.drawing;
        let Some(t) = self.tab() else { return };
        let Some(info) = &t.info else {
            ui.centered_and_justified(|ui| {
                ui.spinner();
            });
            return;
        };
        let sizes = info.sizes.clone();
        let zoom_delta = ctx.input(|i| i.zoom_delta());
        if zoom_delta != 1. && ui.rect_contains_pointer(ui.max_rect()) {
            let old = t.zoom;
            t.zoom = (old * zoom_delta).clamp(0.1, 8.);
            t.fit = false;
            if let Some(mouse) = ctx.input(|i| i.pointer.hover_pos()) {
                let anchor = mouse - ui.min_rect().min;
                t.scroll = (t.scroll + anchor) * (t.zoom / old) - anchor;
            }
        }
        let available = ui.available_width().max(100.);
        if t.fit {
            let size = sizes[t.page];
            let width = (available - 60.) / size[0];
            t.zoom = if t.fit_width {
                width
            } else {
                width.min((ui.available_height() - 30.) / size[1])
            }
            .clamp(0.1, 8.);
        }
        let hand = tool == Tool::Hand
            || (ctx.input(|i| i.key_down(Key::Space)) && !ctx.wants_keyboard_input());
        let area = ScrollArea::both()
            .id_salt(("document", active))
            .auto_shrink([false, false])
            .scroll_offset(t.scroll)
            .animated(smooth_scroll)
            .scroll_source(egui::scroll_area::ScrollSource {
                drag: false,
                ..Default::default()
            });
        let mut pan = None;
        let output = area.show(ui, |ui| {
            ui.set_min_width(
                (available - 20.).max(sizes.iter().map(|s| s[0] * t.zoom).fold(0., f32::max)),
            );
            let mut nearest: Option<(f32, usize, usize)> = None;
            for (p, size) in sizes.iter().enumerate() {
                ui.add_space(12.);
                let extent = vec2(size[0] * t.zoom, size[1] * t.zoom);
                let x = ui.available_width().max(extent.x) / 2. - extent.x / 2.;
                let (r, _) = ui.allocate_exact_size(
                    vec2(ui.available_width().max(extent.x), extent.y),
                    Sense::hover(),
                );
                let page_rect = Rect::from_min_size(r.min + vec2(x, 0.), extent);
                let response = ui.interact(
                    page_rect,
                    ui.id().with(("page", p)),
                    Sense::click_and_drag(),
                );
                if let Some(jump) = t.jump {
                    if jump == p {
                        ui.scroll_to_rect(page_rect, Some(Align::Min));
                        t.jump = None;
                    }
                }
                if !ui.is_rect_visible(page_rect) {
                    continue;
                }
                if page_rect.contains(ui.clip_rect().center()) {
                    t.page = p;
                }
                ui.painter()
                    .rect_filled(page_rect.expand(1.), 0., Color32::from_gray(160));
                ui.painter().rect_filled(page_rect, 0., Color32::WHITE);
                if let Some(tex) = t.texture(ctx, p, t.zoom * ctx.pixels_per_point()) {
                    ui.painter().image(
                        tex.id(),
                        page_rect,
                        Rect::from_min_max(Pos2::ZERO, pos2(1., 1.)),
                        Color32::WHITE,
                    );
                }
                if !t.texts.contains_key(&p) && !t.text_pending.contains(&p) {
                    if t.worker.tx.try_send(Command::Text(p)).is_ok() {
                        t.text_pending.insert(p);
                    }
                }
                if response.hovered() {
                    ctx.set_cursor_icon(if hand {
                        if response.dragged() {
                            CursorIcon::Grabbing
                        } else {
                            CursorIcon::Grab
                        }
                    } else if matches!(tool, Tool::Select | Tool::Edit | Tool::Highlight) {
                        CursorIcon::Text
                    } else {
                        CursorIcon::Crosshair
                    });
                }
                if hand && response.dragged() {
                    pan = Some(ctx.input(|i| i.pointer.delta()));
                }
                let pdf_point = |pos: Pos2| {
                    let v = (pos - page_rect.min) / t.zoom;
                    pos2(v.x, v.y)
                };
                if !hand && matches!(tool, Tool::Select | Tool::Edit) {
                    if let Some(pos) = response.interact_pointer_pos() {
                        let at = pdf_point(pos);
                        if let Some(a) = t.annotations.get(&p).and_then(|list| {
                            list.iter().rev().find(|a| {
                                at.x >= a.bounds.x
                                    && at.x <= a.bounds.x + a.bounds.w
                                    && at.y >= a.bounds.y
                                    && at.y <= a.bounds.y + a.bounds.h
                            })
                        }) {
                            if response.clicked() {
                                t.selected_annotation = Some((p, a.id));
                                t.selection = None;
                            }
                            if response.double_clicked() {
                                comment = Some((p, a.id, a.text.clone()));
                            }
                        }
                    }
                }
                if let Some((page, id)) = t.selected_annotation {
                    if page == p {
                        if let Some(a) = t
                            .annotations
                            .get(&p)
                            .and_then(|list| list.iter().find(|a| a.id == id))
                        {
                            let b = a.bounds;
                            let rect = Rect::from_min_size(
                                page_rect.min + vec2(b.x, b.y) * t.zoom,
                                vec2(b.w, b.h) * t.zoom,
                            );
                            ui.painter().rect_stroke(
                                rect,
                                0.,
                                Stroke::new(1.5_f32, Color32::from_rgb(20, 115, 230)),
                                StrokeKind::Outside,
                            );
                        }
                    }
                }
                if !hand {
                    if let Some(text) = t.texts.get(&p) {
                        if response.drag_started()
                            && matches!(tool, Tool::Select | Tool::Edit | Tool::Highlight)
                        {
                            if let Some(pos) = ctx.input(|i| i.pointer.press_origin()) {
                                let point = pdf_point(pos);
                                if let Some(index) = text.hit(point.x, point.y) {
                                    t.selection = Some(Selection {
                                        anchor: (p, index),
                                        end: (p, index),
                                    });
                                    t.selecting = true;
                                }
                            }
                        }
                        if t.selecting && ctx.input(|i| i.pointer.primary_down()) {
                            if let Some(pos) = ctx.input(|i| i.pointer.hover_pos()) {
                                let point = pdf_point(pos);
                                if let Some(index) = text.hit(point.x, point.y) {
                                    let d = if pos.y < page_rect.top() {
                                        page_rect.top() - pos.y
                                    } else if pos.y > page_rect.bottom() {
                                        pos.y - page_rect.bottom()
                                    } else {
                                        0.
                                    };
                                    if nearest.is_none_or(|(old, _, _)| d < old) {
                                        nearest = Some((d, p, index));
                                    }
                                }
                            }
                        }
                        if response.double_clicked() {
                            if let Some(pos) = response.interact_pointer_pos() {
                                let point = pdf_point(pos);
                                if let Some(index) = text.hit(point.x, point.y) {
                                    let (a, b) = if tool == Tool::Edit {
                                        text.line_range(index)
                                    } else {
                                        text.word(index)
                                    };
                                    t.selection = Some(Selection {
                                        anchor: (p, a),
                                        end: (p, b),
                                    });
                                    if tool == Tool::Edit {
                                        edit = true;
                                    }
                                }
                            }
                        }
                        if response.clicked() && tool == Tool::Edit {
                            if let Some(pos) = response.interact_pointer_pos() {
                                let point = pdf_point(pos);
                                if let Some(index) = text.hit(point.x, point.y) {
                                    let (a, b) = text.line_range(index);
                                    t.selection = Some(Selection {
                                        anchor: (p, a),
                                        end: (p, b),
                                    });
                                    edit = true;
                                }
                            }
                        }
                        if let Some(sel) = t.selection {
                            let (a, b) = if sel.anchor <= sel.end {
                                (sel.anchor, sel.end)
                            } else {
                                (sel.end, sel.anchor)
                            };
                            if (a.0..=b.0).contains(&p) {
                                for (index, g) in text.glyphs.iter().enumerate() {
                                    if (p > a.0 || index >= a.1) && (p < b.0 || index <= b.1) {
                                        paint_box(
                                            ui,
                                            page_rect,
                                            t.zoom,
                                            g.bounds,
                                            Color32::from_rgba_unmultiplied(30, 120, 235, 65),
                                        );
                                    }
                                }
                            }
                        }
                    }
                    if response.drag_started()
                        && matches!(
                            tool,
                            Tool::Note
                                | Tool::Rectangle
                                | Tool::Redact
                                | Tool::AddText
                                | Tool::Image
                        )
                    {
                        if let Some(pos) = ctx.input(|i| i.pointer.press_origin()) {
                            drawing = Some((p, pdf_point(pos)));
                        }
                    }
                    if let Some((page, start)) = drawing {
                        if page == p {
                            if let Some(pos) = ctx.input(|i| i.pointer.hover_pos()) {
                                let end = pdf_point(pos);
                                let rect = Box2 {
                                    x: start.x.min(end.x),
                                    y: start.y.min(end.y),
                                    w: (start.x - end.x).abs().max(16.),
                                    h: (start.y - end.y).abs().max(16.),
                                };
                                paint_box(
                                    ui,
                                    page_rect,
                                    t.zoom,
                                    rect,
                                    Color32::from_rgba_unmultiplied(20, 110, 230, 40),
                                );
                                if response.drag_stopped() {
                                    annotation = Some((p, rect, format!("{tool:?}")));
                                    drawing = None;
                                }
                            }
                        }
                    }
                }
                if t.search_open {
                    for (index, (page, r)) in t.hits.iter().enumerate() {
                        if *page == p {
                            paint_box(
                                ui,
                                page_rect,
                                t.zoom,
                                *r,
                                if index == t.hit {
                                    Color32::from_rgba_unmultiplied(255, 130, 0, 110)
                                } else {
                                    Color32::from_rgba_unmultiplied(250, 220, 0, 90)
                                },
                            );
                        }
                    }
                }
                response.context_menu(|ui| {
                    if ui.button("Copy selected text").clicked() {
                        ctx.copy_text(t.copy());
                        ui.close();
                    }
                    if ui.button("Edit selected text").clicked() {
                        edit = true;
                        ui.close();
                    }
                    if ui.button("Highlight selection").clicked() {
                        if let Some(sel) = t.selection {
                            if sel.anchor.0 == p && sel.end.0 == p {
                                if let Some(text) = t.texts.get(&p) {
                                    let (a, b) =
                                        (sel.anchor.1.min(sel.end.1), sel.anchor.1.max(sel.end.1));
                                    for g in &text.glyphs[a..=b] {
                                        t.send(Command::Annotate {
                                            page: p,
                                            rect: g.bounds,
                                            text: String::new(),
                                            kind: "Highlight".into(),
                                        });
                                    }
                                }
                            }
                        }
                        ui.close();
                    }
                });
            }
            if let Some((_, page, index)) = nearest {
                if let Some(sel) = &mut t.selection {
                    sel.end = (page, index)
                }
            }
            if t.selecting && !ctx.input(|i| i.pointer.primary_down()) {
                t.selecting = false;
            }
        });
        t.scroll = output.state.offset;
        if let Some(delta) = pan {
            t.scroll = (t.scroll - delta).max(Vec2::ZERO)
        }
        if t.selecting {
            if let Some(pos) = ctx.input(|i| i.pointer.hover_pos()) {
                let viewport = output.inner_rect;
                if pos.y < viewport.top() + 24. {
                    t.scroll.y = (t.scroll.y - 12.).max(0.);
                    ctx.request_repaint();
                }
                if pos.y > viewport.bottom() - 24. {
                    t.scroll.y += 12.;
                    ctx.request_repaint();
                }
            }
        }
        self.drawing = drawing;
        if comment.is_some() {
            self.comment = comment;
        }
        if edit {
            self.begin_edit();
        }
        if let Some(a) = annotation {
            self.annotate = Some(a);
            self.note_text.clear();
        }
    }
    fn dialogs(&mut self, ctx: &Context) {
        self.print_dialog(ctx);
        if let Some((page, id, mut text)) = self.comment.take() {
            let mut close = false;
            Modal::new(Id::new("comment-editor")).show(ctx, |ui| {
                ui.set_min_width(400.);
                ui.heading("Edit annotation");
                ui.add(
                    TextEdit::multiline(&mut text)
                        .desired_width(440.)
                        .desired_rows(5),
                );
                ui.horizontal(|ui| {
                    if ui.button("Cancel").clicked() {
                        close = true
                    }
                    if ui.button("Apply").clicked() {
                        if let Some(t) = self.tab() {
                            t.send(Command::UpdateAnnotation {
                                page,
                                id,
                                text: text.clone(),
                            })
                        }
                        close = true
                    }
                });
            });
            if !close {
                self.comment = Some((page, id, text));
            }
        }
        if let Some(mut options) = self.ocr.take() {
            let mut close = false;
            let mut run = false;
            Modal::new(Id::new("ocr")).show(ctx, |ui| {
                ui.set_min_width(440.);
                ui.heading("Recognize text");
                ui.label("Add searchable English text while preserving the original pages.");
                ui.separator();
                ui.label("Pages");
                ui.add(TextEdit::singleline(&mut options.range).hint_text("All pages, or 1-3, 5"));
                ui.checkbox(
                    &mut options.accurate,
                    "Use the accurate recognition model (300 DPI)",
                );
                ui.radio_value(&mut options.overwrite, false, "Save a searchable copy");
                ui.radio_value(&mut options.overwrite, true, "Overwrite the current PDF");
                ui.label("Scanned text uses estimated typography when edited.");
                ui.separator();
                ui.horizontal(|ui| {
                    if ui.button("Cancel").clicked() {
                        close = true
                    }
                    if ui.button("Recognize text").clicked() {
                        run = true
                    }
                });
            });
            if run {
                if let Some(t) = self.tab() {
                    if let Some(info) = &t.info {
                        match crate::printing::page_range(&options.range, info.sizes.len()) {
                            Ok(pages) => {
                                let save = if options.overwrite {
                                    Some(info.path.clone())
                                } else {
                                    rfd::FileDialog::new()
                                        .add_filter("PDF document", &["pdf"])
                                        .set_file_name(format!(
                                            "{}-searchable.pdf",
                                            t.name.trim_end_matches(".pdf")
                                        ))
                                        .save_file()
                                };
                                if let Some(path) = save {
                                    t.send(Command::Ocr {
                                        pages,
                                        accurate: options.accurate,
                                        save: Some(path),
                                    });
                                    self.status = "Recognizing text…".into();
                                    close = true;
                                }
                            }
                            Err(e) => self.error = e.to_string(),
                        }
                    }
                }
            }
            if !close {
                self.ocr = Some(options)
            }
        }
        if let Some(mut e) = self.edit.take() {
            let mut close = false;
            Modal::new(Id::new("text-editor")).show(ctx, |ui| {
                ui.set_min_width(440.);
                ui.heading("Edit text");
                ui.label(format!("{} · {:.1} pt · original color", e.font, e.size));
                ComboBox::from_id_salt("edit-font")
                    .selected_text(e.chosen_font.as_deref().unwrap_or("Keep original font"))
                    .width(360.)
                    .show_ui(ui, |ui| {
                        if ui
                            .selectable_label(e.chosen_font.is_none(), "Keep original font")
                            .clicked()
                        {
                            e.chosen_font = None;
                            e.font_file = None;
                        }
                        ScrollArea::vertical().max_height(240.).show(ui, |ui| {
                            for name in &self.font_names {
                                if ui
                                    .selectable_label(e.chosen_font.as_ref() == Some(name), name)
                                    .clicked()
                                {
                                    e.chosen_font = Some(name.clone());
                                    e.font_file = None;
                                }
                            }
                        });
                    });
                if ui.button("Import font…").clicked() {
                    if let Some(path) = rfd::FileDialog::new()
                        .add_filter("Fonts", &["ttf", "otf", "woff"])
                        .pick_file()
                    {
                        e.chosen_font = Some(
                            path.file_stem()
                                .unwrap_or_default()
                                .to_string_lossy()
                                .into(),
                        );
                        e.font_file = Some(path);
                    }
                }
                let rows = e.text.lines().count().clamp(3, 14);
                ui.add(
                    TextEdit::multiline(&mut e.text)
                        .desired_width(550.)
                        .desired_rows(rows),
                );
                ui.separator();
                ui.horizontal(|ui| {
                    if ui.button("Cancel").clicked() {
                        close = true
                    }
                    if ui.button("Apply").clicked() {
                        if let Some(t) = self.tab() {
                            t.send(Command::EditWithFont {
                                page: e.page,
                                first: e.first,
                                last: e.last,
                                text: e.text.clone(),
                                font: e.chosen_font.clone(),
                                font_file: e.font_file.clone(),
                            });
                        }
                        close = true;
                    }
                });
            });
            if !close {
                self.edit = Some(e)
            }
        }
        if let Some((page, rect, kind)) = self.annotate.clone() {
            let mut close = false;
            Modal::new(Id::new("annotation-confirm")).show(ctx,|ui|{
                ui.set_min_width(400.);
                ui.heading(match kind.as_str(){"Redact"=>"Remove content permanently","AddText"=>"Add text","Image"=>"Add image",_=>"Add annotation"});
                if kind=="Redact" {ui.label("The selected text, graphics and image pixels will be removed when saved. Keep a backup of the original PDF.");}
                else if kind!="Image" {ui.add(TextEdit::multiline(&mut self.note_text).desired_width(440.).desired_rows(4).hint_text("Text or comment"));}
                else {ui.label("Choose a PNG or JPEG to place in the selected area.");}
                ui.horizontal(|ui|{
                    if ui.button("Cancel").clicked(){close=true}
                    if ui.button(if kind=="Redact"{"Redact"}else{"Add"}).clicked(){
                        let note=self.note_text.clone();
                        if let Some(t)=self.tab(){
                            match kind.as_str(){
                                "AddText"=>t.send(Command::PlaceText{page,rect,text:note,font:"source-sans-3-400-normal".into(),size:12.}),
                                "Image"=>if let Some(path)=rfd::FileDialog::new().add_filter("Image",&["png","jpg","jpeg"]).pick_file(){t.send(Command::PlaceImage{page,rect,path});},
                                _=>t.send(Command::Annotate{page,rect,text:note,kind:kind.clone()})
                            }
                        }
                        close=true
                    }
                });
            });
            if close {
                self.annotate = None;
            }
        }
        if self.preferences {
            let mut close = false;
            Modal::new(Id::new("preferences")).show(ctx, |ui| {
                ui.set_min_width(420.);
                ui.heading("Preferences");
                if ui
                    .checkbox(&mut self.settings.dark, "Dark appearance")
                    .changed()
                {
                    theme(ctx, self.settings.dark);
                }
                ui.checkbox(
                    &mut self.settings.single_key_tools,
                    "Use single-key tool shortcuts (H, V, U)",
                );
                ui.checkbox(&mut self.settings.smooth_scroll, "Smooth scrolling");
                ui.label("Document rendering follows your display's scaling automatically.");
                ui.separator();
                if ui.button("Done").clicked() {
                    close = true
                }
            });
            if close {
                self.preferences = false;
                if let Err(e) = self.settings.save() {
                    self.error = e.to_string();
                }
            }
        }
        if let Some(window) = self.closing {
            Modal::new(Id::new("unsaved")).show(ctx, |ui| {
                ui.heading("Save changes before closing?");
                if let Some(tab) = self.tabs.get(self.active) {
                    ui.label(&tab.name);
                }
                ui.horizontal(|ui| {
                    if ui.button("Cancel").clicked() {
                        self.closing = None;
                    }
                    if ui.button("Discard changes").clicked() {
                        self.closing = None;
                        if window {
                            self.remove_tab();
                            if let Some(i) = self
                                .tabs
                                .iter()
                                .position(|t| t.info.as_ref().is_some_and(|i| i.dirty))
                            {
                                self.active = i;
                                self.closing = Some(true);
                            } else {
                                self.allow_close = true;
                                ctx.send_viewport_cmd(ViewportCommand::Close);
                            }
                        } else {
                            self.remove_tab();
                        }
                    }
                    if ui.button("Save").clicked() {
                        self.save(false);
                    }
                });
            });
            if self
                .tab()
                .is_some_and(|t| t.info.as_ref().is_some_and(|i| !i.dirty))
            {
                self.closing = None;
                if window {
                    if let Some(i) = self
                        .tabs
                        .iter()
                        .position(|t| t.info.as_ref().is_some_and(|i| i.dirty))
                    {
                        self.active = i;
                        self.closing = Some(true)
                    } else {
                        self.allow_close = true;
                        ctx.send_viewport_cmd(ViewportCommand::Close)
                    }
                } else {
                    self.remove_tab()
                }
            }
        }
        if !self.error.is_empty() {
            let mut dismiss = false;
            Modal::new(Id::new("error")).show(ctx, |ui| {
                ui.set_max_width(540.);
                ui.heading("Unable to complete action");
                ui.label(&self.error);
                if ui.button("Close").clicked() {
                    dismiss = true
                }
            });
            if dismiss {
                self.error.clear();
            }
        }
    }
    fn print_dialog(&mut self, ctx: &Context) {
        let Some(mut p) = self.print.take() else {
            return;
        };
        let before = serde_json::to_string(&p.options).unwrap_or_default();
        let mut close = false;
        let mut print = false;
        let mut export = false;
        Modal::new(Id::new("print-dialog")).show(ctx, |ui| {
            ui.set_min_width(820.);
            ui.horizontal(|ui| {
                ui.heading("Print");
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if icons::button(ui, Icon::Close, "Close print dialog").clicked() {
                        close = true
                    }
                });
            });
            ui.separator();
            ui.columns(2, |cols| {
                let ui = &mut cols[0];
                ScrollArea::vertical()
                    .max_height((ctx.content_rect().height() - 160.).clamp(280., 680.))
                    .show(ui, |ui| {
                        ui.strong("Printer");
                        ComboBox::from_id_salt("printer")
                            .selected_text(if p.options.printer.is_empty() {
                                "No printer available"
                            } else {
                                &p.options.printer
                            })
                            .width(310.)
                            .show_ui(ui, |ui| {
                                for printer in &p.printers {
                                    ui.selectable_value(
                                        &mut p.options.printer,
                                        printer.name.clone(),
                                        format!(
                                            "{}{}",
                                            printer.name,
                                            if printer.default { " (default)" } else { "" }
                                        ),
                                    );
                                }
                            });
                        ui.horizontal(|ui| {
                            ui.label("Copies");
                            ui.add(DragValue::new(&mut p.options.copies).range(1..=999));
                            ui.checkbox(&mut p.options.collate, "Collate");
                        });
                        ui.checkbox(&mut p.options.color, "Print in color");
                        ui.separator();
                        ui.strong("Pages to Print");
                        ui.label("All pages, or enter a range such as 1-3, 5");
                        ui.add(
                            TextEdit::singleline(&mut p.options.range)
                                .hint_text("All pages")
                                .desired_width(300.),
                        );
                        ui.horizontal(|ui| {
                            if ui.button("Current page").clicked() {
                                if let Some(t) = self.tab() {
                                    p.options.range = (t.page + 1).to_string();
                                }
                            }
                            if ui.button("All pages").clicked() {
                                p.options.range.clear();
                            }
                        });
                        ComboBox::from_id_salt("parity")
                            .selected_text(format!("{:?} pages", p.options.parity))
                            .show_ui(ui, |ui| {
                                for (v, label) in [
                                    (Parity::All, "All pages"),
                                    (Parity::Odd, "Odd pages only"),
                                    (Parity::Even, "Even pages only"),
                                ] {
                                    ui.selectable_value(&mut p.options.parity, v, label);
                                }
                            });
                        ui.checkbox(&mut p.options.reverse, "Reverse pages");
                        ui.separator();
                        ui.strong("Page Sizing & Handling");
                        ui.horizontal(|ui| {
                            for (v, label) in [
                                (Handling::Size, "Size"),
                                (
                                    Handling::Poster {
                                        percent: 100.,
                                        overlap: 12.,
                                    },
                                    "Poster",
                                ),
                                (
                                    Handling::Multiple {
                                        columns: 2,
                                        rows: 1,
                                    },
                                    "Multiple",
                                ),
                                (Handling::Booklet, "Booklet"),
                            ] {
                                let selected = std::mem::discriminant(&p.options.handling)
                                    == std::mem::discriminant(&v);
                                if ui.selectable_label(selected, label).clicked() {
                                    p.options.handling = v;
                                    if v == Handling::Booklet {
                                        p.options.landscape = true;
                                        p.options.duplex = Duplex::ShortEdge;
                                    }
                                }
                            }
                        });
                        match &mut p.options.handling {
                            Handling::Size => {
                                for (v, label) in [
                                    (Scale::Fit, "Fit"),
                                    (Scale::Actual, "Actual size"),
                                    (Scale::Shrink, "Shrink oversized pages"),
                                ] {
                                    ui.radio_value(&mut p.options.scale, v, label);
                                }
                                let custom = matches!(p.options.scale, Scale::Custom(_));
                                if ui.radio(custom, "Custom scale").clicked() {
                                    p.options.scale = Scale::Custom(100.)
                                }
                                if let Scale::Custom(value) = &mut p.options.scale {
                                    ui.add(DragValue::new(value).range(1. ..=1000.).suffix("%"));
                                }
                            }
                            Handling::Multiple { columns, rows } => {
                                ui.horizontal(|ui| {
                                    ui.label("Columns");
                                    ui.add(DragValue::new(columns).range(1..=8));
                                    ui.label("Rows");
                                    ui.add(DragValue::new(rows).range(1..=8));
                                });
                                ui.label("Pages are arranged horizontally, then vertically.");
                            }
                            Handling::Poster { percent, overlap } => {
                                ui.horizontal(|ui| {
                                    ui.label("Tile scale");
                                    ui.add(DragValue::new(percent).range(1. ..=1000.).suffix("%"));
                                });
                                ui.horizontal(|ui| {
                                    ui.label("Overlap");
                                    ui.add(DragValue::new(overlap).range(0. ..=72.).suffix(" pt"));
                                });
                            }
                            Handling::Booklet => {
                                ui.label("Left binding · both sides · blanks added as needed");
                                ui.label("Use landscape paper and short-edge duplex.");
                            }
                        }
                        ui.checkbox(&mut p.options.auto_rotate, "Auto-rotate and center");
                        ui.checkbox(
                            &mut p.options.print_annotations,
                            "Print document and markups",
                        );
                        ui.separator();
                        ui.strong("Paper and orientation");
                        ComboBox::from_id_salt("paper")
                            .selected_text(if p.options.paper[0] > 610. {
                                "Letter"
                            } else {
                                "A4"
                            })
                            .show_ui(ui, |ui| {
                                ui.selectable_value(
                                    &mut p.options.paper,
                                    [595.276, 841.89],
                                    "A4 (210 × 297 mm)",
                                );
                                ui.selectable_value(
                                    &mut p.options.paper,
                                    [612., 792.],
                                    "Letter (8.5 × 11 in)",
                                );
                                ui.selectable_value(
                                    &mut p.options.paper,
                                    [612., 1008.],
                                    "Legal (8.5 × 14 in)",
                                );
                                ui.selectable_value(
                                    &mut p.options.paper,
                                    [841.89, 1190.55],
                                    "A3 (297 × 420 mm)",
                                );
                            });
                        ui.horizontal(|ui| {
                            ui.radio_value(&mut p.options.landscape, false, "Portrait");
                            ui.radio_value(&mut p.options.landscape, true, "Landscape");
                        });
                        ComboBox::from_id_salt("duplex")
                            .selected_text(match p.options.duplex {
                                Duplex::Off => "One-sided",
                                Duplex::LongEdge => "Two-sided · long edge",
                                Duplex::ShortEdge => "Two-sided · short edge",
                            })
                            .show_ui(ui, |ui| {
                                ui.selectable_value(
                                    &mut p.options.duplex,
                                    Duplex::Off,
                                    "One-sided",
                                );
                                ui.selectable_value(
                                    &mut p.options.duplex,
                                    Duplex::LongEdge,
                                    "Two-sided · long edge",
                                );
                                ui.selectable_value(
                                    &mut p.options.duplex,
                                    Duplex::ShortEdge,
                                    "Two-sided · short edge",
                                );
                            });
                        if !p.error.is_empty() {
                            ui.colored_label(Color32::from_rgb(180, 40, 35), &p.error);
                        }
                    });
                let ui = &mut cols[1];
                ui.strong("Preview");
                ui.label("The preview shows the sheets sent to the printer.");
                if let Some(tex) = &p.preview {
                    let sz = tex.size_vec2();
                    ui.add(
                        egui::Image::new(tex).fit_to_exact_size(
                            sz * ((ui.available_width() - 16.) / sz.x)
                                .min((ctx.content_rect().height() - 280.).max(120.) / sz.y),
                        ),
                    );
                } else {
                    ui.spinner();
                }
                ui.horizontal(|ui| {
                    if icons::button(ui, Icon::Previous, "Previous sheet").clicked() {
                        p.sheet = p.sheet.saturating_sub(1);
                        p.changed = Instant::now() - Duration::from_secs(1)
                    }
                    ui.label(format!("Sheet {} of {}", p.sheet + 1, p.sheets));
                    if icons::button(ui, Icon::Next, "Next sheet").clicked() {
                        p.sheet = (p.sheet + 1).min(p.sheets.saturating_sub(1));
                        p.changed = Instant::now() - Duration::from_secs(1)
                    }
                });
            });
            ui.separator();
            ui.horizontal(|ui| {
                if ui.button("Export print layout as PDF…").clicked() {
                    export = true
                }
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    if ui
                        .add_enabled(
                            !p.options.printer.is_empty() && p.error.is_empty() && !p.pending,
                            Button::new("Print"),
                        )
                        .clicked()
                    {
                        print = true
                    }
                    if ui.button("Cancel").clicked() {
                        close = true
                    }
                });
            });
        });
        if before != serde_json::to_string(&p.options).unwrap_or_default() {
            p.changed = Instant::now();
            p.error.clear();
            p.preview_token += 1;
            p.pending = false;
        }
        if p.changed.elapsed() > Duration::from_millis(180) && !p.pending {
            let sizes = self
                .tab()
                .and_then(|t| t.info.as_ref())
                .map(|i| i.sizes.clone())
                .unwrap_or_default();
            match crate::printing::plan(&p.options, &sizes) {
                Ok(sheets) => {
                    p.sheets = sheets.len();
                    p.sheet = p.sheet.min(p.sheets - 1);
                    p.preview_token += 1;
                    p.pending = true;
                    if let Some(t) = self.tab() {
                        t.send(Command::PrintPreview {
                            options: p.options.clone(),
                            sheet: p.sheet,
                            token: p.preview_token,
                        });
                    }
                    p.changed = Instant::now() + Duration::from_secs(86400);
                }
                Err(e) => {
                    p.error = e.to_string();
                    p.changed = Instant::now() + Duration::from_secs(86400);
                }
            }
        }
        if export {
            if let Some(path) = rfd::FileDialog::new()
                .add_filter("PDF document", &["pdf"])
                .set_file_name("print-layout.pdf")
                .save_file()
            {
                if let Some(t) = self.tab() {
                    t.send(Command::ExportPrint {
                        options: p.options.clone(),
                        path,
                    });
                }
            }
        }
        if print {
            if let Some(t) = self.tab() {
                t.send(Command::Print(p.options.clone()));
            }
            close = true;
            self.status = "Preparing print job…".into();
        }
        if !close {
            self.print = Some(p);
            ctx.request_repaint_after(Duration::from_millis(180));
        }
    }
}
impl eframe::App for App {
    fn update(&mut self, ctx: &Context, _: &mut eframe::Frame) {
        self.poll(ctx);
        if ctx.input(|i| i.viewport().close_requested()) && !self.allow_close {
            if let Some(i) = self
                .tabs
                .iter()
                .position(|t| t.info.as_ref().is_some_and(|i| i.dirty))
            {
                ctx.send_viewport_cmd(ViewportCommand::CancelClose);
                self.active = i;
                self.closing = Some(true);
            }
        }
        let typing = ctx.wants_keyboard_input();
        let actions = ctx.input(|i| {
            i.events
                .iter()
                .filter_map(|e| {
                    if let egui::Event::Key {
                        key,
                        modifiers,
                        pressed: true,
                        repeat: false,
                        ..
                    } = e
                    {
                        shortcut(*key, *modifiers, typing, self.settings.single_key_tools)
                    } else {
                        None
                    }
                })
                .collect::<Vec<_>>()
        });
        for a in actions {
            let modal = self.print.is_some()
                || self.edit.is_some()
                || self.ocr.is_some()
                || self.comment.is_some()
                || self.preferences
                || self.closing.is_some()
                || self.annotate.is_some()
                || !self.error.is_empty();
            if !modal || a == Action::Escape {
                self.action(ctx, a);
            }
        }
        let dropped = ctx.input(|i| {
            i.raw
                .dropped_files
                .iter()
                .filter_map(|f| f.path.clone())
                .collect::<Vec<_>>()
        });
        for p in dropped {
            if p.extension().is_some_and(|e| e.eq_ignore_ascii_case("pdf")) {
                self.open(ctx, p);
            }
        }
        self.header(ctx);
        self.find_bar(ctx);
        self.navigation(ctx);
        self.tools(ctx);
        TopBottomPanel::bottom("status").show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.label(&self.status);
                ui.with_layout(Layout::right_to_left(Align::Center), |ui| {
                    ui.small(format!(
                        "Re-Edit PDF {} · native",
                        env!("CARGO_PKG_VERSION")
                    ));
                });
            });
        });
        CentralPanel::default()
            .frame(
                Frame::new().fill(if self.tabs.is_empty() || self.home_visible {
                    ctx.style().visuals.panel_fill
                } else {
                    Color32::from_gray(if self.settings.dark { 40 } else { 220 })
                }),
            )
            .show(ctx, |ui| {
                if self.tabs.is_empty() || self.home_visible {
                    self.home(ctx, ui)
                } else {
                    self.document(ctx, ui)
                }
            });
        self.dialogs(ctx);
        self.ui_test(ctx);
    }
}
impl App {
    fn ui_test(&mut self, ctx: &Context) {
        let Some(directory) = self.test_mode.clone() else {
            return;
        };
        let mut done = false;
        for event in ctx.input(|i| i.events.clone()) {
            if let egui::Event::Screenshot { image, .. } = event {
                let bytes: Vec<_> = image.pixels.iter().flat_map(|p| p.to_array()).collect();
                let _ = image::save_buffer(
                    directory.join(if self.test_stage == 2 {
                        "reader.png"
                    } else {
                        "print.png"
                    }),
                    &bytes,
                    image.size[0] as u32,
                    image.size[1] as u32,
                    image::ColorType::Rgba8,
                );
                if self.test_stage == 2 {
                    self.show_print();
                    self.test_stage = 3;
                } else {
                    done = true;
                }
            }
        }
        if self.test_started.elapsed() > Duration::from_secs(60) {
            self.error = "UI validation timed out".into();
            done = true;
        }
        if self.test_stage == 0
            && self
                .tabs
                .first()
                .is_some_and(|t| !t.textures.is_empty() && !t.texts.is_empty())
        {
            self.test_stage = 1;
            self.test_started = Instant::now();
        }
        if self.test_stage == 1 && self.test_started.elapsed() > Duration::from_millis(300) {
            ctx.send_viewport_cmd(ViewportCommand::Screenshot(Default::default()));
            self.test_stage = 2;
        }
        if self.test_stage == 3
            && self
                .print
                .as_ref()
                .is_some_and(|p| p.preview.is_some() && !p.pending)
        {
            ctx.send_viewport_cmd(ViewportCommand::Screenshot(Default::default()));
            self.test_stage = 4;
        }
        if done {
            let report = serde_json::json!({"reader_rendered":directory.join("reader.png").exists(),"print_preview_rendered":directory.join("print.png").exists(),"errors":self.error,"native_window_decorations":true});
            let _ = std::fs::write(
                directory.join("ui-result.json"),
                serde_json::to_vec_pretty(&report).unwrap(),
            );
            self.allow_close = true;
            ctx.send_viewport_cmd(ViewportCommand::Close);
        }
        ctx.request_repaint_after(Duration::from_millis(80));
    }
}
fn load_texture(ctx: &Context, name: String, image: &Raster) -> TextureHandle {
    ctx.load_texture(
        name,
        ColorImage::from_rgb([image.width, image.height], &image.rgb),
        TextureOptions::LINEAR,
    )
}
fn paint_box(ui: &Ui, page: Rect, zoom: f32, r: Box2, color: Color32) {
    ui.painter().rect_filled(
        Rect::from_min_size(page.min + vec2(r.x, r.y) * zoom, vec2(r.w, r.h) * zoom),
        0.,
        color,
    );
}
fn theme(ctx: &Context, dark: bool) {
    let mut style = Style::default();
    style.visuals = if dark {
        Visuals::dark()
    } else {
        Visuals::light()
    };
    style.spacing.item_spacing = vec2(8., 6.);
    style.spacing.button_padding = vec2(10., 5.);
    style.visuals.selection.bg_fill = Color32::from_rgb(20, 115, 230);
    style.visuals.widgets.active.bg_fill = Color32::from_rgb(20, 115, 230);
    style
        .text_styles
        .insert(TextStyle::Body, FontId::proportional(14.));
    ctx.set_style(style);
}
pub fn icon() -> Option<IconData> {
    let img = image::load_from_memory(include_bytes!("../../build/icon.png"))
        .ok()?
        .into_rgba8();
    Some(IconData {
        width: img.width(),
        height: img.height(),
        rgba: img.into_raw(),
    })
}
