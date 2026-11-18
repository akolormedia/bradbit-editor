//! A small, deterministic A4 PDF renderer for narrative Markdown.
//!
//! This is the book counterpart of the screenplay PDF renderer: proportional
//! Times fonts, A4, 2.5 cm margins, chapter page breaks, a title page and page
//! numbers. It intentionally favors predictable basic printing over advanced
//! typesetting (no hyphenation, images or PDF/X).

use crate::fountain::pdf::winansi;
use pdf_writer::{Content, Name, Pdf, Rect, Ref, Str};

const PAGE_W: f32 = 595.0;
const PAGE_H: f32 = 842.0;
const MARGIN: f32 = 71.0;
const TOP: f32 = 71.0;
const LEADING: f32 = 18.0;
const TITLE_SIZE: f32 = 20.0;
const BODY_SIZE: f32 = 12.0;
const HEADING_SIZE: f32 = 14.0;
const BODY_COLS: usize = 78;
const HEADING_COLS: usize = 72;

#[derive(Default)]
struct Page {
    lines: Vec<Line>,
}

struct Line {
    text: String,
    size: f32,
    bold: bool,
    centered: bool,
    indented: bool,
}

#[derive(Debug, PartialEq, Eq)]
enum Block {
    Heading(u8, String),
    Paragraph(String),
    Rule,
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
        let line = line.trim_end();
        let text = line.trim_start();
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
            blocks.push(Block::Paragraph(format!("“{}”", quote.trim())));
            continue;
        }
        if let Some(item) = text
            .strip_prefix("- ")
            .or_else(|| text.strip_prefix("* "))
            .or_else(|| text.strip_prefix("+ "))
        {
            flush(&mut blocks, &mut paragraph);
            blocks.push(Block::Paragraph(format!("• {}", item.trim())));
            continue;
        }
        paragraph.push(text.to_string());
    }
    flush(&mut blocks, &mut paragraph);
    blocks
}

fn clean_inline(text: &str) -> String {
    text.replace("**", "")
        .replace("__", "")
        .replace(['*', '_'], "")
}

fn wrap(text: &str, cols: usize) -> Vec<String> {
    let mut lines = Vec::new();
    let mut current = String::new();
    for word in text.split_whitespace() {
        if current.is_empty() {
            current.push_str(word);
        } else if current.chars().count() + 1 + word.chars().count() <= cols {
            current.push(' ');
            current.push_str(word);
        } else {
            lines.push(std::mem::take(&mut current));
            current.push_str(word);
        }
    }
    if !current.is_empty() {
        lines.push(current);
    }
    lines
}

struct Builder {
    pages: Vec<Page>,
    current: Page,
    indent_next: bool,
}

impl Builder {
    fn new() -> Self {
        Self {
            pages: Vec::new(),
            current: Page::default(),
            indent_next: false,
        }
    }

    fn new_page(&mut self) {
        if !self.current.lines.is_empty() {
            self.pages.push(std::mem::take(&mut self.current));
        }
    }

    fn push(&mut self, line: Line) {
        if self.current.lines.len() >= 42 {
            self.new_page();
        }
        self.current.lines.push(line);
    }

    fn blank(&mut self) {
        let has_text = self
            .current
            .lines
            .last()
            .is_some_and(|line| !line.text.is_empty());
        if has_text {
            self.push(Line {
                text: String::new(),
                size: BODY_SIZE,
                bold: false,
                centered: false,
                indented: false,
            });
        }
    }

    fn paragraph(&mut self, text: &str) {
        let indent = self.indent_next;
        for (index, line) in wrap(&clean_inline(text), BODY_COLS).into_iter().enumerate() {
            self.push(Line {
                text: line,
                size: BODY_SIZE,
                bold: false,
                centered: false,
                indented: indent && index == 0,
            });
        }
        self.indent_next = true;
    }

    fn heading(&mut self, level: u8, text: &str) {
        if level == 1 {
            self.new_page();
        } else {
            self.blank();
        }
        let size = if level == 1 { HEADING_SIZE } else { BODY_SIZE };
        for line in wrap(&clean_inline(text), HEADING_COLS) {
            self.push(Line {
                text: line,
                size,
                bold: true,
                centered: true,
                indented: false,
            });
        }
        self.push(Line {
            text: String::new(),
            size: BODY_SIZE,
            bold: false,
            centered: false,
            indented: false,
        });
        self.indent_next = false;
    }

