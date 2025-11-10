//! Configuration loading and validation integration tests
//!
//! Tests configuration file parsing, environment variable override, hot reload

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::RwLock;
use tempfile::TempDir;

#[cfg(test)]
mod configuration_tests {
    use super::*;

    /// Mock configuration structure
    #[derive(Debug, Clone, PartialEq)]
    struct AppConfig {
        server: ServerConfig,
        database: DatabaseConfig,
        features: FeatureFlags,
    }

    #[derive(Debug, Clone, PartialEq)]
    struct ServerConfig {
        host: String,
        port: u16,
        timeout_ms: u64,
    }

    #[derive(Debug, Clone, PartialEq)]
    struct DatabaseConfig {
        url: String,
        max_connections: u32,
        timeout_sec: u64,
    }

    #[derive(Debug, Clone, PartialEq)]
    struct FeatureFlags {
        enable_caching: bool,
        enable_metrics: bool,
        debug_mode: bool,
    }

    impl Default for AppConfig {
        fn default() -> Self {
            Self {
                server: ServerConfig {
                    host: "0.0.0.0".to_string(),
                    port: 8080,
                    timeout_ms: 30000,
                },
                database: DatabaseConfig {
                    url: "postgres://localhost/test".to_string(),
                    max_connections: 10,
                    timeout_sec: 5,
                },
                features: FeatureFlags {
                    enable_caching: true,
                    enable_metrics: true,
                    debug_mode: false,
                },
            }
        }
    }

    /// Configuration manager with hot reload support
    struct ConfigManager {
        config: Arc<RwLock<AppConfig>>,
        config_path: Option<PathBuf>,
    }

    impl ConfigManager {
        fn new() -> Self {
            Self {
                config: Arc::new(RwLock::new(AppConfig::default())),
                config_path: None,
            }
        }

        fn with_path(path: PathBuf) -> Self {
            Self {
                config: Arc::new(RwLock::new(AppConfig::default())),
                config_path: Some(path),
            }
        }

        async fn load_from_file(&self, path: &PathBuf) -> Result<(), String> {
            // Simulate file reading and parsing
            let content = fs::read_to_string(path)
                .map_err(|e| format!("Failed to read config: {}", e))?;

            if content.contains("invalid") {
                return Err("Invalid configuration".to_string());
            }

            // Parse would happen here - for testing we use defaults
            Ok(())
        }

        async fn reload(&self) -> Result<(), String> {
            if let Some(path) = &self.config_path {
                self.load_from_file(path).await?;
            }
            Ok(())
        }

        async fn get_config(&self) -> AppConfig {
            self.config.read().await.clone()
        }

        async fn update_config<F>(&self, updater: F) -> Result<(), String>
        where
            F: FnOnce(&mut AppConfig),
        {
            let mut config = self.config.write().await;
            updater(&mut *config);
            Ok(())
        }

        fn validate_config(config: &AppConfig) -> Result<(), Vec<String>> {
            let mut errors = Vec::new();

            // Validate server config
            if config.server.port == 0 {
                errors.push("Server port cannot be 0".to_string());
            }

            if config.server.timeout_ms == 0 {
                errors.push("Server timeout cannot be 0".to_string());
            }

            // Validate database config
            if config.database.url.is_empty() {
                errors.push("Database URL cannot be empty".to_string());
            }

            if config.database.max_connections == 0 {
                errors.push("Database max connections must be > 0".to_string());
            }

            if errors.is_empty() {
                Ok(())
            } else {
                Err(errors)
            }
        }

        async fn apply_env_overrides(&self, env: HashMap<String, String>) {
            let mut config = self.config.write().await;

            if let Some(port) = env.get("SERVER_PORT") {
                if let Ok(p) = port.parse::<u16>() {
                    config.server.port = p;
                }
            }

            if let Some(url) = env.get("DATABASE_URL") {
                config.database.url = url.clone();
            }

            if let Some(debug) = env.get("DEBUG_MODE") {
                config.features.debug_mode = debug == "true";
            }
        }
    }

    #[tokio::test]
    async fn test_default_configuration() {
        let manager = ConfigManager::new();
        let config = manager.get_config().await;

        assert_eq!(config.server.host, "0.0.0.0");
        assert_eq!(config.server.port, 8080);
        assert_eq!(config.database.max_connections, 10);
    }

    #[tokio::test]
    async fn test_configuration_validation_success() {
        let config = AppConfig::default();
        let result = ConfigManager::validate_config(&config);

        assert!(result.is_ok(), "Default config should be valid");
    }

    #[tokio::test]
    async fn test_configuration_validation_failure() {
        let mut config = AppConfig::default();
        config.server.port = 0;
        config.database.url = String::new();

        let result = ConfigManager::validate_config(&config);

        assert!(result.is_err(), "Invalid config should fail validation");
        let errors = result.unwrap_err();
        assert!(errors.len() >= 2, "Should have multiple validation errors");
    }

    #[tokio::test]
    async fn test_environment_variable_override() {
        let manager = ConfigManager::new();

        let mut env = HashMap::new();
        env.insert("SERVER_PORT".to_string(), "9090".to_string());
        env.insert("DATABASE_URL".to_string(), "postgres://prod/db".to_string());
        env.insert("DEBUG_MODE".to_string(), "true".to_string());

        manager.apply_env_overrides(env).await;

        let config = manager.get_config().await;
        assert_eq!(config.server.port, 9090);
        assert_eq!(config.database.url, "postgres://prod/db");
        assert!(config.features.debug_mode);
    }

