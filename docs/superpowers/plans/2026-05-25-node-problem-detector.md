# Node Problem Detector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy upstream Node Problem Detector as an ArgoCD-managed DaemonSet on debian-marmoset, vmi2951245, and vmi3115606 (not marmoset), with custom rules tuned to recurring homelab failure patterns, scraped by Prometheus, with eight alerts wired to Alertmanager.

**Architecture:** Multi-source ArgoCD Application (deliveryhero helm chart + values from `devops-portfolio-manager` repo via `ref: values`, mirroring `gpu-operator.yaml`). Custom rules + ServiceMonitor + PrometheusRule shipped as a co-located cluster-resources directory.

**Tech Stack:** ArgoCD 2.x, Helm chart `deliveryhero/node-problem-detector`, K3s, kube-prometheus-stack (already running), kubeconform + promtool + jq for validation.

**Reference spec:** `portfolio-orchestration-platform/docs/superpowers/specs/2026-05-25-node-problem-detector-design.md`

**Target repo:** `~/GitHub_Projects/devops-portfolio-manager/` (ALL implementation work happens here)

---

## Task 1: Branch + chart version pinning + values discovery

**Files:** none yet (exploration only)

- [ ] **Step 1: Create feature branch in devops-portfolio-manager**

```bash
cd ~/GitHub_Projects/devops-portfolio-manager
git checkout main && git pull
git checkout -b feat/node-problem-detector
```

- [ ] **Step 2: Add helm repo and pick a chart version**

```bash
helm repo add deliveryhero https://charts.deliveryhero.io/
helm repo update
helm search repo deliveryhero/node-problem-detector --versions | head -5
```

Expected: list of versions. Pick the latest stable (likely `2.3.x` range). Record the exact version chosen — you will use it verbatim in Task 8.

- [ ] **Step 3: Dump default values to a scratch file for reference**

```bash
helm show values deliveryhero/node-problem-detector --version <VERSION> > /tmp/npd-default-values.yaml
wc -l /tmp/npd-default-values.yaml
grep -nE "^(image|resources|tolerations|affinity|nodeSelector|extraVolumes|extraVolumeMounts|metrics|serviceMonitor|settings|hostNetwork|priorityClass|customMonitor)" /tmp/npd-default-values.yaml | head -30
```

This confirms which keys the override file must set in Task 5.

- [ ] **Step 4: Create destination directories**

```bash
mkdir -p ~/GitHub_Projects/devops-portfolio-manager/k8s/node-problem-detector
mkdir -p ~/GitHub_Projects/devops-portfolio-manager/helm-charts/node-problem-detector
```

- [ ] **Step 5: Verify kubeconform + promtool installed**

```bash
which kubeconform || echo "MISSING: install with 'go install github.com/yannh/kubeconform/cmd/kubeconform@latest'"
which promtool || echo "MISSING: install via prometheus release tarball or 'apt install prometheus'"
which jq
```

All three must be present before continuing. Stop and install any missing tool.

- [ ] **Step 6: No commit yet** (no files created)

---

## Task 2: Namespace manifest

**Files:**
- Create: `~/GitHub_Projects/devops-portfolio-manager/k8s/node-problem-detector/namespace.yaml`

- [ ] **Step 1: Write namespace.yaml**

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: node-problem-detector
  labels:
    name: node-problem-detector
    app.kubernetes.io/managed-by: argocd
    infrastructure: "true"
