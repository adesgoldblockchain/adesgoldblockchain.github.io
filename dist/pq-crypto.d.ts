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
export declare class PQCrypto {
    static readonly ALGORITHM = "XMSS-SHA2-256";
    private static readonly HASH_BRANCHES;
    private static readonly HASH_DEPTH;
    private static readonly HASH_ITERATIONS;
    private static deriveSeed;
    private static wotsHash;
    static generateKeyPair(seed?: string): PQKeyPair;
    static sign(message: string, privateKey: PQPrivKey): SignedMessage;
    static verify(signed: SignedMessage): boolean;
    static keyExchange(privateKey: PQPrivKey, publicKey: PQPubKey): PQSharedSecret;
    static encrypt(message: string, sharedSecret: PQSharedSecret): string;
    static decrypt(encrypted: string, sharedSecret: PQSharedSecret): string;
    static hash(message: string): string;
    static commitment(value: number, blindingFactor: string): string;
    static verifyCommitment(value: number, blindingFactor: string, expectedCommitment: string): boolean;
}
