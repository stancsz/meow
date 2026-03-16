#!/bin/bash
set -e

# Configuration
# Read URLs from terraform output or use arguments
ENCRYPT_URL=${1:-"$(cd terraform && terraform output -raw encrypt_function_uri 2>/dev/null || echo "")"}
DECRYPT_URL=${2:-"$(cd terraform && terraform output -raw decrypt_function_uri 2>/dev/null || echo "")"}
PLAINTEXT="test-secret-value-123"

if [ -z "$ENCRYPT_URL" ] || [ -z "$DECRYPT_URL" ]; then
  echo "Error: Could not determine function URLs."
  echo "Usage: $0 [ENCRYPT_URL] [DECRYPT_URL]"
  exit 1
fi

# Fetch Google Cloud Identity Token for authentication
if ! command -v gcloud &> /dev/null; then
    echo "Error: gcloud CLI is not installed."
    exit 1
fi
echo "Fetching GCP Identity Token..."
AUTH_TOKEN=$(gcloud auth print-identity-token)

if [ -z "$AUTH_TOKEN" ]; then
  echo "Error: Could not obtain GCP Identity Token. Are you authenticated with 'gcloud auth login'?"
  exit 1
fi

echo "--- KMS Flow Test ---"
echo "Original Plaintext: $PLAINTEXT"
echo "Encrypt URL: $ENCRYPT_URL"
echo "Decrypt URL: $DECRYPT_URL"
echo "---------------------"

# 1. Encrypt
echo -e "\n1. Testing Encrypt Endpoint..."
ENCRYPT_RESPONSE=$(curl -s -X POST "$ENCRYPT_URL" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"plaintext\": \"$PLAINTEXT\"}")

if ! echo "$ENCRYPT_RESPONSE" | grep -q "ciphertext"; then
  echo "❌ Encryption failed. Response:"
  echo "$ENCRYPT_RESPONSE"
  exit 1
fi

# Extract ciphertext (assuming simple JSON, using basic sed/grep)
CIPHERTEXT=$(echo "$ENCRYPT_RESPONSE" | grep -o '"ciphertext":"[^"]*' | cut -d'"' -f4)
KEY_VERSION=$(echo "$ENCRYPT_RESPONSE" | grep -o '"keyVersion":"[^"]*' | cut -d'"' -f4)

echo "✅ Encryption successful!"
echo "Ciphertext length: ${#CIPHERTEXT}"
echo "Key Version: $KEY_VERSION"

# 2. Decrypt
echo -e "\n2. Testing Decrypt Endpoint..."
DECRYPT_RESPONSE=$(curl -s -X POST "$DECRYPT_URL" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"ciphertext\": \"$CIPHERTEXT\"}")

if ! echo "$DECRYPT_RESPONSE" | grep -q "plaintext"; then
  echo "❌ Decryption failed. Response:"
  echo "$DECRYPT_RESPONSE"
  exit 1
fi

RETURNED_PLAINTEXT=$(echo "$DECRYPT_RESPONSE" | grep -o '"plaintext":"[^"]*' | cut -d'"' -f4)

# 3. Validate
echo -e "\n3. Validating Round-trip..."
if [ "$PLAINTEXT" = "$RETURNED_PLAINTEXT" ]; then
  echo "✅ Success: Returned plaintext matches original!"
else
  echo "❌ Error: Mismatch!"
  echo "Expected: $PLAINTEXT"
  echo "Got:      $RETURNED_PLAINTEXT"
  exit 1
fi

echo -e "\n🎉 KMS Flow Phase 0 Test Complete."
