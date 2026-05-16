# iSCSI Target Inventory

Authoritative list of iSCSI targets, portals, and initiator-side configuration
in the homelab as of 2026-05-16. Use this to rebuild iSCSI sessions on a
fresh node, or to audit "should this target exist?" questions.

## Targets

### Synology DS423 (`boom_boom`, 10.0.0.5)

| Detail | Value |
|---|---|
| Base IQN | `iqn.2000-01.com.synology:boom-boom.pvc-<UUID>` |
| Created by | synology-csi v1.2.1 (one IQN per K8s PVC) |
| Portals | `10.0.0.5:3260` (WG mesh), `192.168.50.109:3260` (USB NIC), `192.168.50.129:3260` (BE88U-LAN) |
| Digest | CRC32C (negotiated), can disable via DSM GUI → iSCSI → Targets → CHAP/Advanced |
| Max sessions | 0 (unlimited) — set in DSM GUI → iSCSI → LUNs → Advanced |
| MTU on portal NIC | 1500 (eth2 dropped from 9000 to fix PMTU black hole 2026-05-16) |

PVC IQNs are dynamic (created/destroyed as CNPG provisions instances). Discover live with:
```
iscsiadm -m discovery -t st -p 10.0.0.5:3260
```

### ASUSTOR AS5402T (`AS5402T-A7F3`, 192.168.50.149)

| Detail | Value |
|---|---|
| Cluster IQN | `iqn.2007-09.cn.com.asustor:cluster.<...>` (250 GiB, cluster-nfs PV) |
| ZFS-pool IQN | `iqn.2007-09.cn.com.asustor:zfs-pool.<...>` (2× 480 GiB stripe, asustor-zfs SC) |
| Portals | `192.168.50.149:3260`, `192.168.50.142:3260` (multipath) |
| Persistence | `/usr/local/etc/init.d/S99backup-iscsi-luns` re-creates LUNs after ADM reboots |
| WWID quirk | ASUSTOR doesn't expose SCSI WWID — requires `uid_attribute "ID_SERIAL"` in multipath device entry (see `../multipath/debian-marmoset.conf`) |

## Initiator-side iface assignments (debian-marmoset)

| iface name | Bound to portal | InitiatorName |
|---|---|---|
| (default) | any portal | `iqn.1993-08.org.debian:01:<hostid>` |
| `synology-mp109` | 192.168.50.109 | `iqn.1993-08.org.debian:01:multipath-mp109` |
| `synology-mp129` | 192.168.50.129 | `iqn.1993-08.org.debian:01:multipath-mp129` |

Custom ifaces with unique InitiatorNames let DSM treat each path as a
separate "client," which is required for multi-pathing to the same LUN.
Otherwise DSM rejects the second login as "already connected."

Install ifaces by copying the files from `ifaces/` to `/var/lib/iscsi/ifaces/`
on the node, then re-running iSCSI discovery with `-I <iface>` to attach
each portal to its iface.

## Node startup policy

All persistent iSCSI sessions must have `node.startup=automatic` set so they
auto-reconnect after reboot:
```
iscsiadm -m node -T <iqn> -p <portal> -o update -n node.startup -v automatic
```

Verify after rebuild:
```
iscsiadm -m node | wc -l                       # how many sessions total
iscsiadm -m session                            # how many actually connected
grep "^node.startup" /var/lib/iscsi/nodes/*/*/default 2>/dev/null | grep -v automatic
# ^ anything output here is missing the auto-start flag
```

## Other related state (not iSCSI-controllable but iSCSI-adjacent)

### BE88U router (`/jffs/scripts/services-start`)

- The `bond1` (eth3+eth4 LACP) block is DISABLED — eth3 is Synology USB NIC,
  eth4 is OpenMPTCPRouter, neither supports LACP. Disabling it was required
  for the .109 path to be reachable. See git history for the marker comments.

### Synology DSM GUI

State that cannot be source-controlled (DSM has no API for these):
- iSCSI digest disable (Control Panel → iSCSI → Targets → Advanced)
- max_sessions per LUN (Control Panel → iSCSI → LUNs → Advanced)
- eth2 MTU 1500 (Control Panel → Network → Network Interface → eth2)

Document these as part of the DSM recovery checklist if you ever rebuild
the NAS.

## Recovery quickref

To rebuild iSCSI multipath on debian-marmoset from scratch:

```bash
# 1) Restore /etc/multipath.conf from this repo
cp configs/multipath/debian-marmoset.conf /etc/multipath.conf
systemctl restart multipathd

# 2) Restore /etc/iscsi/iscsid.conf digest defaults
# (manually edit per the snippet in configs/iscsi/iscsid-digest-defaults.conf)
systemctl restart iscsid

# 3) Restore custom ifaces
mkdir -p /var/lib/iscsi/ifaces
cp configs/iscsi/ifaces/synology-mp109 /var/lib/iscsi/ifaces/
cp configs/iscsi/ifaces/synology-mp129 /var/lib/iscsi/ifaces/

# 4) Re-discover Synology and login with each iface
iscsiadm -m discovery -t st -p 10.0.0.5:3260 -I default
iscsiadm -m discovery -t st -p 192.168.50.109:3260 -I synology-mp109
iscsiadm -m discovery -t st -p 192.168.50.129:3260 -I synology-mp129
iscsiadm -m node --login

# 5) Re-discover ASUSTOR
iscsiadm -m discovery -t st -p 192.168.50.149:3260
iscsiadm -m discovery -t st -p 192.168.50.142:3260
iscsiadm -m node --login

# 6) Verify multipath devices appeared for the multi-pathed LUNs
multipath -ll
```
