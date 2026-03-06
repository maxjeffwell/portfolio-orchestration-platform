#!/bin/bash
# Setup swap on K3s VPS nodes.
# Run as root on each node.
#
# K3s sets --fail-swap-on=false by default, so no kubelet config changes needed.
#
# Recommended swap sizes:
#   vmi2951245 (48GB RAM, control-plane): 4GB
#   vmi3115606 (12GB RAM, worker):        4GB
#
# Usage: sudo bash setup-swap.sh [SIZE_IN_GB]

set -euo pipefail

SWAP_SIZE="${1:-4}"
SWAP_FILE="/swapfile"

echo "=== Swap Setup ==="
echo "Node: $(hostname)"
echo "Size: ${SWAP_SIZE}G"
echo ""

# Check existing swap
if swapon --show | grep -q "$SWAP_FILE"; then
    echo "Swap already active at $SWAP_FILE:"
    swapon --show
    echo "To resize: swapoff $SWAP_FILE, then re-run this script."
    exit 0
fi

# Check disk space
AVAIL_GB=$(df -BG / | awk 'NR==2 {print $4}' | tr -d 'G')
if [ "$AVAIL_GB" -lt "$((SWAP_SIZE + 5))" ]; then
    echo "ERROR: Only ${AVAIL_GB}G free. Need at least $((SWAP_SIZE + 5))G."
    exit 1
fi

echo "Creating ${SWAP_SIZE}G swap file..."
fallocate -l "${SWAP_SIZE}G" "$SWAP_FILE"
chmod 600 "$SWAP_FILE"
mkswap "$SWAP_FILE"

echo "Enabling swap..."
swapon "$SWAP_FILE"

# Persist in fstab
if ! grep -q "$SWAP_FILE" /etc/fstab; then
    echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab
    echo "Added to /etc/fstab"
fi

# Set swappiness low — only use swap under memory pressure
if ! grep -q "vm.swappiness" /etc/sysctl.d/99-k8s-network.conf 2>/dev/null; then
    echo "" >> /etc/sysctl.d/99-k8s-network.conf
    echo "# Low swappiness: only swap under real memory pressure" >> /etc/sysctl.d/99-k8s-network.conf
    echo "vm.swappiness = 10" >> /etc/sysctl.d/99-k8s-network.conf
fi
sysctl vm.swappiness=10

echo ""
echo "=== Done ==="
swapon --show
free -h | head -3
echo "swappiness: $(cat /proc/sys/vm/swappiness)"
