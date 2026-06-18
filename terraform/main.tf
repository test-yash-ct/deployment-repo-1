terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "admin_cidr_blocks" {
  type        = list(string)
  description = "Trusted CIDR blocks for SSH breakglass access (e.g., VPN or corporate network)"
  default     = []
}

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
}

resource "aws_security_group" "app" {
  name        = "northwind-pay-app"
  description = "Application tier"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "SSH from trusted networks for breakglass"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.admin_cidr_blocks
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_s3_bucket" "billing_exports" {
  bucket = "northwind-pay-billing-exports-${var.aws_region}"
}

resource "aws_s3_bucket_public_access_block" "billing_exports" {
  bucket = aws_s3_bucket.billing_exports.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}
