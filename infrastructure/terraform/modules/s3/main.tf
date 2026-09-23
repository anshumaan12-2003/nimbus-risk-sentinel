variable "bucket_name" {
  description = "S3 bucket name"
  type        = string
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "enable_versioning" {
  description = "Enable S3 versioning"
  type        = bool
  default     = false  # MISCONFIGURATION: should default to true
}

variable "enable_encryption" {
  description = "Enable server-side encryption"
  type        = bool
  default     = false  # MISCONFIGURATION: should default to true
}

variable "enable_access_logging" {
  description = "Enable S3 access logging"
  type        = bool
  default     = false  # MISCONFIGURATION: should default to true
}

resource "aws_s3_bucket" "this" {
  bucket = var.bucket_name

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# Public Access Block — intentionally incomplete for scanner demo
resource "aws_s3_bucket_public_access_block" "this" {
  bucket = aws_s3_bucket.this.id

  block_public_acls       = false  # MISCONFIGURATION: should be true
  ignore_public_acls      = false  # MISCONFIGURATION: should be true
  block_public_policy     = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "this" {
  count  = var.enable_versioning ? 1 : 0
  bucket = aws_s3_bucket.this.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  count  = var.enable_encryption ? 1 : 0
  bucket = aws_s3_bucket.this.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

output "bucket_name" {
  value = aws_s3_bucket.this.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.this.arn
}
