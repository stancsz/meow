import { KMSProvider } from "../../src/security/kms.ts";

export class MockKMSProvider implements KMSProvider {
  async encrypt(plaintext: string): Promise<string> {
    return `mock_encrypted_${plaintext}`;
  }

  async decrypt(ciphertext: string): Promise<string> {
    if (ciphertext.startsWith("mock_encrypted_")) {
      return ciphertext.replace("mock_encrypted_", "");
    }
    return ciphertext;
  }
}
