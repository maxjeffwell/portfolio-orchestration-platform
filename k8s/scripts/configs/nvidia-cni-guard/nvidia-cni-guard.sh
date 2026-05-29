#!/usr/bin/env bash
# nvidia-cni-guard — repair k3s containerd CNI paths clobbered by the NVIDIA
# gpu-operator container-toolkit.
#
# The toolkit (container-toolkit:v1.18.1) rewrites
# /etc/containerd/conf.d/99-nvidia.toml with VANILLA-k8s CNI paths
# (bin_dirs=["/opt/cni/bin"], conf_dir="/etc/cni/net.d") on the active
# containerd-2.x CRI plugin (io.containerd.cri.v1.runtime). Those paths don't
# exist on k3s, so containerd loads zero CNI plugins -> "cni plugin not
# initialized" -> node NotReady. This guard rewrites just those two lines back
# to k3s's real locations and (rate-limited) restarts k3s-agent to apply.
#
# Triggered by nvidia-cni-guard.path on every change to the drop-in.
# See Claude memory: marmoset-gpu-operator-cni-clobber.
set -euo pipefail

DROPIN=/etc/containerd/conf.d/99-nvidia.toml
K3S_BIN_DIR=/var/lib/rancher/k3s/data/cni
K3S_CONF_DIR=/var/lib/rancher/k3s/agent/etc/cni/net.d
STAMP=/run/nvidia-cni-guard.last-restart
MIN_RESTART_INTERVAL=300   # seconds; rate-limit k3s-agent restarts

log() { logger -t nvidia-cni-guard "$*" 2>/dev/null || true; echo "nvidia-cni-guard: $*"; }

[ -f "$DROPIN" ] || { log "drop-in absent — nothing to do"; exit 0; }

# Act only when the broken vanilla paths are present (idempotent: after our
# rewrite they're gone, so a re-trigger is a clean no-op and cannot loop).
if ! grep -qE '"/opt/cni/bin"|"/etc/cni/net.d"' "$DROPIN"; then
  exit 0
fi

log "detected vanilla CNI paths in $DROPIN — rewriting to k3s paths"
sed -i \
  -e "s#bin_dirs = \[\"/opt/cni/bin\"\]#bin_dirs = [\"${K3S_BIN_DIR}\"]#g" \
  -e "s#conf_dir = \"/etc/cni/net.d\"#conf_dir = \"${K3S_CONF_DIR}\"#g" \
  "$DROPIN"

if grep -qE '"/opt/cni/bin"|"/etc/cni/net.d"' "$DROPIN"; then
  log "ERROR: rewrite left vanilla paths behind (toolkit format changed?) — NOT restarting k3s-agent; needs manual review"
  exit 1
fi
log "rewrote CNI paths -> bin_dirs=[${K3S_BIN_DIR}] conf_dir=${K3S_CONF_DIR}"

now=$(date +%s)
last=0
[ -f "$STAMP" ] && last=$(cat "$STAMP" 2>/dev/null || echo 0)
if [ $(( now - last )) -lt "$MIN_RESTART_INTERVAL" ]; then
  log "k3s-agent restarted <${MIN_RESTART_INTERVAL}s ago — config fixed on disk, skipping restart"
  exit 0
fi
echo "$now" > "$STAMP"
log "restarting k3s-agent (non-blocking) to apply corrected CNI config"
systemctl restart --no-block k3s-agent
