#!/usr/bin/env bash
# One-time AWS setup for the Render-hosted API. Run with an admin profile for the account Nimbus scans:
#   AWS_PROFILE=<admin-profile> ./infra/aws/setup-render-scanner.sh
#
# Creates:
#   nimbus-render       IAM user; its ONLY permission is sts:AssumeRole on the role below.
#                       Render has no instance role, so something must hold keys; these keys alone can
#                       read nothing, and assuming the role also needs the external ID.
#   NimbusScannerRole   SecurityAudit + ViewOnlyAccess (read-only), trusts only nimbus-render + external ID.
#
# Prints the four values to paste into Render → nimbus-risk-sentinel-api → Environment.
set -euo pipefail

USER_NAME=nimbus-render
ROLE_NAME=NimbusScannerRole

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
EXTERNAL_ID=$(openssl rand -hex 16)
echo "Account: $ACCOUNT_ID"

aws iam create-user --user-name "$USER_NAME" >/dev/null
USER_ARN="arn:aws:iam::${ACCOUNT_ID}:user/${USER_NAME}"
ROLE_ARN="arn:aws:iam::${ACCOUNT_ID}:role/${ROLE_NAME}"

# IAM is eventually consistent: a brand-new user can't be a trust principal for a few seconds
for _ in 1 2 3 4 5 6; do
  if aws iam create-role --role-name "$ROLE_NAME" --max-session-duration 3600 \
      --description "Read-only scanning for Nimbus Risk Sentinel (Render)" \
      --assume-role-policy-document "{
        \"Version\": \"2012-10-17\",
        \"Statement\": [{
          \"Effect\": \"Allow\",
          \"Principal\": { \"AWS\": \"${USER_ARN}\" },
          \"Action\": \"sts:AssumeRole\",
          \"Condition\": { \"StringEquals\": { \"sts:ExternalId\": \"${EXTERNAL_ID}\" } }
        }]
      }" >/dev/null 2>&1; then break; fi
  sleep 5
done
aws iam get-role --role-name "$ROLE_NAME" >/dev/null   # fail loudly if every attempt failed

aws iam attach-role-policy --role-name "$ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/SecurityAudit
aws iam attach-role-policy --role-name "$ROLE_NAME" --policy-arn arn:aws:iam::aws:policy/job-function/ViewOnlyAccess

aws iam put-user-policy --user-name "$USER_NAME" --policy-name AssumeNimbusScannerRoleOnly \
  --policy-document "{
    \"Version\": \"2012-10-17\",
    \"Statement\": [{ \"Effect\": \"Allow\", \"Action\": \"sts:AssumeRole\", \"Resource\": \"${ROLE_ARN}\" }]
  }"

read -r KEY_ID SECRET < <(aws iam create-access-key --user-name "$USER_NAME" \
  --query 'AccessKey.[AccessKeyId,SecretAccessKey]' --output text)

cat <<EOF

Done. Paste these into Render (Environment tab), then Save → the service redeploys:

  AWS_ROLE_ARN=${ROLE_ARN}
  AWS_EXTERNAL_ID=${EXTERNAL_ID}
  AWS_ACCESS_KEY_ID=${KEY_ID}
  AWS_SECRET_ACCESS_KEY=${SECRET}

The secret is shown only once. Don't save it anywhere else.
EOF
