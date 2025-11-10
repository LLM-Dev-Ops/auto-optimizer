//! Output formatting modules

mod table;
mod json;
mod yaml;

pub use table::TableFormatter;
pub use json::JsonFormatter;
pub use yaml::YamlFormatter;

use crate::CliResult;
use serde::Serialize;
use std::str::FromStr;

/// Output format
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputFormat {
    Table,
    Json,
    Yaml,
    Csv,
}

impl OutputFormat {
    pub fn as_str(&self) -> &'static str {
        match self {
            OutputFormat::Table => "table",
            OutputFormat::Json => "json",
            OutputFormat::Yaml => "yaml",
            OutputFormat::Csv => "csv",
        }
    }
}

impl std::fmt::Display for OutputFormat {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl FromStr for OutputFormat {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "table" => Ok(OutputFormat::Table),
            "json" => Ok(OutputFormat::Json),
            "yaml" | "yml" => Ok(OutputFormat::Yaml),
            "csv" => Ok(OutputFormat::Csv),
            _ => Err(format!("Unknown output format: {}", s)),
        }
    }
}

/// Output writer trait
pub trait OutputWriter {
    fn write<T: Serialize>(&self, data: &T) -> CliResult<String>;
}

/// Get formatter for the specified format
pub fn get_formatter(format: OutputFormat) -> Box<dyn OutputWriter> {
    match format {
        OutputFormat::Table => Box::new(TableFormatter),
        OutputFormat::Json => Box::new(JsonFormatter),
        OutputFormat::Yaml => Box::new(YamlFormatter),
        OutputFormat::Csv => Box::new(CsvFormatter),
    }
}

/// CSV formatter
pub struct CsvFormatter;

impl OutputWriter for CsvFormatter {
    fn write<T: Serialize>(&self, data: &T) -> CliResult<String> {
        let json_value = serde_json::to_value(data)?;

        // Convert to CSV based on structure
        if let Some(array) = json_value.as_array() {
            if array.is_empty() {
                return Ok(String::new());
            }

            let mut wtr = csv::Writer::from_writer(vec![]);

            // Get headers from first object
            if let Some(first) = array.first() {
                if let Some(obj) = first.as_object() {
                    let headers: Vec<&String> = obj.keys().collect();
                    wtr.write_record(&headers)?;

                    // Write data rows
                    for item in array {
                        if let Some(obj) = item.as_object() {
                            let values: Vec<String> = headers
                                .iter()
                                .map(|k| {
                                    obj.get(*k)
                                        .and_then(|v| match v {
                                            serde_json::Value::String(s) => Some(s.clone()),
                                            serde_json::Value::Number(n) => Some(n.to_string()),
                                            serde_json::Value::Bool(b) => Some(b.to_string()),
                                            serde_json::Value::Null => Some(String::new()),
                                            _ => Some(serde_json::to_string(v).unwrap_or_default()),
                                        })
                                        .unwrap_or_default()
                                })
                                .collect();
                            wtr.write_record(&values)?;
                        }
                    }
                }
            }

            let data = String::from_utf8(wtr.into_inner()?)?;
            Ok(data)
        } else if let Some(obj) = json_value.as_object() {
            // Single object - write key-value pairs
            let mut wtr = csv::Writer::from_writer(vec![]);
            wtr.write_record(&["key", "value"])?;

            for (key, value) in obj {
                let value_str = match value {
                    serde_json::Value::String(s) => s.clone(),
                    serde_json::Value::Number(n) => n.to_string(),
                    serde_json::Value::Bool(b) => b.to_string(),
                    serde_json::Value::Null => String::new(),
                    _ => serde_json::to_string(value)?,
                };
                wtr.write_record(&[key, &value_str])?;
            }

            let data = String::from_utf8(wtr.into_inner()?)?;
            Ok(data)
        } else {
            Ok(format!("{}", json_value))
        }
    }
}
