//! Markdown → EPUB 3 export for manuscripts.
//!
//! The exporter produces a small, self-contained book: one XHTML chapter per
//! level-1 heading, a navigation document, book metadata and a minimal reading
//! stylesheet. Images and remote resources are intentionally left out of this
//! first text-only version.

use crate::fs_ops;
use pulldown_cmark::{html, Options, Parser};
use std::fs;
use std::io::{Cursor, Seek, Write};
use std::path::Path;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

const EPUB_MIMETYPE: &str = "application/epub+zip";

struct Chapter {
    title: String,
    html: String,
}

fn escape_xml(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn markdown_html(source: &str) -> String {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_STRIKETHROUGH);
    let parser = Parser::new_ext(source, options);
    let mut output = String::new();
    html::push_html(&mut output, parser);
    output
}

fn chapter_title(source: &str, fallback: &str) -> String {
    for line in source.lines() {
        if let Some(title) = line.strip_prefix('#') {
            let title = title.trim_start_matches('#').trim();
            if !title.is_empty() {
                return title.to_string();
            }
        }
    }
    fallback.to_string()
}

fn split_chapters(content: &str) -> Vec<Chapter> {
    let mut sections: Vec<String> = Vec::new();
    let mut current = String::new();
    for line in content.lines() {
        if line.starts_with("# ") && !current.trim().is_empty() {
            sections.push(std::mem::take(&mut current));
        }
        current.push_str(line);
        current.push('\n');
    }
    if !current.trim().is_empty() {
        sections.push(current);
    }
    if sections.is_empty() {
        sections.push(String::new());
    }
    sections
        .into_iter()
        .enumerate()
        .map(|(index, section)| Chapter {
            title: chapter_title(&section, &format!("Chapter {}", index + 1)),
            html: markdown_html(&section),
        })
        .collect()
}

fn xhtml_document(title: &str, body: &str, language: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="{language}" lang="{language}">
<head><meta charset="utf-8"/><title>{title}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>{body}</body>
</html>"#,
        language = escape_xml(language),
        title = escape_xml(title),
        body = body,
    )
}

