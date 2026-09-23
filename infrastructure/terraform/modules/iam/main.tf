variable "role_name" {
  description = "IAM role name"
  type        = string
}

variable "environment" {
  type    = string
  default = "dev"
}

# MISCONFIGURATION: Overly permissive trust policy allowing any EC2 instance
resource "aws_iam_role" "scanner" {
  name = var.role_name

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action    = "sts:AssumeRole"
        Effect    = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# MISCONFIGURATION: Inline policy with wildcard permissions (should use managed policies with least-privilege)
resource "aws_iam_role_policy" "scanner_inline" {
  name = "${var.role_name}-policy"
  role = aws_iam_role.scanner.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # MISCONFIGURATION: Wildcard action (administrative access)
        Effect   = "Allow"
        Action   = "s3:*"
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = [
          "ec2:Describe*",
          "iam:Get*",
          "iam:List*",
          "rds:Describe*"
        ]
        Resource = "*"
      }
    ]
  })
}

# MISCONFIGURATION: Missing MFA condition for sensitive actions
resource "aws_iam_user" "service_account" {
  name = "${var.role_name}-svc-user"
  # No MFA enforcement
  # No access key rotation policy

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

output "role_arn" {
  value = aws_iam_role.scanner.arn
}

output "role_name" {
  value = aws_iam_role.scanner.name
}
