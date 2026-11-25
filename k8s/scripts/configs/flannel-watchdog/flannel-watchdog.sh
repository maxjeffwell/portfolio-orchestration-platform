#!/bin/bash
# flannel-watchdog: detect a broken flannel overlay and recover it,
# rate-limited. Invoked by flannel-watchdog.timer every 60s. Logs to journal
# under tag `flannel-watchdog`.
#
# Two failure modes are detected:
#   1. flannel.1 missing or DOWN
#        -> restart tailscaled (the VXLAN underlay), then k3s/k3s-agent.
#   2. flannel.1 UP but with no routes to the other nodes' pod CIDRs
#        -> restart k3s/k3s-agent only.
#      Seen 2026-11-25: a tailscaled restart (apt upgrade of tailscale)
#      recreated tailscale0, flannel recreated flannel.1 on top of it, and the
#      `10.42.x.0/24 via ... dev flannel.1` routes never came back. The node
#      stayed Ready with zero pod restarts while its pods could reach nothing
#      off-node. Restarting tailscaled is what CAUSES this, so mode 2 skips it.
#
# Tunables (environment, or /etc/default/flannel-watchdog):
#   FLANNEL_WATCHDOG_MIN_ROUTES   routes via flannel.1 needed to be healthy
#                                 (default 1; set 0 on a single-node cluster)
#   FLANNEL_WATCHDOG_K3S_GRACE    seconds k3s must have been up before the
#                                 route check counts (default 120)
#   FLANNEL_WATCHDOG_DRY_RUN=1    log what would be done, restart nothing
#
# Edit and reinstall via setup-flannel-watchdog.sh (idempotent).

set -uo pipefail

[ -r /etc/default/flannel-watchdog ] && . /etc/default/flannel-watchdog

RATE_LIMIT_FILE="/var/lib/flannel-watchdog/last-restart"
RATE_LIMIT_SECONDS=600   # 10 minutes
MIN_ROUTES="${FLANNEL_WATCHDOG_MIN_ROUTES:-1}"
K3S_GRACE="${FLANNEL_WATCHDOG_K3S_GRACE:-120}"
DRY_RUN="${FLANNEL_WATCHDOG_DRY_RUN:-0}"
ROUTE_RECHECK_SECONDS=10

log() {
    logger -t flannel-watchdog -- "$*"
}

# flannel.1 exists AND is UP
link_healthy() {
    ip -br link show flannel.1 2>/dev/null | grep -q "UP"
}

# Number of routes to other nodes' pod CIDRs through flannel.1
route_count() {
    ip -4 route show dev flannel.1 2>/dev/null | grep -c .
}

routes_healthy() {
    [ "$(route_count)" -ge "$MIN_ROUTES" ]
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

# Seconds the given unit has been active (0 if unknown)
unit_active_seconds() {
    local enter_us now_s
    enter_us=$(systemctl show "$1" -p ActiveEnterTimestampMonotonic --value 2>/dev/null)
    [ -n "$enter_us" ] && [ "$enter_us" -gt 0 ] 2>/dev/null || { echo 0; return; }
    now_s=$(cut -d' ' -f1 /proc/uptime | cut -d. -f1)
    echo $(( now_s - enter_us / 1000000 ))
}

# Overall health. Returns:
#   0 - healthy
#   2 - flannel.1 missing or DOWN
#   3 - flannel.1 UP but too few routes (confirmed twice, k3s past its grace)
flannel_health() {
    link_healthy || return 2
    routes_healthy && return 0

    # k3s installs the routes a little after it starts; don't judge too early.
    local unit
    unit=$(detect_k3s_unit)
    if [ -n "$unit" ] && [ "$(unit_active_seconds "$unit")" -lt "$K3S_GRACE" ]; then
        return 0
    fi

    # Re-check once so a route refresh in progress is not mistaken for a fault.
    sleep "$ROUTE_RECHECK_SECONDS"
    link_healthy || return 2
    routes_healthy && return 0
    return 3
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

# After a recovery step: link UP and routes present
recovered() {
    link_healthy && routes_healthy
}

main() {
    local health
    flannel_health
    health=$?
    if [ "$health" -eq 0 ]; then
        exit 0
    fi

    if [ "$health" -eq 3 ]; then
        log "ALERT: flannel.1 is UP but has $(route_count) route(s) to other nodes (need >= $MIN_ROUTES) - beginning recovery"
    else
        log "ALERT: flannel.1 missing or DOWN - beginning recovery"
    fi

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

    if [ "$DRY_RUN" = "1" ]; then
        if [ "$health" -eq 3 ]; then
            log "DRY-RUN: would restart $k3s_unit (routes missing; tailscaled left alone)"
        else
            log "DRY-RUN: would restart tailscaled, then $k3s_unit if still unhealthy"
        fi
        exit 0
    fi

    record_restart

    if [ "$health" -eq 2 ]; then
        # Step 1: tailscaled (the underlay). Every node in this cluster uses
        # tailscale0 as the flannel VXLAN underlay.
        log "Restarting tailscaled (Tailscale is the flannel underlay)"
        if ! systemctl restart tailscaled; then
            log "WARNING: tailscaled restart command failed; continuing to K3s restart"
        fi
        sleep 15

        if recovered; then
            log "RECOVERED via tailscaled restart"
            exit 0
        fi
        log "tailscaled restart insufficient (link or routes still missing); restarting $k3s_unit"
    else
        log "Restarting $k3s_unit to reinstall flannel routes (tailscaled left alone)"
    fi

    # Step 2: K3s service (it owns the flannel daemon and its routes)
    if ! systemctl restart "$k3s_unit"; then
        log "ERROR: $k3s_unit restart command failed. MANUAL INTERVENTION NEEDED."
        exit 1
    fi
    sleep 30

    if recovered; then
        log "RECOVERED via $k3s_unit restart ($(route_count) route(s) via flannel.1)"
        exit 0
    fi

    log "CRITICAL: flannel still unhealthy after $k3s_unit restart (link $(link_healthy && echo UP || echo missing/DOWN), $(route_count) route(s)). MANUAL INTERVENTION NEEDED."
    exit 1
}

main "$@"
