#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
cd "$repo_root"

docker compose -f infra/docker-compose.yml config --quiet

for script in infra/aws/*.sh; do
  bash -n "$script"
done

if git ls-files --error-unmatch infra/aws/deploy.env >/dev/null 2>&1; then
  echo "infra/aws/deploy.env must not be tracked" >&2
  exit 1
fi
