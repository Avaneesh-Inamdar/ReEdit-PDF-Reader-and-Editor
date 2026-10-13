//! Standalone verifier using the same Minisign verifier as the updater. Build
//! with rustc --extern minisign_verify=<cached rlib>, then pass a release folder.
use std::{fs,io::Read,path::Path};
use minisign_verify::{PublicKey,Signature};
fn main()->Result<(),Box<dyn std::error::Error>> {
    let directory=std::env::args().nth(1).ok_or("Pass the release folder")?;
    let directory=Path::new(&directory);
    let key=PublicKey::from_file(&directory.join("re-edit-pdf-updater.pub"))?;
    let version=std::env::args().nth(2).ok_or("Pass the expected app version")?;
    let minimum=std::env::args().nth(3).map(|value|value.parse::<usize>()).transpose()?.unwrap_or(7);
    let mut count=0;
    for entry in fs::read_dir(directory)? {
        let path=entry?.path();if path.extension().is_none_or(|ext|ext!="minisig"){continue}
        let signature=Signature::from_file(&path)?;
        let comment=signature.trusted_comment().replace("\\t","\t").replace("\\n","\n");
        let signed_version=comment.split('\t').find_map(|part|part.strip_prefix("version:")).map(str::trim);
        if signed_version != Some(version.as_str()) {
            return Err("Signature version does not match the release".into())
        }
        let asset=path.with_extension("");let mut file=fs::File::open(&asset)?;
        let mut verifier=key.verify_stream(&signature)?;let mut buffer=vec![0;1024*1024];
        loop {let length=file.read(&mut buffer)?;if length==0{break}verifier.update(&buffer[..length]);}
        verifier.finalize()?;println!("Verified {}",asset.file_name().unwrap().to_string_lossy());count+=1;
    }
    if count<minimum {return Err("Not all expected artifacts were verified".into())} Ok(())
}