```

- [ ] **Step 2: Validate with kubeconform**

```bash
kubeconform -strict -summary k8s/node-problem-detector/namespace.yaml
```

Expected: `Summary: 1 resource found ... 1 valid`

- [ ] **Step 3: Commit**

```bash
git add k8s/node-problem-detector/namespace.yaml
git commit -m "feat(npd): add node-problem-detector namespace"
```

---

## Task 3: Capture real journald samples for regex tuning

**Files:**
- Create (scratch, not committed): `/tmp/npd-journal-samples.txt`

**Why:** The spec's regex strings are sketches. Custom rules must match actual journald output, not guesses. This task collects real samples so Task 4's regexes are evidence-based.

- [ ] **Step 1: Pull recent journald excerpts for each pattern from one node**

```bash
ssh debian-marmoset 'sudo journalctl -b -k --no-pager | grep -iE "(iscsi|multipath|tailscaled|io-engine|device-mapper.*thin)" | tail -200' > /tmp/npd-journal-samples.txt
wc -l /tmp/npd-journal-samples.txt
```

- [ ] **Step 2: Eyeball each pattern category**

```bash
grep -i iscsi /tmp/npd-journal-samples.txt | head -5
grep -i multipath /tmp/npd-journal-samples.txt | head -5
grep -i tailscaled /tmp/npd-journal-samples.txt | head -5
grep -i io-engine /tmp/npd-journal-samples.txt | head -5
grep -iE "device-mapper.*thin" /tmp/npd-journal-samples.txt | head -5
```

Some categories may have zero hits (good — means no recent incidents). Record the *exact* message format you see; the regexes in Task 4 should match what's actually in journald, not what the spec sketched.

- [ ] **Step 3: No commit (this is exploration, output stays in /tmp)**

---

## Task 4: Custom rules ConfigMap

**Files:**
- Create: `~/GitHub_Projects/devops-portfolio-manager/k8s/node-problem-detector/custom-rules-configmap.yaml`

- [ ] **Step 1: Write the ConfigMap**

Adjust the regex patterns based on the samples captured in Task 3. The patterns below are starting points based on common journald formats.

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: npd-custom-rules
  namespace: node-problem-detector
  labels:
    app.kubernetes.io/name: node-problem-detector
    app.kubernetes.io/component: rules
data:
  homelab-monitor.json: |
    {
      "plugin": "kmsg",
      "logPath": "/dev/kmsg",
      "lookback": "5m",
      "bufferSize": 10,
      "source": "homelab-monitor",
      "metricsReporting": true,
      "conditions": [
        {
          "type": "ThinPoolOutOfSpace",
          "reason": "ThinPoolHealthy",
          "message": "Thin pool has data space available"
        }
      ],
      "rules": [
        {
          "type": "temporary",
          "reason": "IscsiSessionDrop",
          "pattern": "(connection|session)\\d+:\\d+:.*(ping timeout|detected conn error|session recovery timed out|Connection.*failed)"
        },
        {
          "type": "temporary",
          "reason": "MultipathPathDown",
          "pattern": "multipathd.*: .*: path (down|failed|removed|reinstated)"
        },
        {
          "type": "temporary",
          "reason": "MayastorIoEngineCrash",
          "pattern": "io-engine.*: (panicked|FATAL|aborting|thread '.*' panicked)"
        },
        {
          "type": "permanent",
          "condition": "ThinPoolOutOfSpace",
          "reason": "ThinPoolOutOfSpace",
          "pattern": "device-mapper: thin: .*out of data space"
        }
      ]
    }
  systemd-monitor.json: |
    {
      "plugin": "journald",
      "pluginConfig": {
        "source": "systemd"
      },
      "logPath": "/var/log/journal",
      "lookback": "5m",
      "bufferSize": 10,
      "source": "systemd-monitor",
      "metricsReporting": true,
      "conditions": [],
      "rules": [
        {
          "type": "temporary",
          "reason": "TailscaledRestart",
          "pattern": "tailscaled\\.service: (Main process exited|Failed with result|entered failed state)"
        }
      ]
    }
```

- [ ] **Step 2: Validate JSON syntax of every embedded JSON document**

```bash
python3 -c "
import yaml, json, sys
with open('k8s/node-problem-detector/custom-rules-configmap.yaml') as f:
    cm = yaml.safe_load(f)
for k, v in cm['data'].items():
    try:
        json.loads(v)
        print(f'{k}: OK')
    except json.JSONDecodeError as e:
        print(f'{k}: BROKEN - {e}')
        sys.exit(1)
"
```

Expected: every key prints `OK`. Any `BROKEN` line stops the task.

- [ ] **Step 3: Validate regexes against the captured journald samples**

```bash
python3 << 'EOF'
import yaml, json, re
with open('k8s/node-problem-detector/custom-rules-configmap.yaml') as f:
    cm = yaml.safe_load(f)
with open('/tmp/npd-journal-samples.txt') as f:
    samples = f.readlines()
for k, raw in cm['data'].items():
    doc = json.loads(raw)
    for rule in doc.get('rules', []):
        pat = re.compile(rule['pattern'])
        hits = [s for s in samples if pat.search(s)]
        print(f"{rule['reason']}: {len(hits)} sample matches")
        for h in hits[:2]:
            print(f"  > {h.strip()[:120]}")
EOF
```

