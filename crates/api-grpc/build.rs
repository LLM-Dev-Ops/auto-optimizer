use std::env;
use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let proto_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR")?)
        .join("proto");

    let proto_files = vec![
        proto_dir.join("common.proto"),
        proto_dir.join("optimization.proto"),
        proto_dir.join("config.proto"),
        proto_dir.join("metrics.proto"),
        proto_dir.join("integrations.proto"),
        proto_dir.join("health.proto"),
        proto_dir.join("admin.proto"),
    ];

    let mut config = tonic_build::configure();

    // Configure type attributes for better Rust integration
    config = config
        .type_attribute(".", "#[derive(serde::Serialize, serde::Deserialize)]")
        .type_attribute(".", "#[serde(rename_all = \"camelCase\")]")
        .build_server(true)
        .build_client(true)
        .out_dir("src/generated");

    // Compile all proto files
    config.compile(&proto_files, &[proto_dir])?;

    // Re-run if proto files change
    println!("cargo:rerun-if-changed=proto/");

    Ok(())
}
