# cluster-nfs

In-cluster NFS storage class backed by an ASUSTOR iSCSI LUN.

## Background

The `asustor-k8s` NFS storage class became unusable on 2026-04-22 due to ext4
directory-block corruption on `/dev/vg-ssd/k8s-share` (kernel held the LV
locked across reboots, blocking fsck). This replaces it with a fundamentally
more robust architecture:

```
ASUSTOR vg-ssd LV
       |
       v
iSCSI LUN (raw block, ADM-managed, snapshot-capable thin provisioning)
       |
       v
kubelet iSCSI initiator on cluster node
       |
       v
ext4 (cluster-controlled filesystem, not ASUSTOR-side)
       |
       v
nfs-server pod (kernel NFS, NFSv3+v4)
       |
       v
ClusterIP Service (pinned 10.43.67.16)
       |
       v
nfs-subdir-external-provisioner -> StorageClass `cluster-nfs`
```

The earlier failure mode was at the ASUSTOR-side ext4 layer; iSCSI exposes
raw blocks only, so cluster nodes manage the filesystem with kernel versions
under our control.

## Apply order

```bash
# Apply manifests
kubectl apply -f 01-pv-asustor-iscsi-cluster-nfs.yaml
kubectl apply -f 02-namespace-pvc.yaml
kubectl apply -f 03-nfs-server.yaml

# Install the dynamic subdir provisioner via Helm
helm repo add nfs-subdir-external-provisioner \
  https://kubernetes-sigs.github.io/nfs-subdir-external-provisioner/
helm repo update
helm upgrade --install cluster-nfs-provisioner \
  nfs-subdir-external-provisioner/nfs-subdir-external-provisioner \
  --namespace nfs-provisioners \
  --set nfs.server=10.43.67.16 \
  --set nfs.path=/ \
  --set nfs.mountOptions[0]=nfsvers=4 \
  --set nfs.mountOptions[1]=nconnect=4 \
  --set nfs.mountOptions[2]=hard \
  --set storageClass.name=cluster-nfs \
  --set storageClass.defaultClass=false \
  --set storageClass.reclaimPolicy=Retain \
  --set storageClass.archiveOnDelete=false \
  --set storageClass.allowVolumeExpansion=true \
  --set 'nodeSelector.kubernetes\.io/hostname=debian-marmoset' \
  --set 'podAnnotations.backup\.velero\.io/backup-volumes-excludes=nfs-subdir-external-provisioner-root'
```

The `nodeSelector` pins the provisioner to the same node as the nfs-server backend pod.

The `podAnnotations` line keeps this pod's root mount out of Velero. The provisioner
mounts the ROOT of the export (`/`), i.e. the parent directory of every PVC it hands
out — without the exclusion, fs-backup copies all of that data a SECOND time on top of
the per-PVC backups that already cover it. The PV declares `10Mi` because NFS PVs ignore
`spec.capacity`, so the real size never surfaces in a capacity audit. Added 2026-08-11
after Velero measured the sibling `asustor-backups` provisioner's root at **408.56 GB**
and spent an entire 4h backup window on it. Excluding the root loses no coverage.

## Why pin the provisioner to `debian-marmoset`

The `nfs-server` pod runs on `debian-marmoset` (single replica). Without pinning, the
provisioner can schedule on any worker — including the cloud nodes (vmi3115606,
vmi2951245) which reach the in-cluster NFS service over the WireGuard/Tailscale
tunnel. That cross-host NFS-via-WG path is *extremely* sensitive to network blips:
any tunnel flap leaves the kubelet with an orphaned NFS mount whose TCP socket
stays ESTAB on the server side, holding the NFSv4 lease, blocking ALL future
mount attempts to this nfs-server (even from other clients) until the server pod
is bounced.

Observed 2026-05-27: provisioner pod on vmi3115606 got stuck `ContainerCreating`
for 3+ hours with the orphan-mount/stuck-lease pattern. Fix was 3-fold:
1. `umount -l` the orphan mount on vmi3115606 (didn't kill the TCP socket; lazy detach only)
2. `kubectl rollout restart deploy nfs-server -n cluster-nfs` (clears server state and forces all stale clients to reconnect)
3. Add `nodeSelector: kubernetes.io/hostname=debian-marmoset` so the provisioner mount becomes same-node (CNI bridge, no tunnels)

Pinning to debian-marmoset doesn't worsen failure independence: the nfs-server is
on debian-marmoset already (single replica), so the provisioner has an implicit
dependency on that node either way. Co-locating just removes the WG/Tailscale link
from the dependency chain.

## Anti-affinity gotcha

There was a manual `kubectl patch` at some point that added a `podAntiAffinity`
rule preventing co-location with `app: nfs-server`. That rule isn't in the chart
or helm values, so a `helm upgrade` won't render it — but kubernetes 3-way merge
may have preserved it across upgrades. Check with:
```bash
kubectl -n nfs-provisioners get deploy cluster-nfs-provisioner-nfs-subdir-external-provisioner -o yaml | grep -A8 affinity
```
If `podAntiAffinity` appears, remove with:
```bash
kubectl -n nfs-provisioners patch deploy cluster-nfs-provisioner-nfs-subdir-external-provisioner --type=json -p='[{"op":"remove","path":"/spec/template/spec/affinity"}]'
```

## Why ClusterIP must be pinned

The kubelet on each node runs the `mount -t nfs` command in **host network
namespace**, not pod context. Host's `/etc/resolv.conf` typically doesn't
include cluster DNS, so the FQDN `nfs-server.cluster-nfs.svc.cluster.local`
fails to resolve. The pinned ClusterIP `10.43.67.16` is stable across
Service recreations and routable via kube-proxy from any node.

## Why NFSv4 in the provisioner mount options

The earlier NFSv3 attempts hit "Resource temporarily unavailable" because
NFSv3 needs `rpc.mountd` reachable on a dynamic port that ClusterIP can't
route to. NFSv4 collapses everything onto port 2049 — single-port operation,
no rpcbind, no mountd, just works through ClusterIP.

The 2026-04-22 NFSv4 callback wedge bug applied to ASUSTOR's ADM kernel
implementation; this in-cluster server runs a different kernel (Contabo VPS
Ubuntu) so the bug doesn't apply.

## Why NFSv3 enabled on the server side

The server advertises both v3 and v4 (`rpc.nfsd -V 3 -V 4`) so future
consumers that need v3 can use the same SC if necessary. The provisioner
mount uses v4 specifically to avoid the dynamic-port issue.
