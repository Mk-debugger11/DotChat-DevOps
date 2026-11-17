#!/usr/bin/env bash
# One-time (idempotent) cluster setup. Run ON the k3s server from the repo root:
#   bash scripts/bootstrap-cluster.sh
# Installs: cert-manager + Let's Encrypt issuer, kube-prometheus-stack (Prometheus + Grafana),
# DotChat namespace, Grafana dashboard. App secrets are created separately (see k8s/secret.example.yaml).
set -euo pipefail
export KUBECONFIG=${KUBECONFIG:-$HOME/.kube/config}

echo "==> Helm repositories"
helm repo add jetstack https://charts.jetstack.io --force-update >/dev/null
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts --force-update >/dev/null
helm repo update >/dev/null

echo "==> cert-manager (automatic TLS certificates)"
helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --version v1.16.2 --set crds.enabled=true --wait --timeout 5m
kubectl apply -f k8s/cluster/cluster-issuer.yaml

echo "==> Namespaces"
kubectl apply -f k8s/namespace.yaml
kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -

echo "==> Grafana admin credentials (generated once, stored only in the cluster)"
if ! kubectl -n monitoring get secret grafana-admin >/dev/null 2>&1; then
  kubectl -n monitoring create secret generic grafana-admin \
    --from-literal=admin-user=admin \
    --from-literal=admin-password="$(openssl rand -base64 18 | tr -d '/+=')"
fi

echo "==> kube-prometheus-stack (Prometheus, Grafana, kube-state-metrics, node-exporter)"
helm upgrade --install monitoring prometheus-community/kube-prometheus-stack \
  --namespace monitoring -f monitoring/values-kube-prometheus-stack.yaml --wait --timeout 10m

echo "==> DotChat dashboard + ServiceMonitor + alert rules"
kubectl -n monitoring create configmap dotchat-dashboard \
  --from-file=dotchat.json=monitoring/grafana-dashboard.json \
  --dry-run=client -o yaml | kubectl label --local -f - grafana_dashboard=1 -o yaml | kubectl apply -f -
kubectl apply -f monitoring/servicemonitor.yaml

echo "==> Done. Grafana password:"
kubectl -n monitoring get secret grafana-admin -o jsonpath='{.data.admin-password}' | base64 -d; echo
