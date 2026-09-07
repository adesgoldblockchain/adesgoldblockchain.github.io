import crypto from 'node:crypto';
import { PQCrypto } from './pq-crypto.js';

export interface StealthKeyPair {
  scanPublicKey: string;
  scanPrivateKey: string;
  spendPublicKey: string;
  spendPrivateKey: string;
}

export interface StealthAddress {
  address: string;
  ephemeralPrivateKey: string;
  sharedSecret: string;
}

export interface ConfidentialTx {
  txId: string;
  commitments: string[];
  blindingFactors: string[];
  proof: string;
  outputs: PaymentOutput[];
  timestamp: number;
}

export interface PaymentOutput {
  commitment: string;
  stealthAddress: string;
  proof: string;
}

export interface RangeProof {
  commitment: string;
  proof: string;
  bitLength: number;
}

export class PrivacyManager {
  private readonly PREFIX: string = 'adg1priv';

  generateStealthKeyPair(seed?: string): StealthKeyPair {
    const masterSeed = seed || crypto.randomBytes(32).toString('hex');

    const scanKey = crypto.createHash('sha256').update(masterSeed + ':scan').digest('hex');
    const spendKey = crypto.createHash('sha256').update(masterSeed + ':spend').digest('hex');

    const scanPub = crypto.createHash('sha256').update(scanKey).digest('hex');
    const spendPub = crypto.createHash('sha256').update(spendKey).digest('hex');

    return {
      scanPublicKey: scanPub,
      scanPrivateKey: scanKey,
      spendPublicKey: spendPub,
      spendPrivateKey: spendKey,
    };
  }

  createStealthAddress(
    receiverScanPub: string,
    receiverSpendPub: string,
  ): StealthAddress {
    const ephemeralKey = crypto.randomBytes(32).toString('hex');
    const sharedSecret = PQCrypto.keyExchange(ephemeralKey, receiverScanPub);
    const address = this.deriveStealthAddress(sharedSecret, receiverSpendPub);
    const ephemeralPrivateKey = this.deriveEphemeralPrivateKey(
      ephemeralKey,
      receiverScanPub,
    );

    return {
      address,
      ephemeralPrivateKey,
      sharedSecret,
    };
  }

  private deriveStealthAddress(
    sharedSecret: string,
    spendPub: string,
  ): string {
    const h = crypto.createHmac('sha256', Buffer.from(sharedSecret, 'hex'));
    h.update(Buffer.from(spendPub, 'hex'));
    const derived = h.digest('hex');
    return `${this.PREFIX}${derived.slice(0, 32)}`;
  }

  private deriveEphemeralPrivateKey(
    ephemeralKey: string,
    receiverScanPub: string,
  ): string {
    const h = crypto.createHmac('sha256', Buffer.from(ephemeralKey, 'hex'));
    h.update(Buffer.from(receiverScanPub, 'hex'));
    return h.digest('hex');
  }

  scanForOutputs(
    tx: ConfidentialTx,
    scanPrivateKey: string,
    spendPrivateKey: string,
  ): PaymentOutput[] {
    const matched: PaymentOutput[] = [];

    for (const output of tx.outputs) {
      const sharedSecret = PQCrypto.keyExchange(scanPrivateKey, output.stealthAddress);
      const expectedAddress = this.deriveStealthAddress(sharedSecret, spendPrivateKey);

      if (expectedAddress === output.stealthAddress) {
        matched.push(output);
      }
    }

    return matched;
  }

  createCommitment(value: number, blindingFactor?: string): {
    commitment: string;
    blindingFactor: string;
  } {
    const factor = blindingFactor || crypto.randomBytes(32).toString('hex');
    const commitment = PQCrypto.commitment(value, factor);
    return { commitment, blindingFactor: factor };
  }

  createRangeProof(value: number, blindingFactor: string): RangeProof {
    const commitment = PQCrypto.commitment(value, blindingFactor);
    const proofInput = `${value}:${blindingFactor}`;
    const proof = crypto
      .createHash('sha256')
      .update(proofInput)
      .digest('hex');

    return {
      commitment,
      proof,
      bitLength: 64,
    };
  }

