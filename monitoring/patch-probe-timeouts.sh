#!/usr/bin/env bash
# patch-probe-timeouts.sh — Set probe timeoutSeconds to 5 on components whose
# upstream Helm charts hardcode 1s defaults.
#
# Re-run after every `helm upgrade` for monitoring components, as Helm will
# reset the container spec to the chart's template values.
#
# Usage: ./patch-probe-timeouts.sh [--dry-run]

set -euo pipefail

DRY_RUN=""
if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN="--dry-run=server"
  echo "=== DRY RUN MODE ==="
fi

KUBECTL="kubectl"
TIMEOUT=5

patched=0
skipped=0
failed=0

patch_probe() {
  local kind="$1" ns="$2" name="$3" container="$4" probe_type="$5"
  local patch

  patch=$(cat <<EOF
{"spec":{"template":{"spec":{"containers":[{"name":"${container}","${probe_type}":{"timeoutSeconds":${TIMEOUT}}}]}}}}
EOF
)

  echo -n "  ${kind}/${name} (${container}) ${probe_type}... "
  if $KUBECTL patch "${kind}" "${name}" -n "${ns}" --type=strategic -p "${patch}" ${DRY_RUN} 2>/dev/null; then
    patched=$((patched + 1))
  else
    echo "FAILED"
    failed=$((failed + 1))
  fi
}

# ─── Monitoring namespace ──────────────────────────────────────────────────

echo "=== monitoring namespace ==="

# Mimir components (all use container name matching the component)
for deploy in prometheus-mimir-distributor prometheus-mimir-query-frontend prometheus-mimir-overrides-exporter; do
  container="${deploy#prometheus-mimir-}"
  patch_probe deployment monitoring "$deploy" "$container" readinessProbe
done

patch_probe deployment monitoring prometheus-mimir-querier querier readinessProbe

for sts in prometheus-mimir-ingester prometheus-mimir-store-gateway prometheus-mimir-compactor; do
  container="${sts#prometheus-mimir-}"
  patch_probe statefulset monitoring "$sts" "$container" readinessProbe
done

patch_probe statefulset monitoring prometheus-mimir-kafka kafka readinessProbe

# Grafana
patch_probe deployment monitoring prometheus-grafana grafana readinessProbe

# KubeStateMetrics
patch_probe deployment monitoring prometheus-kube-state-metrics kube-state-metrics livenessProbe
patch_probe deployment monitoring prometheus-kube-state-metrics kube-state-metrics readinessProbe

# Node exporter (DaemonSet)
patch_probe daemonset monitoring prometheus-prometheus-node-exporter node-exporter livenessProbe
patch_probe daemonset monitoring prometheus-prometheus-node-exporter node-exporter readinessProbe

# ─── ArgoCD namespace ──────────────────────────────────────────────────────

echo ""
echo "=== argocd namespace ==="

patch_probe deployment argocd argocd-repo-server argocd-repo-server readinessProbe
patch_probe deployment argocd argocd-server argocd-server readinessProbe
patch_probe statefulset argocd argocd-application-controller argocd-application-controller readinessProbe

# ─── kube-system namespace ─────────────────────────────────────────────────

echo ""
echo "=== kube-system namespace ==="

patch_probe deployment kube-system coredns coredns livenessProbe
patch_probe deployment kube-system coredns coredns readinessProbe

# ─── Summary ───────────────────────────────────────────────────────────────

echo ""
echo "=== Summary ==="
echo "Patched: ${patched}"
echo "Failed:  ${failed}"

if [[ $failed -gt 0 ]]; then
  echo "Some patches failed — check resource names against running pods."
  exit 1
fi
