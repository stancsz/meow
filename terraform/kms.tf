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
  name            = "supabase-service-role-key"
  key_ring        = google_kms_key_ring.swarms_user_keys.id
  purpose         = "ENCRYPT_DECRYPT"

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
