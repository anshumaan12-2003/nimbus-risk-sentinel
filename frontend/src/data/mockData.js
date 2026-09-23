// ═══════════════════════════════════════════════════════════════════
// NIMBUS RISK SENTINEL — ENTERPRISE TELEMETRY & SECURITY DATASET
// Modeled after Google Cloud Security Command Center & Hyperscale CSPMs
// ═══════════════════════════════════════════════════════════════════

export const MOCK_ENVIRONMENTS = [
  { id: 'aws-prod-primary', name: 'AWS Production (us-east-1)', provider: 'aws', accountId: '9823-4412-0914', region: 'us-east-1', status: 'healthy', latency: '19ms' },
  { id: 'aws-prod-eu', name: 'AWS EU Frankfurt (eu-central-1)', provider: 'aws', accountId: '9823-4412-0914', region: 'eu-central-1', status: 'healthy', latency: '64ms' },
  { id: 'aws-staging', name: 'AWS Staging Cluster (us-west-2)', provider: 'aws', accountId: '1092-8831-7721', region: 'us-west-2', status: 'degraded', latency: '42ms' },
  { id: 'gcp-core-prod', name: 'Google Cloud Corp (us-central1)', provider: 'gcp', accountId: 'nimbus-sentinel-prod', region: 'us-central1', status: 'healthy', latency: '28ms' },
]

