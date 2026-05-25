#!/bin/bash
# Setup LVM hardening on storage nodes that have BOTH:
#  - LVM-managed local storage (openebs-lvm thin pool)
#  - iSCSI client sessions to network storage
#
# Without filtering, every `pvscan`/`lvs`/`lvcreate` walks ALL block devices
# including the iSCSI ones. When a multipath path flaps (notably the RTL8156
# USB NIC on .109), AIO on the device can wedge in `exit_aio`, hanging
# LVM tools indefinitely. The filter excludes iSCSI devices from LVM's
# scanning scope; LVM only touches the local NVMe partitions backing the VG.
#
# Also enables thin-pool autoextend at 80% to prevent out_of_data_space
# events from cascading into EXT4 "lost async page write" errors.
#
# Hostname-aware:
#   - debian-marmoset: filter nvme0n1p4 + nvme0n1p5 (openebs-vg PVs)
#   - (others)       : not yet configured
#
# Usage: sudo bash setup-lvm-filter.sh
#
# See memory:
#   thin-pool-first-diagnostic (the diagnostic trick)
#   debian-marmoset-lvm-config-2026-05-22 (when first applied)
#   rtl8156-unreliable-for-iscsi (the underlying NIC flakiness)

set -euo pipefail

HOSTNAME=$(hostname)
DATE_TAG=$(date +%Y-%m-%d-%H%M%S)
LVM_CONF=/etc/lvm/lvm.conf

require_root() {
    if [ "$EUID" -ne 0 ]; then
        echo "ERROR: must run as root (use sudo)" >&2
        exit 1
    fi
}

install_filter_debian_marmoset() {
    echo "=== Configure LVM global_filter + autoextend on debian-marmoset ==="

    # Idempotent: only append if our marker comment isn't already present.
    if grep -q "Added .* exclude iSCSI devices from LVM scanning" "$LVM_CONF"; then
        echo "  filter block already present; skipping"
        return
    fi

    cp -p "$LVM_CONF" "${LVM_CONF}.bak.${DATE_TAG}"
    echo "  backup: ${LVM_CONF}.bak.${DATE_TAG}"

    cat >> "$LVM_CONF" <<'EOF'

# Added 2026-05-22: exclude iSCSI devices from LVM scanning to prevent
# wedge on flaky .109 iSCSI NIC (per memory: rtl8156-unreliable-for-iscsi)
devices {
    global_filter = [ "a|^/dev/nvme0n1p4$|", "a|^/dev/nvme0n1p5$|", "r|.*|" ]
}

# Added 2026-05-22: auto-extend thin pool when it reaches 80% to prevent
# out_of_data_space conditions that cascade into LV write errors
activation {
    thin_pool_autoextend_threshold = 80
    thin_pool_autoextend_percent = 20
}
EOF

    echo "  filter + autoextend appended; rebuilding LVM cache"
    pvscan --cache 2>/dev/null || true
    echo ""
}

main() {
    require_root
    echo "=== LVM filter setup on $HOSTNAME ==="
    echo ""

    case "$HOSTNAME" in
        debian-marmoset)
            install_filter_debian_marmoset
            ;;
        *)
            echo "INFO: $HOSTNAME has no LVM-filter config defined." >&2
            echo "Only debian-marmoset is currently configured (its openebs-vg lives on" >&2
            echo "nvme0n1 partitions and the node also runs iSCSI clients to Synology)." >&2
            exit 0
            ;;
    esac

    echo "=== Done ==="
    echo "Current filter:"
    grep -E "^\s*global_filter" "$LVM_CONF" | tail -1
    echo "Thin pool status:"
    dmsetup status openebs--vg-openebs--vg_thinpool-tpool 2>/dev/null || true
}

main "$@"
