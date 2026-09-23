variable "db_identifier" {
  description = "RDS DB identifier"
  type        = string
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "db_username" {
  type    = string
  default = "admin"  # MISCONFIGURATION: should use non-default username
}

variable "db_password" {
  type      = string
  sensitive = true
}

variable "instance_class" {
  type    = string
  default = "db.t3.micro"
}

variable "publicly_accessible" {
  description = "Make RDS publicly accessible — DANGEROUS"
  type        = bool
  default     = true  # MISCONFIGURATION: should be false
}

variable "backup_retention_period" {
  description = "Days to retain automated backups"
  type        = number
  default     = 0  # MISCONFIGURATION: should be >= 7
}

variable "multi_az" {
  description = "Enable Multi-AZ for high availability"
  type        = bool
  default     = false  # MISCONFIGURATION: should be true for prod
}

resource "aws_db_instance" "this" {
  identifier             = var.db_identifier
  engine                 = "postgres"
  engine_version         = "14.9"
  instance_class         = var.instance_class
  allocated_storage      = 20
  storage_type           = "gp2"

  # MISCONFIGURATION: Storage encryption disabled
  storage_encrypted      = false

  db_name                = "nimbusdb"
  username               = var.db_username  # Using default username
  password               = var.db_password

  # MISCONFIGURATION: Publicly accessible RDS
  publicly_accessible    = var.publicly_accessible

  # MISCONFIGURATION: No automated backups
  backup_retention_period = var.backup_retention_period

  # MISCONFIGURATION: No Multi-AZ
  multi_az               = var.multi_az

  # MISCONFIGURATION: Auto minor version upgrades disabled
  auto_minor_version_upgrade = false

  # MISCONFIGURATION: Deletion protection off
  deletion_protection    = false

  skip_final_snapshot    = true

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

output "db_endpoint" {
  value = aws_db_instance.this.endpoint
}

output "db_port" {
  value = aws_db_instance.this.port
}
