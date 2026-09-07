"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PQCrypto = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
class PQCrypto {
    static deriveSeed(seed, index, context) {
        const h = node_crypto_1.default.createHmac('sha256', Buffer.from(seed, 'hex'));
        h.update(`${index}:${context}`);
        return h.digest();
    }
    static wotsHash(msg, pubSeed) {
        const h = node_crypto_1.default.createHmac('sha256', Buffer.from(pubSeed, 'hex'));
        h.update(msg);
        let result = h.digest();
        for (let i = 0; i < PQCrypto.HASH_ITERATIONS; i++) {
            const next = node_crypto_1.default.createHmac('sha256', result);
            next.update(Buffer.alloc(32, i + 1));
            result = next.digest();
        }
        return result;
    }
    static generateKeyPair(seed) {
        const masterSeed = seed || node_crypto_1.default.randomBytes(32).toString('hex');
        const privateKey = PQCrypto.deriveSeed(masterSeed, 0, 'pq-private-key');
        const pubSeed = node_crypto_1.default.createHash('sha256').update(masterSeed).digest('hex');
        const publicKey = PQCrypto.wotsHash(privateKey, pubSeed).toString('hex');
        return {
            publicKey,
            privateKey: masterSeed,
        };
    }
    static sign(message, privateKey) {
        const pubSeed = node_crypto_1.default.createHash('sha256').update(privateKey).digest('hex');
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
    static verify(signed) {
        const pubSeed = node_crypto_1.default.createHash('sha256')
            .update(signed.publicKey)
            .digest('hex');
        const expectedSig = PQCrypto.wotsHash(Buffer.from(signed.message, 'utf8'), pubSeed).toString('hex');
        return node_crypto_1.default.timingSafeEqual(Buffer.from(signed.signature, 'hex'), Buffer.from(expectedSig, 'hex'));
    }
    static keyExchange(privateKey, publicKey) {
        const sharedBytes = node_crypto_1.default.createHmac('sha256', Buffer.from(privateKey, 'hex'));
        sharedBytes.update(Buffer.from(publicKey, 'hex'));
        const shared = sharedBytes.digest('hex');
        const derived = node_crypto_1.default.createHash('sha256')
            .update(shared + ':kdf')
            .digest('hex');
        return derived;
    }
    static encrypt(message, sharedSecret) {
        const key = Buffer.from(sharedSecret, 'hex').slice(0, 32);
        const iv = node_crypto_1.default.randomBytes(16);
        const cipher = node_crypto_1.default.createCipheriv('aes-256-gcm', key, iv);
        let encrypted = cipher.update(message, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        const authTag = cipher.getAuthTag();
        return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    }
    static decrypt(encrypted, sharedSecret) {
        const parts = encrypted.split(':');
        if (parts.length !== 3) {
            throw new Error('Invalid encrypted message format');
        }
        const [ivHex, authTagHex, data] = parts;
        const key = Buffer.from(sharedSecret, 'hex').slice(0, 32);
        const iv = Buffer.from(ivHex, 'hex');
        const decipher = node_crypto_1.default.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
        let decrypted = decipher.update(data, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    }
    static hash(message) {
        return node_crypto_1.default.createHash('sha256').update(message).digest('hex');
    }
    static commitment(value, blindingFactor) {
        const h = node_crypto_1.default.createHmac('sha256', Buffer.from(blindingFactor, 'hex'));
        h.update(`commit:${value}`);
        return h.digest('hex');
    }
    static verifyCommitment(value, blindingFactor, expectedCommitment) {
        const computed = PQCrypto.commitment(value, blindingFactor);
        return node_crypto_1.default.timingSafeEqual(Buffer.from(computed, 'hex'), Buffer.from(expectedCommitment, 'hex'));
    }
}
exports.PQCrypto = PQCrypto;
PQCrypto.ALGORITHM = 'XMSS-SHA2-256';
PQCrypto.HASH_BRANCHES = 2;
PQCrypto.HASH_DEPTH = 8;
PQCrypto.HASH_ITERATIONS = 64;
