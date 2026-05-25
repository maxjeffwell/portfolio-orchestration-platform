#!/bin/bash
# Setup inotify limits on K3s nodes.
#
# Bumps fs.inotify.max_user_watches=1048576 and max_user_instances=8192
# via /etc/sysctl.d/99-inotify-k8s.conf and reloads. Defaults (especially
# instances=128 on Debian) are too low for K8s nodes hosting many pods —
# udevd silently fails to register, breaking CSI iSCSI mounts.
#
# Source-of-truth: configs/inotify/99-inotify-k8s.conf
#
# Hostname-aware: same install on all 4 K3s nodes (vmi2951245, vmi3115606,
# debian-marmoset, marmoset). Limits are uniform across nodes.
#
# Idempotent: cmp -s skips if installed file already matches repo content.
#
# Legacy-file safety: if /etc/sysctl.d/99-inotify.conf exists (no '-k8s'
# suffix), it would lexically SORT AFTER 99-inotify-k8s.conf and override.
# The script warns and refuses to proceed until that file is removed
# manually (no auto-delete — destructive on a path that might be intentional).
#
# Usage:
#   sudo bash setup-inotify.sh
#
# Verify:
#   sysctl fs.inotify.max_user_watches fs.inotify.max_user_instances
#   # expect: 1048576 / 8192
#
# See memory:
#   inotify-k8s-node-tuning  - original 3-node rollout (2026-05-04)
#   phase3-option-b-postmortem-2026-05-04  - motivating incident (udevd)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIGS_DIR="$SCRIPT_DIR/configs"
HOSTNAME=$(hostname)
DATE_TAG=$(date +%Y-%m-%d-%H%M%S)
TARGET=/etc/sysctl.d/99-inotify-k8s.conf
LEGACY=/etc/sysctl.d/99-inotify.conf

require_root() {
    if [ "$EUID" -ne 0 ]; then
        echo "ERROR: must run as root (use sudo)" >&2
        exit 1
    fi
}

check_legacy_file() {
    if [ -f "$LEGACY" ]; then
        echo "ERROR: legacy $LEGACY exists." >&2
        echo "  It would sort AFTER 99-inotify-k8s.conf and override our settings." >&2
        echo "  Remove it manually (cp to backup first if uncertain), then re-run:" >&2
        echo "    sudo mv $LEGACY ${LEGACY}.bak.${DATE_TAG}" >&2
        exit 1
    fi
}

install_sysctl() {
    local src="$CONFIGS_DIR/inotify/99-inotify-k8s.conf"
    if [ ! -f "$src" ]; then
        echo "ERROR: $src not found. Run from a checkout of portfolio-orchestration-platform." >&2
        exit 1
    fi

    echo "=== Install $TARGET ==="
    if [ -f "$TARGET" ] && cmp -s "$src" "$TARGET"; then
        echo "  $TARGET already matches repo source; skipping copy"
    else
        if [ -f "$TARGET" ]; then
            cp -p "$TARGET" "${TARGET}.bak.${DATE_TAG}"
            echo "  backed up existing $TARGET -> ${TARGET}.bak.${DATE_TAG}"
        fi
        install -m 0644 -o root -g root "$src" "$TARGET"
        echo "  installed $TARGET from $src"
    fi
}

apply_and_verify() {
    echo ""
    echo "=== sysctl --system (reload all drop-ins) ==="
    sysctl --system 2>&1 | grep -E "(inotify|^\* )" | head -10 || true

    echo ""
    echo "=== Verify live values ==="
    local watches instances
    watches=$(sysctl -n fs.inotify.max_user_watches)
    instances=$(sysctl -n fs.inotify.max_user_instances)
    echo "  fs.inotify.max_user_watches   = $watches  (expected 1048576)"
    echo "  fs.inotify.max_user_instances = $instances  (expected 8192)"
    if [ "$watches" != "1048576" ] || [ "$instances" != "8192" ]; then
        echo "WARNING: live values don't match expected. Another sysctl drop-in may be overriding." >&2
        echo "  Investigate: sudo grep -rH 'inotify' /etc/sysctl.conf /etc/sysctl.d/ /usr/lib/sysctl.d/ /run/sysctl.d/" >&2
        exit 1
    fi
}

main() {
    require_root
    echo "=== inotify tuning on $HOSTNAME ==="
    echo ""

    case "$HOSTNAME" in
        vmi2951245|vmi3115606|debian-marmoset|marmoset)
            check_legacy_file
            install_sysctl
            apply_and_verify
            ;;
        *)
            echo "INFO: $HOSTNAME is not a configured K3s node for this tuning." >&2
            echo "Known nodes: vmi2951245, vmi3115606, debian-marmoset, marmoset." >&2
            exit 0
            ;;
    esac

    echo ""
    echo "=== Done ==="
}

main "$@"
