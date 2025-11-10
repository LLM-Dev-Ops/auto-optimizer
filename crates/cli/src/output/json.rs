//! JSON output formatter

use super::OutputWriter;
use crate::CliResult;
use serde::Serialize;

pub struct JsonFormatter;

impl OutputWriter for JsonFormatter {
    fn write<T: Serialize>(&self, data: &T) -> CliResult<String> {
        Ok(serde_json::to_string_pretty(data)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_json_formatter() {
        let formatter = JsonFormatter;
        let data = json!({
            "id": "123",
            "name": "Test",
            "values": [1, 2, 3]
        });

        let result = formatter.write(&data).unwrap();
        assert!(result.contains("\"id\": \"123\""));
        assert!(result.contains("\"name\": \"Test\""));
        assert!(result.contains("\"values\""));
    }
}
