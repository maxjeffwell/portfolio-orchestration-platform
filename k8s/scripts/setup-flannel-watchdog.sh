#!/bin/bash
# Setup flannel.1 watchdog on K3s nodes.
#
# Problem: when tailscale0 flaps (router reboot, WG re-handshake, etc.), the
# flannel.1 VXLAN device on top of tailscale0 can silently vanish. The node
# stays Ready in kubectl but pod-to-pod cross-node traffic fails — DNS to
# off-node CoreDNS replicas dies, ESO can't reach Doppler, ClusterSecretStore
# goes InvalidProviderConfig, dependent apps crashloop. See memory
# [[flannel-dns-eso-cascade-2026-05-25]] for the full cascade.
#
# This watchdog:
#  - Polls flannel.1 every 60s via systemd .timer
#  - On missing/DOWN: restarts tailscaled first (it IS the flannel underlay on
#    every node in this cluster — confirmed via `ip -d link show flannel.1`
#    showing `dev tailscale0` on all 4 nodes), waits 15s, rechecks
#  - If still missing: restarts the K3s service (auto-detects k3s vs k3s-agent)
#  - Rate-limited: max 1 restart cycle per 10 minutes to prevent storm loops
#    on real underlying breakage (e.g., kernel module issue)
#  - Logs to systemd journal (tag flannel-watchdog) only; Loki collects via
#    promtail if wired
#
# Hostname-aware: all 4 K3s nodes (vmi2951245, vmi3115606, debian-marmoset,
# marmoset) get the same install — uniform pattern because the underlay
# (tailscale0) and detection (ip link show flannel.1) are universal.
#
# Usage:
#   sudo bash setup-flannel-watchdog.sh
#
# Installs:
#   /usr/local/sbin/flannel-watchdog.sh           — polling logic
#   /etc/systemd/system/flannel-watchdog.service  — oneshot
#   /etc/systemd/system/flannel-watchdog.timer    — every 60s
#   /var/lib/flannel-watchdog/                    — rate-limit state dir
#
# Idempotent: safe to re-run; overwrites the scripts and unit files in place,
# preserves rate-limit state.
#
# Verify after install:
#   systemctl list-timers flannel-watchdog.timer
#   journalctl -t flannel-watchdog --no-pager -n 20
#
# Manual test (forces watchdog to act):
#   sudo ip link delete flannel.1
#   sudo systemctl start flannel-watchdog.service   # forces immediate run
#   journalctl -t flannel-watchdog -f
#
# See memory:
#   flannel-dns-eso-cascade-2026-05-25  — motivating incident
#   flannel-tailscale-iface-lost-2026-05-16  — prior occurrence
#   coredns-scale-to-3-2026-05-25  — companion change (DNS resilience)

set -euo pipefail

HOSTNAME=$(hostname)
WATCHDOG_SCRIPT=/usr/local/sbin/flannel-watchdog.sh
SERVICE_UNIT=/etc/systemd/system/flannel-watchdog.service
TIMER_UNIT=/etc/systemd/system/flannel-watchdog.timer
STATE_DIR=/var/lib/flannel-watchdog

require_root() {
    if [ "$EUID" -ne 0 ]; then
        echo "ERROR: must run as root (use sudo)" >&2
        exit 1
    fi
}

