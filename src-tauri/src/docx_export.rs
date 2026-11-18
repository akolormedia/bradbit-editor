//! Markdown → DOCX export for narrative manuscripts.
//!
//! The output follows the standard manuscript preset requested for the beta:
//! A4, 2.5 cm margins, Times New Roman 12 pt, double spacing, left alignment,
//! 0.5-inch first-line indent, a title page and page numbers.
//!
//! Only narrative Markdown is interpreted: headings, paragraphs, emphasis,
//! blockquotes, lists and scene breaks. Images, tables and MDX components are
//! intentionally outside this first text-only export.

use crate::fs_ops;
use docx_rs::*;
use std::fs;
use std::path::Path;

/// A4 in twips (11906 × 16838), the default Word page size.
const A4_WIDTH: u32 = 11906;
const A4_HEIGHT: u32 = 16838;
/// 2.5 cm in twips.
const MARGIN_TWIPS: i32 = 1417;
/// 1.25 cm header/footer margin.
const HEADER_FOOTER_TWIPS: i32 = 708;
/// 0.5 inch first-line indent.
const FIRST_LINE_TWIPS: i32 = 720;
/// 12 pt = 24 half-points.
const BODY_SIZE_HALF_POINTS: usize = 24;
/// Double spacing = 480 twentieths of a point.
const DOUBLE_SPACING: i32 = 480;

#[derive(Debug, PartialEq, Eq)]
enum Block {
    Heading(u8, String),
    Paragraph(String),
    Quote(String),
    Rule,
    Bullet(String),
    Numbered(String),
}

#[derive(Debug, PartialEq, Eq)]
struct Inline {
    text: String,
    bold: bool,
    italic: bool,
}

fn parse_inline(text: &str) -> Vec<Inline> {
    let chars: Vec<char> = text.chars().collect();
    let mut runs = Vec::new();
    let mut plain = String::new();
    let mut index = 0;

    let push_plain = |runs: &mut Vec<Inline>, plain: &mut String| {
        if !plain.is_empty() {
            runs.push(Inline {
                text: std::mem::take(plain),
                bold: false,
                italic: false,
            });
        }
    };

    while index < chars.len() {
        let double = chars.get(index) == Some(&'*') && chars.get(index + 1) == Some(&'*');
        let double_underscore =
            chars.get(index) == Some(&'_') && chars.get(index + 1) == Some(&'_');
        let single = chars.get(index) == Some(&'*');
        let single_underscore = chars.get(index) == Some(&'_');

        let marker_len = if double || double_underscore {
            2
        } else if single || single_underscore {
            1
        } else {
            plain.push(chars[index]);
            index += 1;
            continue;
        };

        let marker = if double || double_underscore {
            if double {
                '*'
            } else {
                '_'
            }
        } else if single {
            '*'
        } else {
            '_'
        };

        let close = (index + marker_len..chars.len()).find(|&candidate| {
            if candidate + marker_len > chars.len() {
                return false;
            }
            (0..marker_len).all(|offset| chars[candidate + offset] == marker)
        });

        let Some(close) = close else {
            plain.extend(chars[index..index + marker_len].iter());
            index += marker_len;
            continue;
        };

        push_plain(&mut runs, &mut plain);
        let content: String = chars[index + marker_len..close].iter().collect();
        runs.push(Inline {
            text: content,
            bold: marker_len == 2,
            italic: marker_len == 1,
        });
        index = close + marker_len;
    }
    push_plain(&mut runs, &mut plain);
    runs
}

fn parse_blocks(markdown: &str) -> Vec<Block> {
    let mut blocks = Vec::new();
    let mut paragraph = Vec::new();

    let flush = |blocks: &mut Vec<Block>, paragraph: &mut Vec<String>| {
        if !paragraph.is_empty() {
            blocks.push(Block::Paragraph(paragraph.join(" ")));
            paragraph.clear();
        }
    };

    for line in markdown.lines() {
        let trimmed = line.trim_end();
        let text = trimmed.trim_start();

        if text.is_empty() {
            flush(&mut blocks, &mut paragraph);
            continue;
        }

        if text.starts_with('#') {
            let level = text.chars().take_while(|c| *c == '#').count();
            let rest = &text[level..];
            if (1..=6).contains(&level) && rest.starts_with(' ') {
                flush(&mut blocks, &mut paragraph);
                blocks.push(Block::Heading(level as u8, rest.trim().to_string()));
                continue;
            }
        }

        if matches!(text, "---" | "***" | "___") {
            flush(&mut blocks, &mut paragraph);
            blocks.push(Block::Rule);
            continue;
        }

        if let Some(quote) = text.strip_prefix("> ") {
            flush(&mut blocks, &mut paragraph);
            blocks.push(Block::Quote(quote.trim().to_string()));
            continue;
        }

        if let Some(item) = text
            .strip_prefix("- ")
            .or_else(|| text.strip_prefix("* "))
            .or_else(|| text.strip_prefix("+ "))
        {
            flush(&mut blocks, &mut paragraph);
            blocks.push(Block::Bullet(item.trim().to_string()));
            continue;
        }

        if let Some((number, item)) = numbered_item(text) {
            flush(&mut blocks, &mut paragraph);
            blocks.push(Block::Numbered(format!("{number}. {item}")));
            continue;
        }

        paragraph.push(text.to_string());
    }

    flush(&mut blocks, &mut paragraph);
    blocks
}

