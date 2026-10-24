# k8s/ — what is applied how (2026-09-30 audit)

| Directory | Applied by | Notes |
|---|---|---|
| `deployments/`, `ingress/`, `services/` | ArgoCD app `portfolio-orchestration-platform` | the only auto-synced dirs |
| `databases/` | **by hand**, one file at a time, `kubectl diff -f` first | self-hosted Neon (KubeBlocks) only |
| `configmaps/coredns-custom.yaml` | by hand | the k3s CoreDNS *custom* hook. Never write to the `coredns` ConfigMap itself: k3s rewrites it on every supervisor restart |
| *(no file)* `kube-system/coredns` Deployment | **live `kubectl` on the k3s-owned object** | k3s's bundled manifest carries no `replicas`, `affinity` or `maxSurge`, so values set live survive the supervisor's re-apply (replicas=3 has since 2026-05-25). Current live settings, re-apply if ever lost: `kubectl -n kube-system scale deploy coredns --replicas=3`; **required** nodeAffinity `node-role.kubernetes.io/control-plane In [true]` so replicas run only on the three home servers, never the VPS or the GPU nodes (preferred weight 100 since 2026-10-14, made required 2026-10-24 after every server drain that day parked a replica on the VPS): `kubectl -n kube-system patch deploy coredns --type=json -p='[{"op":"replace","path":"/spec/template/spec/affinity","value":{"nodeAffinity":{"requiredDuringSchedulingIgnoredDuringExecution":{"nodeSelectorTerms":[{"matchExpressions":[{"key":"node-role.kubernetes.io/control-plane","operator":"In","values":["true"]}]}]}}}}]'`; `strategy.rollingUpdate.maxSurge=0` so a rollout frees a server before placing the new pod — with the default surge the hard per-host spread has nowhere to put the surge pod. Consequence: while a server is drained, one replica stays Pending and DNS runs on 2 replicas (node-local-dns caches on every node) until the server returns |
| `kafka/`, `monitoring/`, `priority-classes.yaml`, `resource-quotas.yaml` | by hand | zero drift vs live as of 2026-09-30 |
| `secrets/` | **not applied** | gitignored local files only; live Secrets come from ExternalSecrets (devops repo, Doppler) |
| `scripts/` | host setup scripts | not Kubernetes objects |

Removed 2026-09-30 as stale twins of objects owned elsewhere: `databases/redis.yaml` and the
three `databases/cnpg-*.yaml` (devops `k8s/redis`, `k8s/cnpg-clusters`), `backups/*`
(devops `k8s/backups`), `gpu-operator/device-plugin-config.yaml` (ArgoCD `gpu-operator`),
`monitoring/monitoring-ingress.yaml` (devops monitoring chart), `monitoring/dcgm-servicemonitor.yaml`
and `middleware/*` (not in the cluster, unreferenced), `configmaps/coredns-config.yaml` (k3s-managed).
