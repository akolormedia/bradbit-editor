//! A deterministic A4 PDF renderer for narrative Markdown.
//!
//! The renderer interprets CommonMark instead of printing its source: headings,
//! emphasis, links, inline code, fenced code, quotes, lists and tables become
//! typeset text. It favors predictable basic printing over advanced
//! typesetting (no hyphenation, images or PDF/X).

use crate::fountain::pdf::winansi;
use pdf_writer::{Content, Name, Pdf, Rect, Ref, Str};
use pulldown_cmark::{Event, HeadingLevel, Options, Parser, Tag, TagEnd};

const PAGE_W: f32 = 595.0;
const PAGE_H: f32 = 842.0;
const MARGIN: f32 = 71.0;
const TOP: f32 = 71.0;
const LEADING: f32 = 18.0;
const TITLE_SIZE: f32 = 20.0;
const BODY_SIZE: f32 = 12.0;
const HEADING_SIZE: f32 = 14.0;
const CONTENT_WIDTH: f32 = PAGE_W - 2.0 * MARGIN;
const INDENT: f32 = BODY_SIZE * 1.5;
const QUOTE_INDENT: f32 = BODY_SIZE * 1.5;
const CODE_INDENT: f32 = BODY_SIZE * 1.5;
const CODE_SIZE: f32 = 10.0;
const LIST_INDENT: f32 = BODY_SIZE * 1.5;
const LINES_PER_PAGE: usize = 38;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Style {
    Regular,
    Bold,
    Italic,
    BoldItalic,
    Code,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct Span {
    text: String,
    style: Style,
}

impl Span {
    fn new(text: impl Into<String>, style: Style) -> Self {
        Self {
            text: text.into(),
            style,
        }
    }

    fn plain(text: impl Into<String>) -> Self {
        Self::new(text, Style::Regular)
    }
}

#[derive(Default)]
struct Page {
    lines: Vec<Line>,
}

struct Line {
    spans: Vec<Span>,
    size: f32,
    centered: bool,
    indent_first: bool,
    left_margin: f32,
}

impl Line {
    fn text(&self) -> String {
        self.spans.iter().map(|span| span.text.as_str()).collect()
    }

    fn width(&self) -> f32 {
        spans_width(&self.spans, self.size)
    }
}

#[derive(Debug, PartialEq, Eq)]
enum Block {
    Heading { level: u8, spans: Vec<Span> },
    Paragraph { spans: Vec<Span>, quote: bool },
    ListItem { marker: String, spans: Vec<Span> },
    Code(Vec<String>),
    Rule,
    Table(Vec<Vec<String>>),
}

struct ListState {
    ordered: bool,
    next: u64,
}

struct Collector {
    blocks: Vec<Block>,
    spans: Vec<Span>,
    emphasis: Vec<Style>,
    heading: Option<u8>,
    code: Option<String>,
    quote: usize,
    lists: Vec<ListState>,
    item_marker: Option<String>,
    image_alt: Option<String>,
    table: Option<Vec<Vec<String>>>,
    row: Vec<String>,
    cell: String,
    metadata: bool,
}

impl Collector {
    fn new() -> Self {
        Self {
            blocks: Vec::new(),
            spans: Vec::new(),
            emphasis: Vec::new(),
            heading: None,
            code: None,
            quote: 0,
            lists: Vec::new(),
            item_marker: None,
            image_alt: None,
            table: None,
            row: Vec::new(),
            cell: String::new(),
            metadata: false,
        }
    }

    fn style(&self) -> Style {
        self.emphasis
            .iter()
            .fold(Style::Regular, |style, emphasis| combine(style, *emphasis))
    }

    fn push_span(&mut self, span: Span) {
        if span.text.is_empty() {
            return;
        }
        if let Some(last) = self.spans.last_mut() {
            if last.style == span.style {
                last.text.push_str(&span.text);
                return;
            }
        }
        self.spans.push(span);
    }

    fn push_text(&mut self, text: &str) {
        if self.metadata {
            return;
        }
        if let Some(code) = &mut self.code {
            code.push_str(text);
            return;
        }
        if self.table.is_some() {
            self.cell.push_str(text);
            return;
        }
        if let Some(alt) = &mut self.image_alt {
            alt.push_str(text);
            return;
        }
        self.push_span(Span::new(text, self.style()));
    }

    fn push_code(&mut self, text: &str) {
        if self.metadata {
            return;
        }
        if self.table.is_some() {
            self.cell.push_str(text);
            return;
        }
        self.push_span(Span::new(text, Style::Code));
    }

    fn soft_break(&mut self) {
        if self.code.is_some() {
            if let Some(code) = &mut self.code {
                code.push('\n');
            }
            return;
        }
        if self.table.is_some() {
            self.cell.push(' ');
            return;
        }
        self.push_text(" ");
    }

    fn flush_paragraph(&mut self) {
        if self.spans.is_empty() {
            return;
        }
        let spans = std::mem::take(&mut self.spans);
        if let Some(marker) = self.item_marker.clone() {
            self.blocks.push(Block::ListItem { marker, spans });
        } else {
            self.blocks.push(Block::Paragraph {
                spans,
                quote: self.quote > 0,
            });
        }
    }

    fn start(&mut self, tag: Tag<'_>) {
        match tag {
            Tag::Paragraph if self.item_marker.is_none() && !self.spans.is_empty() => {
                self.flush_paragraph();
            }
            Tag::Paragraph => {}
            Tag::Heading { level, .. } => {
                self.spans.clear();
                self.heading = Some(heading_level(level));
            }
            Tag::BlockQuote(_) => self.quote += 1,
            Tag::CodeBlock(_) => self.code = Some(String::new()),
            Tag::List(start) => self.lists.push(ListState {
                ordered: start.is_some(),
                next: start.unwrap_or(1),
            }),
            Tag::Item => {
                self.spans.clear();
                let marker = self
                    .lists
                    .last()
                    .map(|list| {
                        if list.ordered {
                            format!("{}. ", list.next)
                        } else {
                            "• ".to_string()
                        }
                    })
                    .unwrap_or_else(|| "• ".to_string());
                self.item_marker = Some(marker);
            }
            Tag::Table(_) => self.table = Some(Vec::new()),
            Tag::TableRow => self.row.clear(),
            Tag::TableCell => self.cell.clear(),
            Tag::Image { .. } => self.image_alt = Some(String::new()),
            Tag::Emphasis => self.emphasis.push(Style::Italic),
            Tag::Strong => self.emphasis.push(Style::Bold),
            Tag::MetadataBlock(_) => self.metadata = true,
            _ => {}
        }
    }

    fn end(&mut self, tag: TagEnd) {
        match tag {
            TagEnd::Paragraph => {
                if self.item_marker.is_none() {
                    self.flush_paragraph();
                } else if !self.spans.is_empty() {
                    self.push_text(" ");
                }
            }
            TagEnd::Heading(_) => {
                if let Some(level) = self.heading.take() {
                    let spans = std::mem::take(&mut self.spans);
                    if !spans.is_empty() {
                        self.blocks.push(Block::Heading { level, spans });
                    }
                }
            }
            TagEnd::BlockQuote(_) => self.quote = self.quote.saturating_sub(1),
            TagEnd::CodeBlock => {
                if let Some(code) = self.code.take() {
                    let lines = code
                        .trim_end_matches('\n')
                        .lines()
                        .map(|line| line.trim_end().to_string())
                        .collect::<Vec<_>>();
                    if !lines.is_empty() {
                        self.blocks.push(Block::Code(lines));
                    }
                }
            }
            TagEnd::List(_) => {
                self.lists.pop();
            }
            TagEnd::Item => {
                self.flush_paragraph();
                if let Some(list) = self.lists.last_mut() {
                    list.next += 1;
                }
                self.item_marker = None;
            }
            TagEnd::Table => {
                if let Some(rows) = self.table.take() {
                    if !rows.is_empty() {
                        self.blocks.push(Block::Table(rows));
                    }
                }
            }
            TagEnd::TableRow if !self.row.is_empty() => {
                if let Some(table) = self.table.as_mut() {
                    table.push(std::mem::take(&mut self.row));
                }
            }
            TagEnd::TableRow => {}
            TagEnd::TableHead if !self.row.is_empty() => {
                if let Some(table) = self.table.as_mut() {
                    table.push(std::mem::take(&mut self.row));
                }
            }
            TagEnd::TableHead => {}
            TagEnd::TableCell => {
                self.row.push(self.cell.trim().to_string());
                self.cell.clear();
            }
            TagEnd::Image => {
                if let Some(alt) = self.image_alt.take() {
                    let label = alt.trim();
                    let text = if label.is_empty() {
                        "[Imagen]".to_string()
                    } else {
                        format!("[Imagen: {}]", label)
                    };
                    self.push_span(Span::new(text, Style::Italic));
                }
            }
            TagEnd::Emphasis | TagEnd::Strong => {
                self.emphasis.pop();
            }
            TagEnd::MetadataBlock(_) => self.metadata = false,
            _ => {}
        }
    }

    fn finish(mut self) -> Vec<Block> {
        if let Some(code) = self.code.take() {
            let lines = code
                .lines()
                .map(|line| line.trim_end().to_string())
                .collect::<Vec<_>>();
            if !lines.is_empty() {
                self.blocks.push(Block::Code(lines));
            }
        }
        if let Some(rows) = self.table.take() {
            if !rows.is_empty() {
                self.blocks.push(Block::Table(rows));
            }
        }
        self.flush_paragraph();
        self.blocks
    }
}

fn heading_level(level: HeadingLevel) -> u8 {
    match level {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}

fn combine(base: Style, emphasis: Style) -> Style {
    match (base, emphasis) {
        (Style::Code, _) => Style::Code,
        (Style::BoldItalic, _) => Style::BoldItalic,
        (Style::Bold, Style::Italic) | (Style::Italic, Style::Bold) => Style::BoldItalic,
        (Style::Bold, _) => Style::Bold,
        (Style::Italic, _) => Style::Italic,
        (Style::Regular, Style::Bold) => Style::Bold,
        (Style::Regular, Style::Italic) => Style::Italic,
        _ => Style::Regular,
    }
}

fn bold_style(style: Style) -> Style {
    match style {
        Style::Regular | Style::Bold => Style::Bold,
        Style::Italic | Style::BoldItalic => Style::BoldItalic,
        Style::Code => Style::Code,
    }
}

fn size_for(style: Style, base: f32) -> f32 {
    if style == Style::Code {
        base * 0.92
    } else {
        base
    }
}

fn char_factor(style: Style) -> f32 {
    match style {
        Style::Regular | Style::Italic => 0.50,
        Style::Bold => 0.53,
        Style::BoldItalic => 0.52,
        Style::Code => 0.60,
    }
}

fn text_width(text: &str, style: Style, base: f32) -> f32 {
    let size = size_for(style, base);
    text.chars()
        .map(|character| {
            if character == ' ' {
                size * 0.28
            } else {
                size * char_factor(style)
            }
        })
        .sum()
}

fn spans_width(spans: &[Span], base: f32) -> f32 {
    spans
        .iter()
        .map(|span| text_width(&span.text, span.style, base))
        .sum()
}

fn append_span(spans: &mut Vec<Span>, span: Span) {
    if span.text.is_empty() {
        return;
    }
    if let Some(last) = spans.last_mut() {
        if last.style == span.style {
            last.text.push_str(&span.text);
            return;
        }
    }
    spans.push(span);
}

struct Word {
    text: String,
    style: Style,
    space_before: bool,
}

fn wrap_spans(spans: &[Span], max_width: f32, size: f32) -> Vec<Vec<Span>> {
    let mut words: Vec<Word> = Vec::new();
    let mut pending_space = false;
    for span in spans {
        let mut current = String::new();
        for character in span.text.chars() {
            if character.is_whitespace() {
                if !current.is_empty() {
                    words.push(Word {
                        text: std::mem::take(&mut current),
                        style: span.style,
                        space_before: pending_space && !words.is_empty(),
                    });
                }
                pending_space = true;
            } else {
                current.push(character);
            }
        }
        if !current.is_empty() {
            words.push(Word {
                text: current,
                style: span.style,
                space_before: pending_space && !words.is_empty(),
            });
            pending_space = false;
        }
    }
    if words.is_empty() {
        return Vec::new();
    }

    let mut lines: Vec<Vec<Span>> = Vec::new();
    let mut current: Vec<Span> = Vec::new();
    let mut width = 0.0;

    for word in words {
        let word_width = text_width(&word.text, word.style, size);
        let space_width = text_width(" ", word.style, size);
        let needs_space = word.space_before && !current.is_empty();
        if !current.is_empty()
            && width + (if needs_space { space_width } else { 0.0 }) + word_width > max_width
        {
            lines.push(std::mem::take(&mut current));
            width = 0.0;
        }

        if word_width > max_width {
            if !current.is_empty() {
                lines.push(std::mem::take(&mut current));
                width = 0.0;
            }
            for chunk in split_word(&word.text, word.style, size, max_width) {
                if !current.is_empty() {
                    append_span(&mut current, Span::new(" ", word.style));
                }
                let chunk_width = text_width(&chunk, word.style, size);
                append_span(&mut current, Span::new(chunk, word.style));
                width += chunk_width;
                if width >= max_width {
                    lines.push(std::mem::take(&mut current));
                    width = 0.0;
                }
            }
            continue;
        }

        if needs_space {
            append_span(&mut current, Span::new(" ", word.style));
            width += space_width;
        }
        append_span(&mut current, Span::new(word.text, word.style));
        width += word_width;
    }

    if !current.is_empty() {
        lines.push(current);
    }
    lines
}

fn split_word(text: &str, style: Style, size: f32, max_width: f32) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current = String::new();
    let mut width = 0.0;
    for character in text.chars() {
        let character_width = text_width(&character.to_string(), style, size);
        if !current.is_empty() && width + character_width > max_width {
            chunks.push(std::mem::take(&mut current));
            width = 0.0;
        }
        current.push(character);
        width += character_width;
    }
    if !current.is_empty() {
        chunks.push(current);
    }
    chunks
}

fn quote_spans(mut spans: Vec<Span>) -> Vec<Span> {
    spans.insert(0, Span::plain("“"));
    spans.push(Span::plain("”"));
    spans
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
        if self.current.lines.len() >= LINES_PER_PAGE {
            self.new_page();
        }
        self.current.lines.push(line);
    }

    fn reserve(&mut self, lines: usize) {
        if !self.current.lines.is_empty() && self.current.lines.len() + lines > LINES_PER_PAGE {
            self.new_page();
        }
    }

    fn blank(&mut self) {
        let has_text = self
            .current
            .lines
            .last()
            .is_some_and(|line| !line.text().trim().is_empty());
        if has_text {
            self.push(Line {
                spans: Vec::new(),
                size: BODY_SIZE,
                centered: false,
                indent_first: false,
                left_margin: 0.0,
            });
        }
    }

    fn paragraph(&mut self, spans: Vec<Span>, quote: bool) {
        if spans.is_empty() {
            return;
        }
        let spans = if quote { quote_spans(spans) } else { spans };
        let indent = self.indent_next && !quote;
        let max_width = if quote {
            CONTENT_WIDTH - 2.0 * QUOTE_INDENT
        } else if indent {
            CONTENT_WIDTH - INDENT
        } else {
            CONTENT_WIDTH
        };
        let lines = wrap_spans(&spans, max_width, BODY_SIZE);
        for (index, spans) in lines.into_iter().enumerate() {
            self.push(Line {
                spans,
                size: BODY_SIZE,
                centered: false,
                indent_first: indent && index == 0,
                left_margin: if quote { QUOTE_INDENT } else { 0.0 },
            });
        }
        self.indent_next = true;
    }

    fn heading(&mut self, level: u8, spans: Vec<Span>) {
        if level == 1 {
            self.new_page();
        } else {
            self.blank();
        }
        let size = match level {
            1 => HEADING_SIZE,
            2 => HEADING_SIZE - 1.0,
            _ => BODY_SIZE,
        };
        let spans = spans
            .into_iter()
            .map(|span| Span::new(span.text, bold_style(span.style)))
            .collect::<Vec<_>>();
        let lines = wrap_spans(&spans, CONTENT_WIDTH, size);
        self.reserve(lines.len() + 1);
        for spans in lines {
            self.push(Line {
                spans,
                size,
                centered: true,
                indent_first: false,
                left_margin: 0.0,
            });
        }
        self.push(Line {
            spans: Vec::new(),
            size: BODY_SIZE,
            centered: false,
            indent_first: false,
            left_margin: 0.0,
        });
        self.indent_next = false;
    }

    fn list_item(&mut self, marker: &str, spans: Vec<Span>) {
        let mut all = vec![Span::plain(marker)];
        all.extend(spans);
        for spans in wrap_spans(&all, CONTENT_WIDTH - LIST_INDENT, BODY_SIZE) {
            self.push(Line {
                spans,
                size: BODY_SIZE,
                centered: false,
                indent_first: false,
                left_margin: 0.0,
            });
        }
        self.indent_next = false;
    }

    fn code(&mut self, lines: Vec<String>) {
        self.reserve(lines.len() + 2);
        self.blank();
        for line in lines {
            if line.is_empty() {
                self.push(Line {
                    spans: Vec::new(),
                    size: CODE_SIZE,
                    centered: false,
                    indent_first: false,
                    left_margin: CODE_INDENT,
                });
                continue;
            }
            for chunk in wrap_code_line(&line, 70) {
                self.push(Line {
                    spans: vec![Span::new(chunk, Style::Code)],
                    size: CODE_SIZE,
                    centered: false,
                    indent_first: false,
                    left_margin: CODE_INDENT,
                });
            }
        }
        self.blank();
        self.indent_next = false;
    }

    fn rule(&mut self) {
        self.reserve(3);
        self.blank();
        self.push(Line {
            spans: vec![Span::plain("* * *")],
            size: BODY_SIZE,
            centered: true,
            indent_first: false,
            left_margin: 0.0,
        });
        self.push(Line {
            spans: Vec::new(),
            size: BODY_SIZE,
            centered: false,
            indent_first: false,
            left_margin: 0.0,
        });
        self.indent_next = false;
    }

    fn table(&mut self, rows: Vec<Vec<String>>) {
        self.reserve(rows.len() + 2);
        self.blank();
        for (index, row) in rows.into_iter().enumerate() {
            let text = row
                .into_iter()
                .filter(|cell| !cell.is_empty())
                .collect::<Vec<_>>()
                .join(" · ");
            if text.is_empty() {
                continue;
            }
            let style = if index == 0 {
                Style::Bold
            } else {
                Style::Regular
            };
            for spans in wrap_spans(&[Span::new(text, style)], CONTENT_WIDTH, BODY_SIZE) {
                self.push(Line {
                    spans,
                    size: BODY_SIZE,
                    centered: false,
                    indent_first: false,
                    left_margin: 0.0,
                });
            }
        }
        self.blank();
        self.indent_next = false;
    }

    fn finish(mut self) -> Vec<Page> {
        self.new_page();
        self.pages
    }
}

