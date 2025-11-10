# User Guide

Complete guide for using LLM Auto Optimizer.

## Table of Contents

1. [Introduction](#introduction)
2. [Installation](#installation)
3. [Configuration](#configuration)
4. [Core Concepts](#core-concepts)
5. [Basic Usage](#basic-usage)
6. [Advanced Features](#advanced-features)
7. [Monitoring](#monitoring)
8. [Best Practices](#best-practices)

## Introduction

LLM Auto Optimizer automatically optimizes your LLM infrastructure through continuous feedback loops. It monitors performance, cost, and quality metrics to make intelligent optimization decisions.

### Key Features

- **Automatic Cost Reduction**: 30-60% cost savings through intelligent model selection
- **Performance Optimization**: Sub-second decision latency
- **Quality Assurance**: Maintains or improves response quality
- **Canary Deployments**: Safe, gradual rollouts with automatic rollback
- **Multi-Objective Optimization**: Balance cost, latency, and quality

## Installation

### From Source

```bash
git clone https://github.com/globalbusinessadvisors/llm-auto-optimizer.git
cd llm-auto-optimizer
cargo build --release
```

### Using Docker

```bash
docker pull llm-auto-optimizer:latest
docker run -p 8080:8080 llm-auto-optimizer:latest
```

### Using Helm (Kubernetes)

```bash
helm repo add llm-optimizer https://charts.llmdevops.dev
helm install optimizer llm-optimizer/llm-auto-optimizer
```

## Configuration

### Basic Configuration

Create `config.yaml`:

```yaml
server:
  host: 0.0.0.0
  port: 8080
  timeout_ms: 30000

database:
  url: postgresql://localhost/optimizer
  max_connections: 20
  timeout_sec: 5

redis:
  url: redis://localhost:6379
  max_connections: 10

kafka:
  brokers:
    - localhost:9092
  topic: llm-feedback
  group_id: optimizer-group

optimization:
  enabled: true
  interval_sec: 300  # Run every 5 minutes
  strategies:
    - model_selection
    - prompt_optimization
    - cost_reduction
```

### Environment Variables

Override config with environment variables:

```bash
export SERVER_PORT=9090
export DATABASE_URL=postgresql://prod/optimizer
export KAFKA_BROKERS=kafka1:9092,kafka2:9092
export LOG_LEVEL=info
```

## Core Concepts

### Feedback Loop

The optimizer operates in a continuous feedback loop:

1. **Collect**: Gather metrics from LLM services
2. **Analyze**: Process metrics to identify patterns
3. **Decide**: Determine optimal configuration
4. **Deploy**: Gradually roll out changes
5. **Monitor**: Track impact and rollback if needed

### Optimization Strategies

#### 1. Model Selection

Automatically choose the best model for each request:

```yaml
model_selection:
  enabled: true
  models:
    - gpt-4
    - gpt-3.5-turbo
    - claude-3-opus
    - claude-3-sonnet
  criteria:
    - cost
    - latency
    - quality
```

#### 2. Prompt Optimization

A/B test prompt variations:

```yaml
prompt_optimization:
  enabled: true
  test_duration_sec: 3600
  significance_level: 0.05
  metrics:
    - user_satisfaction
    - response_quality
```

#### 3. Cost Reduction

Minimize costs while maintaining quality:

```yaml
cost_reduction:
  enabled: true
  target_reduction: 0.40  # 40% reduction
  quality_threshold: 0.95  # Min 95% quality
```

## Basic Usage

### Starting the Service

```bash
# Development mode
cargo run

# Production mode
cargo run --release

# With custom config
cargo run -- --config /path/to/config.yaml
```

### REST API

#### Create Optimization

```bash
curl -X POST http://localhost:8080/api/v1/optimize \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Cost Optimization",
    "strategy": "cost_reduction",
    "parameters": {
      "target_reduction": "0.40"
    }
  }'
```

#### Get Status

```bash
curl http://localhost:8080/api/v1/optimize/{id}
```

#### List Optimizations

```bash
curl http://localhost:8080/api/v1/optimize
```

### CLI Usage

```bash
# Create optimization
llm-optimizer optimize create \
  --name "Cost Optimization" \
  --strategy cost_reduction

# List optimizations
llm-optimizer optimize list

# Get status
llm-optimizer optimize status {id}

# Deploy optimization
llm-optimizer optimize deploy {id}

# Rollback
llm-optimizer optimize rollback {id}
```

## Advanced Features

### Canary Deployments

Gradually roll out changes with automatic rollback:

```yaml
deployment:
  canary:
    enabled: true
    stages:
      - percentage: 10
        duration_sec: 300
      - percentage: 50
        duration_sec: 600
      - percentage: 100
    health_check:
      error_rate_threshold: 0.01
      latency_p95_threshold_ms: 1000
```

### Multi-Objective Optimization

Balance multiple objectives:

```yaml
optimization:
  multi_objective:
    enabled: true
    objectives:
      - name: cost
        weight: 0.4
        direction: minimize
      - name: latency
        weight: 0.3
        direction: minimize
      - name: quality
        weight: 0.3
        direction: maximize
```

### Custom Metrics

Define custom metrics:

```yaml
metrics:
  custom:
    - name: user_satisfaction
      type: gauge
      aggregation: mean
    - name: business_value
      type: counter
      aggregation: sum
```

## Monitoring

### Prometheus Metrics

Access metrics at `http://localhost:8080/metrics`:

```
# Cost metrics
llm_optimizer_cost_total
llm_optimizer_cost_savings

# Performance metrics
llm_optimizer_latency_seconds
llm_optimizer_requests_total

# Quality metrics
llm_optimizer_quality_score
llm_optimizer_error_rate
```

### Grafana Dashboards

Import pre-built dashboards from `monitoring/grafana/`:

- Cost Overview Dashboard
- Performance Dashboard
- Quality Metrics Dashboard
- Optimization History Dashboard

### Health Checks

```bash
# Basic health
curl http://localhost:8080/health

# Detailed health
curl http://localhost:8080/health/detailed
```

## Best Practices

### 1. Start Small

Begin with one optimization strategy:

```yaml
optimization:
  strategies:
    - cost_reduction  # Start here
```

### 2. Monitor Closely

Watch metrics during first week:

```bash
# Check metrics every hour
watch -n 3600 'curl http://localhost:8080/metrics | grep cost'
```

### 3. Use Canary Deployments

Always use gradual rollouts:

```yaml
deployment:
  canary:
    enabled: true  # Always enable
```

### 4. Set Quality Thresholds

Never compromise quality:

```yaml
optimization:
  quality_threshold: 0.95  # Maintain 95%+ quality
```

### 5. Regular Backups

Backup configurations regularly:

```bash
# Backup configurations
curl http://localhost:8080/api/v1/config/export > backup.yaml
```

### 6. Test in Staging

Test optimizations in staging first:

```yaml
deployment:
  environment: staging
  auto_promote: false  # Manual promotion to prod
```

## Common Use Cases

### Reduce Costs by 40%

```yaml
optimization:
  strategies:
    - cost_reduction
  cost_reduction:
    target: 0.40
    quality_threshold: 0.95
```

### Improve Latency

```yaml
optimization:
  strategies:
    - latency_optimization
  latency_optimization:
    target_p95_ms: 500
    quality_threshold: 0.90
```

### A/B Test Prompts

```yaml
optimization:
  strategies:
    - prompt_optimization
  prompt_optimization:
    variants:
      - "You are a helpful assistant. {question}"
      - "Help me with: {question}"
    test_duration_sec: 3600
```

## Troubleshooting

See [Troubleshooting Guide](troubleshooting.md) for common issues and solutions.

## Next Steps

- [Administrator Guide](admin-guide.md)
- [API Reference](api-reference.md)
- [Configuration Reference](configuration-reference.md)
- [Architecture Documentation](architecture.md)
