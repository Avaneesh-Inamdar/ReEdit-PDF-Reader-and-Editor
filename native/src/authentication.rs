//! Passwords and decrypted working copies live only in memory. Saving grafts
//! the edited object graph into the authenticated source so MuPDF can retain
//! its original encryption, owner password, and permission flags.
use anyhow::{Result, ensure};
use mupdf::pdf::{Encryption, PdfDocument, PdfWriteOptions, Permission};

pub const INCORRECT_PASSWORD: &str = "PDF_PASSWORD_INCORRECT";
pub const PASSWORD_REQUIRED: &str = "PDF_PASSWORD_REQUIRED";
pub const OWNER_PASSWORD_REQUIRED: &str = "PDF_OWNER_PASSWORD_REQUIRED";

pub fn security(bytes: &[u8]) -> Result<(bool, bool)> {
    let doc = PdfDocument::from_bytes(bytes)?;
    let encrypted = doc.trailer()?.get_dict("Encrypt")?.is_some();
    Ok((encrypted, doc.needs_password()?))
}
pub fn source_permissions(bytes: &[u8]) -> Result<Vec<u32>> {
    let doc = PdfDocument::from_bytes(bytes)?;
    let permissions = doc.permissions();
    Ok([
        Permission::PRINT,
        Permission::MODIFY,
        Permission::COPY,
        Permission::ANNOTATE,
        Permission::FORM,
        Permission::ACCESSIBILITY,
        Permission::ASSEMBLE,
        Permission::PRINT_HQ,
    ]
    .into_iter()
    .filter(|flag| permissions.contains(Permission::from_bits_retain(flag.bits())))
    .map(|flag| flag.bits())
    .collect())
}

// Deliberately does not implement Debug or Serialize.
pub struct Protection {
    source: Vec<u8>,
    password: Vec<u8>,
}
impl Drop for Protection {
    fn drop(&mut self) {
        self.password.fill(0);
    }
}
impl Protection {
    pub fn unlock(source: Vec<u8>, password: Option<&str>) -> Result<(Self, Vec<u8>)> {
        let mut doc = PdfDocument::from_bytes(&source)?;
        let required = doc.needs_password()?;
        if let Some(password) = password {
            ensure!(doc.authenticate(password)?, INCORRECT_PASSWORD);
        } else {
            ensure!(!required, PASSWORD_REQUIRED);
        }
        ensure!(
            doc.permissions().contains(Permission::all()),
            OWNER_PASSWORD_REQUIRED
        );
        let mut options = PdfWriteOptions::default();
        options
            .set_encryption(Encryption::None)
            .set_compress(true)
            .set_garbage_level(4);
        let mut working = Vec::new();
        doc.write_to_with_options(&mut working, options)?;
        Ok((
            Self {
                source,
                password: password.unwrap_or("").as_bytes().to_vec(),
            },
            working,
        ))
    }