    fn finish(mut self) -> Vec<Page> {
        self.new_page();
        self.pages
    }
}

fn build_pages(chapters: &[(String, String)]) -> Vec<Page> {
    let mut builder = Builder::new();
    for (index, (_, markdown)) in chapters.iter().enumerate() {
        if index > 0 {
            builder.new_page();
        }
        builder.indent_next = false;
        for block in parse_blocks(markdown) {
            match block {
                Block::Heading(level, text) => builder.heading(level, &text),
                Block::Paragraph(text) => builder.paragraph(&text),
                Block::Rule => {
                    builder.blank();
                    builder.push(Line {
                        text: "* * *".to_string(),
                        size: BODY_SIZE,
                        bold: false,
                        centered: true,
                        indented: false,
                    });
                    builder.push(Line {
                        text: String::new(),
                        size: BODY_SIZE,
                        bold: false,
                        centered: false,
                        indented: false,
                    });
                    builder.indent_next = false;
                }
            }
        }
    }
    builder.finish()
}

fn write_pdf(title: &str, author: &str, pages: &[Page]) -> Vec<u8> {
    let mut pdf = Pdf::new();
    let mut alloc = Ref::new(1);
    let catalog = alloc.bump();
    let page_tree = alloc.bump();
    let normal = alloc.bump();
    let bold = alloc.bump();

    pdf.catalog(catalog).pages(page_tree);
    pdf.type1_font(normal)
        .base_font(Name(b"Times-Roman"))
        .encoding_predefined(Name(b"WinAnsiEncoding"));
    pdf.type1_font(bold)
        .base_font(Name(b"Times-Bold"))
        .encoding_predefined(Name(b"WinAnsiEncoding"));

    let mut page_ids = Vec::new();

    // Title page.
    {
        let page_id = alloc.bump();
        let content_id = alloc.bump();
        page_ids.push(page_id);
        let mut content = Content::new();
        content.begin_text();
        let display_title = if title.trim().is_empty() {
            "Untitled"
        } else {
            title
        };
        let mut y = 640.0;
        content.set_font(Name(b"F2"), TITLE_SIZE);
        for line in wrap(&clean_inline(display_title), 38) {
            content.set_text_matrix([1.0, 0.0, 0.0, 1.0, centered_x(&line, TITLE_SIZE), y]);
            content.show(Str(&winansi(&line)));
            y -= 28.0;
        }
        y -= 24.0;
        content.set_font(Name(b"F1"), BODY_SIZE);
        for line in wrap(&clean_inline(author), 48) {
            content.set_text_matrix([1.0, 0.0, 0.0, 1.0, centered_x(&line, BODY_SIZE), y]);
            content.show(Str(&winansi(&line)));
            y -= LEADING;
        }
        content.end_text();
        let stream = content.finish();
        pdf.stream(content_id, &stream);
        let mut writer = pdf.page(page_id);
        writer.media_box(Rect::new(0.0, 0.0, PAGE_W, PAGE_H));
        writer.parent(page_tree);
        writer.contents(content_id);
        writer
            .resources()
            .fonts()
            .pair(Name(b"F1"), normal)
            .pair(Name(b"F2"), bold);
    }

    for (page_index, page) in pages.iter().enumerate() {
        let page_id = alloc.bump();
        let content_id = alloc.bump();
        page_ids.push(page_id);
        let mut content = Content::new();
        content.begin_text();
        for (index, line) in page.lines.iter().enumerate() {
            if line.text.is_empty() {
                continue;
            }
            let font = if line.bold { Name(b"F2") } else { Name(b"F1") };
            let x = if line.centered {
                centered_x(&line.text, line.size)
            } else if line.indented {
                MARGIN + BODY_SIZE * 1.5
            } else {
                MARGIN
            };
            let y = PAGE_H - TOP - ((index + 1) as f32) * LEADING;
            content.set_font(font, line.size);
            content.set_text_matrix([1.0, 0.0, 0.0, 1.0, x, y]);
            content.show(Str(&winansi(&line.text)));
        }
        let number = format!("{}", page_index + 1);
        let number_width = number.chars().count() as f32 * 3.2;
        content.set_font(Name(b"F1"), 9.0);
        content.set_text_matrix([1.0, 0.0, 0.0, 1.0, (PAGE_W - number_width) / 2.0, 35.0]);
        content.show(Str(&winansi(&number)));
        content.end_text();
        let stream = content.finish();
        pdf.stream(content_id, &stream);
        let mut writer = pdf.page(page_id);
        writer.media_box(Rect::new(0.0, 0.0, PAGE_W, PAGE_H));
        writer.parent(page_tree);
        writer.contents(content_id);
        writer
            .resources()
            .fonts()
            .pair(Name(b"F1"), normal)
            .pair(Name(b"F2"), bold);
    }

    pdf.pages(page_tree)
        .kids(page_ids)
        .count((pages.len() + 1) as i32);
    pdf.finish()
}

