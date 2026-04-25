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
  --set storageClass.allowVolumeExpansion=true
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
