#!/bin/bash
# Prune unused container images on K3s nodes.
# Run as root via cron (e.g., weekly Sunday 4 AM).
#
# K3s uses containerd — crictl rmi --prune removes images
# not referenced by any running container.
#
# Install crontab entry:
#   echo "0 4 * * 0 /home/maxjeffwell/scripts/prune-images.sh >> /var/log/image-prune.log 2>&1" | sudo crontab -
#
# Or use the setup flag:
#   sudo bash prune-images.sh --install

set -euo pipefail

install_cron() {
    local SCRIPT_PATH
    SCRIPT_PATH="$(readlink -f "$0")"
    local CRON_ENTRY="0 4 * * 0 ${SCRIPT_PATH} >> /var/log/image-prune.log 2>&1"

    if crontab -l 2>/dev/null | grep -qF "prune-images.sh"; then
        echo "Cron entry already exists:"
        crontab -l | grep "prune-images.sh"
        return 0
    fi

    (crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -
    echo "Installed cron: $CRON_ENTRY"
}

if [[ "${1:-}" == "--install" ]]; then
    install_cron
    exit 0
fi

echo "=== Image Prune: $(hostname) $(date -Iseconds) ==="

# Count before
BEFORE=$(k3s crictl images -q 2>/dev/null | wc -l)
DISK_BEFORE=$(df -h / | awk 'NR==2 {print $4}')
echo "Before: ${BEFORE} images, ${DISK_BEFORE} free"

# Prune unused images
k3s crictl rmi --prune 2>&1 | tail -5

# Count after
AFTER=$(k3s crictl images -q 2>/dev/null | wc -l)
DISK_AFTER=$(df -h / | awk 'NR==2 {print $4}')
echo "After:  ${AFTER} images, ${DISK_AFTER} free"
echo "Removed: $((BEFORE - AFTER)) images"
echo "=== Done ==="