fn numbered_item(text: &str) -> Option<(usize, String)> {
    let digits = text.chars().take_while(|c| c.is_ascii_digit()).count();
    if digits == 0 {
        return None;
    }
    let rest = &text[digits..];
    let rest = rest.strip_prefix(". ")?;
    let number = text[..digits].parse().ok()?;
    Some((number, rest.trim().to_string()))
}

fn text_run(text: &str, bold: bool, italic: bool, size: usize) -> Run {
    let mut run = Run::new()
        .add_text(text.to_string())
        .fonts(RunFonts::new().ascii("Times New Roman"))
        .size(size);
    if bold {
        run = run.bold();
    }
    if italic {
        run = run.italic();
    }
    run
}

fn inline_paragraph(paragraph: Paragraph, text: &str, size: usize) -> Paragraph {
    let mut paragraph = paragraph;
    for run in parse_inline(text) {
        paragraph = paragraph.add_run(text_run(&run.text, run.bold, run.italic, size));
    }
    paragraph
}

fn body_paragraph(text: &str) -> Paragraph {
    let paragraph = Paragraph::new()
        .align(AlignmentType::Left)
        .line_spacing(LineSpacing::new().line(DOUBLE_SPACING))
        .indent(
            None,
            Some(SpecialIndentType::FirstLine(FIRST_LINE_TWIPS)),
            None,
            None,
        );
    inline_paragraph(paragraph, text, BODY_SIZE_HALF_POINTS)
}

fn heading_paragraph(level: u8, text: &str, page_break: bool) -> Paragraph {
    let size = match level {
        1 => 32,
        2 => 28,
        _ => 24,
    };
    let paragraph = Paragraph::new()
        .align(AlignmentType::Left)
        .line_spacing(LineSpacing::new().line(DOUBLE_SPACING))
        .page_break_before(page_break);
    inline_paragraph(paragraph, text, size)
}

fn build_document(markdown: &str, title: &str, author: &str) -> Result<Docx, String> {
    if markdown.trim().is_empty() {
        return Err("The Markdown document is empty".to_string());
    }

    let mut docx = Docx::new()
        .page_size(A4_WIDTH, A4_HEIGHT)
        .page_margin(PageMargin {
            top: MARGIN_TWIPS,
            left: MARGIN_TWIPS,
            bottom: MARGIN_TWIPS,
            right: MARGIN_TWIPS,
            header: HEADER_FOOTER_TWIPS,
            footer: HEADER_FOOTER_TWIPS,
            gutter: 0,
        })
        .default_fonts(RunFonts::new().ascii("Times New Roman"))
        .default_size(BODY_SIZE_HALF_POINTS)
        .default_spacing(DOUBLE_SPACING);

    // Title page.
    docx = docx.add_paragraph(
        Paragraph::new()
            .align(AlignmentType::Center)
            .add_run(text_run(title, true, false, 48)),
    );
    docx = docx.add_paragraph(
        Paragraph::new()
            .align(AlignmentType::Center)
            .add_run(text_run(author, false, false, 24)),
    );
    for _ in 0..6 {
        docx = docx.add_paragraph(Paragraph::new());
    }
    docx = docx.add_paragraph(Paragraph::new().add_run(Run::new().add_break(BreakType::Page)));

    let mut first_heading = true;
    for block in parse_blocks(markdown) {
        match block {
            Block::Heading(level, text) => {
                let page_break = level == 1 && !first_heading;
                first_heading = false;
                docx = docx.add_paragraph(heading_paragraph(level, &text, page_break));
            }
            Block::Paragraph(text) => {
                docx = docx.add_paragraph(body_paragraph(&text));
            }
            Block::Quote(text) => {
                let paragraph = Paragraph::new()
                    .align(AlignmentType::Left)
                    .line_spacing(LineSpacing::new().line(DOUBLE_SPACING))
                    .indent(Some(720), None, Some(720), None);
                docx =
                    docx.add_paragraph(inline_paragraph(paragraph, &text, BODY_SIZE_HALF_POINTS));
            }
            Block::Rule => {
                docx = docx.add_paragraph(
                    Paragraph::new()
                        .align(AlignmentType::Center)
                        .line_spacing(LineSpacing::new().line(DOUBLE_SPACING))
                        .add_run(text_run("* * *", false, false, BODY_SIZE_HALF_POINTS)),
                );
            }
            Block::Bullet(text) => {
                docx = docx.add_paragraph(body_paragraph(&format!("• {text}")));
            }
            Block::Numbered(text) => {
                docx = docx.add_paragraph(body_paragraph(&text));
            }
        }
    }

    docx = docx.footer(
        Footer::new().add_paragraph(
            Paragraph::new()
                .align(AlignmentType::Center)
                .add_page_num(PageNum::new()),
        ),
    );

    Ok(docx)
}

