variable "instance_name" {
  description = "EC2 instance name"
  type        = string
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "instance_type" {
  type    = string
  default = "t3.small"
}

variable "allow_ssh_from_internet" {
  description = "Allow SSH (port 22) from 0.0.0.0/0 — DANGEROUS"
  type        = bool
  default     = true  # MISCONFIGURATION: should be false
}

# MISCONFIGURATION: Security group allows unrestricted inbound on SSH and RDP
resource "aws_security_group" "worker_sg" {
  name        = "${var.instance_name}-sg"
  description = "Security group for ${var.instance_name}"

  ingress {
    # MISCONFIGURATION: SSH open to world
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.allow_ssh_from_internet ? ["0.0.0.0/0"] : []
    description = "SSH access"
  }

  ingress {
    # MISCONFIGURATION: RDP open to world
    from_port   = 3389
    to_port     = 3389
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "RDP access"
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
    description = "HTTPS"
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

resource "aws_instance" "worker" {
  ami           = "ami-0c55b159cbfafe1f0"  # Amazon Linux 2 us-east-1
  instance_type = var.instance_type

  associate_public_ip_address = true  # MISCONFIGURATION: should be evaluated per use case

  vpc_security_group_ids = [aws_security_group.worker_sg.id]

  # MISCONFIGURATION: EBS volume not encrypted
  root_block_device {
    volume_type = "gp3"
    volume_size = 20
    encrypted   = false  # MISCONFIGURATION: should be true
  }

  tags = {
    Name        = var.instance_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

output "instance_id" {
  value = aws_instance.worker.id
}

output "security_group_id" {
  value = aws_security_group.worker_sg.id
}
