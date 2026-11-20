//! Line-oriented diff used by the editor gutter.
//!
//! This mirrors Zed's buffer diff: imara-diff's Histogram algorithm followed
//! by the same line post-processing heuristic. Keeping the algorithm in Rust
//! guarantees identical hunks for the same buffer and Git base.

use imara_diff::{sources::lines, Algorithm, Diff, InternedInput};
use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LineDiffHunk {
    /// `added`, `modified` or `deleted`.
    pub kind: String,
    /// 0-based line range in the original/HEAD text, end exclusive.
    pub original_start: u32,
    pub original_end: u32,
    /// 0-based line range in the current editor text, end exclusive.
    pub current_start: u32,
    pub current_end: u32,
}

/// Computes line hunks between the committed text and the editor buffer.
pub fn line_hunks(original: &str, current: &str) -> Vec<LineDiffHunk> {
    let input = InternedInput::new(lines(original), lines(current));
    let mut diff = Diff::compute(Algorithm::Histogram, &input);
    diff.postprocess_lines(&input);

    diff.hunks()
        .map(|hunk| {
            let kind = if hunk.before.start == hunk.before.end {
                "added"
            } else if hunk.after.start == hunk.after.end {
                "deleted"
            } else {
                "modified"
            };
            LineDiffHunk {
                kind: kind.to_string(),
                original_start: hunk.before.start,
                original_end: hunk.before.end,
                current_start: hunk.after.start,
                current_end: hunk.after.end,
            }
        })
        .collect()
}

#[tauri::command]
pub fn diff_line_hunks(original: String, current: String) -> Vec<LineDiffHunk> {
    line_hunks(&original, &current)
}

#[cfg(test)]
mod tests {
    use super::{line_hunks, LineDiffHunk};

    fn hunk(
        kind: &str,
        original_start: u32,
        original_end: u32,
        current_start: u32,
        current_end: u32,
    ) -> LineDiffHunk {
        LineDiffHunk {
            kind: kind.to_string(),
            original_start,
            original_end,
            current_start,
            current_end,
        }
    }

    #[test]
    fn reports_modified_added_and_deleted_lines() {
        let original = "uno\ndos\ntres\ncuatro";
        let current = "uno\nDOS\ntres\ncuatro\ncinco";
        assert_eq!(
            line_hunks(original, current),
            vec![hunk("modified", 1, 2, 1, 2), hunk("modified", 3, 4, 3, 5),]
        );

        assert_eq!(
            line_hunks("uno\ndos\ntres", "uno\ntres"),
            vec![hunk("deleted", 1, 2, 1, 1)]
        );
        assert_eq!(
            line_hunks("uno\ndos\n", "uno\ndos\ntres\n"),
            vec![hunk("added", 2, 2, 2, 3)]
        );
    }

    #[test]
    fn matches_zed_alignment_for_repeated_blank_lines() {
        let original = "a\n\nb\n\nc\n\nd";
        let current = "a\n\nc\n\nd";
        assert_eq!(
            line_hunks(original, current),
            vec![hunk("deleted", 2, 4, 2, 2)]
        );
    }
}
