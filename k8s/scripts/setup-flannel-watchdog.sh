#!/bin/bash
# Setup flannel.1 watchdog on K3s nodes.
#
# Problem: when tailscale0 flaps (router reboot, WG re-handshake, etc.), the
# flannel.1 VXLAN device on top of tailscale0 can silently vanish. The node
# stays Ready in kubectl but pod-to-pod cross-node traffic fails - DNS to
# off-node CoreDNS replicas dies, ESO can't reach Doppler, ClusterSecretStore
# goes InvalidProviderConfig, dependent apps crashloop. See memory
# flannel-dns-eso-cascade-2026-05-25 for the full cascade.
#
# This watchdog:
#  - Polls flannel.1 every 60s via systemd .timer
#  - On missing/DOWN: restarts tailscaled first (it IS the flannel underlay on
#    every node in this cluster - confirmed via `ip -d link show flannel.1`
#    showing `dev tailscale0` on all 4 nodes), waits 15s, rechecks
#  - If still missing: restarts the K3s service (auto-detects k3s vs k3s-agent)
#  - Rate-limited: max 1 restart cycle per 10 minutes to prevent storm loops
#    on real underlying breakage (e.g., kernel module issue)
#  - Logs to systemd journal (tag flannel-watchdog) only; Loki collects via
#    promtail if wired
#
# Hostname-aware: all 4 K3s nodes (vmi2951245, vmi3115606, debian-marmoset,
# marmoset) get the same install - uniform pattern because the underlay
# (tailscale0) and detection (ip link show flannel.1) are universal.
#
# Source-of-truth files live in configs/flannel-watchdog/:
#   flannel-watchdog.sh       -> /usr/local/sbin/flannel-watchdog.sh
#   flannel-watchdog.service  -> /etc/systemd/system/flannel-watchdog.service
#   flannel-watchdog.timer    -> /etc/systemd/system/flannel-watchdog.timer
#
# Usage:
#   sudo bash setup-flannel-watchdog.sh
#
# Idempotent: safe to re-run; backs up replaced files with .bak.<timestamp>,
# preserves rate-limit state in /var/lib/flannel-watchdog/.
#
# Verify after install:
#   systemctl list-timers flannel-watchdog.timer
#   journalctl -t flannel-watchdog --no-pager -n 20
#
# Manual recovery-loop test (forces watchdog to act on a healthy node):
#   sudo ip link delete flannel.1
#   sudo systemctl start flannel-watchdog.service
#   journalctl -t flannel-watchdog -f
#
# See memory:
#   flannel-dns-eso-cascade-2026-05-25  - motivating incident
#   flannel-tailscale-iface-lost-2026-05-16  - prior occurrence
#   coredns-scale-to-3-2026-05-25  - companion change (DNS resilience)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIGS_DIR="$SCRIPT_DIR/configs"
HOSTNAME=$(hostname)
DATE_TAG=$(date +%Y-%m-%d-%H%M%S)
STATE_DIR=/var/lib/flannel-watchdog

require_root() {
    if [ "$EUID" -ne 0 ]; then
        echo "ERROR: must run as root (use sudo)" >&2
        exit 1
    fi
}

backup_then_install() {
    local src="$1" dst="$2" mode="$3"
    if [ -f "$dst" ]; then
        if cmp -s "$src" "$dst"; then
            echo "  $dst unchanged"
            return
        fi
        cp -p "$dst" "${dst}.bak.${DATE_TAG}"
        echo "  backed up existing $dst -> ${dst}.bak.${DATE_TAG}"
    fi
    install -m "$mode" -o root -g root "$src" "$dst"
    echo "  installed $dst from $src"
}

install_watchdog() {
    local src_dir="$CONFIGS_DIR/flannel-watchdog"
    if [ ! -d "$src_dir" ]; then
        echo "ERROR: $src_dir not found. Run from a checkout of portfolio-orchestration-platform." >&2
        exit 1
    fi

    echo "=== Install watchdog script and systemd units ==="
    backup_then_install "$src_dir/flannel-watchdog.sh"      /usr/local/sbin/flannel-watchdog.sh      0755
    backup_then_install "$src_dir/flannel-watchdog.service" /etc/systemd/system/flannel-watchdog.service 0644
    backup_then_install "$src_dir/flannel-watchdog.timer"   /etc/systemd/system/flannel-watchdog.timer   0644

    echo ""
    echo "=== systemd daemon-reload + enable+start timer ==="
    systemctl daemon-reload
    systemctl enable --now flannel-watchdog.timer
    mkdir -p "$STATE_DIR"
    echo "  active"
}

main() {
    require_root
    echo "=== flannel-watchdog setup on $HOSTNAME ==="
    echo ""

    case "$HOSTNAME" in
        vmi2951245|vmi3115606|debian-marmoset|marmoset|elitedesk)
            install_watchdog
            ;;
        *)
            echo "INFO: $HOSTNAME is not a configured K3s node for this watchdog." >&2
            echo "Known nodes: vmi2951245, vmi3115606, debian-marmoset, marmoset." >&2
            exit 0
            ;;
    esac

    echo ""
    echo "=== Done ==="
    systemctl status flannel-watchdog.timer --no-pager -n 0 2>&1 | head -3
    echo ""
    echo "Next run:"
    systemctl list-timers flannel-watchdog.timer --no-pager 2>&1 | head -2
}

main "$@"
