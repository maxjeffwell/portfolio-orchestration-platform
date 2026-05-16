#!/bin/bash
# Setup multipathd + iSCSI initiator config on K8s nodes.
# Run as root on each node.
#
# Hostname-aware:
#   - vmi2951245 + vmi3115606 (VPSes): writes find_multipaths=smart config
#   - debian-marmoset             : writes full config with ASUSTOR + Synology mpaths,
#                                   iSCSI digest defaults, and custom multipath ifaces
#
# Templates live in configs/ alongside this script — committed to git as the
# source of truth for node-level storage state. Updating those files and
# re-running this script is the supported way to change config.
#
# Usage: sudo bash setup-multipath.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIGS_DIR="$SCRIPT_DIR/configs"
HOSTNAME=$(hostname)
DATE_TAG=$(date +%Y-%m-%d-%H%M%S)

# ----------------------------------------------------------------------------
# helpers
# ----------------------------------------------------------------------------

require_root() {
    if [ "$EUID" -ne 0 ]; then
        echo "ERROR: must run as root (use sudo)" >&2
        exit 1
    fi
}

backup_then_install() {
    local src="$1" dst="$2"
    if [ -f "$dst" ]; then
        cp "$dst" "${dst}.bak.${DATE_TAG}"
        echo "  backed up existing $dst → ${dst}.bak.${DATE_TAG}"
    fi
    install -m 0644 "$src" "$dst"
    echo "  installed $dst from $src"
}

require_pkg() {
    local cmd="$1" pkg="$2"
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "ERROR: $cmd not installed. Install with: apt-get install $pkg" >&2
        exit 1
    fi
}

# ----------------------------------------------------------------------------
# per-host actions
# ----------------------------------------------------------------------------

install_multipath_vps() {
    echo "=== Install VPS multipath config ==="
    require_pkg multipathd multipath-tools
    backup_then_install "$CONFIGS_DIR/multipath/vps.conf" /etc/multipath.conf
    systemctl reload multipathd
    systemctl enable --quiet multipathd 2>/dev/null || true
    echo ""
}

install_multipath_debian_marmoset() {
    echo "=== Install debian-marmoset multipath config ==="
    require_pkg multipathd multipath-tools
    backup_then_install "$CONFIGS_DIR/multipath/debian-marmoset.conf" /etc/multipath.conf
    systemctl reload multipathd
    systemctl enable --quiet multipathd 2>/dev/null || true
    echo ""
}

install_iscsi_digest_defaults() {
    echo "=== Ensure iSCSI digest defaults (CRC32C,None) ==="
    require_pkg iscsiadm open-iscsi
    local conf=/etc/iscsi/iscsid.conf
    # Uncomment the digest lines if commented; replace if present-but-different.
    sed -i 's|^#\?node.conn\[0\].iscsi.HeaderDigest = .*|node.conn[0].iscsi.HeaderDigest = CRC32C,None|' "$conf"
    sed -i 's|^#\?node.conn\[0\].iscsi.DataDigest = .*|node.conn[0].iscsi.DataDigest = CRC32C,None|' "$conf"
    systemctl restart iscsid
    echo "  iscsid.conf updated; iscsid restarted"
    echo ""
}

install_iscsi_ifaces() {
    echo "=== Install custom iSCSI ifaces (synology-mp109, synology-mp129) ==="
    require_pkg iscsiadm open-iscsi
    local dst=/var/lib/iscsi/ifaces
    mkdir -p "$dst"
    for src in "$CONFIGS_DIR"/iscsi/ifaces/*; do
        local name=$(basename "$src")
        # Skip if iface already exists with same content (idempotent)
        if [ -f "$dst/$name" ] && cmp -s "$src" "$dst/$name"; then
            echo "  $name unchanged"
            continue
        fi
        install -m 0640 -o root -g root "$src" "$dst/$name"
        echo "  installed $dst/$name"
    done
    echo ""
}

# ----------------------------------------------------------------------------
# main dispatch
# ----------------------------------------------------------------------------

main() {
    require_root
    echo "=== Storage node setup on $HOSTNAME ==="
    echo ""

    case "$HOSTNAME" in
        vmi2951245|vmi3115606)
            install_multipath_vps
            ;;
        debian-marmoset)
            install_multipath_debian_marmoset
            install_iscsi_digest_defaults
            install_iscsi_ifaces
            ;;
        *)
            echo "ERROR: hostname '$HOSTNAME' is not configured." >&2
            echo "Known hosts: vmi2951245, vmi3115606, debian-marmoset" >&2
            echo "Edit the case statement in this script to add a new host." >&2
            exit 1
            ;;
    esac

    echo "=== Done ==="
    echo "multipathd:  $(systemctl is-active multipathd 2>/dev/null || echo 'n/a') ($(systemctl is-enabled multipathd 2>/dev/null || echo 'n/a'))"
    if command -v iscsiadm >/dev/null 2>&1; then
        echo "iscsid:      $(systemctl is-active iscsid 2>/dev/null || echo 'n/a')"
        echo "iSCSI nodes: $(iscsiadm -m node 2>/dev/null | wc -l) configured"
        echo "iSCSI sess:  $(iscsiadm -m session 2>/dev/null | wc -l) connected"
    fi
    echo ""
    echo "Current multipath devices:"
    multipath -ll 2>/dev/null || true
}

main "$@"