export const MOCK_FINDINGS = [
  {
    id: 'find-s3-001',
    rule_id: 'S3-001',
    title: 'S3 Bucket Public Read/Write ACL Enabled',
    description: 'The S3 bucket permits public anonymous READ and WRITE permissions via legacy Access Control Lists (ACLs). Any unauthenticated actor on the public internet can enumerate, download, or overwrite sensitive data objects.',
    severity: 'CRITICAL',
    service: 's3',
    status: 'OPEN',
    resource_id: 'arn:aws:s3:::customer-finance-records-2026',
    resource_name: 'customer-finance-records-2026',
    region: 'us-east-1',
    risk_score: 94,
    created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    cvss: '9.8 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H)',
    compliance: ['CIS AWS 2.1.5', 'SOC 2 CC6.1', 'PCI-DSS 4.1', 'HIPAA 164.312'],
    blast_radius: 'HIGH — Direct exposure to 4.2M financial records & confidential billing statements',
    attack_path_stage: 'Initial Exposure',
    remediation_cli: `aws s3api put-public-access-block \\
  --bucket customer-finance-records-2026 \\
  --public-access-block-configuration "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"`,
    remediation_tf: `resource "aws_s3_bucket_public_access_block" "remediation" {
  bucket = "customer-finance-records-2026"

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}`,
    remediation_cf: `Resources:
  SecureBucketPolicy:
    Type: AWS::S3::BucketPolicy
    Properties:
      Bucket: customer-finance-records-2026
      PolicyDocument:
        Statement:
          - Effect: Deny
            Principal: "*"
            Action: "s3:*"
            Condition:
              Bool:
                aws:SecureTransport: "false"`
  },
  {
    id: 'find-iam-001',
    rule_id: 'IAM-001',
    title: 'Root Account Active Access Key Without MFA',
    description: 'An active access key pair was detected on the AWS root account. Best practice strictly dictates root accounts must never possess programmatic API access keys and must require Hardware MFA.',
    severity: 'CRITICAL',
    service: 'iam',
    status: 'OPEN',
    resource_id: 'arn:aws:iam::982344120914:root',
    resource_name: 'AWS Account Root User',
    region: 'global',
    risk_score: 98,
    created_at: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    cvss: '10.0 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H)',
    compliance: ['CIS AWS 1.4', 'SOC 2 CC6.3', 'PCI-DSS 8.2', 'ISO 27001 A.9.2.6'],
    blast_radius: 'CATASTROPHIC — Unrestricted control over all AWS services, billing, and IAM policies',
    attack_path_stage: 'Privilege Escalation',
    remediation_cli: `aws iam delete-access-key \\
  --user-name root \\
  --access-key-id AKIAIOSFODNN7EXAMPLE`,
    remediation_tf: `# Root credentials cannot be managed via Terraform.
# Log into AWS Management Console as root, navigate to IAM -> Security Credentials,
# and delete all active access keys immediately. Enable FIDO2 / YubiKey MFA.`,
    remediation_cf: `# Manual action required in AWS Console.`
  },
  {
    id: 'find-ec2-001',
    rule_id: 'EC2-001',
    title: 'Security Group Ingress Allows 0.0.0.0/0 on SSH Port 22',
    description: 'Security group rule allows inbound TCP port 22 (SSH) from all IPv4 addresses (0.0.0.0/0). This exposes internal compute workloads directly to internet-wide brute force attacks and botnet exploitation.',
    severity: 'HIGH',
    service: 'ec2',
    status: 'OPEN',
    resource_id: 'sg-0a8bf7913c4de01f2',
    resource_name: 'bastion-host-ingress-sg',
    region: 'us-east-1',
    risk_score: 82,
    created_at: new Date(Date.now() - 1000 * 60 * 95).toISOString(),
    cvss: '8.1 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N)',
    compliance: ['CIS AWS 4.1', 'SOC 2 CC6.6', 'PCI-DSS 1.3'],
    blast_radius: 'HIGH — Potential shell compromise on 3 production bastion instances',
    attack_path_stage: 'Perimeter Breach',
    remediation_cli: `aws ec2 revoke-security-group-ingress \\
  --group-id sg-0a8bf7913c4de01f2 \\
  --protocol tcp --port 22 --cidr 0.0.0.0/0`,
    remediation_tf: `resource "aws_security_group_rule" "ssh_restricted" {
  type              = "ingress"
  from_port         = 22
  to_port           = 22
  protocol          = "tcp"
  cidr_blocks       = ["10.0.0.0/16"] # Restricted to internal VPN
  security_group_id = "sg-0a8bf7913c4de01f2"
}`,
    remediation_cf: `BastionIngressRule:
  Type: AWS::EC2::SecurityGroupIngress
  Properties:
    GroupId: sg-0a8bf7913c4de01f2
    IpProtocol: tcp
    FromPort: 22
    ToPort: 22
    CidrIp: 10.0.0.0/16`
  },
  {
    id: 'find-rds-001',
    rule_id: 'RDS-001',
    title: 'RDS Aurora Instance Publicly Accessible With No KMS Encryption',
    description: 'Production relational database has PubliclyAccessible set to true and StorageEncrypted set to false. Databases containing sensitive state must reside inside private subnets and leverage AWS KMS customer-managed keys.',
    severity: 'CRITICAL',
    service: 'rds',
    status: 'OPEN',
    resource_id: 'arn:aws:rds:us-east-1:982344120914:db:prod-financial-aurora',
    resource_name: 'prod-financial-aurora',
    region: 'us-east-1',
    risk_score: 91,
    created_at: new Date(Date.now() - 1000 * 60 * 140).toISOString(),
    cvss: '9.4 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H)',
    compliance: ['CIS AWS 2.3.1', 'HIPAA 164.312(a)(2)(iv)', 'PCI-DSS 3.4', 'SOC 2 CC6.1'],
    blast_radius: 'CRITICAL — Exposure of relational customer data tables to internet endpoint',
    attack_path_stage: 'Crown Jewel Exfiltration',
    remediation_cli: `aws rds modify-db-instance \\
  --db-instance-identifier prod-financial-aurora \\
  --no-publicly-accessible \\
  --apply-immediately`,
    remediation_tf: `resource "aws_db_instance" "prod_db" {
  identifier          = "prod-financial-aurora"
  publicly_accessible = false
  storage_encrypted   = true
  kms_key_id          = "arn:aws:kms:us-east-1:982344120914:key/db-key"
  apply_immediately   = true
}`,
    remediation_cf: `ProdDBInstance:
  Type: AWS::RDS::DBInstance
  Properties:
    DBInstanceIdentifier: prod-financial-aurora
    PubliclyAccessible: false
    StorageEncrypted: true`
  },
  {
    id: 'find-iam-002',
    rule_id: 'IAM-002',
    title: 'IAM Policy Attached With Wildcard Administrator Access ("Action": "*")',
    description: 'IAM Policy "DataOpsPipelineEngine" contains statements granting "Action": "*" and "Resource": "*". Violates principle of least privilege by granting arbitrary API mutation permissions across all AWS namespaces.',
    severity: 'HIGH',
    service: 'iam',
    status: 'OPEN',
    resource_id: 'arn:aws:iam::982344120914:policy/DataOpsPipelineEngine',
    resource_name: 'DataOpsPipelineEngine',
    region: 'global',
    risk_score: 86,
    created_at: new Date(Date.now() - 1000 * 60 * 210).toISOString(),
    cvss: '8.8 (CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:C/C:H/I:H/A:H)',
    compliance: ['CIS AWS 1.16', 'SOC 2 CC6.2', 'PCI-DSS 7.1'],
    blast_radius: 'HIGH — Role can self-escalate to full cloud administrator',
    attack_path_stage: 'Privilege Escalation',
    remediation_cli: `aws iam create-policy-version \\
  --policy-arn arn:aws:iam::982344120914:policy/DataOpsPipelineEngine \\
  --policy-document file://scoped-least-privilege-policy.json \\
  --set-as-default`,
    remediation_tf: `resource "aws_iam_policy" "scoped_policy" {
  name        = "DataOpsPipelineEngine"
  description = "Scoped read-only pipeline permissions"
  policy      = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:ListBucket"]
      Resource = ["arn:aws:s3:::pipeline-ingest/*"]
    }]
  })
}`,
    remediation_cf: `ScopedPolicy:
  Type: AWS::IAM::ManagedPolicy
  Properties:
    ManagedPolicyName: DataOpsPipelineEngine
    PolicyDocument:
      Version: '2012-10-17'
      Statement:
        - Effect: Allow
          Action:
            - s3:GetObject
            - s3:ListBucket
          Resource: arn:aws:s3:::pipeline-ingest/*`
  },
  {
    id: 'find-s3-002',
    rule_id: 'S3-002',
    title: 'S3 Server-Side Encryption (SSE-KMS) Disabled',
    description: 'Data stored at rest in bucket "prod-app-assets-cdn" is unencrypted. Any physical or backend disk exposure could result in unencrypted data leakage.',
    severity: 'MEDIUM',
    service: 's3',
    status: 'OPEN',
    resource_id: 'arn:aws:s3:::prod-app-assets-cdn',
    resource_name: 'prod-app-assets-cdn',
    region: 'us-east-1',
    risk_score: 54,
    created_at: new Date(Date.now() - 1000 * 60 * 300).toISOString(),
    cvss: '5.3 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N)',
    compliance: ['CIS AWS 2.1.1', 'HIPAA 164.312'],
    blast_radius: 'MEDIUM — Application assets and cached metadata at rest',
    attack_path_stage: 'Data Compliance',
    remediation_cli: `aws s3api put-bucket-encryption \\
  --bucket prod-app-assets-cdn \\
  --server-side-encryption-configuration '{"Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "aws:kms"}}]}'`,
    remediation_tf: `resource "aws_s3_bucket_server_side_encryption_configuration" "s3_enc" {
  bucket = "prod-app-assets-cdn"
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
    }
  }
}`,
    remediation_cf: `S3EncConfig:
  Type: AWS::S3::Bucket
  Properties:
    BucketName: prod-app-assets-cdn
    BucketEncryption:
      ServerSideEncryptionConfiguration:
        - ServerSideEncryptionByDefault:
            SSEAlgorithm: aws:kms`
  },
  {
    id: 'find-ec2-002',
    rule_id: 'EC2-002',
    title: 'EC2 Instance Metadata Service v1 (IMDSv1) Enabled',
    description: 'Instance i-08249bf57a0129c allows insecure IMDSv1 tokenless HTTP GET requests. Vulnerable to SSRF (Server-Side Request Forgery) attacks that allow attackers to steal instance profile IAM credentials.',
    severity: 'HIGH',
    service: 'ec2',
    status: 'OPEN',
    resource_id: 'i-08249bf57a0129c',
    resource_name: 'api-worker-node-03',
    region: 'us-east-1',
    risk_score: 79,
    created_at: new Date(Date.now() - 1000 * 60 * 420).toISOString(),
    cvss: '7.5 (CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N)',
    compliance: ['CIS AWS 5.1', 'SOC 2 CC6.6'],
    blast_radius: 'HIGH — SSRF vector allowing credential harvesting of node IAM role',
    attack_path_stage: 'Lateral Movement',
    remediation_cli: `aws ec2 modify-instance-metadata-options \\
  --instance-id i-08249bf57a0129c \\
  --http-tokens required \\
  --http-endpoint enabled`,
    remediation_tf: `resource "aws_instance" "secure_node" {
  instance_type = "t3.medium"
  metadata_options {
    http_tokens   = "required"
    http_endpoint = "enabled"
  }
}`,
    remediation_cf: `InstanceLaunchTemplate:
  Type: AWS::EC2::LaunchTemplate
  Properties:
    LaunchTemplateData:
      MetadataOptions:
        HttpTokens: required`
  },
  {
    id: 'find-rds-002',
    rule_id: 'RDS-002',
    title: 'Automated Backup Retention Period Set to 0 Days',
    description: 'RDS database instance has backup retention disabled (0 days). Point-in-time recovery and snapshot rollbacks are impossible, violating disaster recovery SLAs and ransomware resilience policies.',
    severity: 'LOW',
    service: 'rds',
    status: 'OPEN',
    resource_id: 'arn:aws:rds:us-east-1:982344120914:db:analytics-cache-store',
    resource_name: 'analytics-cache-store',
    region: 'us-east-1',
    risk_score: 32,
    created_at: new Date(Date.now() - 1000 * 60 * 500).toISOString(),
    cvss: '3.1 (CVSS:3.1/AV:N/AC:H/PR:H/UI:N/S:U/C:N/I:N/A:L)',
    compliance: ['CIS AWS 2.3.3', 'SOC 2 A1.2'],
    blast_radius: 'LOW — Non-critical analytics cache tier',
    attack_path_stage: 'Resilience Failure',
    remediation_cli: `aws rds modify-db-instance \\
  --db-instance-identifier analytics-cache-store \\
  --backup-retention-period 14 \\
  --apply-immediately`,
    remediation_tf: `resource "aws_db_instance" "db" {
  identifier             = "analytics-cache-store"
  backup_retention_period = 14
}`,
    remediation_cf: `DBInstance:
  Type: AWS::RDS::DBInstance
  Properties:
    BackupRetentionPeriod: 14`
  }
]

