"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrivacyManager = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const pq_crypto_js_1 = require("./pq-crypto.js");
class PrivacyManager {
    constructor() {
        this.PREFIX = 'adg1priv';
    }
    generateStealthKeyPair(seed) {
        const masterSeed = seed || node_crypto_1.default.randomBytes(32).toString('hex');
        const scanKey = node_crypto_1.default.createHash('sha256').update(masterSeed + ':scan').digest('hex');
        const spendKey = node_crypto_1.default.createHash('sha256').update(masterSeed + ':spend').digest('hex');
        const scanPub = node_crypto_1.default.createHash('sha256').update(scanKey).digest('hex');
        const spendPub = node_crypto_1.default.createHash('sha256').update(spendKey).digest('hex');
        return {
            scanPublicKey: scanPub,
            scanPrivateKey: scanKey,
            spendPublicKey: spendPub,
            spendPrivateKey: spendKey,
        };
    }
    createStealthAddress(receiverScanPub, receiverSpendPub) {
        const ephemeralKey = node_crypto_1.default.randomBytes(32).toString('hex');
        const sharedSecret = pq_crypto_js_1.PQCrypto.keyExchange(ephemeralKey, receiverScanPub);
        const address = this.deriveStealthAddress(sharedSecret, receiverSpendPub);
        const ephemeralPrivateKey = this.deriveEphemeralPrivateKey(ephemeralKey, receiverScanPub);
        return {
            address,
            ephemeralPrivateKey,
            sharedSecret,
        };
    }
    deriveStealthAddress(sharedSecret, spendPub) {
        const h = node_crypto_1.default.createHmac('sha256', Buffer.from(sharedSecret, 'hex'));
        h.update(Buffer.from(spendPub, 'hex'));
        const derived = h.digest('hex');
        return `${this.PREFIX}${derived.slice(0, 32)}`;
    }
    deriveEphemeralPrivateKey(ephemeralKey, receiverScanPub) {
        const h = node_crypto_1.default.createHmac('sha256', Buffer.from(ephemeralKey, 'hex'));
        h.update(Buffer.from(receiverScanPub, 'hex'));
        return h.digest('hex');
    }
    scanForOutputs(tx, scanPrivateKey, spendPrivateKey) {
        const matched = [];
        for (const output of tx.outputs) {
            const sharedSecret = pq_crypto_js_1.PQCrypto.keyExchange(scanPrivateKey, output.stealthAddress);
            const expectedAddress = this.deriveStealthAddress(sharedSecret, spendPrivateKey);
            if (expectedAddress === output.stealthAddress) {
                matched.push(output);
            }
        }
        return matched;
    }
    createCommitment(value, blindingFactor) {
        const factor = blindingFactor || node_crypto_1.default.randomBytes(32).toString('hex');
        const commitment = pq_crypto_js_1.PQCrypto.commitment(value, factor);
        return { commitment, blindingFactor: factor };
    }
    createRangeProof(value, blindingFactor) {
        const commitment = pq_crypto_js_1.PQCrypto.commitment(value, blindingFactor);
        const proofInput = `${value}:${blindingFactor}`;
        const proof = node_crypto_1.default
            .createHash('sha256')
            .update(proofInput)
            .digest('hex');
        return {
            commitment,
            proof,
            bitLength: 64,
        };
    }
    verifyRangeProof(proof) {
        const recomputedCommitment = proof.commitment;
        const proofHash = node_crypto_1.default
            .createHash('sha256')
            .update(recomputedCommitment + ':' + proof.bitLength)
            .digest('hex');
        return proof.proof.startsWith(proofHash.slice(0, 16));
    }
    createConfidentialTransaction(outputs) {
        const commitments = [];
        const blindingFactors = [];
        const paymentOutputs = [];
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
        const txId = node_crypto_1.default
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
    verifyConfidentialTransaction(tx, inputs, inputBlindingFactors) {
        const inputSum = inputs.reduce((sum, v) => sum + v, 0);
        for (let i = 0; i < inputBlindingFactors.length; i++) {
            const proof = this.createRangeProof(inputs[i], inputBlindingFactors[i]);
            if (!this.verifyRangeProof(proof))
                return false;
        }
        for (let i = 0; i < tx.commitments.length; i++) {
            if (!tx.blindingFactors[i])
                return false;
            const expected = pq_crypto_js_1.PQCrypto.commitment(inputs[i] || 0, tx.blindingFactors[i]);
            if (expected !== tx.commitments[i])
                return false;
        }
        return inputSum >= tx.outputs.length;
    }
    generateRingSignature(signerIndex, message, publicKeys) {
        const keyPair = pq_crypto_js_1.PQCrypto.generateKeyPair(message + signerIndex.toString());
        const signatures = [];
        for (let i = 0; i < publicKeys.length; i++) {
            if (i === signerIndex) {
                const signed = pq_crypto_js_1.PQCrypto.sign(message, keyPair.privateKey);
                signatures.push(signed.signature);
            }
            else {
                signatures.push(node_crypto_1.default.randomBytes(32).toString('hex'));
            }
        }
        return signatures.join(':');
    }
    verifyRingSignature(message, signature, publicKeys) {
        const sigs = signature.split(':');
        if (sigs.length !== publicKeys.length)
            return false;
        let verifiedCount = 0;
        for (let i = 0; i < publicKeys.length; i++) {
            const signed = {
                message,
                signature: sigs[i],
                publicKey: publicKeys[i],
                algorithm: pq_crypto_js_1.PQCrypto.ALGORITHM,
            };
            if (pq_crypto_js_1.PQCrypto.verify(signed))
                verifiedCount++;
        }
        return verifiedCount >= 1;
    }
    generateStealthPayment(receiverScanPub, receiverSpendPub, amount) {
        const stealthAddr = this.createStealthAddress(receiverScanPub, receiverSpendPub);
        const { commitment, blindingFactor } = this.createCommitment(amount);
        const rangeProof = this.createRangeProof(amount, blindingFactor);
        const paymentOutput = {
            commitment,
            stealthAddress: stealthAddr.address,
            proof: rangeProof.proof,
        };
        const tx = this.createConfidentialTransaction([amount]);
        tx.outputs = [paymentOutput];
        return { tx, paymentOutput };
    }
}
exports.PrivacyManager = PrivacyManager;
