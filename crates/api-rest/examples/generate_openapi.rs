//! Example to generate OpenAPI specification

use llm_optimizer_api_rest::openapi::{generate_openapi_json, generate_openapi_yaml};
use std::fs;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Generate YAML
    let yaml = generate_openapi_yaml()?;
    fs::write("openapi.yaml", yaml)?;
    println!("OpenAPI YAML specification written to openapi.yaml");

    // Generate JSON
    let json = generate_openapi_json()?;
    fs::write("openapi.json", json)?;
    println!("OpenAPI JSON specification written to openapi.json");

    Ok(())
}
