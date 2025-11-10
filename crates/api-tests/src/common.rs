//! Common testing utilities and shared test infrastructure

use std::time::Duration;
use tokio::time::timeout;

/// Default timeout for API requests in tests
pub const DEFAULT_TIMEOUT: Duration = Duration::from_secs(30);

/// Default timeout for load tests
pub const LOAD_TEST_TIMEOUT: Duration = Duration::from_secs(300);

/// Maximum concurrent connections for load tests
pub const MAX_CONCURRENT_CONNECTIONS: usize = 1000;

/// Target requests per second for performance benchmarks
pub const TARGET_RPS: u32 = 10000;

/// Run an async test with timeout
pub async fn with_timeout<F, T>(duration: Duration, f: F) -> Result<T, tokio::time::error::Elapsed>
where
    F: std::future::Future<Output = T>,
{
    timeout(duration, f).await
}

/// Assert response time is within acceptable limits
pub fn assert_latency_acceptable(duration: Duration, max_ms: u64) {
    assert!(
        duration.as_millis() <= max_ms as u128,
        "Latency {} ms exceeds maximum {} ms",
        duration.as_millis(),
        max_ms
    );
}

/// Calculate percentile from sorted durations
pub fn calculate_percentile(durations: &mut [Duration], percentile: f64) -> Duration {
    durations.sort();
    let index = ((durations.len() as f64 * percentile) as usize).min(durations.len() - 1);
    durations[index]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_with_timeout_success() {
        let result = with_timeout(Duration::from_secs(1), async { 42 }).await;
        assert_eq!(result.unwrap(), 42);
    }

    #[tokio::test]
    async fn test_with_timeout_failure() {
        let result = with_timeout(Duration::from_millis(10), async {
            tokio::time::sleep(Duration::from_secs(1)).await;
            42
        })
        .await;
        assert!(result.is_err());
    }

    #[test]
    fn test_calculate_percentile() {
        let mut durations = vec![
            Duration::from_millis(10),
            Duration::from_millis(20),
            Duration::from_millis(30),
            Duration::from_millis(40),
            Duration::from_millis(50),
        ];
        let p50 = calculate_percentile(&mut durations, 0.5);
        assert_eq!(p50, Duration::from_millis(30));
    }
}
