import { onRequest } from "firebase-functions/v2/https";
import { KeyManagementServiceClient } from "@google-cloud/kms";

const kmsClient = new KeyManagementServiceClient();

export const encrypt = onRequest(async (req, res) => {
  // Caller authentication is handled by GCP IAM at the Cloud Function level.

  // Parse request
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const { plaintext } = req.body;
  if (!plaintext || typeof plaintext !== "string") {
    res.status(400).send("Bad Request: Missing or invalid 'plaintext'");
    return;
  }

  const keyName = process.env.KMS_KEY_NAME;
  if (!keyName) {
    console.error("KMS_KEY_NAME environment variable not set.");
    res.status(500).send("Internal Server Error");
    return;
  }

  try {
    const [result] = await kmsClient.encrypt({
      name: keyName,
      plaintext: Buffer.from(plaintext).toString("base64"),
    });

    if (!result.ciphertext) {
      throw new Error("Encryption failed: No ciphertext returned");
    }

    const ciphertext = Buffer.from(result.ciphertext as Uint8Array | string).toString("base64");
    // Some KMS encrypt calls return the used key version name
    const keyVersion = result.name || "unknown";

    res.status(200).json({
      ciphertext,
      keyVersion,
    });
  } catch (error) {
    console.error("Error encrypting:", error);
    res.status(500).send("Internal Server Error");
  }
});
