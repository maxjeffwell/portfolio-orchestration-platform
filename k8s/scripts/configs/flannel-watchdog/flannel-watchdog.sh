#!/bin/bash
# flannel-watchdog: detect missing/DOWN flannel.1, graduated restart
# (tailscaled then k3s/k3s-agent), rate-limited. Invoked by
# flannel-watchdog.timer every 60s. Logs to journal under tag
# `flannel-watchdog`.
#
# Edit and reinstall via setup-flannel-watchdog.sh (idempotent).

set -uo pipefail

RATE_LIMIT_FILE="/var/lib/flannel-watchdog/last-restart"
RATE_LIMIT_SECONDS=600   # 10 minutes

log() {
    logger -t flannel-watchdog -- "$*"
}

# Health check: flannel.1 exists AND is UP
flannel_healthy() {
    ip -br link show flannel.1 2>/dev/null | grep -q "UP"
}

# Auto-detect which K3s unit is active (server vs agent)
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

    log "ALERT: flannel.1 missing or DOWN - beginning recovery"

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

    # Step 1: tailscaled (the underlay). Restart unconditionally - every node
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

    # Step 2: K3s service (it owns the flannel daemon)
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
