export interface MockKMSProvider {
  encrypt(plaintext: string): Promise<string>;
  decrypt(ciphertext: string): Promise<string>;
}

export class MockGCPKMS implements MockKMSProvider {
  private prefix = 'mock-kms-encrypted:';
  private shouldFailDecryption = false;

  async encrypt(plaintext: string): Promise<string> {
    // In a real environment, this calls GCP Cloud KMS
    return Buffer.from(this.prefix + plaintext).toString('base64');
  }

  async decrypt(ciphertext: string): Promise<string> {
    if (this.shouldFailDecryption) {
      throw new Error('KMS Decryption failed: invalid key or permission denied');
    }
    // In a real environment, this calls GCP Cloud KMS
    const decoded = Buffer.from(ciphertext, 'base64').toString('utf-8');
    if (!decoded.startsWith(this.prefix)) {
      throw new Error('Invalid mock ciphertext format');
    }
    return decoded.substring(this.prefix.length);
  }

  simulateFailure(shouldFail: boolean) {
    this.shouldFailDecryption = shouldFail;
  }
}
