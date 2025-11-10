# LLM Auto Optimizer CLI - Developer Guide

## Project Structure

```
crates/cli/
├── Cargo.toml                    # Dependencies and package config
├── README.md                     # User documentation
├── IMPLEMENTATION_SUMMARY.md     # Technical implementation details
├── QUICK_REFERENCE.md           # Command quick reference
├── DEVELOPER_GUIDE.md           # This file
└── src/
    ├── main.rs                  # CLI entry point (310 lines)
    ├── lib.rs                   # Shared library (234 lines)
    │
    ├── client/                  # API Client Layer
    │   ├── mod.rs              # Client trait and types (351 lines)
    │   └── rest.rs             # REST client implementation (305 lines)
    │
    ├── commands/                # Command Implementations
    │   ├── mod.rs              # Command exports (13 lines)
    │   ├── service.rs          # Service management (112 lines)
    │   ├── optimize.rs         # Optimization operations (340 lines)
    │   ├── config.rs           # Configuration management (128 lines)
    │   ├── metrics.rs          # Metrics & analytics (216 lines)
    │   ├── integration.rs      # Integration management (115 lines)
    │   ├── admin.rs            # Admin operations (146 lines)
    │   └── util.rs             # Utility commands (160 lines)
    │
    ├── output/                  # Output Formatters
    │   ├── mod.rs              # Formatter interface (137 lines)
    │   ├── table.rs            # Table output (137 lines)
    │   ├── json.rs             # JSON output (26 lines)
    │   └── yaml.rs             # YAML output (26 lines)
    │
    └── interactive.rs           # Interactive mode (171 lines)

Total: 2,551 lines of Rust code
```

## Architecture Overview

### Layer Architecture

```
┌─────────────────────────────────────────┐
│           CLI Entry Point               │
│         (main.rs - clap)                │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│        Command Handlers                 │
│  (service, optimize, config, etc.)      │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│          API Client Layer               │
│      (REST client with reqwest)         │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│        Output Formatters                │
│    (table, json, yaml, csv)             │
└─────────────────────────────────────────┘
```

### Data Flow

```
User Input (CLI args)
    │
    ├─> Configuration Loading (file, env, flags)
    │
    ├─> API Client Creation
    │
    ├─> Command Execution
    │   │
    │   ├─> API Request
    │   ├─> Response Processing
    │   └─> Error Handling
    │
    └─> Output Formatting
        │
        └─> Display to User
```

## Key Components

### 1. Main Entry Point (main.rs)

**Responsibilities:**
- CLI argument parsing with clap
- Configuration loading and merging
- API client initialization
- Command routing
- Error handling and display

**Key Functions:**
```rust
async fn main()                    // Entry point
async fn run() -> CliResult<()>    // Main logic
fn load_config(cli: &Cli) -> CliResult<CliConfig>  // Config loading
fn init_tracing(verbose: bool)     // Logging setup
fn build_cli() -> clap::Command    // CLI structure
```

### 2. Library Module (lib.rs)

**Responsibilities:**
- Error type definitions
- Configuration structures
- Public API exports
- Type conversions

**Key Types:**
```rust
pub enum CliError { ... }          // Error types
pub type CliResult<T> = Result<T, CliError>
pub struct CliConfig { ... }       // Configuration
```

### 3. API Client (client/)

**Responsibilities:**
- HTTP communication with REST API
- Request/response serialization
- Authentication handling
- Error mapping

**Key Traits:**
```rust
#[async_trait]
pub trait ApiClient: Send + Sync {
    async fn health_check(&self) -> CliResult<HealthResponse>;
    async fn create_optimization(&self, ...) -> CliResult<OptimizationResponse>;
    // ... 20+ methods
}
```

**Implementation:**
```rust
pub struct RestClient {
    client: reqwest::Client,
    config: ClientConfig,
}
```

### 4. Commands (commands/)

Each command module follows this pattern:

```rust
#[derive(Debug, Subcommand)]
pub enum CommandName {
    SubCommand1 { /* args */ },
    SubCommand2 { /* args */ },
}

impl CommandName {
    pub async fn execute(
        &self,
        client: &dyn ApiClient,
        formatter: &dyn OutputWriter,
    ) -> CliResult<()> {
        match self {
            Self::SubCommand1 { .. } => { /* implementation */ }
            Self::SubCommand2 { .. } => { /* implementation */ }
        }
    }
}
```

### 5. Output Formatters (output/)

**Trait:**
```rust
pub trait OutputWriter {
    fn write<T: Serialize>(&self, data: &T) -> CliResult<String>;
}
```

**Implementations:**
- `TableFormatter` - Beautiful ASCII tables
- `JsonFormatter` - Pretty JSON
- `YamlFormatter` - YAML output
- `CsvFormatter` - CSV format

