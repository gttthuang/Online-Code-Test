#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck disable=SC1091
source "${SCRIPT_DIR}/common.sh"

require_command aws
require_command docker
require_command npm
require_command zip

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
WORKER_INSTANCE_TYPE=${WORKER_INSTANCE_TYPE:-t3.small}
WORKER_DESIRED_CAPACITY=${WORKER_DESIRED_CAPACITY:-1}
WORKER_MAX_SIZE=${WORKER_MAX_SIZE:-2}
JUDGE_QUEUE_CONCURRENCY=${JUDGE_QUEUE_CONCURRENCY:-2}

ensure_database_password
ensure_ops_token
load_secret_from_ssm_if_needed REDIS_PASSWORD REDIS_PASSWORD_SSM_PARAMETER

ARTIFACT_BUCKET_NAME=${ARTIFACT_BUCKET_NAME:-"${APP_NAME}-${STAGE}-${ACCOUNT_ID}-${AWS_REGION}-artifacts"}
FRONTEND_BUCKET_NAME=${FRONTEND_BUCKET_NAME:-"${APP_NAME}-${STAGE}-${ACCOUNT_ID}-${AWS_REGION}-web"}
API_REPOSITORY_NAME=${API_REPOSITORY_NAME:-"${APP_NAME}/${STAGE}/api"}
WORKER_REPOSITORY_NAME=${WORKER_REPOSITORY_NAME:-"${APP_NAME}/${STAGE}/worker"}

BEANSTALK_APP_NAME=${BEANSTALK_APP_NAME:-"${APP_NAME}-${STAGE}-api"}
BEANSTALK_ENV_NAME=${BEANSTALK_ENV_NAME:-"${APP_NAME}-${STAGE}-api-env"}
WORKER_STACK_NAME="${APP_NAME}-${STAGE}-worker"
EDGE_STACK_NAME="${APP_NAME}-${STAGE}-edge"

log_step "Bootstrapping shared infrastructure"
bash "${SCRIPT_DIR}/bootstrap.sh"

API_REPOSITORY_URI=$(stack_output "${APP_NAME}-${STAGE}-foundation" ApiRepositoryUri)
WORKER_REPOSITORY_URI=$(stack_output "${APP_NAME}-${STAGE}-foundation" WorkerRepositoryUri)
ARTIFACT_BUCKET=$(stack_output "${APP_NAME}-${STAGE}-foundation" ArtifactBucketName)
POSTGRES_HOST=$(stack_output "${APP_NAME}-${STAGE}-data" DatabaseHost)
POSTGRES_PORT=$(stack_output "${APP_NAME}-${STAGE}-data" DatabasePort)
POSTGRES_DB=$(stack_output "${APP_NAME}-${STAGE}-data" DatabaseName)
POSTGRES_USER=$(stack_output "${APP_NAME}-${STAGE}-data" DatabaseUsername)
REDIS_HOST=$(stack_output "${APP_NAME}-${STAGE}-data" RedisHost)
REDIS_PORT=$(stack_output "${APP_NAME}-${STAGE}-data" RedisPort)
REDIS_TLS_ENABLED=$(stack_output "${APP_NAME}-${STAGE}-data" RedisTlsEnabled)

IMAGE_TAG=${IMAGE_TAG:-$(git rev-parse --short HEAD)}
API_IMAGE_URI="${API_REPOSITORY_URI}:${IMAGE_TAG}"
WORKER_IMAGE_URI="${WORKER_REPOSITORY_URI}:${IMAGE_TAG}"
DOCKER_PLATFORM=${DOCKER_PLATFORM:-linux/amd64}

log_step "Logging in to ECR"
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"

log_step "Building and pushing API image"
docker build \
  --platform "${DOCKER_PLATFORM}" \
  -f "${REPO_ROOT}/apps/api/Dockerfile" \
  -t "${API_IMAGE_URI}" \
  "${REPO_ROOT}"
docker push "${API_IMAGE_URI}"

log_step "Building and pushing worker image"
docker build \
  --platform "${DOCKER_PLATFORM}" \
  -f "${REPO_ROOT}/apps/judge-worker/Dockerfile" \
  -t "${WORKER_IMAGE_URI}" \
  "${REPO_ROOT}"
docker push "${WORKER_IMAGE_URI}"

log_step "Packaging Elastic Beanstalk application version"
TMP_DIR=$(mktemp -d)
trap 'rm -rf "${TMP_DIR}"' EXIT

cat > "${TMP_DIR}/Dockerrun.aws.json" <<EOF
{
  "AWSEBDockerrunVersion": "1",
  "Image": {
    "Name": "${API_IMAGE_URI}",
    "Update": "true"
  },
  "Ports": [
    {
      "ContainerPort": "3000"
    }
  ]
}
EOF