/// Exports a Markdown file to `<project>/exports/<relative-folder>/<stem>.docx`.
pub fn export_to_project(
    root: &str,
    rel_path: &str,
    content: &str,
    title: &str,
    author: &str,
) -> Result<String, String> {
    let lower = rel_path.to_lowercase();
    if !lower.ends_with(".md") && !lower.ends_with(".markdown") && !lower.ends_with(".mdx") {
        return Err("DOCX export is only available for Markdown files".to_string());
    }

    let root_path = fs::canonicalize(root)
        .map_err(|e| format!("Could not open the folder '{}': {}", root, e))?;
    if !root_path.is_dir() {
        return Err(format!("The path '{}' is not a folder", root));
    }
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
            .join(format!("{stem}.docx")),
        None => Path::new("exports").join(format!("{stem}.docx")),
    };
    let output = fs_ops::resolve_safe_relative(&root_path, &output_rel.to_string_lossy())?;
    if let Some(parent) = output.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Could not create the export folder: {}", e))?;
    }

    let docx = build_document(content, title, author)?;
    let temp = output.with_extension("docx.tmp");
    let file = fs::File::create(&temp).map_err(|e| format!("Could not create the DOCX: {}", e))?;
    docx.pack(file)
        .map_err(|e| format!("Could not write the DOCX: {}", e))?;
    if let Err(err) = fs::rename(&temp, &output) {
        let _ = fs::remove_file(&temp);
        return Err(format!("Could not save the DOCX: {}", err));
    }
    Ok(output.to_string_lossy().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;

    #[test]
    fn parses_narrative_blocks_and_inline_emphasis() {
        let blocks = parse_blocks(
            "# Chapter One\n\n## Scene\n\nRain hit the windows. **Mara** left *quietly*.\n\n> A quote\n\n---\n\n- item",
        );
        assert_eq!(
            blocks,
            vec![
                Block::Heading(1, "Chapter One".to_string()),
                Block::Heading(2, "Scene".to_string()),
                Block::Paragraph("Rain hit the windows. **Mara** left *quietly*.".to_string()),
                Block::Quote("A quote".to_string()),
                Block::Rule,
                Block::Bullet("item".to_string()),
            ]
        );
        let runs = parse_inline("**Mara** left *quietly*.");
        assert!(runs.iter().any(|run| run.text == "Mara" && run.bold));
        assert!(runs.iter().any(|run| run.text == "quietly" && run.italic));
    }

    #[test]
    fn writes_a_docx_into_the_exports_folder() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        fs::create_dir_all(dir.path().join("manuscript")).unwrap();
        fs::write(
            dir.path().join("manuscript/chapter.md"),
            "# Chapter One\n\nMara left the letter.",
        )
        .unwrap();

        let output = export_to_project(
            root,
            "manuscript/chapter.md",
            "# Chapter One\n\nMara left the letter.",
            "The House of Tides",
            "Rafael Olivares",
        )
        .unwrap();
        assert!(output.contains("exports/manuscript/chapter.docx"));

        let bytes = fs::read(&output).unwrap();
        assert!(bytes.starts_with(b"PK"));
        let cursor = std::io::Cursor::new(bytes);
        let mut archive = zip::ZipArchive::new(cursor).unwrap();
        let mut document = String::new();
        archive
            .by_name("word/document.xml")
            .unwrap()
            .read_to_string(&mut document)
            .unwrap();
        assert!(document.contains("The House of Tides"));
        assert!(document.contains("Chapter One"));
        assert!(document.contains("Mara left the letter."));
    }

    #[test]
    fn rejects_non_markdown_paths() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().to_str().unwrap();
        assert!(export_to_project(root, "script/scene.fountain", "x", "t", "a").is_err());
    }
}
