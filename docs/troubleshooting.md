# Troubleshooting Guide

Common issues and solutions for LLM Auto Optimizer.

## Table of Contents

1. [Installation Issues](#installation-issues)
2. [Configuration Problems](#configuration-problems)
3. [Connection Errors](#connection-errors)
4. [Performance Issues](#performance-issues)
5. [Deployment Problems](#deployment-problems)
6. [Monitoring Issues](#monitoring-issues)

## Installation Issues

### Rust Compilation Errors

**Problem**: Build fails with dependency errors

```
error: failed to compile llm-optimizer
```

**Solution**:
```bash
# Update Rust toolchain
rustup update stable

# Clean and rebuild
cargo clean
cargo build --release

# Check Rust version (need 1.75+)
rustc --version
```

### Missing Dependencies

**Problem**: System libraries not found

**Solution** (Ubuntu/Debian):
```bash
sudo apt-get update
sudo apt-get install build-essential pkg-config libssl-dev
```

**Solution** (macOS):
```bash
brew install openssl pkg-config
```

## Configuration Problems

### Invalid Configuration File

**Problem**: Service fails to start with config error

```
Error: Failed to load configuration: missing field 'server'
```

**Solution**:
```bash
# Validate configuration
llm-optimizer config validate config.yaml

# Use example config as template
cp config.example.yaml config.yaml
```

### Environment Variables Not Working

**Problem**: Config not overridden by env vars

**Solution**:
```bash
# Check env vars are set
env | grep LLM_OPTIMIZER

# Use correct naming convention
export LLM_OPTIMIZER_SERVER_PORT=9090  # Correct
export SERVER_PORT=9090  # Also works
```

### Permission Denied

**Problem**: Cannot read/write config file

**Solution**:
```bash
# Check file permissions
ls -l config.yaml

# Fix permissions
chmod 644 config.yaml
chown $USER:$USER config.yaml
```

## Connection Errors

### Database Connection Failed

**Problem**: Cannot connect to PostgreSQL

```
Error: Connection refused (os error 111)
```

**Solution**:
```bash
# Check PostgreSQL is running
docker-compose ps postgres
# or
systemctl status postgresql

# Test connection manually
psql -h localhost -U optimizer -d optimizer

# Check connection string
export DATABASE_URL="postgresql://user:pass@localhost:5432/optimizer"

# Verify network connectivity
nc -zv localhost 5432
```

### Redis Connection Timeout

**Problem**: Redis connection times out

**Solution**:
```bash
# Check Redis is running
docker-compose ps redis
redis-cli ping

# Test connectivity
redis-cli -h localhost -p 6379 ping

# Check firewall
sudo ufw status
sudo ufw allow 6379
```

### Kafka Connection Issues

**Problem**: Cannot connect to Kafka brokers

**Solution**:
```bash
# Check Kafka is running
docker-compose ps kafka

# List topics
kafka-topics --bootstrap-server localhost:9092 --list

# Test connection
kafka-console-consumer --bootstrap-server localhost:9092 \
  --topic llm-feedback --from-beginning

# Update config with correct brokers
kafka:
  brokers:
    - kafka1:9092
    - kafka2:9092
```

## Performance Issues

### High Memory Usage

**Problem**: Service consuming excessive memory

**Solution**:
```bash
# Check memory usage
docker stats optimizer
# or
ps aux | grep llm-optimizer

# Reduce cache sizes in config
cache:
  max_size_mb: 100  # Reduce from 500
  ttl_sec: 300      # Reduce TTL

# Restart service
systemctl restart llm-optimizer
```

### Slow Response Times

**Problem**: API requests taking too long

**Solution**:
```bash
# Check database indexes
psql -d optimizer -c "\d+ optimizations"

# Add indexes if missing
psql -d optimizer -c "CREATE INDEX idx_opt_status ON optimizations(status);"

# Increase connection pool
database:
  max_connections: 50  # Increase from 20

# Enable query caching
cache:
  queries_enabled: true
  ttl_sec: 60
```

### High CPU Usage

**Problem**: CPU at 100%

**Solution**:
```bash
# Profile the application
cargo flamegraph --bin llm-optimizer-service

# Reduce optimization frequency
optimization:
  interval_sec: 600  # Increase from 300

# Limit concurrent operations
server:
  max_concurrent_requests: 100
```

## Deployment Problems

### Docker Build Fails

**Problem**: Docker build errors

**Solution**:
```bash
# Check Dockerfile syntax
docker build --no-cache -t llm-optimizer:test .

# Clear Docker cache
docker system prune -a

# Use specific Rust version
FROM rust:1.75-slim as builder
```

### Container Crashes on Startup

**Problem**: Container exits immediately

**Solution**:
```bash
# Check logs
docker logs llm-optimizer

# Run interactively
docker run -it llm-optimizer:latest /bin/bash

# Check health endpoint
docker exec llm-optimizer curl http://localhost:8080/health

# Verify environment variables
docker exec llm-optimizer env | grep LLM
```

### Kubernetes Pod Not Starting

**Problem**: Pod stuck in CrashLoopBackOff

**Solution**:
```bash
# Check pod logs
kubectl logs llm-optimizer-xxx

# Describe pod for events
kubectl describe pod llm-optimizer-xxx

# Check resource limits
kubectl top pod llm-optimizer-xxx

# Increase resources
resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "1Gi"
    cpu: "1000m"
```

### Service Not Accessible

**Problem**: Cannot reach service

**Solution**:
```bash
# Check service is running
curl http://localhost:8080/health

# Check port binding
netstat -tlnp | grep 8080
# or
lsof -i :8080

# Check firewall
sudo ufw status
sudo ufw allow 8080

# For Kubernetes
kubectl port-forward svc/llm-optimizer 8080:8080
```

## Monitoring Issues

### Metrics Not Appearing

**Problem**: Prometheus metrics endpoint returns no data

**Solution**:
```bash
# Check metrics endpoint
curl http://localhost:8080/metrics

# Enable metrics in config
observability:
  metrics:
    enabled: true
    endpoint: /metrics

# Restart service
systemctl restart llm-optimizer
```

### Grafana Dashboard Empty

**Problem**: Grafana shows no data

**Solution**:
```bash
# Check Prometheus is scraping
curl http://prometheus:9090/api/v1/targets

# Verify datasource in Grafana
# Settings > Data Sources > Prometheus > Test

# Check scrape config
scrape_configs:
  - job_name: 'llm-optimizer'
    static_configs:
      - targets: ['optimizer:8080']
```

### Logs Not Visible

**Problem**: Cannot see application logs

**Solution**:
```bash
# Set log level
export RUST_LOG=debug

# Check log output
journalctl -u llm-optimizer -f

# For Docker
docker-compose logs -f optimizer

# Configure log format
logging:
  level: info
  format: json
  output: stdout
```

## Common Error Messages

### "Optimization already exists"

**Cause**: Trying to create optimization with duplicate ID

**Solution**:
```bash
# List existing optimizations
curl http://localhost:8080/api/v1/optimize

# Use unique ID
# Or delete existing one first
curl -X DELETE http://localhost:8080/api/v1/optimize/{id}
```

### "Quality threshold not met"

**Cause**: Optimization degraded quality below threshold

**Solution**:
```yaml
# Lower threshold (carefully!)
optimization:
  quality_threshold: 0.90  # From 0.95

# Or disable quality check (not recommended)
optimization:
  enforce_quality: false
```

### "Circuit breaker is open"

**Cause**: Too many failures to downstream service

**Solution**:
```bash
# Check downstream service health
curl http://downstream-service/health

# Reset circuit breaker
curl -X POST http://localhost:8080/api/v1/admin/reset-circuit-breaker

# Increase failure threshold
circuit_breaker:
  failure_threshold: 10  # From 5
  timeout_sec: 60
```

## Getting Help

### Enable Debug Logging

```bash
export RUST_LOG=debug
cargo run
```

### Collect Diagnostic Information

```bash
# System info
uname -a
rustc --version
docker --version

# Service status
systemctl status llm-optimizer

# Check resources
free -h
df -h
top

# Network connectivity
netstat -tlnp
ss -tlnp

# Docker info
docker-compose ps
docker-compose logs
```

### Report an Issue

When reporting issues, include:

1. LLM Optimizer version
2. Operating system and version
3. Configuration file (sanitized)
4. Complete error message
5. Steps to reproduce
6. Relevant logs

```bash
# Get version
llm-optimizer --version

# Export sanitized config
llm-optimizer config export --sanitize > config-sanitized.yaml

# Get recent logs
journalctl -u llm-optimizer --since "1 hour ago" > logs.txt
```

## Resources

- **GitHub Issues**: https://github.com/globalbusinessadvisors/llm-auto-optimizer/issues
- **Discussions**: https://github.com/globalbusinessadvisors/llm-auto-optimizer/discussions
- **Documentation**: https://docs.llmdevops.dev
- **Status Page**: https://status.llmdevops.dev
