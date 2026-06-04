# neon-cluster Move to debian-marmoset (Mayastor) + S3 Offload Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Relocate the self-hosted Neon PoC (`neon-cluster`, ns `default`, KubeBlocks) off vmi3115606 onto **debian-marmoset** with **Mayastor** storage, discarding the existing ~30 throwaway test tenants and recreating fresh, while **fixing the dead pageserver→Garage S3 offload** so the new cluster is actually durable.

**Architecture:** The cluster's two stateful volumes (pageserver 10Gi, safekeeper 5Gi) are on `openebs-lvmpv`, a node-local LVM PV hard-pinned to vmi3115606 — that pin, not pod scheduling, is what welds the cluster to that node. We delete the cluster (after lifting its `DoNotTerminate` guard), patch the KubeBlocks `neon-scripts-template` so the pageserver launches with an active `remote_storage` config (the missing `-c "remote_storage=…"` flag is the entire reason `remote_consistent_lsn` is `0/0` for all 30 tenants), then recreate the cluster with `mayastor-1` volumes and a `schedulingPolicy.nodeSelector` pinning every component to debian-marmoset. Mayastor exports volumes over NVMe-oF, so the pods are no longer disk-welded to one node.

**Tech Stack:** KubeBlocks v1 (`apps.kubeblocks.io/v1`), Neon addon `pg14-1.0.0` (`apecloud/neon`), Mayastor (OpenEBS), Garage S3 (`garage.monitoring.svc:3900`), k3s.

---

## Pre-flight Facts (verified 2026-06-03, do not re-derive — re-verify only if stale)

| Fact | Value |
|------|-------|
| Cluster | `neon-cluster`, ns `default`, `clusterDef: neon`, `topology: default`, `terminationPolicy: DoNotTerminate` |
| Components | `neon-pageserver-1.0.1`, `neon-safekeeper-1.0.1`, `neon-broker-1.0.1`, `neon-compute-1.0.1` (all `serviceVersion: 1.0.0`) |
| Current node | all 4 pods on **vmi3115606** |
| Stateful PVCs | `data-neon-cluster-neon-pageserver-0` (10Gi), `data-neon-cluster-neon-safekeeper-0` (5Gi), both `openebs-lvmpv` pinned to vmi3115606 |
| Target pool | `debian-marmoset-pool` Mayastor — **19.9 GiB free** (need 15 GiB) |
| Target node | `debian-marmoset` — no taints, 16 CPU, ~14Gi mem |
| S3 bug | `pageserver_start.sh` in `kb-system/neon-scripts-template` (key `pageserver_start.sh`) launches `pageserver` with **no** `-c "remote_storage=…"` flag → `# [remote_storage]` stays commented in `/opt/neondatabase-neon/.neon/pageserver.toml` → no offload |
| S3 creds | `AWS_ACCESS_KEY_ID=GKcac2218863e046a6597262ae`, secret in pageserver env (ROTATE post-migration — leaked to transcripts) |
| Garage target | bucket `neon-storage`, endpoint `http://garage.monitoring.svc.cluster.local:3900`, region `garage`, prefix `pageserver/` |
| NetworkPolicy | `allow-neon-to-garage` (selects `app.kubernetes.io/instance=neon-cluster`) — node-agnostic, survives the move |

**Data decision (user, 2026-06-03):** all existing tenants are disposable test data. No data migration. Verify-by-fresh-write only.

---

## File / Resource Structure

- **Live, ungoverned (kubectl):** `Cluster/neon-cluster` (ns default) — deleted and recreated.
- **Live, Helm-managed (kubectl patch, drifts from chart):** `ConfigMap/neon-scripts-template` (ns kb-system) — patched to add the `remote_storage` flag. NOTE: this is `managed-by: Helm` (release `neon`); a live patch drifts from the chart. Durable fix = patch chart values too (Task 7, optional/follow-up).
- **New git-tracked manifest:** `k8s/databases/neon-cluster.yaml` (this repo) — the recreated cluster, so it stops being ungoverned. Created in Task 6.
- **New k8s Secret (optional hardening):** `neon-cluster-s3-creds` (ns default) — replaces inline creds. Task 6 variant.

---

### Task 1: Confirm no live consumers + capture rollback state

**Files:** none (read-only verification)