    pub fn protect(&self, working: &[u8]) -> Result<Vec<u8>> {
        let mut source = PdfDocument::from_bytes(&self.source)?;
        if source.needs_password()? {
            let password = std::str::from_utf8(&self.password)?;
            ensure!(source.authenticate(password)?, INCORRECT_PASSWORD);
        }
        let edited = PdfDocument::from_bytes(working)?;
        ensure!(!edited.needs_password()?, "The working PDF is still locked");
        // One graft map preserves shared references, form fields, outlines,
        // attachments, and metadata along with every edited page object.
        let mut graft = source.new_graft_map()?;
        let root = graft.graft_object(&edited.catalog()?)?;
        let info = edited
            .trailer()?
            .get_dict("Info")?
            .map(|info| graft.graft_object(&info))
            .transpose()?;
        // Grafting creates an incremental xref and may replace its trailer.
        // Obtain the destination trailer after all copied objects exist.
        let mut trailer = source.trailer()?;
        trailer.dict_put("Root", root)?;
        if let Some(info) = info {
            trailer.dict_put("Info", info)?;
        } else {
            trailer.dict_delete("Info")?;
        }
        let mut options = PdfWriteOptions::default();
        options
            .set_encryption(Encryption::Keep)
            .set_compress(true)
            .set_garbage_level(4);
        let mut bytes = Vec::new();
        source.write_to_with_options(&mut bytes, options)?;
        Ok(bytes)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use mupdf::{
        Point, Size, TextPageFlags,
        pdf::Permission,
        shape::{Shape, TextOptions},
    };

    fn encrypted(encryption: Encryption, user: &str) -> Vec<u8> {
        let mut doc = PdfDocument::new();
        let mut page = doc.new_page(Size::A4).unwrap();
        Shape::new(&mut page)
            .unwrap()
            .insert_text(
                Point::new(72., 100.),
                "Original protected text",
                &TextOptions::default(),
            )
            .unwrap()
            .commit(&mut doc, true)
            .unwrap();
        let mut options = PdfWriteOptions::default();
        options
            .set_encryption(encryption)
            .set_user_password(user)
            .set_owner_password("owner-secret")
            .set_permissions(Permission::all());
        let mut bytes = Vec::new();
        doc.write_to_with_options(&mut bytes, options).unwrap();
        bytes
    }

    #[test]
    fn rejects_missing_and_incorrect_passwords_without_returning_working_bytes() {
        let source = encrypted(Encryption::Aes256, "open-secret");
        assert_eq!(security(&source).unwrap(), (true, true));
        assert_eq!(
            Protection::unlock(source.clone(), None)
                .err()
                .unwrap()
                .to_string(),
            PASSWORD_REQUIRED
        );
        assert_eq!(
            Protection::unlock(source, Some("incorrect"))
                .err()
                .unwrap()
                .to_string(),
            INCORRECT_PASSWORD
        );
    }

    #[test]
    fn edited_saved_copies_keep_both_passwords_permissions_and_content() {
        for encryption in [Encryption::Aes128, Encryption::Aes256, Encryption::Rc4_128] {
            let source = encrypted(encryption, "open-secret");
            let (protection, working) =
                Protection::unlock(source.clone(), Some("open-secret")).unwrap();
            assert_eq!(security(&working).unwrap(), (false, false));
            let mut edited = PdfDocument::from_bytes(&working).unwrap();
            let mut page = edited.load_pdf_page(0).unwrap();
            Shape::new(&mut page)
                .unwrap()
                .insert_text(Point::new(72., 140.), "Saved edit", &TextOptions::default())
                .unwrap()
                .commit(&mut edited, true)
                .unwrap();
            let mut working = Vec::new();
            edited
                .write_to_with_options(&mut working, PdfWriteOptions::default())
                .unwrap();
            assert!(
                PdfDocument::from_bytes(&working)
                    .unwrap()
                    .load_page(0)
                    .unwrap()
                    .to_text_page(TextPageFlags::empty())
                    .unwrap()
                    .to_text()
                    .unwrap()
                    .contains("Saved edit"),
                "Working edit did not serialize"
            );
            let saved = protection.protect(&working).unwrap();
            assert_eq!(security(&saved).unwrap(), (true, true));
            assert!(Protection::unlock(saved.clone(), Some("incorrect")).is_err());
            for password in ["open-secret", "owner-secret"] {
                let mut reopened = PdfDocument::from_bytes(&saved).unwrap();
                assert!(reopened.authenticate(password).unwrap());
                let text = reopened
                    .load_page(0)
                    .unwrap()
                    .to_text_page(TextPageFlags::empty())
                    .unwrap()
                    .to_text()
                    .unwrap();
                assert!(
                    text.contains("Original protected text") && text.contains("Saved edit"),
                    "Saved text: {text:?}"
                );
            }
            let mut original = PdfDocument::from_bytes(&source).unwrap();
            original.authenticate("open-secret").unwrap();
            let mut reopened = PdfDocument::from_bytes(&saved).unwrap();
            reopened.authenticate("open-secret").unwrap();
            assert_eq!(original.permissions().bits(), reopened.permissions().bits());
            assert_eq!(
                original.metadata(mupdf::MetadataName::Encryption).unwrap(),
                reopened.metadata(mupdf::MetadataName::Encryption).unwrap()
            );
        }
    }

    #[test]
    fn owner_only_protection_is_editable_and_stays_protected_after_save() {
        let source = encrypted(Encryption::Aes256, "");
        assert_eq!(security(&source).unwrap(), (true, false));
        let (protection, working) = Protection::unlock(source, None).unwrap();
        let saved = protection.protect(&working).unwrap();
        assert_eq!(security(&saved).unwrap(), (true, false));
        let mut reopened = PdfDocument::from_bytes(&saved).unwrap();
        assert!(reopened.authenticate("owner-secret").unwrap());
    }

    #[test]
    fn restricted_user_password_does_not_grant_editing_but_owner_password_does() {
        let source = encrypted(Encryption::Aes256, "open-secret");
        let mut doc = PdfDocument::from_bytes(&source).unwrap();
        doc.authenticate("owner-secret").unwrap();
        let mut options = PdfWriteOptions::default();
        options
            .set_encryption(Encryption::Aes256)
            .set_user_password("open-secret")
            .set_owner_password("owner-secret")
            .set_permissions(Permission::PRINT);
        let mut restricted = Vec::new();
        doc.write_to_with_options(&mut restricted, options).unwrap();
        assert_eq!(
            source_permissions(&restricted).unwrap(),
            vec![Permission::PRINT.bits()]
        );
        assert_eq!(
            Protection::unlock(restricted.clone(), Some("open-secret"))
                .err()
                .unwrap()
                .to_string(),
            OWNER_PASSWORD_REQUIRED
        );
        let (protection, working) = Protection::unlock(restricted, Some("owner-secret")).unwrap();
        let saved = protection.protect(&working).unwrap();
        let mut reopened = PdfDocument::from_bytes(&saved).unwrap();
        assert!(reopened.authenticate("open-secret").unwrap());
        assert!(!reopened.permissions().contains(Permission::MODIFY));
    }
}