fn wrap_code_line(line: &str, max_chars: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let mut current = String::new();
    for character in line.chars() {
        current.push(character);
        if current.chars().count() >= max_chars {
            chunks.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        chunks.push(current);
    }
    if chunks.is_empty() {
        chunks.push(String::new());
    }
    chunks
}

fn collect_blocks(markdown: &str) -> Vec<Block> {
    let options = Options::ENABLE_TABLES
        | Options::ENABLE_STRIKETHROUGH
        | Options::ENABLE_TASKLISTS
        | Options::ENABLE_FOOTNOTES
        | Options::ENABLE_YAML_STYLE_METADATA_BLOCKS;
    let mut collector = Collector::new();
    let cleaned = strip_image_attributes(markdown);
    for event in Parser::new_ext(&cleaned, options) {
        match event {
            Event::Start(tag) => collector.start(tag),
            Event::End(tag) => collector.end(tag),
            Event::Text(text) => collector.push_text(&text),
            Event::Code(text) => collector.push_code(&text),
            Event::Html(text) | Event::InlineHtml(text) => {
                collector.push_text(&html_to_text(&text));
            }
            Event::SoftBreak | Event::HardBreak => collector.soft_break(),
            Event::Rule => {
                if !collector.metadata {
                    collector.blocks.push(Block::Rule);
                }
            }
            Event::TaskListMarker(checked) => {
                collector.push_text(if checked { "[x] " } else { "[ ] " });
            }
            Event::FootnoteReference(label) => {
                collector.push_text(&format!("[{}]", label));
            }
            Event::InlineMath(text) | Event::DisplayMath(text) => collector.push_text(&text),
        }
    }
    collector.finish()
}

fn strip_image_attributes(markdown: &str) -> String {
    let mut output = String::with_capacity(markdown.len());
    for line in markdown.split_inclusive('\n') {
        if line.contains("![") {
            let mut depth = 0usize;
            for character in line.chars() {
                match character {
                    '{' => depth += 1,
                    '}' if depth > 0 => depth -= 1,
                    _ if depth == 0 => output.push(character),
                    _ => {}
                }
            }
        } else {
            output.push_str(line);
        }
    }
    output
}

fn html_to_text(html: &str) -> String {
    let mut output = String::new();
    let mut in_tag = false;
    let mut tag = String::new();
    for character in html.chars() {
        if in_tag {
            if character == '>' {
                in_tag = false;
                let name = tag.trim().to_ascii_lowercase();
                if name.starts_with("img") {
                    output.push_str("[Imagen]");
                } else if name.starts_with("br") {
                    output.push(' ');
                }
                tag.clear();
            } else {
                tag.push(character);
            }
        } else if character == '<' {
            in_tag = true;
            tag.clear();
        } else {
            output.push(character);
        }
    }
    output
        .replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&amp;", "&")
}

fn inline_plain(text: &str) -> String {
    let mut output = String::new();
    for event in Parser::new(text) {
        match event {
            Event::Text(text) | Event::Code(text) => output.push_str(&text),
            Event::SoftBreak | Event::HardBreak => output.push(' '),
            _ => {}
        }
    }
    output.trim().to_string()
}

fn build_pages(chapters: &[(String, String)]) -> Vec<Page> {
    let mut builder = Builder::new();
    for (index, (_, markdown)) in chapters.iter().enumerate() {
        if index > 0 {
            builder.new_page();
        }
        builder.indent_next = false;
        for block in collect_blocks(markdown) {
            match block {
                Block::Heading { level, spans } => builder.heading(level, spans),
                Block::Paragraph { spans, quote } => builder.paragraph(spans, quote),
                Block::ListItem { marker, spans } => builder.list_item(&marker, spans),
                Block::Code(lines) => builder.code(lines),
                Block::Rule => builder.rule(),
                Block::Table(rows) => builder.table(rows),
            }
        }
    }
    builder.finish()
}

fn font_name(style: Style) -> Name<'static> {
    match style {
        Style::Regular => Name(b"F1"),
        Style::Bold => Name(b"F2"),
        Style::Italic => Name(b"F3"),
        Style::BoldItalic => Name(b"F4"),
        Style::Code => Name(b"F5"),
    }
}