- [ ] **Step 1: Confirm nothing outside the cluster depends on it**

Run:
```bash
kubectl get svc,ingress,ingressroute -A 2>/dev/null | grep -iE 'neon-cluster|55432' || echo "NO external refs"
kubectl get cluster -n default neon-cluster -o jsonpath='{.status.phase}{"\n"}'
```
Expected: `NO external refs` and `Running`. If any external Service/Ingress references the cluster, STOP and re-evaluate — there may be a real consumer the data-discard decision didn't account for.

- [ ] **Step 2: Snapshot current state for rollback reference**

Run:
```bash
kubectl get cluster -n default neon-cluster -o yaml > /tmp/neon-cluster.rollback.yaml
kubectl get cm -n kb-system neon-scripts-template -o yaml > /tmp/neon-scripts-template.rollback.yaml
ls -l /tmp/neon-cluster.rollback.yaml /tmp/neon-scripts-template.rollback.yaml
```
Expected: both files exist, non-zero size. These are the restore points if anything goes wrong.

---

### Task 2: Fix the S3 offload in the scripts template

**Files:** Modify (live): `ConfigMap/neon-scripts-template` (ns kb-system), key `pageserver_start.sh`

- [ ] **Step 1: View the current pageserver launch line**

Run:
```bash
kubectl get cm -n kb-system neon-scripts-template -o jsonpath='{.data.pageserver_start\.sh}'
```
Expected: ends with a line containing
`exec pageserver -D /data -c "id=1" -c "broker_endpoint='…'" -c "listen_pg_addr='0.0.0.0:$PAGEKEEPER_PG_PORT'" -c "listen_http_addr='0.0.0.0:$PAGEKEEPER_HTTP_PORT'" -c "pg_distrib_dir='/opt/neondatabase-neon/pg_install'"`
and **no** `remote_storage`.

- [ ] **Step 2: Write the patched script to a file**

Create `/tmp/pageserver_start.sh` — take the exact current content from Step 1 and append a `remote_storage` `-c` flag to the `exec pageserver …` line. The flag (Neon S3-compatible inline TOML; creds come from the `AWS_*` env already on the component):

```
-c "remote_storage={bucket_name='neon-storage',bucket_region='garage',prefix_in_bucket='pageserver/',endpoint='http://garage.monitoring.svc.cluster.local:3900'}"
```

So the final line becomes:
```bash
exec pageserver -D /data -c "id=1" -c "broker_endpoint='http://$NEON_STORAGEBROKER_POD_FQDN_LIST:$NEON_STORAGEBROKER_PORT'" -c "listen_pg_addr='0.0.0.0:$PAGEKEEPER_PG_PORT'" -c "listen_http_addr='0.0.0.0:$PAGEKEEPER_HTTP_PORT'" -c "pg_distrib_dir='/opt/neondatabase-neon/pg_install'" -c "remote_storage={bucket_name='neon-storage',bucket_region='garage',prefix_in_bucket='pageserver/',endpoint='http://garage.monitoring.svc.cluster.local:3900'}"
```
(Reuse the bucket/endpoint/region/prefix the operator wants. They duplicate the `NEON_S3_*` env, which this build ignores for the pageserver — the `-c` flag is what the binary reads.)

- [ ] **Step 3: Apply the patched key**

Run:
```bash
kubectl create cm -n kb-system neon-scripts-template \
  --from-file=pageserver_start.sh=/tmp/pageserver_start.sh \
  --dry-run=client -o yaml \
| kubectl patch cm -n kb-system neon-scripts-template --type merge --patch-file /dev/stdin
```
(Or simpler: `kubectl patch cm -n kb-system neon-scripts-template --type merge -p "$(jq -Rs '{data:{"pageserver_start.sh":.}}' < /tmp/pageserver_start.sh)"`.)

Verify:
```bash
kubectl get cm -n kb-system neon-scripts-template -o jsonpath='{.data.pageserver_start\.sh}' | grep -c remote_storage
```
Expected: `1` (the flag is present). Do NOT restart the old pageserver to test — we are about to delete it. The fix is validated on the fresh cluster in Task 5.

---

### Task 3: Lift the deletion guard

**Files:** Modify (live): `Cluster/neon-cluster` (ns default), `spec.terminationPolicy`

- [ ] **Step 1: Change terminationPolicy DoNotTerminate → WipeOut**

