#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

require_command curl
require_command node

BASE_URL=${BASE_URL:-}
CANDIDATE_TOKEN=${CANDIDATE_TOKEN:-candidate_alice}
INTERVIEWER_TOKEN=${INTERVIEWER_TOKEN:-interviewer_bob}
SMOKE_CANDIDATE_ID=${SMOKE_CANDIDATE_ID:-candidate_alice}
SMOKE_PROBLEM_ID=${SMOKE_PROBLEM_ID:-problem_reverse_string}
SMOKE_LANGUAGE=${SMOKE_LANGUAGE:-python}
SMOKE_SOURCE_CODE=${SMOKE_SOURCE_CODE:-'print(input()[::-1])'}
SMOKE_STDIN=${SMOKE_STDIN:-abc}
SMOKE_EXPECTED_STDOUT=${SMOKE_EXPECTED_STDOUT:-cba}
export BASE_URL CANDIDATE_TOKEN INTERVIEWER_TOKEN SMOKE_CANDIDATE_ID SMOKE_PROBLEM_ID SMOKE_LANGUAGE SMOKE_SOURCE_CODE SMOKE_STDIN

if [[ -z "${BASE_URL}" ]]; then
  cloudfront_domain=$(stack_output "${APP_NAME}-${STAGE}-edge" CloudFrontDomainName)
  BASE_URL="https://${cloudfront_domain}"
fi

BASE_URL=${BASE_URL%/}

function json_value() {
  local expression=$1
  node -e "const fs=require('node:fs'); const input=fs.readFileSync(0,'utf8'); const data=JSON.parse(input); const value=(${expression})(data); if (value === undefined || value === null) process.exit(1); process.stdout.write(String(value));"
}

log_step "Smoke testing ${BASE_URL}/healthz"
health_json=$(curl -sS --fail --max-time 20 "${BASE_URL}/healthz")
health_status=$(printf '%s' "${health_json}" | json_value "data => data.status")
storage_mode=$(printf '%s' "${health_json}" | json_value "data => data.storageMode")
queue_mode=$(printf '%s' "${health_json}" | json_value "data => data.queueMode")
postgres_status=$(printf '%s' "${health_json}" | json_value "data => data.postgres && data.postgres.status")

if [[ "${health_status}" != "ok" || "${storage_mode}" != "postgres" || "${queue_mode}" != "redis-bullmq" || "${postgres_status}" != "reachable" ]]; then
  echo "Unexpected health response: ${health_json}" >&2
  exit 1
fi

log_step "Smoke testing custom run worker"
run_payload=$(
  node -e '
	    const payload = {
	      candidateId: process.env.SMOKE_CANDIDATE_ID,
	      problemId: process.env.SMOKE_PROBLEM_ID,
	      language: process.env.SMOKE_LANGUAGE,
	      sourceCode: process.env.SMOKE_SOURCE_CODE,
      stdin: process.env.SMOKE_STDIN
    };
    process.stdout.write(JSON.stringify(payload));
  '
)

run_json=$(curl -sS --fail --max-time 20 \
  -X POST "${BASE_URL}/admin/custom-runs" \
  -H "Authorization: Bearer ${INTERVIEWER_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "${run_payload}")

run_id=$(printf '%s' "${run_json}" | json_value "data => data.runId")
echo "Created custom run ${run_id}"

custom_run_passed=false
for attempt in {1..30}; do
  detail_json=$(curl -sS --fail --max-time 20 \
    "${BASE_URL}/admin/custom-runs/${run_id}" \
    -H "Authorization: Bearer ${INTERVIEWER_TOKEN}")
  status=$(printf '%s' "${detail_json}" | json_value "data => data.status")
  echo "Custom run ${run_id} status=${status}"

  if [[ "${status}" == "finished" || "${status}" == "failed" ]]; then
    stdout=$(printf '%s' "${detail_json}" | json_value "data => data.stdout || ''")

    if [[ "${status}" != "finished" || "${stdout}" != *"${SMOKE_EXPECTED_STDOUT}"* ]]; then
      echo "Unexpected custom run response: ${detail_json}" >&2
      exit 1
    fi

    custom_run_passed=true
    break
  fi

  sleep 2
done

if [[ "${custom_run_passed}" != "true" ]]; then
  echo "Custom run ${run_id} did not finish in time" >&2
  exit 1
fi

echo "Smoke test passed"
