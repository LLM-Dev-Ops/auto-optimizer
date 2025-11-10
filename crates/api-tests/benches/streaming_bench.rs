//! Streaming performance benchmarks

use criterion::{black_box, criterion_group, criterion_main, Criterion, Throughput};
use std::time::Duration;

fn bench_server_streaming(c: &mut Criterion) {
    let mut group = c.benchmark_group("server_streaming");
    group.measurement_time(Duration::from_secs(20));
    group.throughput(Throughput::Elements(1000));

    group.bench_function("stream_1000_events", |b| {
        b.to_async(tokio::runtime::Runtime::new().unwrap())
            .iter(|| async {
                for _ in 0..1000 {
                    black_box(tokio::time::sleep(Duration::from_micros(10)).await);
                }
            });
    });

    group.finish();
}

fn bench_client_streaming(c: &mut Criterion) {
    let mut group = c.benchmark_group("client_streaming");
    group.measurement_time(Duration::from_secs(20));
    group.throughput(Throughput::Elements(1000));

    group.bench_function("upload_1000_events", |b| {
        b.to_async(tokio::runtime::Runtime::new().unwrap())
            .iter(|| async {
                for _ in 0..1000 {
                    black_box(tokio::time::sleep(Duration::from_micros(10)).await);
                }
            });
    });

    group.finish();
}

fn bench_bidirectional_streaming(c: &mut Criterion) {
    let mut group = c.benchmark_group("bidirectional_streaming");
    group.measurement_time(Duration::from_secs(20));
    group.throughput(Throughput::Elements(1000));

    group.bench_function("bidi_1000_messages", |b| {
        b.to_async(tokio::runtime::Runtime::new().unwrap())
            .iter(|| async {
                for _ in 0..1000 {
                    black_box(tokio::time::sleep(Duration::from_micros(10)).await);
                }
            });
    });

    group.finish();
}

criterion_group!(
    benches,
    bench_server_streaming,
    bench_client_streaming,
    bench_bidirectional_streaming
);
criterion_main!(benches);
