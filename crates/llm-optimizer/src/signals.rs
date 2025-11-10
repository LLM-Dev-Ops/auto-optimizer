//! Signal handling for graceful shutdown and configuration reload
//!
//! This module provides Unix signal handling for:
//! - SIGTERM/SIGINT: Graceful shutdown
//! - SIGHUP: Configuration reload

use anyhow::Result;
use tokio::signal;
use tokio::sync::broadcast;
use tracing::{info, warn};

/// Signal types
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SignalType {
    /// Shutdown signal (SIGTERM, SIGINT)
    Shutdown,
    /// Reload signal (SIGHUP)
    Reload,
}

/// Signal handler
pub struct SignalHandler {
    shutdown_tx: broadcast::Sender<()>,
    reload_tx: broadcast::Sender<()>,
}

impl SignalHandler {
    /// Create a new signal handler
    pub fn new() -> Self {
        let (shutdown_tx, _) = broadcast::channel(16);
        let (reload_tx, _) = broadcast::channel(16);

        Self {
            shutdown_tx,
            reload_tx,
        }
    }

    /// Subscribe to shutdown signals
    pub fn subscribe_shutdown(&self) -> broadcast::Receiver<()> {
        self.shutdown_tx.subscribe()
    }

    /// Subscribe to reload signals
    pub fn subscribe_reload(&self) -> broadcast::Receiver<()> {
        self.reload_tx.subscribe()
    }

    /// Start listening for signals
    pub async fn listen(self) -> Result<()> {
        info!("Starting signal handler");

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    // Handle SIGTERM
                    _ = signal::ctrl_c() => {
                        info!("Received SIGINT (Ctrl+C), initiating graceful shutdown");
                        let _ = self.shutdown_tx.send(());
                        break;
                    }

                    // Handle SIGTERM (Unix only)
                    #[cfg(unix)]
                    _ = Self::wait_for_sigterm() => {
                        info!("Received SIGTERM, initiating graceful shutdown");
                        let _ = self.shutdown_tx.send(());
                        break;
                    }

                    // Handle SIGHUP (Unix only)
                    #[cfg(unix)]
                    _ = Self::wait_for_sighup() => {
                        info!("Received SIGHUP, triggering configuration reload");
                        let _ = self.reload_tx.send(());
                    }
                }
            }

            info!("Signal handler stopped");
        });

        Ok(())
    }

    /// Wait for SIGTERM signal (Unix only)
    #[cfg(unix)]
    async fn wait_for_sigterm() {
        use signal::unix::{signal, SignalKind};

        let mut sigterm = signal(SignalKind::terminate())
            .expect("Failed to register SIGTERM handler");

        sigterm.recv().await;
    }

    /// Wait for SIGHUP signal (Unix only)
    #[cfg(unix)]
    async fn wait_for_sighup() {
        use signal::unix::{signal, SignalKind};

        let mut sighup = signal(SignalKind::hangup())
            .expect("Failed to register SIGHUP handler");

        sighup.recv().await;
    }
}

impl Default for SignalHandler {
    fn default() -> Self {
        Self::new()
    }
}

/// Wait for shutdown signal
pub async fn wait_for_shutdown() {
    let handler = SignalHandler::new();
    let mut rx = handler.subscribe_shutdown();

    // Start listening in background
    let _ = handler.listen().await;

    // Wait for shutdown signal
    let _ = rx.recv().await;
}

/// Graceful shutdown coordinator
pub struct ShutdownCoordinator {
    signal_handler: SignalHandler,
    shutdown_timeout_secs: u64,
}

impl ShutdownCoordinator {
    /// Create a new shutdown coordinator
    pub fn new(shutdown_timeout_secs: u64) -> Self {
        Self {
            signal_handler: SignalHandler::new(),
            shutdown_timeout_secs,
        }
    }

    /// Subscribe to shutdown signals
    pub fn subscribe_shutdown(&self) -> broadcast::Receiver<()> {
        self.signal_handler.subscribe_shutdown()
    }

    /// Subscribe to reload signals
    pub fn subscribe_reload(&self) -> broadcast::Receiver<()> {
        self.signal_handler.subscribe_reload()
    }

    /// Start the coordinator
    pub async fn start(self) -> Result<()> {
        self.signal_handler.listen().await
    }

    /// Wait for shutdown with timeout
    pub async fn wait_for_shutdown_with_timeout(&self) -> Result<()> {
        let mut rx = self.subscribe_shutdown();

        tokio::select! {
            _ = rx.recv() => {
                info!("Graceful shutdown initiated");
                Ok(())
            }
            _ = tokio::time::sleep(tokio::time::Duration::from_secs(self.shutdown_timeout_secs)) => {
                warn!("Shutdown timeout reached, forcing shutdown");
                Ok(())
            }
        }
    }
}

impl Default for ShutdownCoordinator {
    fn default() -> Self {
        Self::new(30)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_signal_handler_creation() {
        let handler = SignalHandler::new();
        let _shutdown_rx = handler.subscribe_shutdown();
        let _reload_rx = handler.subscribe_reload();
    }

    #[test]
    fn test_shutdown_coordinator_creation() {
        let coordinator = ShutdownCoordinator::new(30);
        let _shutdown_rx = coordinator.subscribe_shutdown();
        let _reload_rx = coordinator.subscribe_reload();
    }

    #[test]
    fn test_signal_type_equality() {
        assert_eq!(SignalType::Shutdown, SignalType::Shutdown);
        assert_ne!(SignalType::Shutdown, SignalType::Reload);
    }
}
