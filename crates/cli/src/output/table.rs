//! Table output formatter

use super::OutputWriter;
use crate::CliResult;
use comfy_table::{presets::UTF8_FULL, Attribute, Cell, Color, ContentArrangement, Table};
use serde::Serialize;
use serde_json::Value;

pub struct TableFormatter;

impl OutputWriter for TableFormatter {
    fn write<T: Serialize>(&self, data: &T) -> CliResult<String> {
        let json_value = serde_json::to_value(data)?;
        Ok(format_as_table(&json_value))
    }
}

fn format_as_table(value: &Value) -> String {
    match value {
        Value::Array(items) => format_array_as_table(items),
        Value::Object(obj) => format_object_as_table(obj),
        _ => value.to_string(),
    }
}

fn format_array_as_table(items: &[Value]) -> String {
    if items.is_empty() {
        return "No data available".to_string();
    }

    // Check if all items are objects with same structure
    if let Some(first) = items.first() {
        if let Some(first_obj) = first.as_object() {
            let mut table = Table::new();
            table
                .load_preset(UTF8_FULL)
                .set_content_arrangement(ContentArrangement::Dynamic);

            // Get headers from first object
            let headers: Vec<String> = first_obj.keys().map(|k| k.to_string()).collect();

            // Add header row with styling
            let header_cells: Vec<Cell> = headers
                .iter()
                .map(|h| {
                    Cell::new(h)
                        .add_attribute(Attribute::Bold)
                        .fg(Color::Cyan)
                })
                .collect();
            table.set_header(header_cells);

            // Add data rows
            for item in items {
                if let Some(obj) = item.as_object() {
                    let row: Vec<String> = headers
                        .iter()
                        .map(|k| format_value(obj.get(k).unwrap_or(&Value::Null)))
                        .collect();
                    table.add_row(row);
                }
            }

            return table.to_string();
        }
    }

    // Fallback: simple list
    let mut table = Table::new();
    table.load_preset(UTF8_FULL);
    table.set_header(vec![Cell::new("Value")
        .add_attribute(Attribute::Bold)
        .fg(Color::Cyan)]);

    for item in items {
        table.add_row(vec![format_value(item)]);
    }

    table.to_string()
}

fn format_object_as_table(obj: &serde_json::Map<String, Value>) -> String {
    let mut table = Table::new();
    table
        .load_preset(UTF8_FULL)
        .set_content_arrangement(ContentArrangement::Dynamic);

    table.set_header(vec![
        Cell::new("Key").add_attribute(Attribute::Bold).fg(Color::Cyan),
        Cell::new("Value")
            .add_attribute(Attribute::Bold)
            .fg(Color::Cyan),
    ]);

    for (key, value) in obj {
        table.add_row(vec![key.clone(), format_value(value)]);
    }

    table.to_string()
}

fn format_value(value: &Value) -> String {
    match value {
        Value::Null => "null".to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Number(n) => n.to_string(),
        Value::String(s) => s.clone(),
        Value::Array(arr) => format!("[{} items]", arr.len()),
        Value::Object(_) => "[object]".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_format_array() {
        let data = json!([
            {"id": "1", "name": "Test 1", "status": "active"},
            {"id": "2", "name": "Test 2", "status": "inactive"}
        ]);

        let result = format_as_table(&data);
        assert!(result.contains("id"));
        assert!(result.contains("name"));
        assert!(result.contains("status"));
        assert!(result.contains("Test 1"));
        assert!(result.contains("Test 2"));
    }

    #[test]
    fn test_format_object() {
        let data = json!({
            "id": "123",
            "name": "Test",
            "status": "active"
        });

        let result = format_as_table(&data);
        assert!(result.contains("Key"));
        assert!(result.contains("Value"));
        assert!(result.contains("id"));
        assert!(result.contains("123"));
    }

    #[test]
    fn test_empty_array() {
        let data = json!([]);
        let result = format_as_table(&data);
        assert_eq!(result, "No data available");
    }
}
