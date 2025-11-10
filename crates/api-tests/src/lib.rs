//! Comprehensive API Testing Suite
//!
//! This crate provides extensive testing coverage for REST APIs, gRPC APIs, and API Gateway
//! with security validation, performance benchmarks, and integration tests.

pub mod common;
pub mod fixtures;
pub mod helpers;

// Re-export commonly used testing utilities
pub use common::*;
pub use fixtures::*;
pub use helpers::*;

/// Test result type
pub type TestResult<T = ()> = Result<T, Box<dyn std::error::Error + Send + Sync>>;
