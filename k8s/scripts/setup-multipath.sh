#!/bin/bash
# Setup multipathd on K3s VPS nodes that mount Synology iSCSI PVCs.
# Run as root on each node.
#
# Background:
#   - synology-csi v1.2.1 hard-codes `mount /dev/sdN` (via /dev/disk/by-path/...lun-N).
#   - multipathd's default "greedy" mode claims SCSI devices into /dev/mapper/mpathN
#     before kubelet can mount, causing: mount: /dev/sdf already mounted or mount point busy.
#   - Disabling multipathd is NOT acceptable: it's the corruption guard for the future
#     case when PVs are updated to include multiple iSCSI portals (in-tree driver opens
#     N sessions for targetPortal + portals[]; without multipath, two /dev/sdX writes to
#     the same LUN can corrupt data).
#   - `find_multipaths smart` resolves both concerns:
#       single-path LUN observed → release for direct CSI mount
#       same-WWID on 2+ paths    → aggregate into /dev/mapper/mpathN (corruption guard)
#
# Nodes this applies to:
#   vmi2951245 (control-plane), vmi3115606 (worker)
#   (debian-marmoset Trixie does not ship multipath-tools by default)
#
# Usage: sudo bash setup-multipath.sh

set -euo pipefail

CONF=/etc/multipath.conf
BACKUP="${CONF}.bak.$(date +%Y-%m-%d)"

DESIRED=$(cat <<'EOF'
defaults {
    user_friendly_names yes
    find_multipaths smart
}
EOF
)

echo "=== Multipath Setup ==="
echo "Node: $(hostname)"
echo ""

# Verify multipathd is installed (Debian-family package name)
if ! command -v multipathd >/dev/null 2>&1; then
    echo "ERROR: multipathd not installed. Install with: apt-get install multipath-tools"
    exit 1
fi

# Idempotency: if config already matches, skip the rewrite
if [ -f "$CONF" ] && [ "$(cat "$CONF")" = "$DESIRED" ]; then
    echo "Config already matches desired state — nothing to do."
    echo ""
    echo "Current multipath devices (should be empty for single-path topology):"
    multipath -ll
    exit 0
fi

# Back up existing config (preserves whatever pre-existed: blacklists, friendly_names, etc.)
if [ -f "$CONF" ]; then
    cp "$CONF" "$BACKUP"
    echo "Backed up existing config to $BACKUP"
fi

echo "Writing new $CONF..."
echo "$DESIRED" > "$CONF"

echo "Reloading multipathd (no restart — preserves in-flight state)..."
systemctl reload multipathd

# Ensure enabled at boot
if ! systemctl is-enabled --quiet multipathd; then
    systemctl enable multipathd
    echo "Enabled multipathd at boot"
fi

# Brief settle, then verify
sleep 2

echo ""
echo "=== Done ==="
echo "multipathd: $(systemctl is-active multipathd) ($(systemctl is-enabled multipathd))"
echo ""
echo "Current /etc/multipath.conf:"
cat "$CONF"
echo ""
echo "Multipath devices (single-path LUNs should be released — empty output is normal):"
multipath -ll
