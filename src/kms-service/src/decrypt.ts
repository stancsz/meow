import { onRequest } from "firebase-functions/v2/https";
import { KeyManagementServiceClient } from "@google-cloud/kms";

const kmsClient = new KeyManagementServiceClient();

export const decrypt = onRequest(async (req, res) => {
  // Caller authentication is handled by GCP IAM at the Cloud Function level.

  // Parse request
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const { ciphertext } = req.body;
  if (!ciphertext || typeof ciphertext !== "string") {
    res.status(400).send("Bad Request: Missing or invalid 'ciphertext'");
    return;
  }

  const keyName = process.env.KMS_KEY_NAME;
  if (!keyName) {
    console.error("KMS_KEY_NAME environment variable not set.");
    res.status(500).send("Internal Server Error");
    return;
  }

  try {
    const [result] = await kmsClient.decrypt({
      name: keyName,
      ciphertext: Buffer.from(ciphertext, "base64"),
    });

    if (!result.plaintext) {
      throw new Error("Decryption failed: No plaintext returned");
    }

    const plaintext = Buffer.from(result.plaintext as Uint8Array | string).toString("utf8");

    res.status(200).json({
      plaintext,
    });
  } catch (error) {
    console.error("Error decrypting:", error);
    res.status(500).send("Internal Server Error");
  }
});
