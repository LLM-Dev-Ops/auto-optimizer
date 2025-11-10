#!/bin/bash
# Installation script for LLM Auto Optimizer systemd service

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
INSTALL_DIR="/opt/llm-optimizer"
CONFIG_DIR="/etc/llm-optimizer"
LOG_DIR="/var/log/llm-optimizer"
DATA_DIR="/opt/llm-optimizer/data"
USER="llm-optimizer"
GROUP="llm-optimizer"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root${NC}"
   exit 1
fi

echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN}  LLM Auto Optimizer - Installation Script${NC}"
echo -e "${GREEN}==================================================================${NC}"
echo ""

# Check dependencies
echo -e "${YELLOW}Checking dependencies...${NC}"
for cmd in systemctl curl; do
    if ! command -v $cmd &> /dev/null; then
        echo -e "${RED}Error: $cmd is not installed${NC}"
        exit 1
    fi
done
echo -e "${GREEN}✓ All dependencies satisfied${NC}"
echo ""

# Create user and group
echo -e "${YELLOW}Creating user and group...${NC}"
if ! id "$USER" &>/dev/null; then
    groupadd -r "$GROUP"
    useradd -r -g "$GROUP" -d "$INSTALL_DIR" -s /sbin/nologin -c "LLM Auto Optimizer" "$USER"
    echo -e "${GREEN}✓ Created user: $USER${NC}"
else
    echo -e "${GREEN}✓ User already exists: $USER${NC}"
fi
echo ""

# Create directories
echo -e "${YELLOW}Creating directories...${NC}"
mkdir -p "$INSTALL_DIR/bin"
mkdir -p "$INSTALL_DIR/data"
mkdir -p "$CONFIG_DIR/secrets"
mkdir -p "$LOG_DIR"

echo -e "${GREEN}✓ Created directories${NC}"
echo ""

# Copy binary
echo -e "${YELLOW}Installing binary...${NC}"
if [ -f "./target/release/llm-optimizer-service" ]; then
    cp ./target/release/llm-optimizer-service "$INSTALL_DIR/bin/"
    chmod +x "$INSTALL_DIR/bin/llm-optimizer-service"
    echo -e "${GREEN}✓ Installed binary from local build${NC}"
elif [ -f "./llm-optimizer-service" ]; then
    cp ./llm-optimizer-service "$INSTALL_DIR/bin/"
    chmod +x "$INSTALL_DIR/bin/llm-optimizer-service"
    echo -e "${GREEN}✓ Installed binary${NC}"
else
    echo -e "${RED}Error: Binary not found. Please build the project first.${NC}"
    echo -e "${YELLOW}Run: cargo build --release -p llm-optimizer-api-rest${NC}"
    exit 1
fi
echo ""

# Copy configuration
echo -e "${YELLOW}Installing configuration...${NC}"
if [ ! -f "$CONFIG_DIR/config.yaml" ]; then
    cp config.example.yaml "$CONFIG_DIR/config.yaml"
    echo -e "${GREEN}✓ Installed default configuration${NC}"
    echo -e "${YELLOW}  Please edit $CONFIG_DIR/config.yaml before starting the service${NC}"
else
    echo -e "${YELLOW}⚠ Configuration already exists, skipping${NC}"
fi

if [ ! -f "$CONFIG_DIR/llm-optimizer.env" ]; then
    cp deployment/systemd/llm-optimizer.env.example "$CONFIG_DIR/llm-optimizer.env"
    echo -e "${GREEN}✓ Installed environment template${NC}"
    echo -e "${YELLOW}  Please edit $CONFIG_DIR/llm-optimizer.env before starting the service${NC}"
else
    echo -e "${YELLOW}⚠ Environment file already exists, skipping${NC}"
fi
echo ""

# Set permissions
echo -e "${YELLOW}Setting permissions...${NC}"
chown -R "$USER:$GROUP" "$INSTALL_DIR"
chown -R "$USER:$GROUP" "$LOG_DIR"
chown -R root:root "$CONFIG_DIR"
chmod 700 "$CONFIG_DIR/secrets"
chmod 600 "$CONFIG_DIR/llm-optimizer.env"
chmod 644 "$CONFIG_DIR/config.yaml"
echo -e "${GREEN}✓ Set permissions${NC}"
echo ""

# Install systemd service
echo -e "${YELLOW}Installing systemd service...${NC}"
cp deployment/systemd/llm-optimizer.service /etc/systemd/system/
chmod 644 /etc/systemd/system/llm-optimizer.service
systemctl daemon-reload
echo -e "${GREEN}✓ Installed systemd service${NC}"
echo ""

# Configure log rotation
echo -e "${YELLOW}Configuring log rotation...${NC}"
cat > /etc/logrotate.d/llm-optimizer <<EOF
$LOG_DIR/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0640 $USER $GROUP
    sharedscripts
    postrotate
        systemctl reload llm-optimizer > /dev/null 2>&1 || true
    endscript
}
EOF
echo -e "${GREEN}✓ Configured log rotation${NC}"
echo ""

# Summary
echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN}  Installation Complete!${NC}"
echo -e "${GREEN}==================================================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo -e "  1. Edit configuration: ${GREEN}$CONFIG_DIR/config.yaml${NC}"
echo -e "  2. Edit environment:   ${GREEN}$CONFIG_DIR/llm-optimizer.env${NC}"
echo -e "  3. Enable service:     ${GREEN}systemctl enable llm-optimizer${NC}"
echo -e "  4. Start service:      ${GREEN}systemctl start llm-optimizer${NC}"
echo -e "  5. Check status:       ${GREEN}systemctl status llm-optimizer${NC}"
echo -e "  6. View logs:          ${GREEN}journalctl -u llm-optimizer -f${NC}"
echo ""
echo -e "${YELLOW}Important:${NC}"
echo -e "  - Ensure PostgreSQL and Redis are running"
echo -e "  - Update database connection string in config"
echo -e "  - Update Redis connection in config"
echo -e "  - Run database migrations: ${GREEN}$INSTALL_DIR/bin/llm-optimizer-service migrate${NC}"
echo ""

# Optionally enable and start service
read -p "Do you want to enable and start the service now? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    systemctl enable llm-optimizer
    systemctl start llm-optimizer
    sleep 2
    systemctl status llm-optimizer
    echo ""
    echo -e "${GREEN}✓ Service started successfully${NC}"
else
    echo -e "${YELLOW}Service not started. Start it manually when ready.${NC}"
fi

echo ""
echo -e "${GREEN}Installation script completed successfully!${NC}"