### 6. Interactive Mode (interactive.rs)

**Features:**
- Menu-driven interface
- Simplified workflows
- No command memorization
- Uses `dialoguer` for prompts

## Adding New Commands

### Step 1: Define Command Structure

Create new file in `src/commands/`:

```rust
// src/commands/mycommand.rs
use crate::{client::ApiClient, output::OutputWriter, CliResult};
use clap::Subcommand;

#[derive(Debug, Subcommand)]
pub enum MyCommand {
    /// Subcommand description
    SubCommand1 {
        /// Argument description
        #[arg(short, long)]
        my_arg: String,
    },
}

impl MyCommand {
    pub async fn execute(
        &self,
        client: &dyn ApiClient,
        formatter: &dyn OutputWriter,
    ) -> CliResult<()> {
        match self {
            Self::SubCommand1 { my_arg } => {
                // Implementation
                Ok(())
            }
        }
    }
}
```

### Step 2: Export in mod.rs

```rust
// src/commands/mod.rs
pub mod mycommand;
pub use mycommand::MyCommand;
```

### Step 3: Add to Main CLI

```rust
// src/main.rs
#[derive(Subcommand)]
enum Commands {
    // ... existing commands

    /// My new command
    #[command(name = "mycommand", about = "My command description")]
    MyCommand {
        #[command(subcommand)]
        command: MyCommand,
    },
}

// In match statement
match command {
    // ... existing matches
    Commands::MyCommand { command } => {
        command.execute(&client, formatter.as_ref()).await?;
    }
}
```

### Step 4: Add API Methods (if needed)

```rust
// src/client/mod.rs
#[async_trait]
pub trait ApiClient: Send + Sync {
    // ... existing methods

    async fn my_new_method(&self, params: MyParams) -> CliResult<MyResponse>;
}

// src/client/rest.rs
#[async_trait]
impl ApiClient for RestClient {
    // ... existing implementations

    async fn my_new_method(&self, params: MyParams) -> CliResult<MyResponse> {
        self.post("/api/v1/my-endpoint", &params).await
    }
}
```

## Error Handling Best Practices

### Pattern 1: Propagate Errors

```rust
pub async fn my_function() -> CliResult<Something> {
    let result = client.api_call().await?;  // Use ?
    Ok(result)
}
```

### Pattern 2: Add Context

```rust
pub async fn my_function() -> CliResult<Something> {
    let result = client.api_call().await
        .map_err(|e| CliError::OperationFailed(
            format!("Failed to do X: {}", e)
        ))?;
    Ok(result)
}
```

### Pattern 3: Handle Multiple Error Types

```rust
impl From<MyErrorType> for CliError {
    fn from(err: MyErrorType) -> Self {
        CliError::Serialization(err.to_string())
    }
}
```

### Pattern 4: User-Friendly Messages

```rust
if let Err(e) = operation() {
    eprintln!("{} {}", "Error:".red().bold(), e);
    println!("\n{} Try running 'llm-optimizer doctor'", "Tip:".yellow());
}
```

## Output Formatting Guidelines

### Pattern 1: Use Formatters

```rust
pub async fn my_command(&self, formatter: &dyn OutputWriter) -> CliResult<()> {
    let data = client.get_data().await?;
    let output = formatter.write(&data)?;
    println!("{}", output);
    Ok(())
}
```

### Pattern 2: Add Context

```rust
// After output
println!("\n{} Found {} items", "ℹ".blue(), items.len());
```

### Pattern 3: Use Colors

```rust
use colored::Colorize;

println!("{} Operation successful", "✓".green());
println!("{} Warning message", "⚠".yellow());
println!("{} Error occurred", "✗".red());
println!("{} Information", "ℹ".blue());
```

### Pattern 4: Progress Indicators

```rust
use indicatif::{ProgressBar, ProgressStyle};

let pb = ProgressBar::new_spinner();
pb.set_style(
    ProgressStyle::default_spinner()
        .template("{spinner:.green} {msg}")
        .unwrap(),
);
pb.set_message("Processing...");
pb.enable_steady_tick(Duration::from_millis(100));

// Do work
let result = long_operation().await?;

pb.finish_and_clear();
println!("{} Done", "✓".green());
```

## Testing

### Unit Tests

Add tests in each module:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_my_function() {
        let result = my_function();
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn test_async_function() {
        let result = async_function().await;
        assert!(result.is_ok());
    }
}
```

### Integration Tests

Create `tests/` directory:

```rust
// tests/integration_test.rs
use llm_optimizer_cli::*;

#[tokio::test]
async fn test_full_workflow() {
    // Test complete workflow
}
```

### Running Tests

```bash
# All tests
cargo test -p llm-optimizer-cli

