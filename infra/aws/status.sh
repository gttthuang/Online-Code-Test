#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

for stack in \
  "${APP_NAME}-${STAGE}-foundation" \
  "${APP_NAME}-${STAGE}-data" \
  "${APP_NAME}-${STAGE}-edge" \
  "${APP_NAME}-${STAGE}-worker"; do
  echo "--- ${stack} ---"
  aws cloudformation describe-stacks \
    --stack-name "${stack}" \
    --query "Stacks[0].{Status:StackStatus,Updated:LastUpdatedTime,Outputs:Outputs}" \
    --output json \
    --region "${AWS_REGION}" || true
done

echo "--- Elastic Beanstalk ---"
aws elasticbeanstalk describe-environments \
  --application-name "${APP_NAME}-${STAGE}-api" \
  --query "Environments[].{Name:EnvironmentName,Status:Status,Health:Health,CNAME:CNAME}" \
  --output table \
  --region "${AWS_REGION}" || true

echo "--- CloudWatch alarms ---"
aws cloudwatch describe-alarms \
  --alarm-name-prefix "${APP_NAME}-${STAGE}-" \
  --query "MetricAlarms[].{Name:AlarmName,State:StateValue,Reason:StateReason}" \
  --output table \
  --region "${AWS_REGION}" || true

echo "--- CloudWatch log groups ---"
aws logs describe-log-groups \
  --log-group-name-prefix "/${APP_NAME}/${STAGE}" \
  --query "logGroups[].{Name:logGroupName,RetentionDays:retentionInDays}" \
  --output table \
  --region "${AWS_REGION}" || true
