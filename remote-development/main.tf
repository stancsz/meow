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

  # Credentials from environment or ~/.env
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
  description = "Anthropic API Key for Claude Code"
  type        = string
  sensitive   = true
  default     = ""
}

# Static IP for the instance
resource "aws_lightsail_static_ip" "meow" {
  name = "meow-remote-dev"
}

# SSH key pair for access
resource "aws_lightsail_key_pair" "meow" {
  name = "meow-remote-dev-key"
}

# The Lightsail instance - larger bundle for continuous Claude Code
resource "aws_lightsail_instance" "meow" {
  name              = "meow-remote-dev"
  availability_zone = "us-east-1a"
  blueprint_id      = "ubuntu_22_04"
  bundle_id         = "large_2_0" # 4 GB RAM, 2 vCPUs - better for Claude Code
  key_pair_name      = aws_lightsail_key_pair.meow.key_name

  user_data = <<-EOF
      #!/bin/bash
      set -e
      exec > /var/log/user-data.log 2>&1

      echo "=== Meow Remote Dev Setup: $(date) ==="

      # Update system
      export DEBIAN_FRONTEND=noninteractive
      apt-get update -y
      apt-get upgrade -y

      # Install essentials
      apt-get install -y curl git unzip jq nginx certbot

      # Install bun
      if ! command -v bun &> /dev/null; then
        curl -fsSL https://bun.sh/install | bash
      fi
      export BUN_INSTALL="$HOME/.bun"
      export PATH="$BUN_INSTALL/bin:$PATH"

      # Install Claude Code
      npm install -g @anthropic-ai/claude-code

      # Create meow user for Claude Code
      id -u meow &>/dev/null || useradd -m -s /bin/bash meow
      mkdir -p /home/meow
      chown -R meow:meow /home/meow

      # Prepare project directory
      mkdir -p /home/meow/meow
      chown -R meow:meow /home/meow/meow

      # Create systemd service for continuous Claude Code
      cat > /etc/systemd/system/meow.service << 'SERVICE'
      [Unit]
      Description=Meow - Claude Code Agent (Continuous Training Loop)
      After=network.target

      [Service]
      Type=simple
      User=meow
      WorkingDirectory=/home/meow/meow
      Environment="PATH=/home/meow/.bun/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin"
      Environment="ANTHROPIC_API_KEY=${var.anthropic_api_key}"
      ExecStart=/home/meow/.bun/bin/bun run /home/meow/meow/remote-development/scripts/linux/train.sh
      Restart=always
      RestartSec=10
      StandardOutput=append:/var/log/meow/output.log
      StandardError=append:/var/log/meow/error.log

      [Install]
      WantedBy=multi-user.target
      SERVICE

      # Ensure meow owns the service
      chmod 644 /etc/systemd/system/meow.service

      # Create log directory
      mkdir -p /var/log/meow
      chown meow:meow /var/log/meow

      # Enable and start the service
      systemctl daemon-reload
      systemctl enable meow
      systemctl start meow

      echo "=== Meow Setup Complete at $(date) ==="
      echo "Logs: journalctl -u meow -f"
      echo "Status: systemctl status meow"
      EOF
}

# Allow SSH access
resource "aws_lightsail_instance_public_ports" "meow" {
  instance_name = aws_lightsail_instance.meow.name

  port_info {
    protocol  = "tcp"
    from_port = 22
    to_port   = 22
  }
}

# Output connection info
output "static_ip" {
  value       = aws_lightsail_static_ip.meow.ip_address
  description = "Public IP address of the Meow server"
}

output "ssh_command" {
  value       = "ssh -i ~/.ssh/meow.pem ubuntu@${aws_lightsail_static_ip.meow.ip_address}"
  description = "Command to SSH into the server"
}

output "meow_status" {
  value       = "ssh -i ~/.ssh/meow.pem ubuntu@${aws_lightsail_static_ip.meow.ip_address} 'sudo systemctl status meow'"
  description = "Command to check Meow service status"
}

output "meow_logs" {
  value       = "ssh -i ~/.ssh/meow.pem ubuntu@${aws_lightsail_static_ip.meow.ip_address} 'sudo journalctl -u meow -f --lines=50'"
  description = "Command to tail Meow logs"
}

output "ssh_key_file" {
  value       = "~/.ssh/meow-remote-dev-key.pem"
  description = "Path to download the private SSH key"
}