`WipeOut` deletes pods AND PVCs (we want the vmi3115606 LVM volumes gone). Run:
```bash
kubectl patch cluster -n default neon-cluster --type merge -p '{"spec":{"terminationPolicy":"WipeOut"}}'
kubectl get cluster -n default neon-cluster -o jsonpath='{.spec.terminationPolicy}{"\n"}'
```
Expected: `WipeOut`.

---

### Task 4: Delete the old cluster

**Files:** Delete (live): `Cluster/neon-cluster` and all its child resources

- [ ] **Step 1: Delete the cluster**

Run:
```bash
kubectl delete cluster -n default neon-cluster
```
Expected: `cluster.apps.kubeblocks.io "neon-cluster" deleted` (may take 30–90s while the operator wipes components).

- [ ] **Step 2: Verify full teardown (pods + PVCs gone)**

Run:
```bash
kubectl get pods -n default 2>/dev/null | grep neon-cluster || echo "NO pods"
kubectl get pvc -n default 2>/dev/null | grep neon-cluster || echo "NO pvcs"
```
Expected: `NO pods` and `NO pvcs`. If a PVC lingers in `Terminating`, check for a stuck finalizer:
`kubectl get pvc -n default -o name | grep neon-cluster | xargs -r kubectl patch -n default --type merge -p '{"metadata":{"finalizers":null}}'`

- [ ] **Step 3: Verify the vmi3115606 LVM space was reclaimed**

Run:
```bash
kubectl get pv 2>/dev/null | grep openebs-lvmpv | grep -i neon || echo "LVM PVs released"
```
Expected: `LVM PVs released` (Retain policy may leave the PV `Released`; if so, `kubectl delete pv <name>` to free the LVM LV on vmi3115606).

---

### Task 5: Recreate the cluster on debian-marmoset / Mayastor

**Files:** Create (live + git): `Cluster/neon-cluster` from `k8s/databases/neon-cluster.yaml`

- [ ] **Step 1: Write the new cluster manifest**

Create `k8s/databases/neon-cluster.yaml`:

```yaml
apiVersion: apps.kubeblocks.io/v1
kind: Cluster
metadata:
  name: neon-cluster
  namespace: default
  labels:
    clusterdefinition.kubeblocks.io/name: neon
spec:
  clusterDef: neon
  topology: default
  terminationPolicy: WipeOut
  componentSpecs:
  - name: neon-pageserver
    componentDef: neon-pageserver-1.0.1
    serviceVersion: 1.0.0
    replicas: 1
    podUpdatePolicy: PreferInPlace
    schedulingPolicy:
      nodeSelector:
        kubernetes.io/hostname: debian-marmoset
    env:
    - name: NEON_S3_BUCKET
      value: neon-storage
    - name: NEON_S3_ENDPOINT
      value: http://garage.monitoring.svc.cluster.local:3900
    - name: NEON_S3_REGION
      value: garage
    - name: NEON_S3_PREFIX
      value: pageserver/
    - name: AWS_ACCESS_KEY_ID
      valueFrom:
        secretKeyRef: { name: neon-cluster-s3-creds, key: AWS_ACCESS_KEY_ID }
    - name: AWS_SECRET_ACCESS_KEY
      valueFrom:
        secretKeyRef: { name: neon-cluster-s3-creds, key: AWS_SECRET_ACCESS_KEY }
    resources:
      limits: { memory: 512Mi }
      requests: { cpu: 100m, memory: 256Mi }
    volumeClaimTemplates:
    - name: data
      spec:
        accessModes: [ReadWriteOnce]
        storageClassName: mayastor-1
        resources:
          requests: { storage: 10Gi }
  - name: neon-safekeeper
    componentDef: neon-safekeeper-1.0.1
    serviceVersion: 1.0.0
    replicas: 1
    podUpdatePolicy: PreferInPlace
    schedulingPolicy:
      nodeSelector:
        kubernetes.io/hostname: debian-marmoset
    annotations:
      backup.velero.io/backup-volumes-excludes: data
    resources:
      limits: { memory: 256Mi }
      requests: { cpu: 100m, memory: 128Mi }
    volumeClaimTemplates:
    - name: data
      spec:
        accessModes: [ReadWriteOnce]
        storageClassName: mayastor-1
        resources:
          requests: { storage: 5Gi }
  - name: neon-broker
    componentDef: neon-broker-1.0.1
    serviceVersion: 1.0.0
    replicas: 1
    podUpdatePolicy: PreferInPlace
    schedulingPolicy:
      nodeSelector:
        kubernetes.io/hostname: debian-marmoset
    annotations:
      backup.velero.io/backup-volumes-excludes: data
    resources:
      limits: { memory: 128Mi }
      requests: { cpu: 50m, memory: 64Mi }
  - name: neon-compute
    componentDef: neon-compute-1.0.1
    serviceVersion: 1.0.0
    replicas: 1
    podUpdatePolicy: PreferInPlace
    schedulingPolicy:
      nodeSelector:
        kubernetes.io/hostname: debian-marmoset
    resources:
      limits: { memory: 512Mi }
      requests: { cpu: 250m, memory: 256Mi }
```

