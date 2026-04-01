# Google Cloud Provider Configuration
provider "google" {
  project = var.project_id
  region  = var.region
}

# Variable Definitions
variable "project_id" {
  description = "The ID of the project in which to create resources."
  type        = string
}

variable "region" {
  description = "The region in which to create resources."
  type        = string
  default     = "us-central1" # Free tier eligible: us-west1, us-central1, us-east1
}

variable "zone" {
  description = "The zone in which to create resources."
  type        = string
  default     = "us-central1-a"
}

# Network Configuration
resource "google_compute_network" "vpc_network" {
  name = "simpleclaw-network"
}

resource "google_compute_firewall" "default" {
  name    = "allow-http-https"
  network = google_compute_network.vpc_network.name

  allow {
    protocol = "tcp"
    ports    = ["80", "443", "3000", "22"]
  }

  source_ranges = ["0.0.0.0/0"]
}

# Compute Instance (E2-Micro is Free Tier eligible)
resource "google_compute_instance" "vm_instance" {
  name         = "simpleclaw-app"
  machine_type = "e2-micro" # 2 vCPU, 1GB RAM (Free Tier)
  zone         = var.zone

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
      size  = 30 # 30GB is the Free Tier limit
      type  = "pd-standard"
    }
  }

  network_interface {
    network = google_compute_network.vpc_network.name
    access_config {
      # Ephemeral IP
    }
  }

  metadata_startup_script = <<-EOF
    #!/bin/bash
    sudo apt-get update
    sudo apt-get install -y docker.io docker-compose
    sudo systemctl start docker
    sudo systemctl enable docker
    # Setup SWAP (Crucial for e2-micro with only 1GB RAM)
    sudo fallocate -l 2G /swapfile
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  EOF

  tags = ["http-server", "https-server"]
}

# Cloud Storage Bucket for Cloud Function Source Code
resource "google_storage_bucket" "function_source_bucket" {
  name     = "${var.project_id}-gcf-source"
  location = var.region

  uniform_bucket_level_access = true
}

# Archive the source code
data "archive_file" "kms_service_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../src/kms-service"
  output_path = "${path.module}/../src/kms-service.zip"
  excludes    = ["node_modules", "lib"]
}

# Upload the zip to the bucket
resource "google_storage_bucket_object" "kms_service_zip" {
  name   = "kms-service-${data.archive_file.kms_service_zip.output_md5}.zip"
  bucket = google_storage_bucket.function_source_bucket.name
  source = data.archive_file.kms_service_zip.output_path
}

# Encrypt Function
resource "google_cloudfunctions2_function" "encrypt_function" {
  name        = "encrypt"
  location    = var.region
  description = "KMS Encrypt Function"

  build_config {
    runtime     = "nodejs20"
    entry_point = "encrypt"
    source {
      storage_source {
        bucket = google_storage_bucket.function_source_bucket.name
        object = google_storage_bucket_object.kms_service_zip.name
      }
    }
  }

  service_config {
    max_instance_count = 10
    available_memory   = "256M"
    timeout_seconds    = 60

    # Use the dedicated KMS service account
    service_account_email = google_service_account.kms_functions_sa.email

    environment_variables = {
      KMS_KEY_NAME = google_kms_crypto_key.supabase_service_role_key.id
    }
  }

  depends_on = [
    google_kms_crypto_key_iam_member.crypto_key_encrypter_decrypter
  ]
}

# Decrypt Function
resource "google_cloudfunctions2_function" "decrypt_function" {
  name        = "decrypt"
  location    = var.region
  description = "KMS Decrypt Function"

  build_config {
    runtime     = "nodejs20"
    entry_point = "decrypt"
    source {
      storage_source {
        bucket = google_storage_bucket.function_source_bucket.name
        object = google_storage_bucket_object.kms_service_zip.name
      }
    }
  }

  service_config {
    max_instance_count = 10
    available_memory   = "256M"
    timeout_seconds    = 60

    # Use the dedicated KMS service account
    service_account_email = google_service_account.kms_functions_sa.email

    environment_variables = {
      KMS_KEY_NAME = google_kms_crypto_key.supabase_service_role_key.id
    }
  }

  depends_on = [
    google_kms_crypto_key_iam_member.crypto_key_encrypter_decrypter
  ]
}

output "instance_ip" {
  value = google_compute_instance.vm_instance.network_interface[0].access_config[0].nat_ip
}

output "encrypt_function_uri" {
  value = google_cloudfunctions2_function.encrypt_function.service_config[0].uri
}

output "decrypt_function_uri" {
  value = google_cloudfunctions2_function.decrypt_function.service_config[0].uri
}
