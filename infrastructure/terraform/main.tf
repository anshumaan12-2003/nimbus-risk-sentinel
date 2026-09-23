terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  # Remote state — update with your actual S3 bucket + DynamoDB table
  # backend "s3" {
  #   bucket         = "nimbus-tfstate-prod"
  #   key            = "sentinel/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "nimbus-tfstate-lock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = var.tags
  }
}

# ─── S3 Module: Findings Storage & Audit Trail ─────────────────────────────
module "findings_bucket" {
  source = "./modules/s3"

  bucket_name = "${var.project_name}-findings-${var.environment}"
  environment = var.environment
  # INTENTIONAL MISCONFIGURATION (for scanner demo):
  # enable_versioning = false
  # enable_encryption = false
}

module "audit_bucket" {
  source = "./modules/s3"

  bucket_name       = "${var.project_name}-audit-logs-${var.environment}"
  environment       = var.environment
  enable_versioning = true
  enable_encryption = true
}

# ─── IAM Module: Scanner Service Account ───────────────────────────────────
module "scanner_role" {
  source = "./modules/iam"

  role_name   = "${var.project_name}-scanner-role"
  environment = var.environment
}

# ─── EC2 Module: API Worker Node ───────────────────────────────────────────
module "api_worker" {
  source = "./modules/ec2"

  instance_name = "${var.project_name}-api-worker-${var.environment}"
  environment   = var.environment
  # INTENTIONAL MISCONFIGURATION (for scanner demo):
  # allow_ssh_from_internet = true
}

# ─── RDS Module: Application Database ─────────────────────────────────────
module "nimbus_db" {
  source = "./modules/rds"

  db_identifier = "${var.project_name}-db-${var.environment}"
  environment   = var.environment
  db_username   = var.db_username
  db_password   = var.db_password
  instance_class = var.db_instance_class
  # INTENTIONAL MISCONFIGURATION (for scanner demo):
  # publicly_accessible = true
  # backup_retention_period = 0
}