  verifyRangeProof(proof: RangeProof): boolean {
    const recomputedCommitment = proof.commitment;
    const proofHash = crypto
      .createHash('sha256')
      .update(recomputedCommitment + ':' + proof.bitLength)
      .digest('hex');

    return proof.proof.startsWith(proofHash.slice(0, 16));
  }

  createConfidentialTransaction(
    outputs: number[],
  ): ConfidentialTx {
    const commitments: string[] = [];
    const blindingFactors: string[] = [];
    const paymentOutputs: PaymentOutput[] = [];

    for (const amount of outputs) {
      const { commitment, blindingFactor } = this.createCommitment(amount);
      const rangeProof = this.createRangeProof(amount, blindingFactor);

      commitments.push(commitment);
      blindingFactors.push(blindingFactor);

      paymentOutputs.push({
        commitment,
        stealthAddress: `${this.PREFIX}0000000000000000000000000000000000`,
        proof: rangeProof.proof,
      });
    }

    const txId = crypto
      .createHash('sha256')
      .update(commitments.join('') + Date.now().toString())
      .digest('hex');

    return {
      txId,
      commitments,
      blindingFactors,
      proof: txId,
      outputs: paymentOutputs,
      timestamp: Date.now(),
    };
  }

  verifyConfidentialTransaction(
    tx: ConfidentialTx,
    inputs: number[],
    inputBlindingFactors: string[],
  ): boolean {
    const inputSum = inputs.reduce((sum, v) => sum + v, 0);

    for (let i = 0; i < inputBlindingFactors.length; i++) {
      const proof = this.createRangeProof(inputs[i], inputBlindingFactors[i]);
      if (!this.verifyRangeProof(proof)) return false;
    }

    for (let i = 0; i < tx.commitments.length; i++) {
      if (!tx.blindingFactors[i]) return false;
      const expected = PQCrypto.commitment(inputs[i] || 0, tx.blindingFactors[i]);
      if (expected !== tx.commitments[i]) return false;
    }

    return inputSum >= tx.outputs.length;
  }

  generateRingSignature(
    signerIndex: number,
    message: string,
    publicKeys: string[],
  ): string {
    const keyPair = PQCrypto.generateKeyPair(message + signerIndex.toString());
    const signatures: string[] = [];

    for (let i = 0; i < publicKeys.length; i++) {
      if (i === signerIndex) {
        const signed = PQCrypto.sign(message, keyPair.privateKey);
        signatures.push(signed.signature);
      } else {
        signatures.push(crypto.randomBytes(32).toString('hex'));
      }
    }

    return signatures.join(':');
  }

  verifyRingSignature(
    message: string,
    signature: string,
    publicKeys: string[],
  ): boolean {
    const sigs = signature.split(':');
    if (sigs.length !== publicKeys.length) return false;

    let verifiedCount = 0;
    for (let i = 0; i < publicKeys.length; i++) {
      const signed: any = {
        message,
        signature: sigs[i],
        publicKey: publicKeys[i],
        algorithm: PQCrypto.ALGORITHM,
      };
      if (PQCrypto.verify(signed)) verifiedCount++;
    }

    return verifiedCount >= 1;
  }

  generateStealthPayment(
    receiverScanPub: string,
    receiverSpendPub: string,
    amount: number,
  ): { tx: ConfidentialTx; paymentOutput: PaymentOutput } {
    const stealthAddr = this.createStealthAddress(receiverScanPub, receiverSpendPub);
    const { commitment, blindingFactor } = this.createCommitment(amount);
    const rangeProof = this.createRangeProof(amount, blindingFactor);

    const paymentOutput: PaymentOutput = {
      commitment,
      stealthAddress: stealthAddr.address,
      proof: rangeProof.proof,
    };

    const tx = this.createConfidentialTransaction([amount]);
    tx.outputs = [paymentOutput];

    return { tx, paymentOutput };
  }
}