export const MOCK_STATS = {
  total: 24,
  critical: 4,
  high: 8,
  medium: 9,
  low: 3,
  open: 20,
  in_progress: 2,
  resolved: 2,
  risk_score: 84,
  scanned_resources: 142,
  coverage_percent: 98.4
}

export const MOCK_LATEST_SCAN = {
  id: 'scn-9048a1b2-scale',
  status: 'COMPLETED',
  started_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  finished_at: new Date(Date.now() - 1000 * 60 * 11).toISOString(),
  duration_seconds: 38.4,
  account_id: '9823-4412-0914',
  region: 'us-east-1',
  total_findings: 24,
  critical_count: 4,
  high_count: 8,
  medium_count: 9,
  low_count: 3,
  risk_score: 84,
  engine_version: 'v2.4-sentinel-scale'
}

export const MOCK_COMPLIANCE_BENCHMARKS = [
  {
    id: 'cis-aws-1.4',
    name: 'CIS AWS Foundations Benchmark v1.4',
    score: 82,
    passingRules: 41,
    failingRules: 9,
    category: 'Foundational Baseline',
    status: 'ACTION_REQUIRED',
    icon: 'shield',
    color: '#8b5cf6'
  },
  {
    id: 'soc2-type2',
    name: 'SOC 2 Type II (Security & Confidentiality)',
    score: 89,
    passingRules: 34,
    failingRules: 4,
    category: 'Trust Services Criteria',
    status: 'NEAR_COMPLIANT',
    icon: 'file-check',
    color: '#06b6d4'
  },
  {
    id: 'pci-dss-4.0',
    name: 'PCI-DSS v4.0 (Cardholder Data Protection)',
    score: 74,
    passingRules: 29,
    failingRules: 10,
    category: 'Payment Card Security',
    status: 'HIGH_RISK',
    icon: 'credit-card',
    color: '#f97316'
  },
  {
    id: 'hipaa-sec',
    name: 'HIPAA Security Rule (ePHI Safeguards)',
    score: 86,
    passingRules: 31,
    failingRules: 5,
    category: 'Healthcare Data Privacy',
    status: 'NEAR_COMPLIANT',
    icon: 'activity',
    color: '#10b981'
  }
]

