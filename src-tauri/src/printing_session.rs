use anyhow::{Context, Result, ensure};
use base64::Engine as _;
use re_edit_pdf_native::{
    engine::Engine,
    printing::{PrintOptions, plan},
};
use serde::Serialize;
use std::{
    collections::HashMap,
    io::Cursor,
    sync::{
        Mutex,
        atomic::{AtomicU64, Ordering},
        mpsc,
    },
};

enum Job {
    Preview(PrintOptions, usize, mpsc::Sender<Result<Preview>>),
    Export(PrintOptions, mpsc::Sender<Result<Vec<u8>>>),
    Print(PrintOptions, mpsc::Sender<Result<()>>),
}
#[derive(Default)]
pub struct Sessions {
    next: AtomicU64,
    jobs: Mutex<HashMap<String, mpsc::SyncSender<Job>>>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Preview {
    image: String,
    sheets: usize,
    width: f32,
    height: f32,
}
impl Sessions {
    #[cfg(feature = "desktop-test")]
    pub fn count(&self) -> usize {
        self.jobs.lock().unwrap().len()
    }
    pub fn begin(&self, bytes: Vec<u8>) -> Result<String> {
        let mut sessions = self.jobs.lock().unwrap();
        ensure!(sessions.len() < 4, "Close another print dialog first");
        let id = format!("print-{}", self.next.fetch_add(1, Ordering::Relaxed));
        let (send, receive) = mpsc::sync_channel::<Job>(2);
        let (ready, wait) = mpsc::channel();
        sessions.insert(id.clone(), send);
        drop(sessions);
        let spawned=std::thread::Builder::new().name("pdf-print".into()).spawn(move||{
            let opened=(||->Result<_>{let dir=tempfile::tempdir()?;let path=dir.path().join("source.pdf");std::fs::write(&path,bytes)?;let document=Engine::open(&path)?;let sizes=document.info()?.sizes;Ok((dir,document,sizes))})();
            let (dir,document,sizes)=match opened{Ok(value)=>{let _=ready.send(Ok(()));value},Err(error)=>{let _=ready.send(Err(error));return}};
            for job in receive{match job{
                Job::Preview(options,index,reply)=>{let result=(||->Result<Preview>{let sheets=plan(&options,&sizes)?;let sheet=sheets.get(index.min(sheets.len()-1)).context("No printed sheet")?;
                    let path=dir.path().join("preview.pdf");document.write_print_sheets(&options,std::slice::from_ref(sheet),&path)?;let engine=Engine::open(&path)?;
                    let raster=engine.render(0,(1000./sheet.size[0]).min(1200./sheet.size[1]))?;let mut rgb=raster.rgb;
                    if !options.color{for pixel in rgb.chunks_exact_mut(3){let y=(pixel[0]as f32*0.2126+pixel[1]as f32*0.7152+pixel[2]as f32*0.0722)as u8;pixel.fill(y)}}
                    let image=image::RgbImage::from_raw(raster.width as u32,raster.height as u32,rgb).context("Invalid preview image")?;let mut png=Cursor::new(Vec::new());image.write_to(&mut png,image::ImageFormat::Png)?;
                    Ok(Preview{image:format!("data:image/png;base64,{}",base64::engine::general_purpose::STANDARD.encode(png.into_inner())),sheets:sheets.len(),width:sheet.size[0],height:sheet.size[1]})})();let _=reply.send(result);
                },
                Job::Export(options,reply)=>{let result=(||{ensure!(options.color,"Grayscale output requires a printer; select Color to save a vector PDF");let path=dir.path().join("export.pdf");document.print_pdf(&options,&path)?;Ok(std::fs::read(path)?)})();let _=reply.send(result);},
                Job::Print(options,reply)=>{let result=(||{let path=dir.path().join("job.pdf");document.print_pdf(&options,&path)?;re_edit_pdf_native::platform_print::submit(&path,&options)})();let _=reply.send(result);}
            }}
        });
        if let Err(error) = spawned {
            self.close(&id);
            return Err(error.into());
        }
        match wait.recv() {
            Ok(Ok(())) => Ok(id),
            Ok(Err(error)) => {
                self.close(&id);
                Err(error)
            }
            Err(error) => {
                self.close(&id);
                Err(error.into())
            }
        }
    }
    fn sender(&self, id: &str) -> Result<mpsc::SyncSender<Job>> {
        self.jobs
            .lock()
            .unwrap()
            .get(id)
            .cloned()
            .context("Print session is closed")
    }
    pub fn preview(&self, id: &str, options: PrintOptions, sheet: usize) -> Result<Preview> {
        let (tx, rx) = mpsc::channel();
        self.sender(id)?.send(Job::Preview(options, sheet, tx))?;
        rx.recv()?
    }
    pub fn export(&self, id: &str, options: PrintOptions) -> Result<Vec<u8>> {
        let (tx, rx) = mpsc::channel();
        self.sender(id)?.send(Job::Export(options, tx))?;
        rx.recv()?
    }
    pub fn print(&self, id: &str, options: PrintOptions) -> Result<()> {
        let (tx, rx) = mpsc::channel();
        self.sender(id)?.send(Job::Print(options, tx))?;
        rx.recv()?
    }
    pub fn close(&self, id: &str) {
        self.jobs.lock().unwrap().remove(id);
    }
}
