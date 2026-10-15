# k8s/ — what is applied how (2026-09-30 audit)

| Directory | Applied by | Notes |
|---|---|---|
| `deployments/`, `ingress/`, `services/` | ArgoCD app `portfolio-orchestration-platform` | the only auto-synced dirs |
| `databases/` | **by hand**, one file at a time, `kubectl diff -f` first | self-hosted Neon (KubeBlocks) only |
| `configmaps/coredns-custom.yaml` | by hand | the k3s CoreDNS *custom* hook. Never write to the `coredns` ConfigMap itself: k3s rewrites it on every supervisor restart |
| *(no file)* `kube-system/coredns` Deployment | **live `kubectl` on the k3s-owned object** | k3s's bundled manifest carries no `replicas`, `affinity` or `maxSurge`, so values set live survive the supervisor's re-apply (replicas=3 has since 2026-05-25). Current live settings, re-apply if ever lost: `kubectl -n kube-system scale deploy coredns --replicas=3`; preferred (weight 100, never required) nodeAffinity `node-role.kubernetes.io/control-plane=true` so replicas land on the three home servers and not the VPS/GPU nodes (2026-10-14); `strategy.rollingUpdate.maxSurge=0` so a rollout frees a server before placing the new pod — with the default surge the hard per-host spread pushed the surge pod onto the VPS. The descheduler never evicts coredns (system-cluster-critical), so after a server drain check `kubectl -n kube-system get pods -l k8s-app=kube-dns -o wide` and delete any off-server replica by hand |
| `kafka/`, `monitoring/`, `priority-classes.yaml`, `resource-quotas.yaml` | by hand | zero drift vs live as of 2026-09-30 |
| `secrets/` | **not applied** | gitignored local files only; live Secrets come from ExternalSecrets (devops repo, Doppler) |
| `scripts/` | host setup scripts | not Kubernetes objects |

Removed 2026-09-30 as stale twins of objects owned elsewhere: `databases/redis.yaml` and the
three `databases/cnpg-*.yaml` (devops `k8s/redis`, `k8s/cnpg-clusters`), `backups/*`
(devops `k8s/backups`), `gpu-operator/device-plugin-config.yaml` (ArgoCD `gpu-operator`),
`monitoring/monitoring-ingress.yaml` (devops monitoring chart), `monitoring/dcgm-servicemonitor.yaml`
and `middleware/*` (not in the cluster, unreferenced), `configmaps/coredns-config.yaml` (k3s-managed).