export const MOCK_ATTACK_GRAPH = {
  title: 'Critical Attack Vector: Unauthenticated Internet to Aurora Crown Jewel',
  blastRadiusScore: 94,
  cvssComposite: '9.8 (CRITICAL)',
  nodes: [
    {
      id: 'node-internet',
      label: 'Adversary (Public Internet)',
      type: 'attacker',
      threatLevel: 'EXTERNAL_THREAT',
      icon: 'globe',
      description: 'Anonymous actor scanning public IPv4 subnets for open cloud assets'
    },
    {
      id: 'node-s3',
      label: 'S3: customer-finance-records',
      type: 'compromised_asset',
      threatLevel: 'CRITICAL',
      icon: 'hard-drive',
      detail: 'Public Read/Write ACL Enabled (S3-001)',
      findingId: 'find-s3-001'
    },
    {
      id: 'node-iam',
      label: 'IAM Role: DataOpsPipelineEngine',
      type: 'lateral_movement',
      threatLevel: 'HIGH',
      icon: 'key',
      detail: 'Overprivileged Wildcard Administrator (IAM-002)',
      findingId: 'find-iam-002'
    },
    {
      id: 'node-ec2',
      label: 'EC2: api-worker-node-03',
      type: 'pivot_host',
      threatLevel: 'HIGH',
      icon: 'server',
      detail: 'IMDSv1 Enabled + SSRF Exposure (EC2-002)',
      findingId: 'find-ec2-002'
    },
    {
      id: 'node-rds',
      label: 'RDS: prod-financial-aurora',
      type: 'crown_jewel',
      threatLevel: 'CRITICAL',
      icon: 'database',
      detail: 'Unencrypted + Public Accessible Endpoint (RDS-001)',
      findingId: 'find-rds-001'
    }
  ],
  edges: [
    { from: 'node-internet', to: 'node-s3', label: '1. Anonymous Bucket Listing', active: true },
    { from: 'node-s3', to: 'node-ec2', label: '2. Stolen Pipeline Config / Keys', active: true },
    { from: 'node-ec2', to: 'node-iam', label: '3. SSRF Instance Profile Escalation', active: true },
    { from: 'node-iam', to: 'node-rds', label: '4. Direct DB Dump & Exfiltration', active: true }
  ]
}