Expected: each rule shows >= 0 matches (zero is fine for rules whose incident type hasn't recently occurred). Refine patterns and re-run until matches look correct — false positives are worse than no matches.

- [ ] **Step 4: Validate K8s schema**

```bash
kubeconform -strict -summary k8s/node-problem-detector/custom-rules-configmap.yaml
```

Expected: `1 valid`.

- [ ] **Step 5: Commit**

```bash
git add k8s/node-problem-detector/custom-rules-configmap.yaml
git commit -m "feat(npd): add custom SystemLogMonitor rules for homelab failure patterns

Five custom rules tuned to recurring incidents: iSCSI session drops,
multipath path failures, tailscaled restarts (flannel cascade leading
indicator), mayastor io-engine crashes, and LVM thin-pool exhaustion."
```

---

## Task 5: Helm values-override

**Files:**
- Create: `~/GitHub_Projects/devops-portfolio-manager/helm-charts/node-problem-detector/values-override.yaml`

- [ ] **Step 1: Write the override**

Confirm key names against `/tmp/npd-default-values.yaml` from Task 1. The names below match the deliveryhero chart's 2.3.x schema; if your pinned version differs, adjust accordingly.

```yaml
image:
  tag: v0.8.20

# Schedule on every node EXCEPT marmoset (GPU box, deferred per spec)
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
        - matchExpressions:
            - key: kubernetes.io/hostname
              operator: NotIn
              values:
                - marmoset

# No tolerations -> marmoset's nvidia.com/gpu:NoSchedule keeps it out
tolerations: []

resources:
  requests:
    cpu: 20m
    memory: 50Mi
  limits:
    cpu: 200m
    memory: 100Mi

# Mount the custom rules ConfigMap so NPD picks them up
extraVolumes:
  - name: custom-rules
    configMap:
      name: npd-custom-rules

extraVolumeMounts:
  - name: custom-rules
    mountPath: /custom-config
    readOnly: true

# Tell NPD which monitor configs to load (built-in defaults + our two)
settings:
  system_log_monitor:
    - /config/kernel-monitor.json
    - /config/docker-monitor.json
    - /config/systemd-monitor.json
    - /custom-config/homelab-monitor.json
    - /custom-config/systemd-monitor.json
  custom_plugin_monitor: []
  system_stats_monitor:
    - /config/system-stats-monitor.json

# Disable the chart's built-in ServiceMonitor; we ship our own in cluster-resources
metrics:
  enabled: true
serviceMonitor:
  enabled: false

priorityClassName: system-node-critical

hostNetwork: false
```

- [ ] **Step 2: Validate values render with the chart**

```bash
helm template npd deliveryhero/node-problem-detector \
  --version <VERSION_FROM_TASK_1> \
  --namespace node-problem-detector \
  --values helm-charts/node-problem-detector/values-override.yaml \
  > /tmp/npd-rendered.yaml
echo "Exit code: $?"
grep -c "^kind:" /tmp/npd-rendered.yaml
```

Expected: exit 0, at least 3 `kind:` lines (DaemonSet, ServiceAccount, ClusterRole, etc.). If `helm template` errors on an unknown key, that key name is wrong for this chart version — fix using the keys present in `/tmp/npd-default-values.yaml`.

- [ ] **Step 3: Sanity-check the rendered DaemonSet**

```bash
grep -A3 "kind: DaemonSet" /tmp/npd-rendered.yaml | head -10
grep -A2 "extraVolumeMounts\|/custom-config" /tmp/npd-rendered.yaml | head -10
grep -A5 "affinity:" /tmp/npd-rendered.yaml | head -15
```

Expected: affinity stanza shows the `NotIn marmoset` rule, volume mount `/custom-config` is present in the container spec.

- [ ] **Step 4: Validate rendered manifests pass kubeconform**

```bash
kubeconform -strict -summary -ignore-missing-schemas /tmp/npd-rendered.yaml
```

Expected: `0 invalid`.

- [ ] **Step 5: Commit**

```bash
git add helm-charts/node-problem-detector/values-override.yaml
git commit -m "feat(npd): add helm values override for deliveryhero/node-problem-detector

Pins NPD to 3 nodes (excludes marmoset), mounts custom rules ConfigMap,
references both built-in and homelab-tuned monitor configs, disables
chart's built-in ServiceMonitor in favor of cluster-resources one."
```

---

## Task 6: ServiceMonitor

**Files:**
- Create: `~/GitHub_Projects/devops-portfolio-manager/k8s/node-problem-detector/servicemonitor.yaml`

- [ ] **Step 1: Confirm ServiceMonitor CRD selector convention used by your kube-prometheus-stack**

```bash
kubectl get prometheus -A -o jsonpath='{.items[*].spec.serviceMonitorSelector}' | head; echo
kubectl get servicemonitor -n monitoring -o yaml | head -30
```

Look for the `release:` or `app:` label your Prometheus instance selects on. Pick a representative existing ServiceMonitor to crib labels from.

- [ ] **Step 2: Write servicemonitor.yaml**

Replace `<RELEASE_LABEL>` with what you found in Step 1 (commonly `release: prometheus` or `release: kube-prometheus-stack`).

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: node-problem-detector
  namespace: node-problem-detector
  labels:
    app.kubernetes.io/name: node-problem-detector
    release: <RELEASE_LABEL>
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: node-problem-detector
  endpoints:
    - port: metrics
      interval: 30s
      scrapeTimeout: 10s
      path: /metrics
  namespaceSelector:
    matchNames:
      - node-problem-detector
```

- [ ] **Step 3: Validate schema**

```bash
kubeconform -strict -summary -ignore-missing-schemas \
  -schema-location default \
  -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json' \
  k8s/node-problem-detector/servicemonitor.yaml
```

Expected: `1 valid`.

- [ ] **Step 4: Commit**

```bash
git add k8s/node-problem-detector/servicemonitor.yaml
git commit -m "feat(npd): add ServiceMonitor for NPD metrics scrape"
```

---

## Task 7: PrometheusRule with 8 alerts

**Files:**
- Create: `~/GitHub_Projects/devops-portfolio-manager/k8s/node-problem-detector/prometheusrule.yaml`

- [ ] **Step 1: Write the PrometheusRule**

```yaml
apiVersion: monitoring.coreos.com/v1
kind: PrometheusRule
metadata:
  name: node-problem-detector-alerts
  namespace: node-problem-detector
  labels:
    app.kubernetes.io/name: node-problem-detector
    release: <RELEASE_LABEL>
spec:
  groups:
    - name: node-problem-detector.rules
      rules:
        - alert: NodeKernelDeadlock
          expr: problem_gauge{type="KernelDeadlock"} == 1
          for: 0s
          labels:
            severity: critical
          annotations:
            summary: "Kernel deadlock on {{ $labels.node }}"
            description: "NPD reports KernelDeadlock=True on node {{ $labels.node }}. Investigate hung tasks; node may need reboot."

        - alert: NodeReadonlyFilesystem
          expr: problem_gauge{type="ReadonlyFilesystem"} == 1
          for: 0s
          labels:
            severity: critical
          annotations:
            summary: "Filesystem remounted read-only on {{ $labels.node }}"
            description: "Likely EXT4 errors or iSCSI/multipath failure. See [[iscsi-lun5-corruption]] memory for prior pattern."

        - alert: NodeFrequentUnregisterNetDevice
          expr: rate(problem_counter{reason="UnregisterNetDevice"}[15m]) > 0
          for: 5m
          labels:
            severity: warning
          annotations:
            summary: "Frequent netdev unregister on {{ $labels.node }}"
            description: "USB-NIC or virtual-iface churn. Maps to known r8152 deregistration pattern."

        - alert: NodeIscsiSessionDrop
          expr: increase(problem_counter{reason="IscsiSessionDrop"}[10m]) > 2
          for: 0s
          labels:
            severity: warning
          annotations:
            summary: "Repeated iSCSI session drops on {{ $labels.node }}"
            description: "{{ $value }} iSCSI session events in 10m. Check Synology/ASUSTOR portal health."

        - alert: NodeMultipathPathDown
          expr: increase(problem_counter{reason="MultipathPathDown"}[10m]) > 0
          for: 0s
          labels:
            severity: warning
          annotations:
            summary: "Multipath path event on {{ $labels.node }}"
            description: "multipathd reports path down/failed/removed. Verify with `multipath -ll`."

        - alert: NodeTailscaledRestart
          expr: increase(problem_counter{reason="TailscaledRestart"}[30m]) > 1
          for: 0s
          labels:
            severity: warning
          annotations:
            summary: "tailscaled restarted on {{ $labels.node }}"
            description: "Leading indicator for the flannel.1 cascade. Verify flannel.1 still present: `ip link show flannel.1` on this node."

        - alert: NodeMayastorIoEngineCrash
          expr: increase(problem_counter{reason="MayastorIoEngineCrash"}[5m]) > 0
          for: 0s
          labels:
            severity: critical
          annotations:
            summary: "Mayastor io-engine crash on {{ $labels.node }}"
            description: "Storage data-path daemon panicked. Replica health and target failover state must be verified."

        - alert: NodeThinPoolOutOfSpace
          expr: problem_gauge{type="ThinPoolOutOfSpace"} == 1
          for: 0s
          labels:
            severity: critical
          annotations:
            summary: "LVM thin pool out of data space on {{ $labels.node }}"
            description: "Pool entered out-of-data-space mode. Extend immediately or expect cascading I/O errors."
```

- [ ] **Step 2: Replace `<RELEASE_LABEL>` placeholder with the value confirmed in Task 6**

```bash
sed -i 's/<RELEASE_LABEL>/<actual-release-value>/g' k8s/node-problem-detector/prometheusrule.yaml
grep -c "release:" k8s/node-problem-detector/prometheusrule.yaml
```

Expected: 1 (single occurrence in metadata).

- [ ] **Step 3: Extract rule bodies and validate with promtool**

```bash
python3 -c "
import yaml
with open('k8s/node-problem-detector/prometheusrule.yaml') as f:
    pr = yaml.safe_load(f)
print(yaml.dump({'groups': pr['spec']['groups']}))
" > /tmp/npd-rules-only.yaml
promtool check rules /tmp/npd-rules-only.yaml
```

Expected: `SUCCESS: 8 rules found`.

- [ ] **Step 4: Validate K8s schema**

```bash
kubeconform -strict -summary -ignore-missing-schemas \
  -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json' \
  k8s/node-problem-detector/prometheusrule.yaml
```

Expected: `1 valid`.

- [ ] **Step 5: Commit**

```bash
git add k8s/node-problem-detector/prometheusrule.yaml
git commit -m "feat(npd): add PrometheusRule with 8 alerts for NPD-reported conditions"
```

---

## Task 8: ArgoCD Application CR

**Files:**
- Create: `~/GitHub_Projects/devops-portfolio-manager/gitops/applications/node-problem-detector.yaml`

- [ ] **Step 1: Write the Application** (mirrors gpu-operator.yaml multi-source pattern + adds a second sync for k8s/node-problem-detector raw manifests)

The cleanest approach uses TWO Applications: one for the chart, one for the cluster-resources directory. This matches existing precedent (`network-policies.yaml` is a plain single-source app pointing at `k8s/network-policies`). Use this pattern.

```yaml
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: node-problem-detector
  namespace: argocd
  labels:
    app: node-problem-detector
    infrastructure: "true"
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  sources:
    - repoURL: https://charts.deliveryhero.io/
      chart: node-problem-detector
      targetRevision: <VERSION_FROM_TASK_1>
      helm:
        valueFiles:
          - $values/helm-charts/node-problem-detector/values-override.yaml
    - repoURL: https://github.com/maxjeffwell/devops-portfolio-manager.git
      targetRevision: main
      ref: values
  destination:
    server: https://kubernetes.default.svc
    namespace: node-problem-detector
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
      allowEmpty: false
    syncOptions:
      - CreateNamespace=false
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
---
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: node-problem-detector-resources
  namespace: argocd
  labels:
    app: node-problem-detector
    infrastructure: "true"
spec:
  project: default
  source:
    repoURL: https://github.com/maxjeffwell/devops-portfolio-manager.git
    targetRevision: main
    path: k8s/node-problem-detector
  destination:
    server: https://kubernetes.default.svc
    namespace: node-problem-detector
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
      allowEmpty: false
    syncOptions:
      - CreateNamespace=false
    retry:
      limit: 5
      backoff:
        duration: 5s
        factor: 2
        maxDuration: 3m
```

- [ ] **Step 2: Replace `<VERSION_FROM_TASK_1>` with the actual chart version**

```bash
grep targetRevision gitops/applications/node-problem-detector.yaml
# verify the chart version line shows a real semver, not the placeholder
```

- [ ] **Step 3: Validate Application schema**

```bash
kubeconform -strict -summary -ignore-missing-schemas \
  -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/main/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json' \
  gitops/applications/node-problem-detector.yaml
```

Expected: `2 valid` (two Application documents).

- [ ] **Step 4: Commit**

```bash
git add gitops/applications/node-problem-detector.yaml
git commit -m "feat(npd): add ArgoCD Application CRs (chart + cluster-resources)"
```

---

## Task 9: Push branch and merge

**Files:** none

- [ ] **Step 1: Push branch**

```bash
cd ~/GitHub_Projects/devops-portfolio-manager
git push -u origin feat/node-problem-detector
```

- [ ] **Step 2: Open PR (or fast-forward to main if that matches existing convention)**

Inspect recent commits on `main` to determine convention:

```bash
git log main --oneline -10
```

If recent commits are PR merges → open a PR via `gh pr create`. If direct-to-main pattern → fast-forward and push.

Stop and ask the user which path before destructive action.

- [ ] **Step 3: Confirm ArgoCD discovers both Applications**

```bash
sleep 30  # let ArgoCD poll the repo
kubectl get applications -n argocd | grep node-problem-detector
```

Expected: two rows: `node-problem-detector` and `node-problem-detector-resources`. Sync status may be `OutOfSync` initially.

- [ ] **Step 4: Trigger first sync (manual to be safe; auto-sync will catch subsequent changes)**

```bash
argocd app sync node-problem-detector
argocd app sync node-problem-detector-resources
```

Both should reach `Synced` / `Healthy`. If `OutOfSync` persists, run `argocd app get <name>` to see which resource is failing.

---

## Task 10: Validate pods running on 3 nodes

**Files:** none (cluster validation)

- [ ] **Step 1: Confirm DaemonSet placed pods on exactly 3 nodes (not marmoset)**

```bash
kubectl get pods -n node-problem-detector -o wide
```

Expected: 3 pods, all `Running`, on `debian-marmoset`, `vmi2951245`, `vmi3115606`. **No pod on `marmoset`.**

- [ ] **Step 2: Inspect a pod's logs for monitor-config load**

```bash
POD=$(kubectl get pod -n node-problem-detector -o jsonpath='{.items[0].metadata.name}')
kubectl logs -n node-problem-detector $POD | grep -iE "(monitor|config|loaded|error)" | head -20
```

Expected: log lines showing each monitor JSON file loaded successfully. No `ERROR` or `failed to parse` lines.

---

## Task 11: Validate NodeConditions appear

**Files:** none

- [ ] **Step 1: List conditions on each node**

```bash
for n in debian-marmoset vmi2951245 vmi3115606; do
  echo "=== $n ==="
  kubectl get node $n -o jsonpath='{range .status.conditions[*]}{.type}{"\t"}{.status}{"\n"}{end}'
done
```

Expected: in addition to default kubelet conditions (`Ready`, `MemoryPressure`, `DiskPressure`, `PIDPressure`), each node now shows NPD-added conditions including `KernelDeadlock`, `ReadonlyFilesystem`, `ThinPoolOutOfSpace`, all with status `False` (problems absent).

- [ ] **Step 2: Confirm marmoset has NONE of those conditions**

```bash
kubectl get node marmoset -o jsonpath='{range .status.conditions[*]}{.type}{"\n"}{end}' | sort
```

Expected: only the 4 kubelet defaults. Any NPD-added condition here = pod scheduled where it shouldn't be; revisit the affinity in Task 5.

---

## Task 12: Validate metrics scrape + alerts loaded

**Files:** none

- [ ] **Step 1: Scrape metrics directly from one pod**

```bash
POD=$(kubectl get pod -n node-problem-detector -o jsonpath='{.items[0].metadata.name}')
kubectl port-forward -n node-problem-detector $POD 20257:20257 &
PF=$!
sleep 2
curl -s localhost:20257/metrics | grep -E "^problem_(counter|gauge)" | head -20
kill $PF
```

Expected: rows like `problem_gauge{reason="...",type="KernelDeadlock"} 0`, `problem_counter{reason="UnregisterNetDevice",...} 0`. Custom rules (`IscsiSessionDrop`, etc.) should appear after first match — for unmatched rules, the counter starts at 0 once Prometheus scrapes.

- [ ] **Step 2: Confirm Prometheus target is Up**

Open the Prometheus UI (Targets page) via your usual ingress. Locate target `serviceMonitor/node-problem-detector/node-problem-detector` — expect 3 targets, all `UP`.

Or from CLI if you have a service account:

```bash
kubectl exec -n monitoring deploy/prometheus-operated -- wget -qO- localhost:9090/api/v1/targets | jq '.data.activeTargets[] | select(.labels.job=="node-problem-detector") | {node:.labels.node, health}'
```

- [ ] **Step 3: Confirm alert rules loaded in Prometheus**

In the Prometheus UI → Alerts page, search for `Node` — expect all 8 alerts present and `Inactive`.

```bash
kubectl exec -n monitoring deploy/prometheus-operated -- wget -qO- localhost:9090/api/v1/rules | jq '.data.groups[] | select(.name=="node-problem-detector.rules") | .rules[] | .name' | head
```

Expected: 8 alert names listed.

- [ ] **Step 4: Spot-check that one alert evaluates without error**

```bash
kubectl exec -n monitoring deploy/prometheus-operated -- wget -qO- 'localhost:9090/api/v1/query?query=problem_gauge{type=%22KernelDeadlock%22}' | jq .status
```

Expected: `"success"`.

- [ ] **Step 5: Final summary commit** (only if you made any post-deploy fixes in earlier files)

If everything passed first-shot, no further commit. If you tuned regex/labels during validation, commit those follow-ups now with a clear message.

---

## Task 13: Update memory + spec status

**Files:**
- Modify: `~/.claude/projects/-home-maxjeffwell/memory/MEMORY.md` (add one-line entry)
- Create: `~/.claude/projects/-home-maxjeffwell/memory/project_npd_deployed_2026_05_25.md` (project memory)
- Modify: `portfolio-orchestration-platform/docs/superpowers/specs/2026-05-25-node-problem-detector-design.md` (status: Approved → Implemented)

- [ ] **Step 1: Write project memory**

```markdown
---
name: npd-deployed-2026-05-25
description: Node Problem Detector deployed via ArgoCD on 3 nodes; chart + cluster-resources split across two Applications
metadata:
  type: project
---

Node Problem Detector live as of 2026-05-25. Two ArgoCD Applications:
`node-problem-detector` (deliveryhero helm chart vX.Y.Z) and
`node-problem-detector-resources` (k8s/node-problem-detector/ raw manifests).

**Why:** Detect node-level issues kubelet doesn't surface — iSCSI drops,
multipath failures, tailscaled flaps (flannel cascade leading indicator),
mayastor crashes, thin-pool exhaustion. Pairs with [[flannel-watchdog-2026-05-25]]
which acts; NPD reports.

**How to apply:** When investigating node-level incidents, check
`kubectl get node <name> -o jsonpath='{.status.conditions[*]}'` for
NPD-added conditions. Alerts route via Alertmanager. Marmoset NOT
covered (GPU-tainted; revisit after pilot stable).
```

- [ ] **Step 2: Add MEMORY.md index entry**

Append one line under appropriate section:

```
- [NPD deployed (2026-05-25)](project_npd_deployed_2026_05_25.md) — Two ArgoCD apps; NPD on 3 nodes (not marmoset); pairs with [[flannel-watchdog-2026-05-25]] for detect+act split.
```

- [ ] **Step 3: Flip spec status**

```bash
sed -i 's/^\*\*Status:\*\* Approved (pending implementation plan)/**Status:** Implemented 2026-05-25/' \
  ~/GitHub_Projects/portfolio-orchestration-platform/docs/superpowers/specs/2026-05-25-node-problem-detector-design.md
```

- [ ] **Step 4: Commit spec update in orchestration repo**

```bash
cd ~/GitHub_Projects/portfolio-orchestration-platform
git add docs/superpowers/specs/2026-05-25-node-problem-detector-design.md
git commit -m "docs(npd): mark spec implemented 2026-05-25"
```

---

## Out of Scope (do not implement)

- Marmoset NPD coverage
- Auto-remediation (Draino integration)
- Grafana dashboard import
- CustomPluginMonitor scripts
- Migration of host-systemd `flannel-watchdog` to NPD

## Rollback

If NPD causes problems:

```bash
argocd app delete node-problem-detector --cascade
argocd app delete node-problem-detector-resources --cascade
kubectl delete namespace node-problem-detector
```

Then revert the merge commit in `devops-portfolio-manager` so ArgoCD doesn't recreate.
