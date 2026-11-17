//! Final Draft (FDX) import.
//!
//! `jumpcut` parses the FDX XML into a screenplay model and renders it as
//! Fountain. The import is intentionally one-way: the project source remains
//! Fountain and the original FDX is not modified.

pub fn convert_path(path: &str) -> Result<String, String> {
    if !path.to_ascii_lowercase().ends_with(".fdx") {
        return Err("Only .fdx files can be imported".to_string());
    }

    let metadata = std::fs::metadata(path)
        .map_err(|e| format!("Could not read the Final Draft file: {}", e))?;
    if metadata.len() > 50 * 1024 * 1024 {
        return Err("The Final Draft file is larger than 50 MB".to_string());
    }

    let xml = std::fs::read_to_string(path)
        .map_err(|e| format!("Could not read the Final Draft file: {}", e))?;
    convert(&xml)
}

pub fn convert(xml: &str) -> Result<String, String> {
    let screenplay = jumpcut::parse_fdx(xml)
        .map_err(|e| format!("Could not parse the Final Draft file: {:?}", e))?;
    let fountain = jumpcut::rendering::fountain::render(&screenplay);
    if fountain.trim().is_empty() {
        return Err("The Final Draft file has no importable screenplay text".to_string());
    }
    Ok(fountain)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE: &str = r#"<?xml version="1.0" encoding="UTF-8" standalone="no" ?>
<FinalDraft DocumentType="Script" Template="No" Version="3">
  <Content>
    <Paragraph Type="Scene Heading"><Text>INT. HOUSE - DAY</Text></Paragraph>
    <Paragraph Type="Action"><Text>Rain hits the windows.</Text></Paragraph>
    <Paragraph Type="Character"><Text>MARA</Text></Paragraph>
    <Paragraph Type="Parenthetical"><Text>(quietly)</Text></Paragraph>
    <Paragraph Type="Dialogue"><Text>No vine a quedarme.</Text></Paragraph>
    <Paragraph Type="Transition"><Text>CUT TO:</Text></Paragraph>
  </Content>
</FinalDraft>"#;

    #[test]
    fn converts_scene_elements_to_fountain() {
        let fountain = convert(SAMPLE).unwrap();
        assert!(fountain.contains("INT. HOUSE - DAY"));
        assert!(fountain.contains("Rain hits the windows."));
        assert!(fountain.contains("MARA"));
        assert!(fountain.contains("(quietly)"));
        assert!(fountain.contains("No vine a quedarme."));
        assert!(fountain.contains("CUT TO:"));
    }

    #[test]
    fn rejects_missing_files_and_non_fdx_paths() {
        assert!(convert_path("/tmp/missing.fdx").is_err());
        assert!(convert_path("/tmp/script.fountain").is_err());
    }
}