fn package_document(
    title: &str,
    author: &str,
    language: &str,
    identifier: &str,
    modified: &str,
    chapters: &[Chapter],
) -> String {
    let manifest = chapters
        .iter()
        .enumerate()
        .map(|(index, _)| {
            format!(
                r#"<item id="ch{index}" href="ch{index:03}.xhtml" media-type="application/xhtml+xml"/>"#,
                index = index + 1
            )
        })
        .collect::<String>();
    let spine = chapters
        .iter()
        .enumerate()
        .map(|(index, _)| format!(r#"<itemref idref="ch{index}"/>"#, index = index + 1))
        .collect::<String>();
    format!(
        r#"<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">{identifier}</dc:identifier>
    <dc:title>{title}</dc:title>
    <dc:creator>{author}</dc:creator>
    <dc:language>{language}</dc:language>
    <meta property="dcterms:modified">{modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="style.css" media-type="text/css"/>
    {manifest}
  </manifest>
  <spine>{spine}</spine>
</package>"#,
        identifier = escape_xml(identifier),
        title = escape_xml(title),
        author = escape_xml(author),
        language = escape_xml(language),
        modified = escape_xml(modified),
        manifest = manifest,
        spine = spine,
    )
}

fn navigation_document(title: &str, language: &str, chapters: &[Chapter]) -> String {
    let entries = chapters
        .iter()
        .enumerate()
        .map(|(index, chapter)| {
            format!(
                r#"<li><a href="ch{index:03}.xhtml">{title}</a></li>"#,
                index = index + 1,
                title = escape_xml(&chapter.title)
            )
        })
        .collect::<String>();
    let body = format!(
        r#"<nav epub:type="toc" id="toc"><h1>{title}</h1><ol>{entries}</ol></nav>"#,
        title = escape_xml(title),
        entries = entries
    );
    // epub:type needs the namespace declared on the document.
    xhtml_document(title, &body, language).replace(
        "<html xmlns=\"http://www.w3.org/1999/xhtml\"",
        "<html xmlns=\"http://www.w3.org/1999/xhtml\" xmlns:epub=\"http://www.idpf.org/2007/ops\"",
    )
}

fn reading_css() -> &'static str {
    r#"body { font-family: Georgia, "Times New Roman", serif; line-height: 1.6; margin: 5%; color: #1e1e1e; }
h1, h2, h3 { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; line-height: 1.25; }
h1 { margin-top: 2em; }
p { margin: 0 0 0.9em; text-indent: 1.4em; }
blockquote { margin: 1em 2em; color: #555; }
nav ol { line-height: 1.8; }
"#
}

fn add_file<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    name: &str,
    data: &str,
    options: SimpleFileOptions,
) -> Result<(), String> {
    zip.start_file(name, options)
        .map_err(|error| format!("Could not add {name}: {error}"))?;
    zip.write_all(data.as_bytes())
        .map_err(|error| format!("Could not write {name}: {error}"))
}

fn build_epub(content: &str, title: &str, author: &str, language: &str) -> Result<Vec<u8>, String> {
    let chapters = split_chapters(content);
    let modified = OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .map_err(|error| format!("Could not create the EPUB timestamp: {error}"))?;
    let identifier = format!("urn:bradbit:{}", modified);

    let mut buffer = Vec::new();
    {
        let mut zip = ZipWriter::new(Cursor::new(&mut buffer));
        let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
        let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

        add_file(&mut zip, "mimetype", EPUB_MIMETYPE, stored)?;
        add_file(
            &mut zip,
            "META-INF/container.xml",
            r#"<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>"#,
            deflated,
        )?;
        add_file(
            &mut zip,
            "OEBPS/package.opf",
            &package_document(title, author, language, &identifier, &modified, &chapters),
            deflated,
        )?;
        add_file(
            &mut zip,
            "OEBPS/nav.xhtml",
            &navigation_document(title, language, &chapters),
            deflated,
        )?;
        add_file(&mut zip, "OEBPS/style.css", reading_css(), deflated)?;
        for (index, chapter) in chapters.iter().enumerate() {
            add_file(
                &mut zip,
                &format!("OEBPS/ch{:03}.xhtml", index + 1),
                &xhtml_document(&chapter.title, &chapter.html, language),
                deflated,
            )?;
        }
        zip.finish()
            .map_err(|error| format!("Could not finish the EPUB: {error}"))?;
    }
    Ok(buffer)
}

/// Exports a Markdown file to `<project>/exports/<relative-folder>/<stem>.epub`.
pub fn export_to_project(
    root: &str,
    rel_path: &str,
    content: &str,
    title: &str,
    author: &str,
    language: &str,
) -> Result<String, String> {
    let lower = rel_path.to_lowercase();
    if !lower.ends_with(".md") && !lower.ends_with(".markdown") && !lower.ends_with(".mdx") {
        return Err("EPUB export is only available for Markdown files".to_string());
    }
    let root_path = fs::canonicalize(root)
        .map_err(|error| format!("Could not open the folder '{}': {}", root, error))?;
    fs_ops::resolve_safe_relative(&root_path, rel_path)?;

    let rel = Path::new(rel_path);
    let stem = rel
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("document");
    let parent = rel.parent().filter(|path| !path.as_os_str().is_empty());
    let output_rel = match parent {
        Some(parent) => Path::new("exports")
            .join(parent)
            .join(format!("{stem}.epub")),
        None => Path::new("exports").join(format!("{stem}.epub")),
    };
    let output = fs_ops::resolve_safe_relative(&root_path, &output_rel.to_string_lossy())?;
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Could not create the export folder: {error}"))?;
    }

    let epub = build_epub(content, title, author, language)?;
    let temp = output.with_extension("epub.tmp");
    fs::write(&temp, epub).map_err(|error| format!("Could not save the EPUB: {error}"))?;
    if let Err(error) = fs::rename(&temp, &output) {
        let _ = fs::remove_file(&temp);
        return Err(format!("Could not save the EPUB: {error}"));
    }
    Ok(output.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::{build_epub, export_to_project};
    use std::fs;
    use std::io::Read;
    use std::path::Path;
    use tempfile::tempdir;
    use zip::ZipArchive;

    #[test]
    fn builds_a_valid_epub_archive_with_chapters() {
        let bytes = build_epub(
            "# Uno\n\nHola.\n\n# Dos\n\nAdiós.\n",
            "Mi libro",
            "Ana",
            "es",
        )
        .unwrap();
        let mut archive = ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
        let mut mimetype = String::new();
        archive
            .by_name("mimetype")
            .unwrap()
            .read_to_string(&mut mimetype)
            .unwrap();
        assert_eq!(mimetype, "application/epub+zip");
        assert!(archive.by_name("META-INF/container.xml").is_ok());
        assert!(archive.by_name("OEBPS/package.opf").is_ok());
        assert!(archive.by_name("OEBPS/ch001.xhtml").is_ok());
        assert!(archive.by_name("OEBPS/ch002.xhtml").is_ok());
    }

    #[test]
    fn writes_the_epub_under_exports() {
        let dir = tempdir().unwrap();
        fs::write(dir.path().join("capitulo.md"), "# Uno\n\nHola.\n").unwrap();
        let output = export_to_project(
            dir.path().to_str().unwrap(),
            "capitulo.md",
            "# Uno\n\nHola.\n",
            "Mi libro",
            "Ana",
            "es",
        )
        .unwrap();
        assert!(output.ends_with("exports/capitulo.epub"));
        assert!(Path::new(&output).is_file());
    }
}
