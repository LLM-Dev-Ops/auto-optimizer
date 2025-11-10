#!/bin/bash
# Uninstallation script for LLM Auto Optimizer systemd service

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
USER="llm-optimizer"
GROUP="llm-optimizer"

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo -e "${RED}Error: This script must be run as root${NC}"
   exit 1
fi

echo -e "${RED}==================================================================${NC}"
echo -e "${RED}  LLM Auto Optimizer - Uninstallation Script${NC}"
echo -e "${RED}==================================================================${NC}"
echo ""
echo -e "${YELLOW}WARNING: This will remove the LLM Auto Optimizer service and all its files.${NC}"
echo -e "${YELLOW}Data and configuration files will be backed up to /tmp/llm-optimizer-backup${NC}"
echo ""

# Confirm uninstallation
read -p "Are you sure you want to uninstall? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${GREEN}Uninstallation cancelled.${NC}"
    exit 0
fi

# Backup data
echo -e "${YELLOW}Creating backup...${NC}"
BACKUP_DIR="/tmp/llm-optimizer-backup-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

if [ -d "$CONFIG_DIR" ]; then
    cp -r "$CONFIG_DIR" "$BACKUP_DIR/" 2>/dev/null || true
fi

if [ -d "$INSTALL_DIR/data" ]; then
    cp -r "$INSTALL_DIR/data" "$BACKUP_DIR/" 2>/dev/null || true
fi

if [ -d "$LOG_DIR" ]; then
    cp -r "$LOG_DIR" "$BACKUP_DIR/" 2>/dev/null || true
fi

echo -e "${GREEN}✓ Backup created at: $BACKUP_DIR${NC}"
echo ""

# Stop and disable service
echo -e "${YELLOW}Stopping service...${NC}"
if systemctl is-active --quiet llm-optimizer; then
    systemctl stop llm-optimizer
    echo -e "${GREEN}✓ Service stopped${NC}"
else
    echo -e "${YELLOW}⚠ Service not running${NC}"
fi

if systemctl is-enabled --quiet llm-optimizer 2>/dev/null; then
    systemctl disable llm-optimizer
    echo -e "${GREEN}✓ Service disabled${NC}"
else
    echo -e "${YELLOW}⚠ Service not enabled${NC}"
fi
echo ""

# Remove systemd service
echo -e "${YELLOW}Removing systemd service...${NC}"
if [ -f "/etc/systemd/system/llm-optimizer.service" ]; then
    rm -f /etc/systemd/system/llm-optimizer.service
    systemctl daemon-reload
    systemctl reset-failed
    echo -e "${GREEN}✓ Removed systemd service${NC}"
else
    echo -e "${YELLOW}⚠ Systemd service not found${NC}"
fi
echo ""

# Remove log rotation
echo -e "${YELLOW}Removing log rotation...${NC}"
if [ -f "/etc/logrotate.d/llm-optimizer" ]; then
    rm -f /etc/logrotate.d/llm-optimizer
    echo -e "${GREEN}✓ Removed log rotation${NC}"
else
    echo -e "${YELLOW}⚠ Log rotation not configured${NC}"
fi
echo ""

# Remove directories
echo -e "${YELLOW}Removing directories...${NC}"

read -p "Remove installation directory ($INSTALL_DIR)? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf "$INSTALL_DIR"
    echo -e "${GREEN}✓ Removed installation directory${NC}"
fi

read -p "Remove configuration directory ($CONFIG_DIR)? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf "$CONFIG_DIR"
    echo -e "${GREEN}✓ Removed configuration directory${NC}"
fi

read -p "Remove log directory ($LOG_DIR)? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    rm -rf "$LOG_DIR"
    echo -e "${GREEN}✓ Removed log directory${NC}"
fi
echo ""

# Remove user and group
echo -e "${YELLOW}Removing user and group...${NC}"
read -p "Remove user ($USER) and group ($GROUP)? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if id "$USER" &>/dev/null; then
        userdel "$USER" 2>/dev/null || true
        echo -e "${GREEN}✓ Removed user: $USER${NC}"
    fi
    if getent group "$GROUP" &>/dev/null; then
        groupdel "$GROUP" 2>/dev/null || true
        echo -e "${GREEN}✓ Removed group: $GROUP${NC}"
    fi
else
    echo -e "${YELLOW}⚠ User and group not removed${NC}"
fi
echo ""

# Summary
echo -e "${GREEN}==================================================================${NC}"
echo -e "${GREEN}  Uninstallation Complete!${NC}"
echo -e "${GREEN}==================================================================${NC}"
echo ""
echo -e "${YELLOW}Backup location:${NC} ${GREEN}$BACKUP_DIR${NC}"
echo ""
echo -e "${YELLOW}To restore from backup:${NC}"
echo -e "  cp -r $BACKUP_DIR/llm-optimizer /etc/"
echo -e "  cp -r $BACKUP_DIR/data /opt/llm-optimizer/"
echo ""
echo -e "${GREEN}Uninstallation completed successfully!${NC}"
