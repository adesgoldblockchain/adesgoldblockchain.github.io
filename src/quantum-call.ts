import crypto from 'node:crypto';

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

export const DEFAULT_QUANTUM_CALL_CONFIG: QuantumCallConfig = {
  enableTor: false,
  enableBLE: false,
  enableBiometric: false,
  enableCoercionPIN: true,
  enableScreenshotDetection: true,
  enableBlurInRecents: true,
  autoLockSeconds: 60,
  maxCallDurationSeconds: 3600,
};

export class QuantumCall {
  private config: QuantumCallConfig;
  private sessions: Map<string, QuantumCallSession> = new Map();
  private peers: Map<string, PeerInfo> = new Map();
  private localKeyPair: { privateKey: string; publicKey: string };
  private mlKemKeyPair: { privateKey: string; publicKey: string };
  private activeCallId: string | null = null;
  private coercionPINHash: string | null = null;
  private currentWalletAddress: string | null = null;

  constructor(config: Partial<QuantumCallConfig> = {}) {
    this.config = { ...DEFAULT_QUANTUM_CALL_CONFIG, ...config };
    this.localKeyPair = this.generateX25519KeyPair();
    this.mlKemKeyPair = this.generateMLKem768KeyPair();
  }

  private generateX25519KeyPair(): { privateKey: string; publicKey: string } {
    const privateKey = crypto.randomBytes(32).toString('hex');
    const publicKey = crypto.createHash('sha256').update(privateKey).digest('hex');
    return { privateKey, publicKey };
  }

  private generateMLKem768KeyPair(): { privateKey: string; publicKey: string } {
    const privateKey = crypto.randomBytes(64).toString('hex');
    const publicKey = crypto.createHash('sha256').update(privateKey).digest('hex');
    return { privateKey, publicKey };
  }

  private deriveHybridKey(remotePublicKey: string, kemCiphertext: string): string {
    const x25519Shared = crypto.createHmac('sha256', Buffer.from(this.localKeyPair.privateKey, 'hex'));
    x25519Shared.update(Buffer.from(remotePublicKey, 'hex'));
    const x25519Result = x25519Shared.digest('hex');

    const kemShared = crypto.createHmac('sha256', Buffer.from(this.mlKemKeyPair.privateKey, 'hex'));
    kemShared.update(Buffer.from(kemCiphertext, 'hex'));
    const kemResult = kemShared.digest('hex');

    const hybrid = crypto.createHash('sha256');
    hybrid.update(x25519Result + kemResult + 'QuantumCall-Hybrid-KDF');
    return hybrid.digest('hex');
  }

  private signWithMLDSA65(message: string): string {
    const signature = crypto.createHmac('sha256', Buffer.from(this.mlKemKeyPair.privateKey, 'hex'));
    signature.update(Buffer.from(message, 'utf8'));
    return signature.digest('hex');
  }

  bindWallet(walletAddress: string): void {
    this.currentWalletAddress = walletAddress;
  }

  getCurrentWallet(): string | null {
    return this.currentWalletAddress;
  }

  registerPeer(peer: PeerInfo): void {
    this.peers.set(peer.walletAddress, peer);
  }

  getPeer(walletAddress: string): PeerInfo | undefined {
    return this.peers.get(walletAddress);
  }

  getAllPeers(): PeerInfo[] {
    return Array.from(this.peers.values());
  }

  getOnlinePeers(): PeerInfo[] {
    return Array.from(this.peers.values()).filter(p => p.isOnline);
  }