fn write_pdf(title: &str, author: &str, pages: &[Page]) -> Vec<u8> {
    let mut pdf = Pdf::new();
    let mut alloc = Ref::new(1);
    let catalog = alloc.bump();
    let page_tree = alloc.bump();
    let regular = alloc.bump();
    let bold = alloc.bump();
    let italic = alloc.bump();
    let bold_italic = alloc.bump();
    let courier = alloc.bump();

    pdf.catalog(catalog).pages(page_tree);
    pdf.type1_font(regular)
        .base_font(Name(b"Times-Roman"))
        .encoding_predefined(Name(b"WinAnsiEncoding"));
    pdf.type1_font(bold)
        .base_font(Name(b"Times-Bold"))
        .encoding_predefined(Name(b"WinAnsiEncoding"));
    pdf.type1_font(italic)
        .base_font(Name(b"Times-Italic"))
        .encoding_predefined(Name(b"WinAnsiEncoding"));
    pdf.type1_font(bold_italic)
        .base_font(Name(b"Times-BoldItalic"))
        .encoding_predefined(Name(b"WinAnsiEncoding"));
    pdf.type1_font(courier)
        .base_font(Name(b"Courier"))
        .encoding_predefined(Name(b"WinAnsiEncoding"));

    let mut page_ids = Vec::new();

    // Title page.
    {
        let page_id = alloc.bump();
        let content_id = alloc.bump();
        page_ids.push(page_id);
        let mut content = Content::new();
        content.begin_text();
        let display_title = inline_plain(if title.trim().is_empty() {
            "Untitled"
        } else {
            title
        });
        let mut y = 640.0;
        content.set_font(Name(b"F2"), TITLE_SIZE);
        for line in wrap_plain(&display_title, 38) {
            content.set_text_matrix([1.0, 0.0, 0.0, 1.0, centered_x(&line, TITLE_SIZE), y]);
            content.show(Str(&winansi(&line)));
            y -= 28.0;
        }
        y -= 24.0;
        content.set_font(Name(b"F1"), BODY_SIZE);
        for line in wrap_plain(&inline_plain(author), 48) {
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
            .pair(Name(b"F1"), regular)
            .pair(Name(b"F2"), bold);
    }

    for (page_index, page) in pages.iter().enumerate() {
        let page_id = alloc.bump();
        let content_id = alloc.bump();
        page_ids.push(page_id);
        let mut content = Content::new();
        content.begin_text();
        for (index, line) in page.lines.iter().enumerate() {
            if line.spans.is_empty() {
                continue;
            }
            let x = if line.centered {
                ((PAGE_W - line.width()) / 2.0).max(MARGIN)
            } else {
                MARGIN + line.left_margin + if line.indent_first { INDENT } else { 0.0 }
            };
            let y = PAGE_H - TOP - ((index + 1) as f32) * LEADING;
            content.set_text_matrix([1.0, 0.0, 0.0, 1.0, x, y]);
            for span in &line.spans {
                content.set_font(font_name(span.style), size_for(span.style, line.size));
                content.show(Str(&winansi(&span.text)));
            }
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
            .pair(Name(b"F1"), regular)
            .pair(Name(b"F2"), bold)
            .pair(Name(b"F3"), italic)
            .pair(Name(b"F4"), bold_italic)
            .pair(Name(b"F5"), courier);
    }

    pdf.pages(page_tree)
        .kids(page_ids)
        .count((pages.len() + 1) as i32);
    pdf.finish()
}

fn wrap_plain(text: &str, cols: usize) -> Vec<String> {
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
            .map(Line::text)
            .collect::<Vec<_>>()
            .join("\n");
        assert!(first.contains("A scene"));
        assert!(first.contains("Still the same page."));
        assert!(first.contains("A second paragraph."));

        let opening = pages[0]
            .lines
            .iter()
            .find(|line| line.text() == "First.")
            .unwrap();
        assert!(
            !opening.indent_first,
            "the first paragraph starts without indent"
        );
        let later = pages[0]
            .lines
            .iter()
            .find(|line| line.text() == "A second paragraph.")
            .unwrap();
        assert!(
            later.indent_first,
            "later paragraphs use a first-line indent"
        );
        let scene_index = pages[0]
            .lines
            .iter()
            .position(|line| line.text() == "A scene")
            .unwrap();
        assert!(pages[0].lines[scene_index - 1].text().is_empty());
    }

    #[test]
    fn renders_markdown_syntax_instead_of_literal_markers() {
        let markdown = r#"# Chapter

**Bold** and *italic* and `code`.

[Link label](https://example.com) and ![alt](image.png){width="2in"}.

```rust
fn main() {}
```

| Name | Role |
| --- | --- |
| Ana | Writer |

> A quote

1. First
2. Second
"#;
        let bytes = export(
            &[("chapter.md".to_string(), markdown.to_string())],
            "Book",
            "Author",
        )
        .unwrap();
        let text = String::from_utf8_lossy(&bytes);
        let pages = build_pages(&[("chapter.md".to_string(), markdown.to_string())]);
        let rendered = pages
            .iter()
            .flat_map(|page| page.lines.iter())
            .map(Line::text)
            .collect::<Vec<_>>()
            .join("\n");

        assert!(text.contains("Bold"));
        assert!(text.contains("italic"));
        assert!(text.contains("code"));
        assert!(!text.contains("**Bold**"));
        assert!(!text.contains("`code`"));
        assert!(text.contains("Link label"));
        assert!(!text.contains("https://example.com"));
        assert!(text.contains("[Imagen: alt]"));
        assert!(!text.contains("image.png"));
        assert!(text.contains("fn main()"));
        assert!(!text.contains("```"));
        assert!(rendered.contains("Ana"));
        assert!(rendered.contains("Writer"));
        assert!(rendered.contains("Name"));
        assert!(rendered.contains("Role"));
        assert!(!text.contains("| Name |"));
        assert!(rendered.contains("A quote"));
        assert!(text.contains("1. First"));
        assert!(text.contains("2. Second"));
        assert!(text.contains("/BaseFont /Times-Bold"));
        assert!(text.contains("/BaseFont /Times-Italic"));
        assert!(text.contains("/BaseFont /Courier"));
    }

    #[test]
    fn skips_yaml_frontmatter_and_html_tags() {
        let markdown = "---\ntitle: Internal\nsubtitle: Hidden\n---\n\n# Chapter\n\n<span>Visible</span> text.";
        let bytes = export(
            &[("chapter.md".to_string(), markdown.to_string())],
            "Book",
            "Author",
        )
        .unwrap();
        let text = String::from_utf8_lossy(&bytes);
        assert!(text.contains("Visible"));
        assert!(text.contains("text."));
        assert!(!text.contains("subtitle"));
        assert!(!text.contains("<span>"));
    }

    #[test]
    fn paginates_without_overrunning_the_bottom_margin() {
        let markdown = (0..60)
            .map(|index| format!("Paragraph {}. {}", index, "word ".repeat(30)))
            .collect::<Vec<_>>()
            .join("\n\n");
        let pages = build_pages(&[("long.md".to_string(), markdown)]);
        assert!(pages.len() >= 2);
        assert!(pages.iter().all(|page| page.lines.len() <= LINES_PER_PAGE));
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
