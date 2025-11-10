//! Load testing benchmarks

use criterion::{black_box, criterion_group, criterion_main, Criterion, Throughput};
use std::time::Duration;

fn bench_concurrent_requests(c: &mut Criterion) {
    let mut group = c.benchmark_group("concurrent_requests");
    group.measurement_time(Duration::from_secs(30));

    for concurrency in [10, 50, 100, 500, 1000].iter() {
        group.throughput(Throughput::Elements(*concurrency as u64));
        group.bench_with_input(
            criterion::BenchmarkId::from_parameter(concurrency),
            concurrency,
            |b, &concurrency| {
                b.to_async(tokio::runtime::Runtime::new().unwrap())
                    .iter(|| async move {
                        let mut tasks = vec![];
                        for _ in 0..concurrency {
                            tasks.push(tokio::spawn(async {
                                // Simulate API request
                                tokio::time::sleep(Duration::from_millis(10)).await;
                            }));
                        }
                        futures::future::join_all(tasks).await;
                    });
            },
        );
    }

    group.finish();
}

fn bench_throughput(c: &mut Criterion) {
    let mut group = c.benchmark_group("throughput");
    group.measurement_time(Duration::from_secs(30));
    group.throughput(Throughput::Elements(1000));

    group.bench_function("requests_per_second", |b| {
        b.to_async(tokio::runtime::Runtime::new().unwrap())
            .iter(|| async {
                // Simulate handling 1000 requests
                for _ in 0..1000 {
                    black_box(tokio::time::sleep(Duration::from_micros(100)).await);
                }
            });
    });

    group.finish();
}

fn bench_streaming_throughput(c: &mut Criterion) {
    let mut group = c.benchmark_group("streaming_throughput");
    group.measurement_time(Duration::from_secs(30));
    group.throughput(Throughput::Elements(10000));

    group.bench_function("stream_10k_messages", |b| {
        b.to_async(tokio::runtime::Runtime::new().unwrap())
            .iter(|| async {
                // Simulate streaming 10k messages
                for _ in 0..10000 {
                    black_box(());
                }
            });
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_concurrent_requests,
    bench_throughput,
    bench_streaming_throughput
);
criterion_main!(benches);
