#!/bin/bash
# Setup nvidia-cni-guard on the GPU node (marmoset only).
#
# Problem: the NVIDIA gpu-operator container-toolkit (container-toolkit:v1.18.1,
# chart v25.10.1) rewrites /etc/containerd/conf.d/99-nvidia.toml on every
# reconcile/pod-restart. It emits VANILLA-Kubernetes CNI paths on containerd
# 2.x's active CRI plugin (io.containerd.cri.v1.runtime):
#     bin_dirs = ["/opt/cni/bin"]      # does not exist on k3s
#     conf_dir = "/etc/cni/net.d"      # lacks k3s's 10-flannel.conflist
# k3s relocates both (bin -> /var/lib/rancher/k3s/data/cni,
# conf -> /var/lib/rancher/k3s/agent/etc/cni/net.d), so containerd loads ZERO
# CNI plugins -> "cni plugin not initialized" -> node NotReady. A k3s restart
# can't fix it (the bad drop-in is re-imported every boot). Observed 7+ times;
# manual workaround was always "disable the drop-in + restart". See memory
# marmoset-gpu-operator-cni-clobber for the full diagnosis.
#
# Why a watchdog instead of toolkit.enabled=false: disabling the toolkit would
# trigger its uninstall-cleanup, reverting containerd config and breaking the
# deliberately-enabled devicePlugin + dcgmExporter (GPU advertise + metrics).
# The watchdog keeps the toolkit working and only corrects its CNI mistake.
#
# This watchdog:
#  - systemd .path unit watches the drop-in; fires the oneshot on any change
#  - oneshot rewrites ONLY the two bad CNI lines back to k3s paths in place
#    (preserves the nvidia/nvidia-cdi/nvidia-legacy/runc runtime stanzas)
#  - then restarts k3s-agent (--no-block) to apply, rate-limited to 1/300s via
#    /run/nvidia-cni-guard.last-restart to prevent restart storms
#  - idempotent: only acts when "/opt/cni/bin" is present, so its own edit
#    can't cause a re-trigger loop
#  - logs to the journal (tag nvidia-cni-guard)
#
# Node scope: marmoset ONLY. It is the sole node running the nvidia
# gpu-operator container-toolkit. Other nodes have no 99-nvidia.toml drop-in.
#
# Source-of-truth files live in configs/nvidia-cni-guard/:
#   nvidia-cni-guard.sh       -> /usr/local/sbin/nvidia-cni-guard.sh
#   nvidia-cni-guard.path     -> /etc/systemd/system/nvidia-cni-guard.path
#   nvidia-cni-guard.service  -> /etc/systemd/system/nvidia-cni-guard.service
#
# Usage (on marmoset):
#   sudo bash setup-nvidia-cni-guard.sh
#
# Idempotent: safe to re-run; backs up replaced files with .bak.<timestamp>.
#
# Verify after install:
#   systemctl status nvidia-cni-guard.path        # expect: active (waiting)
#   journalctl -t nvidia-cni-guard --no-pager -n 20
#
# Test (forces the guard to act, WITHOUT a node blip — seeds the rate-limit
# stamp so the k3s-agent restart is skipped):
#   sudo bash -c 'date +%s > /run/nvidia-cni-guard.last-restart; \
#     cp /etc/containerd/conf.d/99-nvidia.toml.disabled-7 \
#        /etc/containerd/conf.d/99-nvidia.toml; sleep 3; \
#     grep -nE "bin_dirs|conf_dir = " /etc/containerd/conf.d/99-nvidia.toml'
#   # expect bin_dirs/conf_dir rewritten to the k3s paths
#
# See memory:
#   marmoset-gpu-operator-cni-clobber  - motivating incident + full diagnosis
#   flannel-watchdog-2026-05-25        - companion watchdog (same pattern)
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/configs/nvidia-cni-guard" && pwd)"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run as root (sudo bash setup-nvidia-cni-guard.sh)" >&2
  exit 1
fi

if [ "$(hostname)" != "marmoset" ]; then
  echo "WARNING: this host is '$(hostname)', not 'marmoset'. The nvidia"
  echo "container-toolkit drop-in only exists on the GPU node. Continuing"
  echo "anyway in 5s (Ctrl-C to abort)..."
  sleep 5
fi

install_file() {  # <src> <dst> <mode>
  local src="$1" dst="$2" mode="$3"
  if [ -f "$dst" ] && ! cmp -s "$src" "$dst"; then
    cp -a "$dst" "${dst}.bak.${STAMP}"
    echo "backed up existing $dst -> ${dst}.bak.${STAMP}"
  fi
  install -m "$mode" "$src" "$dst"
  echo "installed $dst"
}

install_file "$SRC_DIR/nvidia-cni-guard.sh"      /usr/local/sbin/nvidia-cni-guard.sh      0755
install_file "$SRC_DIR/nvidia-cni-guard.path"    /etc/systemd/system/nvidia-cni-guard.path    0644
install_file "$SRC_DIR/nvidia-cni-guard.service" /etc/systemd/system/nvidia-cni-guard.service 0644

systemctl daemon-reload
systemctl enable --now nvidia-cni-guard.path

echo
echo "nvidia-cni-guard installed and armed:"
systemctl status nvidia-cni-guard.path --no-pager | grep -E "Loaded:|Active:|Triggers:" || true
echo "INSTALLED-OK"
