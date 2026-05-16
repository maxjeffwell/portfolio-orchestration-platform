# Storage Node Setup

Source of truth for K8s node-level storage configuration (multipath +
iSCSI initiator state). Complements the K8s-level GitOps managed by
ArgoCD — this layer is what enables the PVs to work in the first place.

## Repo layout

```
k8s/scripts/
├── setup-multipath.sh            # Entry point. Hostname-aware dispatcher.
├── configs/
│   ├── multipath/
│   │   ├── debian-marmoset.conf  # Full conf: ASUSTOR + Synology multipaths
│   │   └── vps.conf              # find_multipaths smart for VPSes
│   └── iscsi/
│       ├── iscsid-digest-defaults.conf  # CRC32C,None snippet for iscsid.conf
│       ├── ifaces/
│       │   ├── synology-mp109    # Bound to 192.168.50.109 (USB NIC path)
│       │   └── synology-mp129    # Bound to 192.168.50.129 (BE88U-LAN path)
│       └── INVENTORY.md          # Targets, portals, recovery quickref
```

## When to run setup-multipath.sh

- After provisioning a new K3s node that needs iSCSI PV access
- After changing any of the `configs/` files (re-run to push the change)
- During disaster recovery on a rebuilt node

The script is idempotent — safe to run repeatedly.

## How to roll a config change

1. Edit the file under `configs/` (e.g. add a new Synology `multipath{}` block
   to `configs/multipath/debian-marmoset.conf`).
2. Commit + push.
3. SSH to each affected node, `git pull` (or `scp` the file), run `sudo bash setup-multipath.sh`.
4. Verify with `multipath -ll` and the relevant K8s pods.

(No ArgoCD path for this — node-level Linux config sits below the K8s
abstraction. Could be wrapped into Ansible later if the manual `ssh+run`
step becomes a bottleneck.)

## What this layer does NOT cover

Some homelab storage state lives outside any source-controlled file:

| State | Why not in git |
|---|---|
| Synology DSM iSCSI digest disable, max_sessions, MTU | DSM has no public API for these (GUI-only) |
| BE88U `/jffs/scripts/services-start` bond1 disable | Router NVRAM; not easily exported |
| ASUSTOR `/usr/local/etc/init.d/S99backup-iscsi-luns` | ADM-side script; lives on the NAS itself |
| ArgoCD apps' `targetRevision` + sync policy | In each Application CRD — managed via `gitops/applications/` in `devops-portfolio-manager` |

These are documented in `k8s/scripts/configs/iscsi/INVENTORY.md` under
"Other related state" with manual procedures.

## Discovering the WWID for a new multi-pathed Synology LUN

When a Synology PVC starts using multiple portals and you need to add an
explicit `multipaths{}` alias block:

```bash
# On debian-marmoset, find the device for the PVC:
lsblk -o NAME,SERIAL,SIZE | grep <pvc-uuid-prefix>
# Get its WWID:
/lib/udev/scsi_id -g -u /dev/sdX
# Add a block to configs/multipath/debian-marmoset.conf:
#     multipath {
#         wwid "0x<the-wwid>"
#         alias mpath-<friendly-name>
#     }
```

Then commit + push + re-run on the node.

## See also

- `project_synology_iscsi_multipath_path_2026_05_16.md` (memory entry, design rationale)
- `project_asustor_iscsi_multipath_2026_05_16.md` (memory entry, ASUSTOR-specific procedure)
- `project_multipathd_smart_2026_05_16.md` (memory entry, VPS find_multipaths=smart context)