fn centered_x(text: &str, size: f32) -> f32 {
    let approx = text.chars().count() as f32 * size * 0.45;
    ((PAGE_W - approx) / 2.0).max(MARGIN)
}

/// Renders one or more Markdown chapters as a single A4 book PDF.
pub fn export(chapters: &[(String, String)], title: &str, author: &str) -> Result<Vec<u8>, String> {
    if chapters
        .iter()
        .all(|(_, content)| content.trim().is_empty())
    {
        return Err("The selected folder has no Markdown text".to_string());
    }
    Ok(write_pdf(title, author, &build_pages(chapters)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_a4_book_pdf_with_title_and_chapter() {
        let chapters = vec![(
            "chapter.md".to_string(),
            "# Chapter One\n\nMara left the letter.\n\n---\n\nLast line.".to_string(),
        )];
        let bytes = export(&chapters, "The House of Tides", "Rafael Olivares").unwrap();
        assert!(bytes.starts_with(b"%PDF-"));
        assert!(bytes.windows(5).any(|window| window == b"%%EOF"));
        let text = String::from_utf8_lossy(&bytes);
        assert!(text.contains("The House of Tides"));
        assert!(text.contains("Mara left the letter."));
    }

    #[test]
    fn joins_chapters_and_handles_empty_input() {
        let chapters = vec![
            ("01.md".to_string(), "# One\n\nFirst.".to_string()),
            ("02.md".to_string(), "# Two\n\nSecond.".to_string()),
        ];
        assert!(export(&chapters, "Book", "Author").unwrap().len() > 1000);
        assert!(export(
            &[("empty.md".to_string(), " \n".to_string())],
            "Book",
            "Author"
        )
        .is_err());
    }

    #[test]
    fn starts_chapters_on_new_pages_but_keeps_subheadings_flowing() {
        let chapters = vec![
            (
                "01.md".to_string(),
                "# One\n\nFirst.\n\n## A scene\n\nStill the same page.\n\nA second paragraph."
                    .to_string(),
            ),
            ("02.md".to_string(), "# Two\n\nSecond.".to_string()),
        ];
        let pages = build_pages(&chapters);
        assert_eq!(pages.len(), 2);
        let first = pages[0]
            .lines
            .iter()
            .map(|line| line.text.as_str())
            .collect::<Vec<_>>()
            .join("\n");
        assert!(first.contains("A scene"));
        assert!(first.contains("Still the same page."));
        assert!(first.contains("A second paragraph."));

        let opening = pages[0]
            .lines
            .iter()
            .find(|line| line.text == "First.")
            .unwrap();
        assert!(
            !opening.indented,
            "the first paragraph starts without indent"
        );
        let later = pages[0]
            .lines
            .iter()
            .find(|line| line.text == "A second paragraph.")
            .unwrap();
        assert!(later.indented, "later paragraphs use a first-line indent");
        let scene_index = pages[0]
            .lines
            .iter()
            .position(|line| line.text == "A scene")
            .unwrap();
        assert!(pages[0].lines[scene_index - 1].text.is_empty());
    }

    #[test]
    fn writes_an_a4_page_box() {
        let bytes = export(
            &[("01.md".to_string(), "# One\n\nText.".to_string())],
            "Book",
            "Author",
        )
        .unwrap();
        let text = String::from_utf8_lossy(&bytes);
        assert!(text.contains("/MediaBox [0 0 595 842]"));
    }
}