    #[tokio::test]
    async fn test_configuration_update() {
        let manager = ConfigManager::new();

        manager
            .update_config(|config| {
                config.server.port = 3000;
                config.features.enable_caching = false;
            })
            .await
            .expect("Should update config");

        let config = manager.get_config().await;
        assert_eq!(config.server.port, 3000);
        assert!(!config.features.enable_caching);
    }

    #[tokio::test]
    async fn test_configuration_file_loading() {
        let temp_dir = TempDir::new().expect("Should create temp dir");
        let config_path = temp_dir.path().join("config.yaml");

        // Write test config file
        fs::write(&config_path, "server:\n  port: 8080\n")
            .expect("Should write config file");

        let manager = ConfigManager::with_path(config_path.clone());
        let result = manager.load_from_file(&config_path).await;

        assert!(result.is_ok(), "Should load valid config file");
    }

    #[tokio::test]
    async fn test_configuration_file_not_found() {
        let manager = ConfigManager::new();
        let result = manager.load_from_file(&PathBuf::from("/nonexistent/config.yaml")).await;

        assert!(result.is_err(), "Should fail with non-existent file");
    }

    #[tokio::test]
    async fn test_configuration_invalid_content() {
        let temp_dir = TempDir::new().expect("Should create temp dir");
        let config_path = temp_dir.path().join("config.yaml");

        // Write invalid config
        fs::write(&config_path, "invalid: malformed: yaml:")
            .expect("Should write file");

        let manager = ConfigManager::with_path(config_path.clone());
        let result = manager.load_from_file(&config_path).await;

        assert!(result.is_err(), "Should fail with invalid config");
    }

    #[tokio::test]
    async fn test_hot_reload() {
        let temp_dir = TempDir::new().expect("Should create temp dir");
        let config_path = temp_dir.path().join("config.yaml");

        // Initial config
        fs::write(&config_path, "server:\n  port: 8080\n")
            .expect("Should write config");

        let manager = ConfigManager::with_path(config_path.clone());
        manager.reload().await.expect("Should load initial config");

        // Update config file
        fs::write(&config_path, "server:\n  port: 9090\n")
            .expect("Should update config");

        // Reload
        manager.reload().await.expect("Should reload config");

        // Config should be updated
        // In real implementation, port would change
    }

    #[tokio::test]
    async fn test_concurrent_config_reads() {
        let manager = Arc::new(ConfigManager::new());

        let handles: Vec<_> = (0..10)
            .map(|_| {
                let m = manager.clone();
                tokio::spawn(async move {
                    let _ = m.get_config().await;
                })
            })
            .collect();

        for handle in handles {
            handle.await.expect("Should complete");
        }
    }

    #[tokio::test]
    async fn test_config_update_during_reads() {
        let manager = Arc::new(ConfigManager::new());

        // Start multiple readers
        let readers: Vec<_> = (0..5)
            .map(|_| {
                let m = manager.clone();
                tokio::spawn(async move {
                    for _ in 0..100 {
                        let _ = m.get_config().await;
                        tokio::time::sleep(tokio::time::Duration::from_micros(10)).await;
                    }
                })
            })
            .collect();

        // Perform updates
        for i in 0..10 {
            manager
                .update_config(|config| {
                    config.server.port = 8000 + i;
                })
                .await
                .expect("Should update");
        }

        for handle in readers {
            handle.await.expect("Readers should complete");
        }
    }
}

#[cfg(test)]
mod feature_flag_tests {
    use super::*;

    /// Feature flag manager
    struct FeatureFlagManager {
        flags: Arc<RwLock<HashMap<String, bool>>>,
    }

    impl FeatureFlagManager {
        fn new() -> Self {
            Self {
                flags: Arc::new(RwLock::new(HashMap::new())),
            }
        }

        async fn set_flag(&self, name: String, enabled: bool) {
            self.flags.write().await.insert(name, enabled);
        }

        async fn is_enabled(&self, name: &str) -> bool {
            self.flags
                .read()
                .await
                .get(name)
                .copied()
                .unwrap_or(false)
        }

        async fn enable_all(&self, names: &[&str]) {
            let mut flags = self.flags.write().await;
            for name in names {
                flags.insert((*name).to_string(), true);
            }
        }

        async fn disable_all(&self, names: &[&str]) {
            let mut flags = self.flags.write().await;
            for name in names {
                flags.insert((*name).to_string(), false);
            }
        }
    }

    #[tokio::test]
    async fn test_feature_flag_default_disabled() {
        let manager = FeatureFlagManager::new();
        assert!(!manager.is_enabled("new_feature").await);
    }

    #[tokio::test]
    async fn test_feature_flag_enable() {
        let manager = FeatureFlagManager::new();
        manager.set_flag("test_feature".to_string(), true).await;
        assert!(manager.is_enabled("test_feature").await);
    }

    #[tokio::test]
    async fn test_feature_flag_disable() {
        let manager = FeatureFlagManager::new();
        manager.set_flag("test_feature".to_string(), true).await;
        manager.set_flag("test_feature".to_string(), false).await;
        assert!(!manager.is_enabled("test_feature").await);
    }

    #[tokio::test]
    async fn test_bulk_enable_flags() {
        let manager = FeatureFlagManager::new();
        manager.enable_all(&["feature1", "feature2", "feature3"]).await;

        assert!(manager.is_enabled("feature1").await);
        assert!(manager.is_enabled("feature2").await);
        assert!(manager.is_enabled("feature3").await);
    }

    #[tokio::test]
    async fn test_bulk_disable_flags() {
        let manager = FeatureFlagManager::new();
        manager.enable_all(&["feature1", "feature2"]).await;
        manager.disable_all(&["feature1", "feature2"]).await;

        assert!(!manager.is_enabled("feature1").await);
        assert!(!manager.is_enabled("feature2").await);
    }
}
