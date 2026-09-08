export type CallStatus = 'idle' | 'ringing' | 'active' | 'ended' | 'failed';
export type CallType = 'audio' | 'video';
export type TransportMode = 'direct' | 'tor' | 'ble-mesh';
export interface QuantumCallSession {
    id: string;
    callerAddress: string;
    calleeAddress: string;
    type: CallType;
    status: CallStatus;
    transport: TransportMode;
    startedAt: number;
    endedAt?: number;
    durationSeconds: number;
    encryption: {
        x25519SharedSecret: string;
        mlKem768Ciphertext: string;
        mlKem768SharedSecret: string;
        hybridKey: string;
        ratchetStep: number;
    };
    signaling: {
        offer: string;
        answer: string;
        iceCandidates: string[];
    };
    pqSignature?: string;
}
export interface PeerInfo {
    walletAddress: string;
    publicKey: string;
    mlKem768PublicKey: string;
    torOnionAddress?: string;
    bleId?: string;
    isOnline: boolean;
    lastSeen: number;
}
export interface CallOffer {
    callId: string;
    caller: PeerInfo;
    callee: string;
    type: CallType;
    transport: TransportMode;
    offerSdp: string;
    hybridKeyOffer: string;
    mlDsa65Signature: string;
    timestamp: number;
}
export interface CallAnswer {
    callId: string;
    answerSdp: string;
    hybridKeyAnswer: string;
    mlDsa65Signature: string;
    timestamp: number;
}
export interface QuantumCallConfig {
    enableTor: boolean;
    enableBLE: boolean;
    enableBiometric: boolean;
    enableCoercionPIN: boolean;
    enableScreenshotDetection: boolean;
    enableBlurInRecents: boolean;
    autoLockSeconds: number;
    maxCallDurationSeconds: number;
}
export declare const DEFAULT_QUANTUM_CALL_CONFIG: QuantumCallConfig;
export declare class QuantumCall {
    private config;
    private sessions;
    private peers;
    private localKeyPair;
    private mlKemKeyPair;
    private activeCallId;
    private coercionPINHash;
    private currentWalletAddress;
    constructor(config?: Partial<QuantumCallConfig>);
    private generateX25519KeyPair;
    private generateMLKem768KeyPair;
    private deriveHybridKey;
    private signWithMLDSA65;
    bindWallet(walletAddress: string): void;
    getCurrentWallet(): string | null;
    registerPeer(peer: PeerInfo): void;
    getPeer(walletAddress: string): PeerInfo | undefined;
    getAllPeers(): PeerInfo[];
    getOnlinePeers(): PeerInfo[];
    initiateCall(calleeAddress: string, type?: CallType, transport?: TransportMode): QuantumCallSession | null;
    answerCall(callId: string): QuantumCallSession | null;
    endCall(callId: string): QuantumCallSession | null;
    ratchetKey(callId: string): string | null;
    getActiveCall(): QuantumCallSession | null;
    getCallHistory(): QuantumCallSession[];
    setCoercionPIN(pin: string): void;
    verifyCoercionPIN(pin: string): boolean;
    panicWipe(): {
        success: boolean;
        message: string;
    };
    updateConfig(updates: Partial<QuantumCallConfig>): void;
    getConfig(): QuantumCallConfig;
    getSecurityStatus(): {
        encryption: string;
        signatures: string;
        torEnabled: boolean;
        bleEnabled: boolean;
        biometricEnabled: boolean;
        coercionPINEnabled: boolean;
        screenshotDetection: boolean;
        blurInRecents: boolean;
        autoLockSeconds: number;
    };
}
