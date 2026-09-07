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
export declare class PrivacyManager {
    private readonly PREFIX;
    generateStealthKeyPair(seed?: string): StealthKeyPair;
    createStealthAddress(receiverScanPub: string, receiverSpendPub: string): StealthAddress;
    private deriveStealthAddress;
    private deriveEphemeralPrivateKey;
    scanForOutputs(tx: ConfidentialTx, scanPrivateKey: string, spendPrivateKey: string): PaymentOutput[];
    createCommitment(value: number, blindingFactor?: string): {
        commitment: string;
        blindingFactor: string;
    };
    createRangeProof(value: number, blindingFactor: string): RangeProof;
    verifyRangeProof(proof: RangeProof): boolean;
    createConfidentialTransaction(outputs: number[]): ConfidentialTx;
    verifyConfidentialTransaction(tx: ConfidentialTx, inputs: number[], inputBlindingFactors: string[]): boolean;
    generateRingSignature(signerIndex: number, message: string, publicKeys: string[]): string;
    verifyRingSignature(message: string, signature: string, publicKeys: string[]): boolean;
    generateStealthPayment(receiverScanPub: string, receiverSpendPub: string, amount: number): {
        tx: ConfidentialTx;
        paymentOutput: PaymentOutput;
    };
}