VERSION_LABEL="${STAGE}-$(date +%Y%m%d%H%M%S)-${IMAGE_TAG}"
(
  cd "${TMP_DIR}"
  zip -qr "${VERSION_LABEL}.zip" Dockerrun.aws.json
)

aws s3 cp \
  "${TMP_DIR}/${VERSION_LABEL}.zip" \
  "s3://${ARTIFACT_BUCKET}/beanstalk/${VERSION_LABEL}.zip" \
  --region "${AWS_REGION}" >/dev/null

if ! aws elasticbeanstalk describe-applications \
  --application-names "${BEANSTALK_APP_NAME}" \
  --query "Applications[0].ApplicationName" \
  --output text \
  --region "${AWS_REGION}" | grep -q "${BEANSTALK_APP_NAME}"; then
  log_step "Creating Elastic Beanstalk application"
  aws elasticbeanstalk create-application \
    --application-name "${BEANSTALK_APP_NAME}" \
    --region "${AWS_REGION}" >/dev/null
fi

log_step "Creating Elastic Beanstalk application version"
aws elasticbeanstalk create-application-version \
  --application-name "${BEANSTALK_APP_NAME}" \
  --version-label "${VERSION_LABEL}" \
  --source-bundle "S3Bucket=${ARTIFACT_BUCKET},S3Key=beanstalk/${VERSION_LABEL}.zip" \
  --region "${AWS_REGION}" >/dev/null

ENV_STATUS=$(aws elasticbeanstalk describe-environments \
  --application-name "${BEANSTALK_APP_NAME}" \
  --environment-names "${BEANSTALK_ENV_NAME}" \
  --query "Environments[0].Status" \
  --output text \
  --region "${AWS_REGION}" 2>/dev/null || true)

cat > "${TMP_DIR}/beanstalk-option-settings.json" <<EOF
[
  {"Namespace":"aws:autoscaling:launchconfiguration","OptionName":"IamInstanceProfile","Value":"aws-elasticbeanstalk-ec2-role"},
  {"Namespace":"aws:elasticbeanstalk:environment","OptionName":"ServiceRole","Value":"aws-elasticbeanstalk-service-role"},
  {"Namespace":"aws:elasticbeanstalk:application","OptionName":"Application Healthcheck URL","Value":"/readyz"},
  {"Namespace":"aws:elasticbeanstalk:healthreporting:system","OptionName":"SystemType","Value":"enhanced"},
  {"Namespace":"aws:elasticbeanstalk:cloudwatch:logs","OptionName":"StreamLogs","Value":"true"},
  {"Namespace":"aws:elasticbeanstalk:cloudwatch:logs","OptionName":"RetentionInDays","Value":"14"},
  {"Namespace":"aws:elasticbeanstalk:cloudwatch:logs","OptionName":"DeleteOnTerminate","Value":"false"},
  {"Namespace":"aws:autoscaling:launchconfiguration","OptionName":"InstanceType","Value":"t3.small"},
  {"Namespace":"aws:ec2:vpc","OptionName":"VPCId","Value":"${VPC_ID}"},
  {"Namespace":"aws:ec2:vpc","OptionName":"Subnets","Value":"${SUBNET_IDS_CSV}"},
  {"Namespace":"aws:ec2:vpc","OptionName":"ELBSubnets","Value":"${SUBNET_IDS_CSV}"},
  {"Namespace":"aws:ec2:vpc","OptionName":"AssociatePublicIpAddress","Value":"true"},
  {"Namespace":"aws:elasticbeanstalk:environment","OptionName":"EnvironmentType","Value":"LoadBalanced"},
  {"Namespace":"aws:elb:healthcheck","OptionName":"Target","Value":"HTTP:80/readyz"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"API_PORT","Value":"3000"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"OPS_TOKEN","Value":"${OPS_TOKEN}"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"POSTGRES_HOST","Value":"${POSTGRES_HOST}"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"POSTGRES_PORT","Value":"${POSTGRES_PORT}"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"POSTGRES_DB","Value":"${POSTGRES_DB}"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"POSTGRES_USER","Value":"${POSTGRES_USER}"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"POSTGRES_PASSWORD","Value":"${DB_PASSWORD}"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"POSTGRES_SSL","Value":"true"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"REDIS_HOST","Value":"${REDIS_HOST}"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"REDIS_PORT","Value":"${REDIS_PORT}"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"REDIS_PASSWORD","Value":"${REDIS_PASSWORD:-}"},
  {"Namespace":"aws:elasticbeanstalk:application:environment","OptionName":"REDIS_TLS","Value":"${REDIS_TLS_ENABLED}"}
]
EOF

