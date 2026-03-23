/// Validate and normalize a user-supplied file path.
/// Rejects path traversal, absolute paths, Windows reserved names,
/// and invalid characters.
pub fn validate_path(path: &str) -> anyhow::Result<String> {
    let normalized = path.replace('\\', "/");

    if normalized.starts_with('/')
        || (normalized.len() > 1 && normalized.as_bytes()[1] == b':')
    {
        anyhow::bail!("Absolute paths not allowed");
    }

    for component in normalized.split('/') {
        if component.is_empty() || component == "." {
            continue;
        }
        if component == ".." {
            anyhow::bail!("Path traversal not allowed");
        }
        validate_filename_component(component)?;
    }

    if normalized.len() > 1024 {
        anyhow::bail!("Path too long (max 1024 chars)");
    }

    Ok(normalized)
}

fn validate_filename_component(name: &str) -> anyhow::Result<()> {
    const RESERVED: &[&str] = &[
        "CON", "PRN", "AUX", "NUL",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];

    let upper = name.to_uppercase();
    let stem = upper.split('.').next().unwrap_or("");
    if RESERVED.contains(&stem) {
        anyhow::bail!("Reserved filename not allowed: {}", name);
    }

    for c in name.chars() {
        if c < ' ' || "<>:\"|?*".contains(c) {
            anyhow::bail!("Invalid character in filename: '{}'", c);
        }
    }

    if name.ends_with('.') || name.ends_with(' ') {
        anyhow::bail!("Filename cannot end with dot or space: {}", name);
    }

    if name.len() > 255 {
        anyhow::bail!("Filename component too long (max 255)");
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_traversal() {
        assert!(validate_path("../etc/passwd").is_err());
        assert!(validate_path("foo/../../bar").is_err());
    }

    #[test]
    fn rejects_absolute() {
        assert!(validate_path("/etc/passwd").is_err());
        assert!(validate_path("C:\\Windows").is_err());
    }

    #[test]
    fn rejects_reserved() {
        assert!(validate_path("CON.md").is_err());
        assert!(validate_path("stream/NUL").is_err());
    }

    #[test]
    fn accepts_valid() {
        assert_eq!(
            validate_path("stream/2026-03-22.md").unwrap(),
            "stream/2026-03-22.md"
        );
        assert_eq!(
            validate_path("tasks\\my-task.md").unwrap(),
            "tasks/my-task.md"
        );
    }
}
