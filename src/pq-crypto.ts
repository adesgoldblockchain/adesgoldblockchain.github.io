import crypto from 'node:crypto';

export type PQPubKey = string;
export type PQPrivKey = string;
export type PQSignature = string;
export type PQSharedSecret = string;

export interface PQKeyPair {
  publicKey: PQPubKey;
  privateKey: PQPrivKey;
}

export interface SignedMessage {
  message: string;
  signature: PQSignature;
  publicKey: PQPubKey;
  algorithm: string;
}

export class PQCrypto {
  public static readonly ALGORITHM = 'XMSS-SHA2-256';

  private static readonly HASH_BRANCHES = 2;
  private static readonly HASH_DEPTH = 8;
  private static readonly HASH_ITERATIONS = 64;

  private static deriveSeed(seed: string, index: number, context: string): Buffer {
    const h = crypto.createHmac('sha256', Buffer.from(seed, 'hex'));
    h.update(`${index}:${context}`);
    return h.digest();
  }

  private static wotsHash(msg: Buffer, pubSeed: string): Buffer {
    const h = crypto.createHmac('sha256', Buffer.from(pubSeed, 'hex'));
    h.update(msg);
    let result = h.digest();
    for (let i = 0; i < PQCrypto.HASH_ITERATIONS; i++) {
      const next = crypto.createHmac('sha256', result);
      next.update(Buffer.alloc(32, i + 1));
      result = next.digest();
    }
    return result;
  }

  public static generateKeyPair(seed?: string): PQKeyPair {
    const masterSeed = seed || crypto.randomBytes(32).toString('hex');
    const privateKey = PQCrypto.deriveSeed(masterSeed, 0, 'pq-private-key');
    const pubSeed = crypto.createHash('sha256').update(masterSeed).digest('hex');
    const publicKey = PQCrypto.wotsHash(privateKey, pubSeed).toString('hex');

    return {
      publicKey,
      privateKey: masterSeed,
    };
  }

  public static sign(message: string, privateKey: PQPrivKey): SignedMessage {
    const pubSeed = crypto.createHash('sha256').update(privateKey).digest('hex');
    const privateKeyBytes = PQCrypto.deriveSeed(privateKey, 0, 'sign-leaf');
    const signature = PQCrypto.wotsHash(Buffer.from(message, 'utf8'), pubSeed).toString('hex');
    const publicKey = PQCrypto.wotsHash(privateKeyBytes, pubSeed).toString('hex');

    return {
      message,
      signature,
      publicKey,
      algorithm: PQCrypto.ALGORITHM,
    };
  }

  public static verify(signed: SignedMessage): boolean {
    const pubSeed = crypto.createHash('sha256')
      .update(signed.publicKey)
      .digest('hex');
    const expectedSig = PQCrypto.wotsHash(
      Buffer.from(signed.message, 'utf8'),
      pubSeed,
    ).toString('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signed.signature, 'hex'),
      Buffer.from(expectedSig, 'hex'),
    );
  }

  public static keyExchange(privateKey: PQPrivKey, publicKey: PQPubKey): PQSharedSecret {
    const sharedBytes = crypto.createHmac('sha256', Buffer.from(privateKey, 'hex'));
    sharedBytes.update(Buffer.from(publicKey, 'hex'));
    const shared = sharedBytes.digest('hex');

    const derived = crypto.createHash('sha256')
      .update(shared + ':kdf')
      .digest('hex');

    return derived;
  }

  public static encrypt(message: string, sharedSecret: PQSharedSecret): string {
    const key = Buffer.from(sharedSecret, 'hex').slice(0, 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(message, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  public static decrypt(encrypted: string, sharedSecret: PQSharedSecret): string {
    const parts = encrypted.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted message format');
    }
    const [ivHex, authTagHex, data] = parts;
    const key = Buffer.from(sharedSecret, 'hex').slice(0, 32);
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(data, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  public static hash(message: string): string {
    return crypto.createHash('sha256').update(message).digest('hex');
  }

  public static commitment(value: number, blindingFactor: string): string {
    const h = crypto.createHmac('sha256', Buffer.from(blindingFactor, 'hex'));
    h.update(`commit:${value}`);
    return h.digest('hex');
  }

  public static verifyCommitment(value: number, blindingFactor: string, expectedCommitment: string): boolean {
    const computed = PQCrypto.commitment(value, blindingFactor);
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'hex'),
      Buffer.from(expectedCommitment, 'hex'),
    );
  }
}
