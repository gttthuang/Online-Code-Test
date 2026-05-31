#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

require_command aws

ACCOUNT_ID=$(aws_account_id)
VPC_ID=${AWS_VPC_ID:-$(default_vpc_id)}
SUBNET_IDS_CSV=${AWS_SUBNET_IDS:-$(default_subnet_ids_csv "${VPC_ID}")}
VPC_CIDR=${AWS_VPC_CIDR:-$(default_vpc_cidr "${VPC_ID}")}

DB_NAME=${DB_NAME:-online_code_test}
DB_USERNAME=${DB_USERNAME:-oct_admin}
DB_INSTANCE_CLASS=${DB_INSTANCE_CLASS:-db.t4g.micro}
DB_ALLOCATED_STORAGE=${DB_ALLOCATED_STORAGE:-20}
REDIS_NODE_TYPE=${REDIS_NODE_TYPE:-cache.t4g.micro}
REDIS_TLS=${REDIS_TLS:-true}

ensure_database_password

ARTIFACT_BUCKET_NAME=${ARTIFACT_BUCKET_NAME:-"${APP_NAME}-${STAGE}-${ACCOUNT_ID}-${AWS_REGION}-artifacts"}
API_REPOSITORY_NAME=${API_REPOSITORY_NAME:-"${APP_NAME}/${STAGE}/api"}
WORKER_REPOSITORY_NAME=${WORKER_REPOSITORY_NAME:-"${APP_NAME}/${STAGE}/worker"}

log_step "Deploying foundation stack"
delete_stack_if_rollback_complete "${APP_NAME}-${STAGE}-foundation"
aws cloudformation deploy \
  --stack-name "${APP_NAME}-${STAGE}-foundation" \
  --template-file "${SCRIPT_DIR}/templates/foundation.yaml" \
  --parameter-overrides \
    AppName="${APP_NAME}" \
    Stage="${STAGE}" \
    ArtifactBucketName="${ARTIFACT_BUCKET_NAME}" \
    ApiRepositoryName="${API_REPOSITORY_NAME}" \
    WorkerRepositoryName="${WORKER_REPOSITORY_NAME}" \
  --region "${AWS_REGION}"

log_step "Deploying data stack"
delete_stack_if_rollback_complete "${APP_NAME}-${STAGE}-data"
aws cloudformation deploy \
  --stack-name "${APP_NAME}-${STAGE}-data" \
  --template-file "${SCRIPT_DIR}/templates/data.yaml" \
  --parameter-overrides \
    AppName="${APP_NAME}" \
    Stage="${STAGE}" \
    VpcId="${VPC_ID}" \
    VpcCidr="${VPC_CIDR}" \
    SubnetIds="${SUBNET_IDS_CSV}" \
    DbName="${DB_NAME}" \
    DbUsername="${DB_USERNAME}" \
    DbPassword="${DB_PASSWORD}" \
    DbInstanceClass="${DB_INSTANCE_CLASS}" \
    DbAllocatedStorage="${DB_ALLOCATED_STORAGE}" \
    RedisNodeType="${REDIS_NODE_TYPE}" \
    RedisTransitEncryptionEnabled="${REDIS_TLS}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "${AWS_REGION}"

ensure_beanstalk_roles

log_step "Bootstrap complete"
echo "Foundation stack: ${APP_NAME}-${STAGE}-foundation"
echo "Data stack: ${APP_NAME}-${STAGE}-data"
echo "Database password secret: ${DB_PASSWORD_SECRET_NAME}"
