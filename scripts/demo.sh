#!/usr/bin/env bash
# Live DevOps demo helpers. Run ON the k3s server (ssh ubuntu@<ip>), from the repo root.
#   bash scripts/demo.sh status      # what's running
#   bash scripts/demo.sh selfheal    # kill a pod, watch Kubernetes replace it
#   bash scripts/demo.sh load        # generate CPU load -> watch HPA scale backend 2 -> 5
#   bash scripts/demo.sh stopload    # stop load -> HPA scales back down
#   bash scripts/demo.sh rollback    # roll back the backend to the previous version
#   bash scripts/demo.sh history     # rollout history (one revision per CD deploy)
set -euo pipefail
NS=dotchat
k() { kubectl -n "$NS" "$@"; }

case "${1:-status}" in
  status)
    k get deploy,pods,svc,ingress,hpa -o wide ;;
  selfheal)
    POD=$(k get pods -l app=backend -o jsonpath='{.items[0].metadata.name}')
    echo ">> Deleting $POD — the Deployment controller will recreate it"
    k delete pod "$POD" --wait=false
    k get pods -l app=backend -w ;;
  load)
    echo ">> Starting 6 load generators against the backend Service"
    k create deployment loadgen --image=busybox:1.36 --replicas=6 -- \
      /bin/sh -c 'while true; do wget -q -O /dev/null http://backend:8080/ ; done' 2>/dev/null || \
      k scale deployment loadgen --replicas=6
    echo ">> Watching HPA (Ctrl+C to exit; run 'stopload' afterwards)"
    k get hpa backend -w ;;
  stopload)
    k delete deployment loadgen --ignore-not-found
    k get hpa ;;
  rollback)
    k rollout undo deployment/backend
    k rollout status deployment/backend ;;
  history)
    k rollout history deployment/backend ;;
  *)
    echo "usage: $0 {status|selfheal|load|stopload|rollback|history}"; exit 1 ;;
esac