export const MOCK_AUDIT_STREAM = [
  { id: 'evt-1', time: '10s ago', service: 'IAM', event: 'AssumeRoleWithSAML', actor: 'pipeline-runner@sentinel.cloud', status: 'WARN', detail: 'Role policy session elevated to AdminAccess' },
  { id: 'evt-2', time: '45s ago', service: 'S3', event: 'PutBucketAcl', actor: 'deploy-bot@ci-cd', status: 'CRITICAL', detail: 'PublicReadWrite granted on customer-finance-records' },
  { id: 'evt-3', time: '2m ago', service: 'EC2', event: 'AuthorizeSecurityGroupIngress', actor: 'dev-ops-admin@cloud', status: 'ALERT', detail: '0.0.0.0/0 port 22 opened on sg-0a8bf7' },
  { id: 'evt-4', time: '4m ago', service: 'RDS', event: 'ModifyDBInstance', actor: 'db-automation@prod', status: 'WARN', detail: 'PubliclyAccessible updated to TRUE' },
  { id: 'evt-5', time: '7m ago', service: 'GuardDuty', event: 'Recon:IAMUser/NetworkPermissions', actor: 'unknown-ip (198.51.100.4)', status: 'CRITICAL', detail: 'Brute force credential attempt detected' },
  { id: 'evt-6', time: '11m ago', service: 'KMS', event: 'ScheduleKeyDeletion', actor: 'secops-lead@sentinel.cloud', status: 'INFO', detail: 'Pending deletion cancelled for key/prod-vault' },
  { id: 'evt-7', time: '15m ago', service: 'CloudTrail', event: 'StopLogging', actor: 'unknown-arn', status: 'CRITICAL', detail: 'Anomaly: Attempted logging suppression' },
]