install_watchdog_script() {
    echo "=== Writing $WATCHDOG_SCRIPT ==="
    install -m 0755 -o root -g root /dev/null "$WATCHDOG_SCRIPT"
    cat > "$WATCHDOG_SCRIPT" <<'WATCHDOG_EOF'
#!/bin/bash
# flannel-watchdog: detect missing/DOWN flannel.1, graduated restart
# (tailscaled → k3s/k3s-agent), rate-limited. Invoked by flannel-watchdog.timer.
#
# Edit via: sudo bash /path/to/setup-flannel-watchdog.sh (idempotent)

set -uo pipefail

RATE_LIMIT_FILE="/var/lib/flannel-watchdog/last-restart"
RATE_LIMIT_SECONDS=600   # 10 minutes

log() {
    logger -t flannel-watchdog -- "$*"
}

# Health check: flannel.1 exists AND is UP (LOWER_UP also fine; just not absent)
flannel_healthy() {
    ip -br link show flannel.1 2>/dev/null | grep -q "UP"
}

# Detect which K3s unit is active (server vs agent)
detect_k3s_unit() {
    if systemctl is-active --quiet k3s.service; then
        echo "k3s.service"
    elif systemctl is-active --quiet k3s-agent.service; then
        echo "k3s-agent.service"
    else
        echo ""
    fi
}

# Rate-limit: returns 0 if allowed to act, 1 if rate-limited
allowed_to_restart() {
    mkdir -p "$(dirname "$RATE_LIMIT_FILE")"
    if [ ! -f "$RATE_LIMIT_FILE" ]; then
        return 0
    fi
    local last now elapsed
    last=$(cat "$RATE_LIMIT_FILE" 2>/dev/null || echo 0)
    now=$(date +%s)
    elapsed=$((now - last))
    [ "$elapsed" -ge "$RATE_LIMIT_SECONDS" ]
}

record_restart() {
    mkdir -p "$(dirname "$RATE_LIMIT_FILE")"
    date +%s > "$RATE_LIMIT_FILE"
}

main() {
    if flannel_healthy; then
        exit 0
    fi

    log "ALERT: flannel.1 missing or DOWN — beginning recovery"

    if ! allowed_to_restart; then
        local last elapsed
        last=$(cat "$RATE_LIMIT_FILE")
        elapsed=$(( $(date +%s) - last ))
        log "RATE-LIMITED: last restart ${elapsed}s ago (threshold ${RATE_LIMIT_SECONDS}s). MANUAL INTERVENTION NEEDED."
        exit 1
    fi

    local k3s_unit
    k3s_unit=$(detect_k3s_unit)
    if [ -z "$k3s_unit" ]; then
        log "ERROR: neither k3s.service nor k3s-agent.service is active; cannot recover. MANUAL INTERVENTION NEEDED."
        exit 1
    fi

    record_restart

    # Step 1: tailscaled (the underlay). Restart unconditionally — every node
    # in this cluster uses tailscale0 as the flannel VXLAN underlay.
    log "Restarting tailscaled (Tailscale is the flannel underlay)"
    if ! systemctl restart tailscaled; then
        log "WARNING: tailscaled restart command failed; continuing to K3s restart"
    fi
    sleep 15

    if flannel_healthy; then
        log "RECOVERED via tailscaled restart"
        exit 0
    fi

    # Step 2: K3s service (it owns flannel daemon)
    log "tailscaled restart insufficient; restarting $k3s_unit"
    if ! systemctl restart "$k3s_unit"; then
        log "ERROR: $k3s_unit restart command failed. MANUAL INTERVENTION NEEDED."
        exit 1
    fi
    sleep 30

    if flannel_healthy; then
        log "RECOVERED via $k3s_unit restart"
        exit 0
    fi

    log "CRITICAL: flannel.1 still missing after tailscaled + $k3s_unit restart. MANUAL INTERVENTION NEEDED."
    exit 1
}

main "$@"
WATCHDOG_EOF
    chmod 0755 "$WATCHDOG_SCRIPT"
    echo "  installed"
}

install_service_unit() {
    echo "=== Writing $SERVICE_UNIT ==="
    cat > "$SERVICE_UNIT" <<'EOF'
[Unit]
Description=flannel.1 watchdog (detect missing iface and recover)
ConditionPathExists=/usr/local/sbin/flannel-watchdog.sh

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/flannel-watchdog.sh
EOF
    chmod 0644 "$SERVICE_UNIT"
    echo "  installed"
}

install_timer_unit() {
    echo "=== Writing $TIMER_UNIT ==="
    cat > "$TIMER_UNIT" <<'EOF'
[Unit]
Description=Run flannel-watchdog every 60s

[Timer]
OnBootSec=2min
OnUnitActiveSec=60s
AccuracySec=5s
Unit=flannel-watchdog.service

[Install]
WantedBy=timers.target
EOF
    chmod 0644 "$TIMER_UNIT"
    echo "  installed"
}

reload_and_enable() {
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
        vmi2951245|vmi3115606|debian-marmoset|marmoset)
            install_watchdog_script
            install_service_unit
            install_timer_unit
            reload_and_enable
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
