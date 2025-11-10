# Makefile for LLM Auto Optimizer
# Provides common operations for building, testing, and deploying

.PHONY: help
.DEFAULT_GOAL := help

# ============================================================================
# Variables
# ============================================================================
VERSION ?= $(shell git describe --tags --always --dirty)
DOCKER_REGISTRY ?= docker.io
DOCKER_IMAGE_SERVICE ?= llm-auto-optimizer
DOCKER_IMAGE_CLI ?= llm-auto-optimizer-cli
HELM_RELEASE ?= llm-optimizer
KUBE_NAMESPACE ?= llm-optimizer
BUILD_TYPE ?= release

# Colors for output
RED := \033[0;31m
GREEN := \033[0;32m
YELLOW := \033[1;33m
BLUE := \033[0;34m
NC := \033[0m # No Color

# ============================================================================
# Help
# ============================================================================
help: ## Show this help message
	@echo '$(BLUE)LLM Auto Optimizer - Makefile$(NC)'
	@echo ''
	@echo '$(YELLOW)Available targets:$(NC)'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ''

# ============================================================================
# Development
# ============================================================================
.PHONY: install
install: ## Install dependencies
	@echo "$(YELLOW)Installing Rust dependencies...$(NC)"
	rustup update stable
	rustup component add rustfmt clippy
	cargo install cargo-watch cargo-audit cargo-tarpaulin

.PHONY: build
build: ## Build the project in release mode
	@echo "$(YELLOW)Building project...$(NC)"
	cargo build --release --workspace
	@echo "$(GREEN)✓ Build complete$(NC)"

.PHONY: build-debug
build-debug: ## Build the project in debug mode
	@echo "$(YELLOW)Building project (debug)...$(NC)"
	cargo build --workspace
	@echo "$(GREEN)✓ Build complete$(NC)"

.PHONY: test
test: ## Run all tests
	@echo "$(YELLOW)Running tests...$(NC)"
	cargo test --workspace --all-features
	@echo "$(GREEN)✓ All tests passed$(NC)"

.PHONY: test-watch
test-watch: ## Run tests in watch mode
	cargo watch -x 'test --workspace'

.PHONY: bench
bench: ## Run benchmarks
	@echo "$(YELLOW)Running benchmarks...$(NC)"
	cargo bench --workspace
	@echo "$(GREEN)✓ Benchmarks complete$(NC)"

.PHONY: lint
lint: ## Run linters (clippy and fmt check)
	@echo "$(YELLOW)Running linters...$(NC)"
	cargo fmt --all -- --check
	cargo clippy --workspace --all-targets --all-features -- -D warnings
	@echo "$(GREEN)✓ Linting passed$(NC)"

.PHONY: fmt
fmt: ## Format code
	@echo "$(YELLOW)Formatting code...$(NC)"
	cargo fmt --all
	@echo "$(GREEN)✓ Code formatted$(NC)"

.PHONY: audit
audit: ## Run security audit
	@echo "$(YELLOW)Running security audit...$(NC)"
	cargo audit
	@echo "$(GREEN)✓ Security audit complete$(NC)"

.PHONY: coverage
coverage: ## Generate code coverage report
	@echo "$(YELLOW)Generating coverage report...$(NC)"
	cargo tarpaulin --verbose --all-features --workspace --timeout 300 --out Html
	@echo "$(GREEN)✓ Coverage report generated: target/tarpaulin/index.html$(NC)"

.PHONY: clean
clean: ## Clean build artifacts
	@echo "$(YELLOW)Cleaning build artifacts...$(NC)"
	cargo clean
	@echo "$(GREEN)✓ Clean complete$(NC)"

# ============================================================================
# Docker
# ============================================================================
.PHONY: docker-build
docker-build: ## Build Docker images
	@echo "$(YELLOW)Building Docker images...$(NC)"
	docker build -f docker/Dockerfile.service -t $(DOCKER_REGISTRY)/$(DOCKER_IMAGE_SERVICE):$(VERSION) ..
	docker build -f docker/Dockerfile.cli -t $(DOCKER_REGISTRY)/$(DOCKER_IMAGE_CLI):$(VERSION) ..
	docker tag $(DOCKER_REGISTRY)/$(DOCKER_IMAGE_SERVICE):$(VERSION) $(DOCKER_REGISTRY)/$(DOCKER_IMAGE_SERVICE):latest
	docker tag $(DOCKER_REGISTRY)/$(DOCKER_IMAGE_CLI):$(VERSION) $(DOCKER_REGISTRY)/$(DOCKER_IMAGE_CLI):latest
	@echo "$(GREEN)✓ Docker images built$(NC)"

.PHONY: docker-push
docker-push: ## Push Docker images to registry
	@echo "$(YELLOW)Pushing Docker images...$(NC)"
	docker push $(DOCKER_REGISTRY)/$(DOCKER_IMAGE_SERVICE):$(VERSION)
	docker push $(DOCKER_REGISTRY)/$(DOCKER_IMAGE_SERVICE):latest
	docker push $(DOCKER_REGISTRY)/$(DOCKER_IMAGE_CLI):$(VERSION)
	docker push $(DOCKER_REGISTRY)/$(DOCKER_IMAGE_CLI):latest
	@echo "$(GREEN)✓ Docker images pushed$(NC)"

.PHONY: docker-compose-up
docker-compose-up: ## Start services with docker-compose (development)
	@echo "$(YELLOW)Starting services with docker-compose...$(NC)"
	docker-compose -f docker/docker-compose.yml up -d
	@echo "$(GREEN)✓ Services started$(NC)"

.PHONY: docker-compose-down
docker-compose-down: ## Stop services with docker-compose
	@echo "$(YELLOW)Stopping services with docker-compose...$(NC)"
	docker-compose -f docker/docker-compose.yml down
	@echo "$(GREEN)✓ Services stopped$(NC)"

.PHONY: docker-compose-logs
docker-compose-logs: ## View docker-compose logs
	docker-compose -f docker/docker-compose.yml logs -f

# ============================================================================
# Kubernetes
# ============================================================================
.PHONY: k8s-apply
k8s-apply: ## Apply Kubernetes manifests
	@echo "$(YELLOW)Applying Kubernetes manifests...$(NC)"
	kubectl apply -f kubernetes/namespace.yaml
	kubectl apply -f kubernetes/configmap.yaml
	kubectl apply -f kubernetes/secret.yaml
	kubectl apply -f kubernetes/pvc.yaml
	kubectl apply -f kubernetes/serviceaccount.yaml
	kubectl apply -f kubernetes/deployment.yaml
	kubectl apply -f kubernetes/service.yaml
	kubectl apply -f kubernetes/ingress.yaml
	kubectl apply -f kubernetes/hpa.yaml
	kubectl apply -f kubernetes/networkpolicy.yaml
	kubectl apply -f kubernetes/poddisruptionbudget.yaml
	@echo "$(GREEN)✓ Kubernetes resources applied$(NC)"

.PHONY: k8s-delete
k8s-delete: ## Delete Kubernetes resources
	@echo "$(YELLOW)Deleting Kubernetes resources...$(NC)"
	kubectl delete -f kubernetes/ --ignore-not-found=true
	@echo "$(GREEN)✓ Kubernetes resources deleted$(NC)"

.PHONY: k8s-status
k8s-status: ## Show Kubernetes deployment status
	@echo "$(YELLOW)Kubernetes Status:$(NC)"
	kubectl get pods -n $(KUBE_NAMESPACE)
	kubectl get svc -n $(KUBE_NAMESPACE)
	kubectl get ingress -n $(KUBE_NAMESPACE)

.PHONY: k8s-logs
k8s-logs: ## View Kubernetes logs
	kubectl logs -n $(KUBE_NAMESPACE) -l app.kubernetes.io/name=llm-optimizer -f

# ============================================================================
# Helm
# ============================================================================
.PHONY: helm-install
helm-install: ## Install Helm chart
	@echo "$(YELLOW)Installing Helm chart...$(NC)"
	helm install $(HELM_RELEASE) ./helm \
		--namespace $(KUBE_NAMESPACE) \
		--create-namespace
	@echo "$(GREEN)✓ Helm chart installed$(NC)"

.PHONY: helm-upgrade
helm-upgrade: ## Upgrade Helm release
	@echo "$(YELLOW)Upgrading Helm release...$(NC)"
	helm upgrade $(HELM_RELEASE) ./helm \
		--namespace $(KUBE_NAMESPACE)
	@echo "$(GREEN)✓ Helm release upgraded$(NC)"

.PHONY: helm-uninstall
helm-uninstall: ## Uninstall Helm release
	@echo "$(YELLOW)Uninstalling Helm release...$(NC)"
	helm uninstall $(HELM_RELEASE) --namespace $(KUBE_NAMESPACE)
	@echo "$(GREEN)✓ Helm release uninstalled$(NC)"

.PHONY: helm-template
helm-template: ## Generate Helm templates
	helm template $(HELM_RELEASE) ./helm --namespace $(KUBE_NAMESPACE)

.PHONY: helm-lint
helm-lint: ## Lint Helm chart
	@echo "$(YELLOW)Linting Helm chart...$(NC)"
	helm lint ./helm
	@echo "$(GREEN)✓ Helm chart linted$(NC)"

.PHONY: helm-package
helm-package: ## Package Helm chart
	@echo "$(YELLOW)Packaging Helm chart...$(NC)"
	helm package ./helm --version $(VERSION)
	@echo "$(GREEN)✓ Helm chart packaged$(NC)"

# ============================================================================
# Systemd
# ============================================================================
.PHONY: systemd-install
systemd-install: ## Install systemd service
	@echo "$(YELLOW)Installing systemd service...$(NC)"
	sudo ./systemd/install.sh
	@echo "$(GREEN)✓ Systemd service installed$(NC)"

.PHONY: systemd-uninstall
systemd-uninstall: ## Uninstall systemd service
	@echo "$(YELLOW)Uninstalling systemd service...$(NC)"
	sudo ./systemd/uninstall.sh
	@echo "$(GREEN)✓ Systemd service uninstalled$(NC)"

.PHONY: systemd-status
systemd-status: ## Show systemd service status
	sudo systemctl status llm-optimizer

.PHONY: systemd-logs
systemd-logs: ## View systemd service logs
	sudo journalctl -u llm-optimizer -f

# ============================================================================
# Database
# ============================================================================
.PHONY: db-migrate
db-migrate: ## Run database migrations
	@echo "$(YELLOW)Running database migrations...$(NC)"
	./scripts/migrate.sh
	@echo "$(GREEN)✓ Migrations complete$(NC)"

.PHONY: db-backup
db-backup: ## Backup database
	@echo "$(YELLOW)Creating database backup...$(NC)"
	./scripts/backup.sh
	@echo "$(GREEN)✓ Backup complete$(NC)"

.PHONY: db-restore
db-restore: ## Restore database from backup
	@echo "$(YELLOW)Restoring database...$(NC)"
	./scripts/restore.sh $(BACKUP_FILE)
	@echo "$(GREEN)✓ Restore complete$(NC)"

# ============================================================================
# Release
# ============================================================================
.PHONY: release
release: ## Create a new release
	@echo "$(YELLOW)Creating release $(VERSION)...$(NC)"
	./scripts/release.sh --version $(VERSION)
	@echo "$(GREEN)✓ Release $(VERSION) created$(NC)"

.PHONY: release-build
release-build: ## Build release artifacts (all platforms)
	@echo "$(YELLOW)Building release artifacts...$(NC)"
	./scripts/build.sh --release --cross
	@echo "$(GREEN)✓ Release artifacts built$(NC)"

# ============================================================================
# Utilities
# ============================================================================
.PHONY: health-check
health-check: ## Run health check
	@echo "$(YELLOW)Running health check...$(NC)"
	./scripts/health-check.sh
	@echo "$(GREEN)✓ Health check complete$(NC)"

.PHONY: version
version: ## Show version
	@echo "Version: $(VERSION)"

.PHONY: info
info: ## Show build information
	@echo "$(BLUE)Build Information:$(NC)"
	@echo "  Version:        $(GREEN)$(VERSION)$(NC)"
	@echo "  Docker Registry: $(GREEN)$(DOCKER_REGISTRY)$(NC)"
	@echo "  Service Image:  $(GREEN)$(DOCKER_IMAGE_SERVICE)$(NC)"
	@echo "  CLI Image:      $(GREEN)$(DOCKER_IMAGE_CLI)$(NC)"
	@echo "  Helm Release:   $(GREEN)$(HELM_RELEASE)$(NC)"
	@echo "  K8s Namespace:  $(GREEN)$(KUBE_NAMESPACE)$(NC)"
	@echo "  Build Type:     $(GREEN)$(BUILD_TYPE)$(NC)"

# ============================================================================
# CI/CD
# ============================================================================
.PHONY: ci
ci: lint test audit ## Run CI checks locally
	@echo "$(GREEN)✓ All CI checks passed$(NC)"

.PHONY: pre-commit
pre-commit: fmt lint test ## Run pre-commit checks
	@echo "$(GREEN)✓ Pre-commit checks passed$(NC)"

# ============================================================================
# All-in-one commands
# ============================================================================
.PHONY: all
all: build test ## Build and test everything
	@echo "$(GREEN)✓ Build and test complete$(NC)"

.PHONY: dev
dev: docker-compose-up ## Start development environment
	@echo "$(GREEN)✓ Development environment started$(NC)"

.PHONY: deploy-local
deploy-local: build docker-build docker-compose-up ## Deploy locally with Docker
	@echo "$(GREEN)✓ Local deployment complete$(NC)"

.PHONY: deploy-k8s
deploy-k8s: docker-build docker-push k8s-apply ## Deploy to Kubernetes
	@echo "$(GREEN)✓ Kubernetes deployment complete$(NC)"