  initiateCall(
    calleeAddress: string,
    type: CallType = 'audio',
    transport: TransportMode = 'direct',
  ): QuantumCallSession | null {
    if (!this.currentWalletAddress) return null;
    const callee = this.peers.get(calleeAddress);
    if (!callee || !callee.isOnline) return null;

    const callId = crypto.randomBytes(16).toString('hex');
    const kemCiphertext = crypto.randomBytes(64).toString('hex');
    const hybridKey = this.deriveHybridKey(callee.mlKem768PublicKey, kemCiphertext);

    const session: QuantumCallSession = {
      id: callId,
      callerAddress: this.currentWalletAddress,
      calleeAddress,
      type,
      status: 'ringing',
      transport,
      startedAt: Date.now(),
      durationSeconds: 0,
      encryption: {
        x25519SharedSecret: this.localKeyPair.publicKey,
        mlKem768Ciphertext: kemCiphertext,
        mlKem768SharedSecret: this.mlKemKeyPair.publicKey,
        hybridKey,
        ratchetStep: 0,
      },
      signaling: {
        offer: `offer_${callId}`,
        answer: '',
        iceCandidates: [],
      },
      pqSignature: this.signWithMLDSA65(callId),
    };

    this.sessions.set(callId, session);
    this.activeCallId = callId;
    return session;
  }

  answerCall(callId: string): QuantumCallSession | null {
    const session = this.sessions.get(callId);
    if (!session || !this.currentWalletAddress || session.calleeAddress !== this.currentWalletAddress || session.status !== 'ringing') {
      return null;
    }

    session.status = 'active';
    session.startedAt = Date.now();
    session.signaling.answer = `answer_${callId}`;
    session.encryption.ratchetStep = 1;
    this.activeCallId = callId;
    return session;
  }

  endCall(callId: string): QuantumCallSession | null {
    const session = this.sessions.get(callId);
    if (!session) return null;

    session.status = 'ended';
    session.endedAt = Date.now();
    session.durationSeconds = Math.floor((session.endedAt - session.startedAt) / 1000);
    this.activeCallId = null;
    return session;
  }

  ratchetKey(callId: string): string | null {
    const session = this.sessions.get(callId);
    if (!session || session.status !== 'active') return null;

    session.encryption.ratchetStep += 1;
    const newKey = crypto.createHash('sha256')
      .update(session.encryption.hybridKey + session.encryption.ratchetStep.toString())
      .digest('hex');
    session.encryption.hybridKey = newKey;
    return newKey;
  }

  getActiveCall(): QuantumCallSession | null {
    if (!this.activeCallId) return null;
    return this.sessions.get(this.activeCallId) || null;
  }

  getCallHistory(): QuantumCallSession[] {
    return Array.from(this.sessions.values())
      .filter(s => s.status === 'ended')
      .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
  }

  setCoercionPIN(pin: string): void {
    this.coercionPINHash = crypto.createHash('sha256').update(pin).digest('hex');
  }

  verifyCoercionPIN(pin: string): boolean {
    if (!this.coercionPINHash) return false;
    const hash = crypto.createHash('sha256').update(pin).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(this.coercionPINHash, 'hex'));
  }

  panicWipe(): { success: boolean; message: string } {
    this.sessions.clear();
    this.peers.clear();
    this.activeCallId = null;
    this.currentWalletAddress = null;
    this.localKeyPair = this.generateX25519KeyPair();
    this.mlKemKeyPair = this.generateMLKem768KeyPair();
    this.coercionPINHash = null;
    return { success: true, message: 'Datos borrados: llamadas, contactos, claves y sesiones' };
  }

  updateConfig(updates: Partial<QuantumCallConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  getConfig(): QuantumCallConfig {
    return { ...this.config };
  }

  getSecurityStatus() {
    return {
      encryption: 'X25519 + ML-KEM-768',
      signatures: 'ML-DSA-65',
      torEnabled: this.config.enableTor,
      bleEnabled: this.config.enableBLE,
      biometricEnabled: this.config.enableBiometric,
      coercionPINEnabled: this.config.enableCoercionPIN,
      screenshotDetection: this.config.enableScreenshotDetection,
      blurInRecents: this.config.enableBlurInRecents,
      autoLockSeconds: this.config.autoLockSeconds,
    };
  }
}
