output "findings_bucket_name" {
  description = "Name of the S3 bucket for findings storage"
  value       = module.findings_bucket.bucket_name
}

output "audit_bucket_name" {
  description = "Name of the S3 bucket for audit logs"
  value       = module.audit_bucket.bucket_name
}

output "scanner_role_arn" {
  description = "ARN of the IAM role used by the scanner"
  value       = module.scanner_role.role_arn
}

output "api_worker_instance_id" {
  description = "EC2 instance ID of the API worker"
  value       = module.api_worker.instance_id
}

output "db_endpoint" {
  description = "RDS database connection endpoint"
  value       = module.nimbus_db.db_endpoint
  sensitive   = true
}

output "db_port" {
  description = "RDS database port"
  value       = module.nimbus_db.db_port
}
