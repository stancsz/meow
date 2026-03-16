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

# Cloud Storage Bucket for Cloud Function Source Code
resource "google_storage_bucket" "function_source_bucket" {
  name     = "${var.project_id}-gcf-source"
  location = var.region

  uniform_bucket_level_access = true
}

# Archive the source code for Orchestrator
data "archive_file" "orchestrator_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../src/core"
  output_path = "${path.module}/../src/orchestrator.zip"
  excludes    = ["node_modules", "lib"]
}

# Upload the Orchestrator zip to the bucket
resource "google_storage_bucket_object" "orchestrator_zip" {
  name   = "orchestrator-${data.archive_file.orchestrator_zip.output_md5}.zip"
  bucket = google_storage_bucket.function_source_bucket.name
  source = data.archive_file.orchestrator_zip.output_path
}

# Archive the source code for Worker
data "archive_file" "worker_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../src/workers"
  output_path = "${path.module}/../src/worker.zip"
  excludes    = ["node_modules", "lib"]
}

# Upload the Worker zip to the bucket
resource "google_storage_bucket_object" "worker_zip" {
  name   = "worker-${data.archive_file.worker_zip.output_md5}.zip"
  bucket = google_storage_bucket.function_source_bucket.name
  source = data.archive_file.worker_zip.output_path
}

# Orchestrator Function
resource "google_cloudfunctions2_function" "orchestrator_function" {
  name        = "orchestrator"
  location    = var.region
  description = "SimpleClaw Orchestrator Function"

  build_config {
    runtime     = "nodejs20"
    entry_point = "orchestrator" # Make sure this matches your exported handler
    source {
      storage_source {
        bucket = google_storage_bucket.function_source_bucket.name
        object = google_storage_bucket_object.orchestrator_zip.name
      }
    }
  }

  service_config {
    max_instance_count = 10
    min_instance_count = 1 # Pre-warmed as per SWARM_SPEC.md §15.4
    available_memory   = "256M"
    timeout_seconds    = 540 # ~9 minutes as per SWARM_SPEC.md

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

# Worker Function Template
resource "google_cloudfunctions2_function" "worker_function" {
  name        = "worker-template"
  location    = var.region
  description = "SimpleClaw Worker Function Template"

  build_config {
    runtime     = "nodejs20"
    entry_point = "worker" # Make sure this matches your exported handler
    source {
      storage_source {
        bucket = google_storage_bucket.function_source_bucket.name
        object = google_storage_bucket_object.worker_zip.name
      }
    }
  }

  service_config {
    max_instance_count = 100
    available_memory   = "512M"
    timeout_seconds    = 60 # Shorter timeout for workers

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

output "orchestrator_function_uri" {
  value = google_cloudfunctions2_function.orchestrator_function.service_config[0].uri
}

output "worker_function_uri" {
  value = google_cloudfunctions2_function.worker_function.service_config[0].uri
}
# Enable the Cloud KMS API
resource "google_project_service" "kms" {
  project            = var.project_id
  service            = "cloudkms.googleapis.com"
  disable_on_destroy = false
}

# Create the KMS Key Ring
resource "google_kms_key_ring" "swarms_user_keys" {
  name     = "swarms-user-keys"
  location = var.region
  project  = var.project_id

  depends_on = [google_project_service.kms]
}

# Create the symmetric encryption key
resource "google_kms_crypto_key" "supabase_service_role_key" {
  name     = "supabase-service-role-key"
  key_ring = google_kms_key_ring.swarms_user_keys.id
  purpose  = "ENCRYPT_DECRYPT"

  # Rotate key every 90 days
  rotation_period = "7776000s"
}

# Create a dedicated service account for the Cloud Functions
resource "google_service_account" "kms_functions_sa" {
  account_id   = "kms-functions-sa"
  display_name = "Service Account for KMS Encrypt/Decrypt Functions"
  project      = var.project_id
}

# Grant the service account permissions to encrypt and decrypt using the key
resource "google_kms_crypto_key_iam_member" "crypto_key_encrypter_decrypter" {
  crypto_key_id = google_kms_crypto_key.supabase_service_role_key.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:${google_service_account.kms_functions_sa.email}"
}

# Outputs
output "kms_key_ring_name" {
  description = "The name of the KMS key ring"
  value       = google_kms_key_ring.swarms_user_keys.name
}

output "kms_key_ring_location" {
  description = "The location of the KMS key ring"
  value       = google_kms_key_ring.swarms_user_keys.location
}

output "kms_crypto_key_name" {
  description = "The name of the KMS crypto key"
  value       = google_kms_crypto_key.supabase_service_role_key.name
}

output "kms_crypto_key_id" {
  description = "The full resource ID of the KMS crypto key"
  value       = google_kms_crypto_key.supabase_service_role_key.id
}

output "kms_functions_service_account_email" {
  description = "The email of the service account for the KMS functions"
  value       = google_service_account.kms_functions_sa.email
}
