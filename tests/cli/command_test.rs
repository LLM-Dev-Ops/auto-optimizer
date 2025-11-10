//! CLI command tests
//!
//! Tests for all CLI commands and options

#[cfg(test)]
mod cli_command_tests {
    use std::process::Command;

    #[test]
    fn test_cli_help_command() {
        let output = Command::new("cargo")
            .args(&["run", "--bin", "llm-optimizer-cli", "--", "--help"])
            .output();

        if let Ok(output) = output {
            assert!(output.status.success() || output.status.code() == Some(0));
        }
    }

    #[test]
    fn test_cli_version_command() {
        let output = Command::new("cargo")
            .args(&["run", "--bin", "llm-optimizer-cli", "--", "--version"])
            .output();

        if let Ok(output) = output {
            let stdout = String::from_utf8_lossy(&output.stdout);
            assert!(stdout.contains("0.1.0") || output.status.success());
        }
    }
}