export const MOCK_DRIFT_REPORT = {
  status: 'DEGRADED',
  risk_score_delta: 14,
  current_risk_score: 84,
  previous_risk_score: 70,
  current_scan_id: 'scn-9048a1b2-scale',
  previous_scan_id: 'scn-7719f4cc-scale',
  detected_at: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
  summary: {
    new_count: 2,
    resolved_count: 1,
    regressed_count: 0,
    persisting_count: 21,
    total_drift_events: 3,
  },
  new_findings: [
    {
      id: 'drift-new-1',
      rule_id: 'S3-001',
      title: 'S3 Bucket Public Read/Write ACL Enabled',
      severity: 'CRITICAL',
      service: 's3',
      resource_name: 'customer-finance-records-2026',
      risk_score: 94,
      author: 'deploy-bot@ci-cd',
      detected_at: '12m ago',
      change_detail: 'ACL changed from private -> PublicReadWrite via Terraform apply',
    },
    {
      id: 'drift-new-2',
      rule_id: 'EC2-001',
      title: 'Security Group Ingress Allows 0.0.0.0/0 on SSH Port 22',
      severity: 'HIGH',
      service: 'ec2',
      resource_name: 'bastion-host-ingress-sg',
      risk_score: 82,
      author: 'developer-hotfix@cloud',
      detected_at: '24m ago',
      change_detail: 'Inbound rule added port 22 CIDR 0.0.0.0/0 at 02:14 AM',
    }
  ],
  resolved_findings: [
    {
      id: 'drift-res-1',
      rule_id: 'IAM-003',
      title: 'Unused IAM Credentials Older Than 90 Days',
      severity: 'MEDIUM',
      service: 'iam',
      resource_name: 'intern-legacy-pipeline-key',
      risk_score: 45,
      resolved_at: '38m ago',
      remediated_by: 'secops-lead@sentinel.cloud',
      change_detail: 'Access key deactivated and purged',
    }
  ],
  regressed_findings: []
}

export const MOCK_DRIFT_TIMELINE = [
  {
    id: 'dt-1',
    scan_id: 'scn-9048a1b2',
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    status: 'DEGRADED',
    risk_delta: '+14',
    new_count: 2,
    resolved_count: 1,
    author: 'ci-runner@prod',
    highlight: 'CRITICAL: S3 Public Bucket & Open Port 22 introduced'
  },
  {
    id: 'dt-2',
    scan_id: 'scn-7719f4cc',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
    status: 'IMPROVED',
    risk_delta: '-6',
    new_count: 0,
    resolved_count: 2,
    author: 'secops-lead@sentinel.cloud',
    highlight: 'REMEDIATED: 2 unencrypted RDS databases configured with KMS'
  },
  {
    id: 'dt-3',
    scan_id: 'scn-6623e1aa',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    status: 'DEGRADED',
    risk_delta: '+8',
    new_count: 1,
    resolved_count: 0,
    author: 'dev-team@cloud',
    highlight: 'NEW: Overprivileged IAM Administrator Policy attached'
  },
  {
    id: 'dt-4',
    scan_id: 'scn-5512b988',
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    status: 'STABLE',
    risk_delta: '0',
    new_count: 0,
    resolved_count: 0,
    author: 'system',
    highlight: 'Baseline Snapshot created: 28 active findings tracked'
  }
]

