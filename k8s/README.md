# k8s/ — what is applied how (2026-09-30 audit)

| Directory | Applied by | Notes |
|---|---|---|
| `deployments/`, `ingress/`, `services/` | ArgoCD app `portfolio-orchestration-platform` | the only auto-synced dirs |
| `databases/` | **by hand**, one file at a time, `kubectl diff -f` first | self-hosted Neon (KubeBlocks) only |
| `configmaps/coredns-custom.yaml` | by hand | the k3s CoreDNS *custom* hook. Never write to the `coredns` ConfigMap itself: k3s rewrites it on every supervisor restart |
| `kafka/`, `monitoring/`, `priority-classes.yaml`, `resource-quotas.yaml` | by hand | zero drift vs live as of 2026-09-30 |
| `secrets/` | **not applied** | gitignored local files only; live Secrets come from ExternalSecrets (devops repo, Doppler) |
| `scripts/` | host setup scripts | not Kubernetes objects |

Removed 2026-09-30 as stale twins of objects owned elsewhere: `databases/redis.yaml` and the
three `databases/cnpg-*.yaml` (devops `k8s/redis`, `k8s/cnpg-clusters`), `backups/*`
(devops `k8s/backups`), `gpu-operator/device-plugin-config.yaml` (ArgoCD `gpu-operator`),
`monitoring/monitoring-ingress.yaml` (devops monitoring chart), `monitoring/dcgm-servicemonitor.yaml`
and `middleware/*` (not in the cluster, unreferenced), `configmaps/coredns-config.yaml` (k3s-managed).
