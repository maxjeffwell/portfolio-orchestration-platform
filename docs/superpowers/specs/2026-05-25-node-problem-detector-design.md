# Node Problem Detector — Design Spec

**Date:** 2026-05-25
**Status:** Approved (pending implementation plan)
**Scope:** Single ArgoCD Application deploying upstream Node Problem Detector (NPD) DaemonSet across 3 of 4 K3s nodes, with custom rules tuned to recurring homelab failure patterns, ServiceMonitor scraping, and Alertmanager-routed alerts.

## Goal

Detect node-level health issues that the kubelet does not surface — kernel hangs, filesystem corruption, NIC deregistration, iSCSI session drops, tailscaled flaps, mayastor io-engine crashes, thin-pool exhaustion — and report them as Kubernetes NodeConditions / Events with Prometheus metrics and alerts.

NPD only detects; remediation is out of scope for this project.

## Non-Goals

- Marmoset coverage (GPU-tainted; deferred until pilot is stable on the other 3 nodes)
- Remediation automation (no Draino, no custom controllers — future project)
- CustomPluginMonitor scripts (SystemLogMonitor only in v1)
- Replacing the existing host-systemd `flannel-watchdog` (the watchdog acts; NPD reports; they coexist)

## Design Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Deployment shape | ArgoCD-managed DaemonSet | Matches repo's app-of-apps pattern; in-cluster reporting is sufficient when k3s is up |
| 2 | Rule scope | Upstream defaults + 5 homelab-tuned custom rules | Defaults already catch ~4 historical incidents for free; custom rules give leading indicators for cascade failures |
| 3 | Alerting | ServiceMonitor + PrometheusRule shipped together | Prometheus stack already running; no value in delaying alerts |
| 4 | Node coverage | 3 nodes (debian-marmoset, vmi2951245, vmi3115606); skip marmoset | GPU operator already contests containerd config on marmoset; minimize blast radius for pilot |

## Repo Layout

**Correction discovered during plan-writing:** All ArgoCD Applications source from `devops-portfolio-manager`, not `portfolio-orchestration-platform`. The latter holds databases + this spec/plan; the former holds Application CRs + per-app manifests. The `gpu-operator.yaml` Application is the exact precedent for the multi-source helm-chart-plus-values pattern.

```
devops-portfolio-manager/                                # ← NPD lives here
├── gitops/applications/
│   └── node-problem-detector.yaml                       # NEW — Application CR (multi-source)
├── helm-charts/node-problem-detector/
│   └── values-override.yaml                             # NEW — chart values
└── k8s/node-problem-detector/                           # NEW
    ├── namespace.yaml                                   # ns: node-problem-detector
    ├── custom-rules-configmap.yaml                      # SystemLogMonitor JSON
    ├── servicemonitor.yaml                              # scrape :20257/metrics
    └── prometheusrule.yaml                              # 8 alerts

portfolio-orchestration-platform/                        # ← Spec/plan only
└── docs/superpowers/{specs,plans}/                      # this design + implementation plan
```

Helm chart: `deliveryhero/node-problem-detector`, pinned at implementation time. ArgoCD Application uses **multi-source** mirroring `gpu-operator.yaml`:

- Source 1: `https://charts.deliveryhero.io/` helm chart with `valueFiles: [$values/helm-charts/node-problem-detector/values-override.yaml]`
- Source 2: `devops-portfolio-manager` repo with `ref: values` providing the override values

The ConfigMap / ServiceMonitor / PrometheusRule live in `k8s/node-problem-detector/` and sync via a **second** Application (matching the `network-policies` pattern) OR via the same Application's helm `extraObjects`. Plan will choose based on whether the chart's `extraObjects` cleanly accepts ConfigMap-style data.

## Custom Rules (SystemLogMonitor)

Five JSON entries appended to NPD's `kernel-monitor.json` and `docker-monitor.json` equivalents, watching journald:

| Condition / event name | NPD type | Regex (sketch) | Maps to incident memory |
|------------------------|----------|----------------|--------------------------|
| `IscsiSessionDrop` | event | `kernel:.*connection.*iscsi.*: Connection.*to .* failed` | asustor-iscsi-cluster-iqn-only-2026-05-25, rtl8156-unreliable-for-iscsi |
| `MultipathPathDown` | event | `multipathd.*: .*: path (down\|failed\|removed)` | democratic-csi-pilot-2026-05-17, multipathd-smart-2026-05-16 |
| `TailscaledRestart` | counter | `systemd.*: tailscaled.service.*entered (failed\|inactive)` | flannel-dns-eso-cascade-2026-05-25 (leading indicator) |
| `MayastorIoEngineCrash` | event | `io-engine.*: (panicked\|FATAL\|aborting)` | mayastor-2replica-2026-05-25 |
| `ThinPoolOutOfSpace` | permanent | `device-mapper: thin: .*out of data space` | thin-pool-first-diagnostic, debian-marmoset-lvm-config-2026-05-22 |

