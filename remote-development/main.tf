terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = "us-east-1"

  skip_credentials_validation = true
  skip_requesting_account_id   = true
  skip_metadata_api_check       = true
  access_key                  = var.aws_access_key
  secret_key                  = var.aws_secret_key
}

variable "aws_access_key" {
  description = "AWS Access Key ID"
  type        = string
  sensitive   = true
}

variable "aws_secret_key" {
  description = "AWS Secret Access Key"
  type        = string
  sensitive   = true
}

variable "anthropic_api_key" {
  description = "Anthropic API Key"
  type        = string
  sensitive   = true
}

variable "github_pat" {
  description = "GitHub Personal Access Token"
  type        = string
  sensitive   = true
}

variable "github_username" {
  description = "GitHub Username"
  type        = string
  default     = "stancsz"
}

variable "minimax_base_url" {
  description = "MiniMax API Base URL"
  type        = string
  default     = "https://api.minimax.io/anthropic"
}

# Static IP (IPv4)
resource "aws_lightsail_static_ip" "meow" {
  name = "meow-remote-dev-01"
}

# SSH key pair
resource "aws_lightsail_key_pair" "meow" {
  name = "meow-remote-dev-02-key"
}

# The Lightsail instance - medium bundle (4 GB RAM, 2 vCPUs)
resource "aws_lightsail_instance" "meow" {
  name              = "meow-remote-dev-02"
  availability_zone = "us-east-1a"
  blueprint_id      = "ubuntu_22_04"
  bundle_id         = "medium_2_0" # 4 GB RAM, 2 vCPUs
  key_pair_name      = aws_lightsail_key_pair.meow.name
  user_data         = templatefile("${path.module}/user_data.tftpl", {
    anthropic_api_key = var.anthropic_api_key
    github_pat        = var.github_pat
    github_username   = var.github_username
    minimax_base_url  = var.minimax_base_url
  })
}

# Allow SSH
resource "aws_lightsail_instance_public_ports" "meow" {
  instance_name = aws_lightsail_instance.meow.name

  port_info {
    protocol  = "tcp"
    from_port = 22
    to_port   = 22
  }
}

output "static_ip" {
  value       = aws_lightsail_static_ip.meow.ip_address
  description = "Public IPv4 address"
}

output "ssh_command" {
  value       = "ssh -i ~/.ssh/meow-remote-dev-02-key.pem ubuntu@${aws_lightsail_static_ip.meow.ip_address}"
  description = "SSH command to connect"
}

output "meow_status" {
  value       = "ssh -i ~/.ssh/meow-remote-dev-key.pem ubuntu@${aws_lightsail_static_ip.meow.ip_address} 'sudo systemctl status meow'"
  description = "Check Meow service status"
}

output "meow_logs" {
  value       = "ssh -i ~/.ssh/meow-remote-dev-key.pem ubuntu@${aws_lightsail_static_ip.meow.ip_address} 'sudo journalctl -u meow -f --lines=50'"
  description = "Tail Meow logs"
}
