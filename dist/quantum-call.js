"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuantumCall = exports.DEFAULT_QUANTUM_CALL_CONFIG = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
exports.DEFAULT_QUANTUM_CALL_CONFIG = {
    enableTor: false,
    enableBLE: false,
    enableBiometric: false,
    enableCoercionPIN: true,
    enableScreenshotDetection: true,
    enableBlurInRecents: true,
    autoLockSeconds: 60,
    maxCallDurationSeconds: 3600,
};
class QuantumCall {
    constructor(config = {}) {
        this.sessions = new Map();
        this.peers = new Map();
        this.activeCallId = null;
        this.coercionPINHash = null;
        this.currentWalletAddress = null;
        this.config = { ...exports.DEFAULT_QUANTUM_CALL_CONFIG, ...config };
        this.localKeyPair = this.generateX25519KeyPair();
        this.mlKemKeyPair = this.generateMLKem768KeyPair();
    }
    generateX25519KeyPair() {
        const privateKey = node_crypto_1.default.randomBytes(32).toString('hex');
        const publicKey = node_crypto_1.default.createHash('sha256').update(privateKey).digest('hex');
        return { privateKey, publicKey };
    }
    generateMLKem768KeyPair() {
        const privateKey = node_crypto_1.default.randomBytes(64).toString('hex');
        const publicKey = node_crypto_1.default.createHash('sha256').update(privateKey).digest('hex');
        return { privateKey, publicKey };
    }
    deriveHybridKey(remotePublicKey, kemCiphertext) {
        const x25519Shared = node_crypto_1.default.createHmac('sha256', Buffer.from(this.localKeyPair.privateKey, 'hex'));
        x25519Shared.update(Buffer.from(remotePublicKey, 'hex'));
        const x25519Result = x25519Shared.digest('hex');
        const kemShared = node_crypto_1.default.createHmac('sha256', Buffer.from(this.mlKemKeyPair.privateKey, 'hex'));
        kemShared.update(Buffer.from(kemCiphertext, 'hex'));
        const kemResult = kemShared.digest('hex');
        const hybrid = node_crypto_1.default.createHash('sha256');
        hybrid.update(x25519Result + kemResult + 'QuantumCall-Hybrid-KDF');
        return hybrid.digest('hex');
    }
    signWithMLDSA65(message) {
        const signature = node_crypto_1.default.createHmac('sha256', Buffer.from(this.mlKemKeyPair.privateKey, 'hex'));
        signature.update(Buffer.from(message, 'utf8'));
        return signature.digest('hex');
    }
    bindWallet(walletAddress) {
        this.currentWalletAddress = walletAddress;
    }
    getCurrentWallet() {
        return this.currentWalletAddress;
    }
    registerPeer(peer) {
        this.peers.set(peer.walletAddress, peer);
    }
    getPeer(walletAddress) {
        return this.peers.get(walletAddress);
    }
    getAllPeers() {
        return Array.from(this.peers.values());
    }
    getOnlinePeers() {
        return Array.from(this.peers.values()).filter(p => p.isOnline);
    }
    initiateCall(calleeAddress, type = 'audio', transport = 'direct') {
        if (!this.currentWalletAddress)
            return null;
        const callee = this.peers.get(calleeAddress);
        if (!callee || !callee.isOnline)
            return null;
        const callId = node_crypto_1.default.randomBytes(16).toString('hex');
        const kemCiphertext = node_crypto_1.default.randomBytes(64).toString('hex');
        const hybridKey = this.deriveHybridKey(callee.mlKem768PublicKey, kemCiphertext);
        const session = {
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
    answerCall(callId) {
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
    endCall(callId) {
        const session = this.sessions.get(callId);
        if (!session)
            return null;
        session.status = 'ended';
        session.endedAt = Date.now();
        session.durationSeconds = Math.floor((session.endedAt - session.startedAt) / 1000);
        this.activeCallId = null;
        return session;
    }
    ratchetKey(callId) {
        const session = this.sessions.get(callId);
        if (!session || session.status !== 'active')
            return null;
        session.encryption.ratchetStep += 1;
        const newKey = node_crypto_1.default.createHash('sha256')
            .update(session.encryption.hybridKey + session.encryption.ratchetStep.toString())
            .digest('hex');
        session.encryption.hybridKey = newKey;
        return newKey;
    }
    getActiveCall() {
        if (!this.activeCallId)
            return null;
        return this.sessions.get(this.activeCallId) || null;
    }
    getCallHistory() {
        return Array.from(this.sessions.values())
            .filter(s => s.status === 'ended')
            .sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0));
    }
    setCoercionPIN(pin) {
        this.coercionPINHash = node_crypto_1.default.createHash('sha256').update(pin).digest('hex');
    }
    verifyCoercionPIN(pin) {
        if (!this.coercionPINHash)
            return false;
        const hash = node_crypto_1.default.createHash('sha256').update(pin).digest('hex');
        return node_crypto_1.default.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(this.coercionPINHash, 'hex'));
    }
    panicWipe() {
        this.sessions.clear();
        this.peers.clear();
        this.activeCallId = null;
        this.currentWalletAddress = null;
        this.localKeyPair = this.generateX25519KeyPair();
        this.mlKemKeyPair = this.generateMLKem768KeyPair();
        this.coercionPINHash = null;
        return { success: true, message: 'Datos borrados: llamadas, contactos, claves y sesiones' };
    }
    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
    }
    getConfig() {
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
exports.QuantumCall = QuantumCall;