NOTE on `replicas`: keep every component at `replicas: 1`. `neon-compute` MUST NOT be set to `0` — this KubeBlocks version rejects `replicas:0` (`out-of-limit [1,16384]`) and hot-loops the operator (the `tenantflow-neon` wedge incident).

- [ ] **Step 2: Create the S3 creds Secret**

Run (replaces inline creds — and remember these specific values must be ROTATED in Garage afterward):
```bash
kubectl create secret generic neon-cluster-s3-creds -n default \
  --from-literal=AWS_ACCESS_KEY_ID=GKcac2218863e046a6597262ae \
  --from-literal=AWS_SECRET_ACCESS_KEY=b92b131272d6d8a1b61e9e5447dcc94b5824c50efddd79c3cb27dd4f3d86198c
```
Expected: `secret/neon-cluster-s3-creds created`.

- [ ] **Step 3: Apply the cluster**

Run:
```bash
kubectl apply -f k8s/databases/neon-cluster.yaml
```
Expected: `cluster.apps.kubeblocks.io/neon-cluster created`.

- [ ] **Step 4: Wait for all components Running on debian-marmoset**

Run:
```bash
kubectl get cluster -n default neon-cluster -o jsonpath='{.status.phase}{"\n"}'
kubectl get pods -n default -o wide | grep neon-cluster
```
Expected (allow 2–5 min): cluster phase `Running`; all 4 pods `Running` with NODE = `debian-marmoset`. If a stateful pod is `Pending`, check Mayastor capacity / PVC binding:
`kubectl get pvc -n default | grep neon-cluster` and `kubectl describe pvc -n default data-neon-cluster-neon-pageserver-0`.

---

### Task 6: Verify S3 offload actually works (the real test)

**Files:** none (verification)

- [ ] **Step 1: Confirm pageserver booted WITH remote storage**

Run:
```bash
kubectl logs -n default neon-cluster-neon-pageserver-0 | grep -iE 'remote_storage|remote storage|S3' | head
kubectl exec -n default neon-cluster-neon-pageserver-0 -- grep -A2 remote_storage /opt/neondatabase-neon/.neon/pageserver.toml 2>/dev/null || echo "(config via -c flag, not file)"
```
Expected: a startup log line indicating remote storage configured (e.g. "Starting remote storage" / S3 init). If the pageserver is in CrashLoop, the `-c "remote_storage=…"` TOML syntax is wrong — read the crash log, fix Task 2 Step 2's flag, and re-patch + restart the pod.

- [ ] **Step 2: Create a fresh tenant + timeline and write real data**

Run:
```bash
TENANT=$(kubectl exec -n default neon-cluster-neon-pageserver-0 -- curl -s -X POST http://localhost:9898/v1/tenant/ -H 'Content-Type: application/json' -d '{}' | tr -d '"')
echo "tenant=$TENANT"
# compute auto-attaches its own tenant/timeline; write through the compute service:
kubectl exec -n default neon-cluster-neon-compute-0 -- psql -h 127.0.0.1 -p 55432 -U cloud_admin -d postgres -c "CREATE TABLE IF NOT EXISTS migration_probe(id int); INSERT INTO migration_probe SELECT generate_series(1,10000); CHECKPOINT;"
```
Expected: `INSERT 0 10000`, `CHECKPOINT`. (If the compute's tenant id differs from `$TENANT`, use the compute's actual tenant — read it from the running compute spec: `kubectl exec -n default neon-cluster-neon-compute-0 -- cat /data/spec.json | grep -E 'tenant_id|timeline_id'`.)