if [[ "${ENV_STATUS}" == "None" || -z "${ENV_STATUS}" ]]; then
  log_step "Creating Elastic Beanstalk environment"
  SOLUTION_STACK=$(aws elasticbeanstalk list-available-solution-stacks \
    --query "SolutionStacks[?contains(@, 'Amazon Linux 2023') && contains(@, 'Docker')] | [0]" \
    --output text \
    --region "${AWS_REGION}")

  aws elasticbeanstalk create-environment \
    --application-name "${BEANSTALK_APP_NAME}" \
    --environment-name "${BEANSTALK_ENV_NAME}" \
    --solution-stack-name "${SOLUTION_STACK}" \
    --version-label "${VERSION_LABEL}" \
    --option-settings "file://${TMP_DIR}/beanstalk-option-settings.json" \
    --region "${AWS_REGION}" >/dev/null
else
  if [[ "${ENV_STATUS}" != "Ready" ]]; then
    wait_for_beanstalk_ready "${BEANSTALK_ENV_NAME}"
  fi

  log_step "Updating Elastic Beanstalk environment"
  aws elasticbeanstalk update-environment \
    --environment-name "${BEANSTALK_ENV_NAME}" \
    --version-label "${VERSION_LABEL}" \
    --option-settings "file://${TMP_DIR}/beanstalk-option-settings.json" \
    --region "${AWS_REGION}" >/dev/null
fi

wait_for_beanstalk_ready "${BEANSTALK_ENV_NAME}"

API_CNAME=$(aws elasticbeanstalk describe-environments \
  --application-name "${BEANSTALK_APP_NAME}" \
  --environment-names "${BEANSTALK_ENV_NAME}" \
  --query "Environments[0].CNAME" \
  --output text \
  --region "${AWS_REGION}")

log_step "Deploying ECS worker stack"
wait_for_stack_stable "${WORKER_STACK_NAME}"
aws cloudformation deploy \
  --stack-name "${WORKER_STACK_NAME}" \
  --template-file "${SCRIPT_DIR}/templates/worker.yaml" \
  --parameter-overrides \
    AppName="${APP_NAME}" \
    Stage="${STAGE}" \
    VpcId="${VPC_ID}" \
    SubnetIds="${SUBNET_IDS_CSV}" \
    WorkerImageUri="${WORKER_IMAGE_URI}" \
    InstanceType="${WORKER_INSTANCE_TYPE}" \
    DesiredCapacity="${WORKER_DESIRED_CAPACITY}" \
    MaxSize="${WORKER_MAX_SIZE}" \
    PostgresHost="${POSTGRES_HOST}" \
    PostgresPort="${POSTGRES_PORT}" \
    PostgresDb="${POSTGRES_DB}" \
    PostgresUser="${POSTGRES_USER}" \
    PostgresPassword="${DB_PASSWORD}" \
    PostgresSsl="true" \
    RedisHost="${REDIS_HOST}" \
    RedisPort="${REDIS_PORT}" \
    RedisPassword="${REDIS_PASSWORD:-}" \
    RedisTls="${REDIS_TLS_ENABLED}" \
    QueueConcurrency="${JUDGE_QUEUE_CONCURRENCY}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --region "${AWS_REGION}"

log_step "Deploying edge stack"
wait_for_stack_stable "${EDGE_STACK_NAME}"
delete_stack_if_rollback_complete "${EDGE_STACK_NAME}"
aws cloudformation deploy \
  --stack-name "${EDGE_STACK_NAME}" \
  --template-file "${SCRIPT_DIR}/templates/edge.yaml" \
  --parameter-overrides \
    AppName="${APP_NAME}" \
    Stage="${STAGE}" \
    FrontendBucketName="${FRONTEND_BUCKET_NAME}" \
    ApiOriginDomainName="${API_CNAME}" \
  --region "${AWS_REGION}"

FRONTEND_BUCKET=$(stack_output "${EDGE_STACK_NAME}" FrontendBucketName)
CLOUDFRONT_DISTRIBUTION_ID=$(stack_output "${EDGE_STACK_NAME}" CloudFrontDistributionId)
CLOUDFRONT_DOMAIN_NAME=$(stack_output "${EDGE_STACK_NAME}" CloudFrontDomainName)

log_step "Building frontend"
(
  cd "${REPO_ROOT}"
  VITE_API_BASE_URL= npm run build:web
)

log_step "Uploading frontend assets"
aws s3 sync "${REPO_ROOT}/apps/web/dist" "s3://${FRONTEND_BUCKET}" --delete --region "${AWS_REGION}" >/dev/null

log_step "Creating CloudFront invalidation"
aws cloudfront create-invalidation \
  --distribution-id "${CLOUDFRONT_DISTRIBUTION_ID}" \
  --paths "/*" >/dev/null

log_step "Deployment complete"
echo "CloudFront URL: https://${CLOUDFRONT_DOMAIN_NAME}"
echo "Beanstalk API CNAME: ${API_CNAME}"
echo "Worker stack: ${WORKER_STACK_NAME}"
echo "Database password secret: ${DB_PASSWORD_SECRET_NAME}"
