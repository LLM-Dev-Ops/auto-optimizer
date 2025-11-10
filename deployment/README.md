# LLM Auto Optimizer - Deployment Guide

Complete deployment documentation for all supported platforms and environments.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Deployment Methods](#deployment-methods)
  - [Docker](#docker)
  - [Docker Compose](#docker-compose)
  - [Kubernetes](#kubernetes)
  - [Helm](#helm)
  - [Systemd](#systemd)
- [Configuration](#configuration)
- [Monitoring](#monitoring)
- [Operations](#operations)
- [Troubleshooting](#troubleshooting)
- [Security](#security)
- [Performance Tuning](#performance-tuning)

---

## Overview

The LLM Auto Optimizer supports multiple deployment methods:

| Method | Use Case | Complexity | Production Ready |
|--------|----------|------------|------------------|
| Docker | Local development, testing | Low | No |
| Docker Compose | Multi-service local setup | Low | No |
| Kubernetes | Production, scalable | Medium | Yes |
| Helm | Production, managed K8s | Low | Yes |
| Systemd | Bare metal, VM | Medium | Yes |

---

## Prerequisites

### Common Requirements

- **Rust 1.75+** (for building from source)
- **PostgreSQL 15+** or SQLite
- **Redis 7+**
- **Kafka 3.x** (optional, for Sentinel integration)

### Platform-Specific

#### Docker
- Docker 20.10+
- Docker Compose 2.0+

#### Kubernetes
- Kubernetes 1.24+
- kubectl configured
- Ingress controller (nginx recommended)
- cert-manager (for TLS)

#### Helm
- Helm 3.10+

#### Systemd
- Linux with systemd (Ubuntu 20.04+, Debian 11+, CentOS 8+)
- sudo access

---

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/globalbusinessadvisors/llm-auto-optimizer.git
cd llm-auto-optimizer
```

### 2. Choose Your Deployment Method

**For local development:**
```bash
make docker-compose-up
```

**For production (Helm):**
```bash
helm install llm-optimizer deployment/helm \
  --namespace llm-optimizer \
  --create-namespace
```

**For bare metal (systemd):**
```bash
cargo build --release
sudo deployment/systemd/install.sh
```

---

## Deployment Methods

### Docker

#### Build Images

```bash
# Service image
docker build -f deployment/docker/Dockerfile.service -t llm-auto-optimizer:latest .

# CLI image
docker build -f deployment/docker/Dockerfile.cli -t llm-auto-optimizer-cli:latest .
```

#### Run Container

```bash
docker run -d \
  --name llm-optimizer \
  -p 8080:8080 \
  -p 50051:50051 \
  -v $(pwd)/config.yaml:/app/config/config.yaml:ro \
  -v llm-optimizer-data:/app/data \
  -e OPTIMIZER_DATABASE__CONNECTION_STRING=postgres://user:pass@host/db \
  -e REDIS_URL=redis://host:6379 \
  llm-auto-optimizer:latest
```

#### Health Check

```bash
curl http://localhost:8080/health
```

---

### Docker Compose

#### Development Setup

```bash
cd deployment/docker
docker-compose up -d
```

This starts:
- LLM Auto Optimizer service
- PostgreSQL
- Redis
- Kafka + Zookeeper
- Prometheus
- Grafana
- Jaeger
- pgAdmin
- Redis Commander

#### Access Services

- **Optimizer API**: http://localhost:8080
- **Metrics**: http://localhost:9090/metrics
- **Grafana**: http://localhost:3000 (admin/admin)
- **Prometheus**: http://localhost:9091
- **Jaeger UI**: http://localhost:16686
- **pgAdmin**: http://localhost:5050
- **Redis Commander**: http://localhost:8081

#### Production Setup

```bash
# Edit environment variables
cp deployment/docker/docker-compose.prod.yml docker-compose.yml

# Configure secrets
mkdir -p /etc/llm-optimizer/secrets
echo "your-db-password" > /etc/llm-optimizer/secrets/db_password.txt
echo "your-redis-password" > /etc/llm-optimizer/secrets/redis_password.txt

# Deploy
docker-compose up -d
```

#### View Logs

```bash
docker-compose logs -f llm-optimizer
```

#### Stop Services

```bash
docker-compose down
```

---

### Kubernetes

#### Prerequisites

```bash
# Create namespace
kubectl create namespace llm-optimizer

# Install cert-manager (for TLS)
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
```

#### Deploy

```bash
cd deployment/kubernetes

# Apply all manifests
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml
kubectl apply -f secret.yaml
kubectl apply -f pvc.yaml
kubectl apply -f serviceaccount.yaml
kubectl apply -f deployment.yaml
kubectl apply -f service.yaml
kubectl apply -f ingress.yaml
kubectl apply -f hpa.yaml
kubectl apply -f networkpolicy.yaml
kubectl apply -f poddisruptionbudget.yaml
```

#### Or use the Makefile:

```bash
make k8s-apply
```

#### Verify Deployment

```bash
# Check pods
kubectl get pods -n llm-optimizer

# Check services
kubectl get svc -n llm-optimizer

# Check ingress
kubectl get ingress -n llm-optimizer

# View logs
kubectl logs -n llm-optimizer -l app.kubernetes.io/name=llm-optimizer -f
```

#### Scale Deployment

```bash
# Manual scaling
kubectl scale deployment llm-optimizer -n llm-optimizer --replicas=5

# HPA will auto-scale between 2-10 replicas based on CPU/memory
```

#### Delete Deployment

```bash
make k8s-delete
# or
kubectl delete namespace llm-optimizer
```

---

### Helm

#### Install

```bash
helm install llm-optimizer deployment/helm \
  --namespace llm-optimizer \
  --create-namespace
```

#### Custom Values

```bash
# Create custom values
cat > custom-values.yaml <<EOF
replicaCount: 3

resources:
  requests:
    cpu: 1000m
    memory: 2Gi
  limits:
    cpu: 4000m
    memory: 8Gi

ingress:
  enabled: true
  hosts:
    - host: optimizer.example.com
      paths:
        - path: /
          pathType: Prefix
          backend: http

postgresql:
  enabled: true
  auth:
    password: "secure-password"

redis:
  enabled: true
  auth:
    password: "secure-password"
EOF

# Install with custom values
helm install llm-optimizer deployment/helm \
  --namespace llm-optimizer \
  --create-namespace \
  --values custom-values.yaml
```

#### Upgrade

```bash
helm upgrade llm-optimizer deployment/helm \
  --namespace llm-optimizer \
  --values custom-values.yaml
```

#### Uninstall

```bash
helm uninstall llm-optimizer --namespace llm-optimizer
```

#### Useful Commands

```bash
# Check status
helm status llm-optimizer -n llm-optimizer

# View values
helm get values llm-optimizer -n llm-optimizer

# View all resources
helm get all llm-optimizer -n llm-optimizer

# Dry run (test installation)
helm install llm-optimizer deployment/helm \
  --namespace llm-optimizer \
  --dry-run --debug
```

---

### Systemd

#### Build from Source

```bash
cargo build --release -p llm-optimizer-api-rest -p llm-optimizer-api-grpc
```

#### Install

```bash
cd deployment/systemd
sudo ./install.sh
```

This will:
1. Create `llm-optimizer` user
2. Install binaries to `/opt/llm-optimizer`
3. Create configuration in `/etc/llm-optimizer`
4. Install systemd service
5. Configure log rotation

#### Configure

```bash
# Edit configuration
sudo nano /etc/llm-optimizer/config.yaml

# Edit environment variables
sudo nano /etc/llm-optimizer/llm-optimizer.env
```

#### Manage Service

```bash
# Enable and start
sudo systemctl enable llm-optimizer
sudo systemctl start llm-optimizer

# Check status
sudo systemctl status llm-optimizer

# View logs
sudo journalctl -u llm-optimizer -f

# Restart
sudo systemctl restart llm-optimizer

# Stop
sudo systemctl stop llm-optimizer

# Disable
sudo systemctl disable llm-optimizer
```

#### Uninstall

```bash
cd deployment/systemd
sudo ./uninstall.sh
```

---

## Configuration

### Configuration File

The main configuration file is `config.yaml`. See `config.example.yaml` for all options.

**Key sections:**

```yaml
service:
  host: "0.0.0.0"
  port: 8080
  mode: "standalone"  # sidecar, standalone, or daemon

database:
  connection_string: "postgres://user:pass@host/db"
  max_connections: 50

integrations:
  observatory_url: "http://observatory:4317"
  orchestrator_url: "http://orchestrator:8080"

strategies:
  thresholds:
    latency_p95_ms: 5000.0
    error_rate_pct: 5.0
    cost_per_request: 0.10
```

### Environment Variables

All configuration can be overridden with environment variables:

```bash
# Format: OPTIMIZER_<SECTION>__<KEY>
export OPTIMIZER_SERVICE__PORT=9090
export OPTIMIZER_DATABASE__CONNECTION_STRING="postgres://..."
export OPTIMIZER_OBSERVABILITY__LOG_LEVEL="debug"
```

### Secrets Management

#### Kubernetes Secrets

```bash
kubectl create secret generic llm-optimizer-secrets \
  --from-literal=database-url="postgres://..." \
  --from-literal=redis-url="redis://..." \
  --namespace llm-optimizer
```

#### External Secrets

For production, use external secret management:

- **Sealed Secrets**: https://github.com/bitnami-labs/sealed-secrets
- **External Secrets Operator**: https://external-secrets.io/
- **HashiCorp Vault**: https://www.vaultproject.io/
- **AWS Secrets Manager**
- **Azure Key Vault**
- **Google Secret Manager**

---

## Monitoring

### Metrics

Prometheus metrics are exposed at `/metrics` endpoint.

**Key metrics:**
- `http_requests_total` - Total HTTP requests
- `http_request_duration_seconds` - Request latency
- `optimization_cycle_duration_seconds` - Optimization cycle time
- `optimization_cost_total` - Total optimization cost
- `optimization_quality_score` - Quality score
- `drift_score` - Drift detection score

### Prometheus

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'llm-optimizer'
    static_configs:
      - targets: ['llm-optimizer:9090']
    scrape_interval: 15s
```

### Grafana Dashboards

Import the dashboard from `deployment/monitoring/grafana-dashboard.json`

**Dashboard includes:**
- Request rate and latency
- Error rates
- Resource usage (CPU, memory)
- Optimization metrics
- Database and cache performance

### Alerts

Alert rules are defined in `deployment/monitoring/alert-rules.yml`

**Key alerts:**
- Service down
- High error rate
- High latency
- Memory leaks
- Database connection pool exhausted
- Cost increase
- Quality degradation

### Distributed Tracing

Configure Jaeger for distributed tracing:

```yaml
observability:
  traces_endpoint: "http://jaeger:14268/api/traces"
```

---

## Operations

### Backup and Restore

#### Backup

```bash
./deployment/scripts/backup.sh
```

Creates backup of:
- PostgreSQL database
- Redis data
- Configuration files
- Application data

#### Restore

```bash
./deployment/scripts/restore.sh /path/to/backup.tar.gz
```

### Database Migrations

```bash
# Run migrations
./deployment/scripts/migrate.sh

# Or directly
/opt/llm-optimizer/bin/llm-optimizer-service migrate --config /etc/llm-optimizer/config.yaml
```

### Health Checks

```bash
./deployment/scripts/health-check.sh
```

Checks:
- HTTP endpoint
- gRPC endpoint (if available)
- PostgreSQL connection
- Redis connection

### Logs

#### Docker Compose

```bash
docker-compose logs -f llm-optimizer
```

#### Kubernetes

```bash
kubectl logs -n llm-optimizer -l app.kubernetes.io/name=llm-optimizer -f
```

#### Systemd

```bash
sudo journalctl -u llm-optimizer -f
```

---

## Troubleshooting

### Common Issues

#### Service Won't Start

1. Check configuration:
```bash
cat /etc/llm-optimizer/config.yaml
```

2. Verify database connection:
```bash
psql "postgresql://user:pass@host/db"
```

3. Check logs:
```bash
# Kubernetes
kubectl logs -n llm-optimizer deployment/llm-optimizer

# Systemd
sudo journalctl -u llm-optimizer -n 100
```

#### High Memory Usage

1. Check memory limits:
```bash
# Kubernetes
kubectl describe pod -n llm-optimizer

# Systemd
systemctl show llm-optimizer | grep Memory
```

2. Adjust configuration:
```yaml
strategies:
  thresholds:
    # Reduce thresholds to lower memory usage
```

#### Database Connection Errors

1. Verify database is running:
```bash
pg_isready -h hostname -p 5432
```

2. Check connection string
3. Verify network connectivity
4. Check connection pool settings

#### High Latency

1. Check database query performance
2. Verify Redis is accessible
3. Check resource limits (CPU throttling)
4. Review optimization intervals

### Debug Mode

Enable debug logging:

```bash
# Environment variable
export RUST_LOG=debug

# Or in config
observability:
  log_level: "debug"
```

### Performance Profiling

```bash
# CPU profiling
cargo build --release
perf record -F 99 -g ./target/release/llm-optimizer-service

# Memory profiling
valgrind --tool=massif ./target/release/llm-optimizer-service
```

---

## Security

### Best Practices

1. **Use TLS for all connections**
   - Enable HTTPS for REST API
   - Use TLS for gRPC
   - Encrypt database connections

2. **Secure secrets**
   - Never commit secrets to git
   - Use external secret management
   - Rotate secrets regularly

3. **Network policies**
   - Restrict pod-to-pod communication
   - Use network policies in Kubernetes
   - Enable firewall rules

4. **RBAC**
   - Use service accounts
   - Principle of least privilege
   - Regular access audits

5. **Container security**
   - Run as non-root user
   - Use read-only filesystem
   - Scan images for vulnerabilities

### Security Scanning

```bash
# Audit Rust dependencies
cargo audit

# Scan Docker images
docker scan llm-auto-optimizer:latest

# Kubernetes security
kubectl auth can-i --list --namespace llm-optimizer
```

---

## Performance Tuning

### Database

```yaml
database:
  max_connections: 100  # Increase for high load
  timeout_secs: 60      # Adjust based on query times
```

### Redis

```yaml
# Redis configuration
maxmemory: 4gb
maxmemory-policy: allkeys-lru
```

### Resource Limits

#### Kubernetes

```yaml
resources:
  requests:
    cpu: 1000m      # 1 CPU core
    memory: 2Gi     # 2GB RAM
  limits:
    cpu: 4000m      # 4 CPU cores
    memory: 8Gi     # 8GB RAM
```

#### Systemd

```ini
[Service]
CPUQuota=400%       # 4 cores
MemoryLimit=8G      # 8GB RAM
```

### Autoscaling

```yaml
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 70
  targetMemoryUtilizationPercentage: 80
```

---

## Architecture Diagrams

### Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Internet                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │  Ingress/LB     │
                    │  (TLS termination)
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    ┌────▼────┐         ┌────▼────┐       ┌────▼────┐
    │ Service │         │ Service │       │ Service │
    │  Pod 1  │         │  Pod 2  │       │  Pod N  │
    └────┬────┘         └────┬────┘       └────┬────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
    ┌────▼────┐         ┌────▼────┐       ┌─────▼─────┐
    │ Postgres│         │  Redis  │       │   Kafka   │
    │ Primary │         │  Master │       │  Cluster  │
    └─────────┘         └─────────┘       └───────────┘
```

### Monitoring Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    LLM Auto Optimizer                            │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Service    │  │   Service    │  │   Service    │          │
│  │    Pod 1     │  │    Pod 2     │  │    Pod N     │          │
│  │              │  │              │  │              │          │
│  │ /metrics:9090│  │ /metrics:9090│  │ /metrics:9090│          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
└─────────┼─────────────────┼─────────────────┼───────────────────┘
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │ (scrape)
                     ┌──────▼────────┐
                     │  Prometheus   │
                     │   (Metrics)   │
                     └──────┬────────┘
                            │
                     ┌──────▼────────┐
                     │   Grafana     │
                     │ (Visualization)│
                     └───────────────┘
```

---

## Support

### Documentation

- **GitHub**: https://github.com/globalbusinessadvisors/llm-auto-optimizer
- **Issues**: https://github.com/globalbusinessadvisors/llm-auto-optimizer/issues
- **Discussions**: https://github.com/globalbusinessadvisors/llm-auto-optimizer/discussions

### Getting Help

1. Check this documentation
2. Search existing issues
3. Ask in discussions
4. Create a new issue with:
   - Deployment method
   - Configuration
   - Logs
   - Expected vs actual behavior

---

## License

Apache License 2.0 - see [LICENSE](../LICENSE) for details.

---

**Happy Deploying!**