- [ ] **Step 3: Confirm remote_consistent_lsn ADVANCES past 0/0**

Run (poll for up to ~60s; offload happens on checkpoint/compaction):
```bash
CT=$(kubectl exec -n default neon-cluster-neon-compute-0 -- cat /data/spec.json | grep -oE '"tenant_id"[^,]*' | grep -oE '[a-f0-9]{32}' | head -1)
for i in $(seq 1 12); do
  kubectl exec -n default neon-cluster-neon-pageserver-0 -- curl -s "http://localhost:9898/v1/tenant/$CT/timeline" | tr ',' '\n' | grep -E 'remote_consistent_lsn'
  sleep 5
done
```
Expected: `remote_consistent_lsn` becomes **non-zero** (e.g. `0/XXXXXXX`). THIS is proof the S3 offload is fixed — the thing that was broken for all 30 prior tenants.

- [ ] **Step 4: Confirm objects landed in Garage**

Run (via any pod with the Garage S3 creds, or the garage CLI in ns monitoring):
```bash
kubectl exec -n monitoring statefulset/garage -- /garage bucket info neon-storage 2>/dev/null | grep -iE 'objects|size' || echo "check garage bucket manually"
```
Expected: object count / size > 0 under the `pageserver/` prefix. (Pre-migration this was empty of real layer data.)

---

### Task 7: Govern the rebuild + harden (commit, rotate creds)

**Files:** Modify: `k8s/databases/neon-cluster.yaml` (already created); follow-ups noted below.

- [ ] **Step 1: Commit the now-governed manifest**

Run:
```bash
cd /home/maxjeffwell/GitHub_Projects/portfolio-orchestration-platform
git checkout -b neon-cluster-move-debian-marmoset
git add k8s/databases/neon-cluster.yaml docs/superpowers/plans/2026-06-03-neon-cluster-move-to-debian-marmoset.md
git commit -m "neon-cluster: move to debian-marmoset/Mayastor, fix S3 offload, bring under git"
```
(Per user memory: NO Claude attribution trailer.)

- [ ] **Step 2: Follow-ups (record, do not necessarily execute now)**

  - **ROTATE** the Garage S3 key `GKcac2218863e046a6597262ae` (leaked to live CR + transcripts). Update the `neon-cluster-s3-creds` Secret after rotation.
  - **Durable scripts-template fix:** the Task 2 patch to `neon-scripts-template` is a live edit that drifts from the Helm release `neon`. Mirror the `remote_storage` flag into the chart values / vendored chart so a Helm upgrade doesn't silently re-break offload.
  - **Optional HA:** if the PoC graduates, switch volumes to `mayastor-2` (repl:2) so a node loss doesn't lose the cache — requires 15 GiB free on `marmoset-pool` too.

---

## Rollback

If anything fails before Task 4 (delete): nothing destructive has happened — revert Task 3 (`terminationPolicy` back to `DoNotTerminate`) and Task 2 (restore `neon-scripts-template` from `/tmp/neon-scripts-template.rollback.yaml`).

After Task 4 (delete): the old data is gone by design (user-approved discard). Roll "forward" by completing Task 5. The rollback YAML in `/tmp` recreates the OLD (vmi3115606/LVM) cluster shape if you must abort the move — but it would come up empty (no data) and with the same broken S3, so prefer fixing forward.

---

## Self-Review

- **Spec coverage:** move off vmi3115606 ✓ (Task 4–5 + nodeSelector), debian-marmoset target ✓ (Task 5 schedulingPolicy), Mayastor ✓ (mayastor-1 SC), respawn/recreate-fresh ✓ (discard via WipeOut, recreate), S3 offload fix ✓ (Task 2 + verified Task 6).
- **Placeholder scan:** all commands concrete; the only runtime-resolved value is the compute's actual `tenant_id` (Task 6 Step 3, derived live via `/data/spec.json`) — unavoidable since the compute auto-creates it at boot.
- **Consistency:** Secret name `neon-cluster-s3-creds` used identically in Task 5 Step 1/2; component names match the captured CR; `replicas:1` guard called out against the known `replicas:0` wedge.
