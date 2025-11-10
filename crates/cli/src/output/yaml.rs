//! YAML output formatter

use super::OutputWriter;
use crate::CliResult;
use serde::Serialize;

pub struct YamlFormatter;

impl OutputWriter for YamlFormatter {
    fn write<T: Serialize>(&self, data: &T) -> CliResult<String> {
        Ok(serde_yaml::to_string(data)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_yaml_formatter() {
        let formatter = YamlFormatter;
        let data = json!({
            "id": "123",
            "name": "Test",
            "values": [1, 2, 3]
        });

        let result = formatter.write(&data).unwrap();
        assert!(result.contains("id: '123'") || result.contains("id: \"123\""));
        assert!(result.contains("name:"));
        assert!(result.contains("values:"));
    }
}
