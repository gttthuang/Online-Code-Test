#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(cd -- "${SCRIPT_DIR}/../.." && pwd)

AWS_REGION=${AWS_REGION:-$(aws configure get region 2>/dev/null || true)}
AWS_REGION=${AWS_REGION:-ap-northeast-1}
APP_NAME=${APP_NAME:-online-code-test}
STAGE=${STAGE:-prod}

DEPLOY_ENV_FILE=${DEPLOY_ENV_FILE:-"${SCRIPT_DIR}/deploy.env"}

if [[ -f "${DEPLOY_ENV_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "${DEPLOY_ENV_FILE}"
fi

AWS_REGION=${AWS_REGION:-ap-northeast-1}
APP_NAME=${APP_NAME:-online-code-test}
STAGE=${STAGE:-prod}

function log_step() {
  printf '\n==> %s\n' "$1"
}

function require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

function require_env() {
  local name=$1
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: ${name}" >&2
    exit 1
  fi
}

function ssm_parameter_exists() {
  local parameter_name=$1
  aws ssm get-parameter \
    --name "${parameter_name}" \
    --with-decryption \
    --query "Parameter.Name" \
    --output text \
    --region "${AWS_REGION}" >/dev/null 2>&1
}

function secretsmanager_secret_exists() {
  local secret_id=$1
  aws secretsmanager describe-secret \
    --secret-id "${secret_id}" \
    --query "ARN" \
    --output text \
    --region "${AWS_REGION}" >/dev/null 2>&1
}

function secretsmanager_secret_value() {
  local secret_id=$1
  aws secretsmanager get-secret-value \
    --secret-id "${secret_id}" \
    --query "SecretString" \
    --output text \
    --region "${AWS_REGION}"
}

function put_secretsmanager_secret_value() {
  local secret_id=$1
  local secret_value=$2

  if secretsmanager_secret_exists "${secret_id}"; then
    aws secretsmanager put-secret-value \
      --secret-id "${secret_id}" \
      --secret-string "${secret_value}" \
      --region "${AWS_REGION}" >/dev/null
    return
  fi

  aws secretsmanager create-secret \
    --name "${secret_id}" \
    --secret-string "${secret_value}" \
    --region "${AWS_REGION}" >/dev/null
}

function ssm_parameter_value() {
  local parameter_name=$1
  aws ssm get-parameter \
    --name "${parameter_name}" \
    --with-decryption \
    --query "Parameter.Value" \
    --output text \
    --region "${AWS_REGION}"
}

function load_secret_from_ssm_if_needed() {
  local env_name=$1
  local parameter_env_name=$2
  local parameter_name=${!parameter_env_name:-}

  if [[ -n "${!env_name:-}" ]]; then
    return
  fi

  if [[ -z "${parameter_name}" ]]; then
    return
  fi

  if ! ssm_parameter_exists "${parameter_name}"; then
    echo "SSM parameter not found: ${parameter_name}" >&2
    exit 1
  fi

  export "${env_name}=$(ssm_parameter_value "${parameter_name}")"
}

function default_db_password_secret_name() {
  echo "${APP_NAME}/${STAGE}/postgres/master-password"
}

function generate_database_password() {
  require_command openssl
  openssl rand -hex 16
}

function ensure_database_password() {
  DB_PASSWORD_SECRET_NAME=${DB_PASSWORD_SECRET_NAME:-$(default_db_password_secret_name)}
  export DB_PASSWORD_SECRET_NAME

  if [[ -n "${DB_PASSWORD:-}" ]]; then
    local current_secret=""

    if secretsmanager_secret_exists "${DB_PASSWORD_SECRET_NAME}"; then
      current_secret=$(secretsmanager_secret_value "${DB_PASSWORD_SECRET_NAME}")
    fi

    if [[ "${current_secret}" != "${DB_PASSWORD}" ]]; then
      put_secretsmanager_secret_value "${DB_PASSWORD_SECRET_NAME}" "${DB_PASSWORD}"
    fi
    return
  fi

  if secretsmanager_secret_exists "${DB_PASSWORD_SECRET_NAME}"; then
    export "DB_PASSWORD=$(secretsmanager_secret_value "${DB_PASSWORD_SECRET_NAME}")"
    return
  fi

  load_secret_from_ssm_if_needed DB_PASSWORD DB_PASSWORD_SSM_PARAMETER
  if [[ -n "${DB_PASSWORD:-}" ]]; then
    put_secretsmanager_secret_value "${DB_PASSWORD_SECRET_NAME}" "${DB_PASSWORD}"
    return
  fi

  export "DB_PASSWORD=$(generate_database_password)"
  put_secretsmanager_secret_value "${DB_PASSWORD_SECRET_NAME}" "${DB_PASSWORD}"
}

function aws_account_id() {
  aws sts get-caller-identity --query Account --output text
}

function default_vpc_id() {
  aws ec2 describe-vpcs \
    --filters "Name=isDefault,Values=true" \
    --query "Vpcs[0].VpcId" \
    --output text \
    --region "${AWS_REGION}"
}

function default_vpc_cidr() {
  local vpc_id=$1
  aws ec2 describe-vpcs \
    --vpc-ids "${vpc_id}" \
    --query "Vpcs[0].CidrBlock" \
    --output text \
    --region "${AWS_REGION}"
}

function default_subnet_ids_csv() {
  local vpc_id=$1
  aws ec2 describe-subnets \
    --filters "Name=vpc-id,Values=${vpc_id}" "Name=default-for-az,Values=true" \
    --query "Subnets[].SubnetId" \
    --output text \
    --region "${AWS_REGION}" | tr '\t' ','
}

function stack_output() {
  local stack_name=$1
  local output_key=$2
  aws cloudformation describe-stacks \
    --stack-name "${stack_name}" \
    --query "Stacks[0].Outputs[?OutputKey=='${output_key}'].OutputValue | [0]" \
    --output text \
    --region "${AWS_REGION}"
}

function stack_status() {
  local stack_name=$1
  aws cloudformation describe-stacks \
    --stack-name "${stack_name}" \
    --query "Stacks[0].StackStatus" \
    --output text \
    --region "${AWS_REGION}" 2>/dev/null || true
}

function delete_stack_if_rollback_complete() {
  local stack_name=$1
  local status
  status=$(stack_status "${stack_name}")

  if [[ "${status}" != "ROLLBACK_COMPLETE" ]]; then
    return
  fi

  log_step "Deleting failed stack ${stack_name} before retry"
  aws cloudformation delete-stack \
    --stack-name "${stack_name}" \
    --region "${AWS_REGION}"

  aws cloudformation wait stack-delete-complete \
    --stack-name "${stack_name}" \
    --region "${AWS_REGION}"
}

function ensure_role_exists() {
  local role_name=$1
  local assume_role_policy=$2

  if aws iam get-role --role-name "${role_name}" >/dev/null 2>&1; then
    return
  fi

  aws iam create-role \
    --role-name "${role_name}" \
    --assume-role-policy-document "${assume_role_policy}" >/dev/null
}

function ensure_role_policy_attached() {
  local role_name=$1
  local policy_arn=$2

  if aws iam list-attached-role-policies \
    --role-name "${role_name}" \
    --query "AttachedPolicies[?PolicyArn=='${policy_arn}'].PolicyArn | [0]" \
    --output text | grep -q "${policy_arn}"; then
    return
  fi

  aws iam attach-role-policy \
    --role-name "${role_name}" \
    --policy-arn "${policy_arn}" >/dev/null
}

function ensure_beanstalk_roles() {
  log_step "Ensuring Elastic Beanstalk IAM roles exist"

  ensure_role_exists \
    aws-elasticbeanstalk-service-role \
    '{
      "Version":"2012-10-17",
      "Statement":[{"Effect":"Allow","Principal":{"Service":"elasticbeanstalk.amazonaws.com"},"Action":"sts:AssumeRole"}]
    }'
  ensure_role_policy_attached \
    aws-elasticbeanstalk-service-role \
    arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkEnhancedHealth
  ensure_role_policy_attached \
    aws-elasticbeanstalk-service-role \
    arn:aws:iam::aws:policy/service-role/AWSElasticBeanstalkService
  ensure_role_policy_attached \
    aws-elasticbeanstalk-service-role \
    arn:aws:iam::aws:policy/AWSElasticBeanstalkManagedUpdatesCustomerRolePolicy

  ensure_role_exists \
    aws-elasticbeanstalk-ec2-role \
    '{
      "Version":"2012-10-17",
      "Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]
    }'
  ensure_role_policy_attached \
    aws-elasticbeanstalk-ec2-role \
    arn:aws:iam::aws:policy/AWSElasticBeanstalkWebTier
  ensure_role_policy_attached \
    aws-elasticbeanstalk-ec2-role \
    arn:aws:iam::aws:policy/AWSElasticBeanstalkWorkerTier
  ensure_role_policy_attached \
    aws-elasticbeanstalk-ec2-role \
    arn:aws:iam::aws:policy/AWSElasticBeanstalkMulticontainerDocker
  ensure_role_policy_attached \
    aws-elasticbeanstalk-ec2-role \
    arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryReadOnly

  if ! aws iam get-instance-profile --instance-profile-name aws-elasticbeanstalk-ec2-role >/dev/null 2>&1; then
    aws iam create-instance-profile --instance-profile-name aws-elasticbeanstalk-ec2-role >/dev/null
  fi

  if ! aws iam get-instance-profile \
    --instance-profile-name aws-elasticbeanstalk-ec2-role \
    --query "InstanceProfile.Roles[?RoleName=='aws-elasticbeanstalk-ec2-role'].RoleName | [0]" \
    --output text | grep -q aws-elasticbeanstalk-ec2-role; then
    aws iam add-role-to-instance-profile \
      --instance-profile-name aws-elasticbeanstalk-ec2-role \
      --role-name aws-elasticbeanstalk-ec2-role >/dev/null
  fi
}

function wait_for_beanstalk_ready() {
  local environment_name=$1

  log_step "Waiting for Elastic Beanstalk environment ${environment_name} to become ready"

  local health="Unknown"
  local status="Unknown"

  while true; do
    status=$(aws elasticbeanstalk describe-environments \
      --environment-names "${environment_name}" \
      --query "Environments[0].Status" \
      --output text \
      --region "${AWS_REGION}")

    health=$(aws elasticbeanstalk describe-environments \
      --environment-names "${environment_name}" \
      --query "Environments[0].Health" \
      --output text \
      --region "${AWS_REGION}")

    echo "Elastic Beanstalk status=${status} health=${health}"

    if [[ "${status}" == "Ready" ]]; then
      break
    fi

    sleep 20
  done
}