Upstream defaults retained: `KernelDeadlock`, `ReadonlyFilesystem`, `FrequentUnregisterNetDevice`, `FrequentKubeletRestart`, `FrequentContainerdRestart`, kernel OOM events.

Regex strings above are sketches; final patterns to be validated against actual journald output during implementation.

## Alerts (PrometheusRule)

Eight alerts routed to the existing Alertmanager:

| Alert | Severity | Expression sketch |
|-------|----------|-------------------|
| `NodeKernelDeadlock` | critical | `problem_gauge{type="KernelDeadlock"} == 1` |
| `NodeReadonlyFilesystem` | critical | `problem_gauge{type="ReadonlyFilesystem"} == 1` |
| `NodeFrequentUnregisterNetDevice` | warning | `rate(problem_counter{reason="UnregisterNetDevice"}[15m]) > 0` |
| `NodeIscsiSessionDrop` | warning | `increase(problem_counter{reason="IscsiSessionDrop"}[10m]) > 2` |
| `NodeMultipathPathDown` | warning | `increase(problem_counter{reason="MultipathPathDown"}[10m]) > 0` |
| `NodeTailscaledRestart` | warning | `increase(problem_counter{reason="TailscaledRestart"}[30m]) > 1` |
| `NodeMayastorIoEngineCrash` | critical | `increase(problem_counter{reason="MayastorIoEngineCrash"}[5m]) > 0` |
| `NodeThinPoolOutOfSpace` | critical | `problem_gauge{type="ThinPoolOutOfSpace"} == 1` |

`for:` durations to be tuned during implementation (default: 2m for warning, 0s for critical).

## Scheduling

```yaml
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
      - matchExpressions:
        - key: kubernetes.io/hostname
          operator: NotIn
          values: ["marmoset"]
tolerations: []   # no nvidia.com/gpu toleration → marmoset stays excluded
```

Explicit `NotIn` is more durable than relying on absent tolerations: if marmoset is ever untainted, NPD will not surprise-deploy there.

Per `nodetaintspolicy-honor-requires-all-taints` memory: not using topologySpreadConstraints here (DaemonSet semantics make it moot, and Honor + missing PreferNoSchedule tolerations has bitten this user before).

## Resource Footprint

Per pod (per node, × 3):
- CPU request: 20m, limit: 200m
- Memory request: 50Mi, limit: 100Mi
- Mounts: `/var/log` (RO), `/dev/kmsg` (RO), custom-rules ConfigMap (RO)
- Network: port 20257 (metrics, in-cluster only)

Total cluster footprint: ~150Mi memory, negligible CPU steady-state.

## Rollout Plan

1. Branch `feat/node-problem-detector` in **`devops-portfolio-manager`** (where the files actually go)
2. Create the 4 manifest files + the values-override + the Application CR
3. Commit (no Claude attribution per user preference)
4. Push → ArgoCD auto-sync OR manual sync first for safety
5. Validate:
   - `kubectl get pods -n node-problem-detector` → 3 Running
   - `kubectl get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.status.conditions[*].type}{"\n"}{end}'` → new condition types appear on 3 nodes
   - `kubectl port-forward -n node-problem-detector <pod> 20257 && curl -s localhost:20257/metrics | grep ^problem_` → metric series present
   - Prometheus UI → ServiceMonitor target Up; PrometheusRule rules Active

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Custom rule regex misses real events | Validate against actual journald excerpts during implementation; iterate per-rule |
| Alert noise on chronic known issues (e.g. r8152 dereg on .149 is a NAS problem, not a K8s node) | Rules scoped to K8s-node journald only; .149 is a separate device, won't fire `FrequentUnregisterNetDevice` on K8s nodes |
| In-cluster NPD pod can't report when k3s is itself sick on that node | Accepted limitation; pairs with existing host-systemd `flannel-watchdog` which acts independently |
| ArgoCD Application drift on chart upgrade | Pin chart version; document upgrade procedure in app README |

## Out of Scope (YAGNI)

- Marmoset coverage
- CustomPluginMonitor scripts
- Auto-remediation
- Grafana dashboard (NPD ships an upstream one; can be imported later as a ConfigMap)
- `FrequentDockerRestart` (cluster runs containerd, not docker)