# Specific module
cargo test -p llm-optimizer-cli client::

# With output
cargo test -p llm-optimizer-cli -- --nocapture

# Integration tests only
cargo test -p llm-optimizer-cli --test '*'
```

## Building and Debugging

### Development Build

```bash
cargo build -p llm-optimizer-cli
./target/debug/llm-optimizer --help
```

### Release Build

```bash
cargo build --release -p llm-optimizer-cli
./target/release/llm-optimizer --help
```

### Debug Logging

```bash
# Enable verbose logging
llm-optimizer --verbose service status

# Or set RUST_LOG
RUST_LOG=debug llm-optimizer service status
```

### Common Issues

**Issue**: "command not found"
```bash
# Add to PATH
export PATH="$PATH:$HOME/.cargo/bin"
```

**Issue**: Compilation errors
```bash
# Clean and rebuild
cargo clean
cargo build -p llm-optimizer-cli
```

**Issue**: API connection errors
```bash
# Check configuration
llm-optimizer doctor

# Test connectivity
curl http://localhost:8080/health
```

## Code Style

### Rust Style Guide

Follow Rust standard style:

```bash
# Format code
cargo fmt -p llm-optimizer-cli

# Check lints
cargo clippy -p llm-optimizer-cli
```

### Naming Conventions

- Functions: `snake_case`
- Types: `PascalCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Modules: `snake_case`

### Documentation

Add doc comments:

```rust
/// Performs an optimization operation
///
/// # Arguments
///
/// * `client` - The API client
/// * `request` - The optimization request
///
/// # Returns
///
/// Returns the created optimization
///
/// # Errors
///
/// Returns error if API call fails
pub async fn create_optimization(
    client: &dyn ApiClient,
    request: CreateOptimizationRequest,
) -> CliResult<OptimizationResponse> {
    // Implementation
}
```

## Performance Considerations

### Async Best Practices

```rust
// Good: Concurrent requests
let (result1, result2) = tokio::join!(
    client.request1(),
    client.request2(),
);

// Bad: Sequential requests
let result1 = client.request1().await?;
let result2 = client.request2().await?;
```

### Memory Management

```rust
// Good: Use references
fn process_data(data: &[u8]) { ... }

// Bad: Unnecessary clones
fn process_data(data: Vec<u8>) { ... }
```

### Error Handling

```rust
// Good: Early returns
if error_condition {
    return Err(CliError::InvalidInput("...".to_string()));
}

// Bad: Deep nesting
if !error_condition {
    // ... lots of code
}
```

## Extending the CLI

### Adding New Output Format

1. Create formatter in `src/output/`:
```rust
pub struct XmlFormatter;

impl OutputWriter for XmlFormatter {
    fn write<T: Serialize>(&self, data: &T) -> CliResult<String> {
        // Implementation
    }
}
```

2. Add to OutputFormat enum:
```rust
pub enum OutputFormat {
    Table,
    Json,
    Yaml,
    Csv,
    Xml,  // New
}
```

3. Update get_formatter:
```rust
pub fn get_formatter(format: OutputFormat) -> Box<dyn OutputWriter> {
    match format {
        // ... existing
        OutputFormat::Xml => Box::new(XmlFormatter),
    }
}
```

### Adding New Integration Type

1. Add to client types:
```rust
pub struct AddIntegrationRequest {
    pub integration_type: String,  // e.g., "newtype"
    // ...
}
```

2. Update documentation
3. Add examples

## Resources

### Documentation
- User Guide: `README.md`
- Technical Details: `IMPLEMENTATION_SUMMARY.md`
- Quick Reference: `QUICK_REFERENCE.md`

### External Resources
- Clap Documentation: https://docs.rs/clap
- Tokio Guide: https://tokio.rs/tokio/tutorial
- Reqwest: https://docs.rs/reqwest

### Tools
- Cargo: https://doc.rust-lang.org/cargo/
- Rustfmt: https://github.com/rust-lang/rustfmt
- Clippy: https://github.com/rust-lang/rust-clippy

## Contributing

### Workflow

1. Create feature branch
2. Implement changes
3. Add tests
4. Run `cargo fmt` and `cargo clippy`
5. Test manually
6. Create pull request

### Checklist

- [ ] Code compiles without warnings
- [ ] Tests pass
- [ ] Documentation updated
- [ ] Examples added (if applicable)
- [ ] Error handling comprehensive
- [ ] No unwrap() in production code

## Support

For questions or issues:
1. Check documentation first
2. Run `llm-optimizer doctor`
3. Enable verbose logging
4. Check GitHub issues
5. Create new issue with details

## License

Apache-2.0 - See LICENSE file for details.
