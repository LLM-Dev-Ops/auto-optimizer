//! Latency benchmarks for API endpoints

use criterion::{black_box, criterion_group, criterion_main, Criterion, BenchmarkId};
use std::time::Duration;

fn bench_rest_api_latency(c: &mut Criterion) {
    let mut group = c.benchmark_group("rest_api_latency");
    group.measurement_time(Duration::from_secs(10));

    // Benchmark different endpoint types
    for endpoint_type in ["get", "post", "put", "delete"].iter() {
        group.bench_with_input(
            BenchmarkId::from_parameter(endpoint_type),
            endpoint_type,
            |b, _endpoint_type| {
                b.to_async(tokio::runtime::Runtime::new().unwrap())
                    .iter(|| async {
                        // Simulate API call
                        black_box(tokio::time::sleep(Duration::from_micros(100)).await);
                    });
            },
        );
    }

    group.finish();
}

fn bench_grpc_api_latency(c: &mut Criterion) {
    let mut group = c.benchmark_group("grpc_api_latency");
    group.measurement_time(Duration::from_secs(10));

    for rpc_type in ["unary", "server_stream", "client_stream", "bidi_stream"].iter() {
        group.bench_with_input(
            BenchmarkId::from_parameter(rpc_type),
            rpc_type,
            |b, _rpc_type| {
                b.to_async(tokio::runtime::Runtime::new().unwrap())
                    .iter(|| async {
                        black_box(tokio::time::sleep(Duration::from_micros(50)).await);
                    });
            },
        );
    }

    group.finish();
}

fn bench_authentication_overhead(c: &mut Criterion) {
    c.bench_function("jwt_validation", |b| {
        b.iter(|| {
            // Benchmark JWT token validation
            black_box(std::thread::sleep(Duration::from_micros(10)));
        });
    });

    c.bench_function("api_key_validation", |b| {
        b.iter(|| {
            // Benchmark API key validation
            black_box(std::thread::sleep(Duration::from_micros(5)));
        });
    });
}

criterion_group!(
    benches,
    bench_rest_api_latency,
    bench_grpc_api_latency,
    bench_authentication_overhead
);
criterion_main!(benches);
