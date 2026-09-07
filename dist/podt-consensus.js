"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PoDTConsensus = exports.DEFAULT_PODT_CONFIG = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const pq_crypto_js_1 = require("./pq-crypto.js");
exports.DEFAULT_PODT_CONFIG = {
    minValidators: 4,
    maxValidators: 100,
    trustThreshold: 66.67,
    slashingFraction: 0.05,
    jailDuration: 3600000,
    proposalThreshold: 33.34,
    votingPeriod: 300000,
};
class PoDTConsensus {
    constructor(config = {}, minStake = 1000, initialValidators = []) {
        this.validators = new Map();
        this.proposals = new Map();
        this.slashingEvents = [];
        this.blockHeight = 0;
        this.config = { ...exports.DEFAULT_PODT_CONFIG, ...config };
        this.minStake = minStake;
        for (const v of initialValidators) {
            this.addValidator(v);
        }
    }
    addValidator(validator) {
        const id = validator.id || this.generateValidatorId();
        const address = validator.address || `val1${node_crypto_1.default.randomBytes(10).toString('hex')}`;
        const keyPair = pq_crypto_js_1.PQCrypto.generateKeyPair(validator.id);
        const newValidator = {
            id,
            address,
            publicKey: keyPair.publicKey,
            status: 'standby',
            trustScore: {
                validator: id,
                score: 50,
                reputation: 0,
                lastUpdate: Date.now(),
                blocksProposed: 0,
                blocksSigned: 0,
                uptime: 100,
            },
            stake: validator.stake || this.minStake,
        };
        this.validators.set(id, newValidator);
        return newValidator;
    }
    generateValidatorId() {
        return `val_${node_crypto_1.default.randomBytes(8).toString('hex')}`;
    }
    selectProposer(height) {
        const eligible = Array.from(this.validators.values())
            .filter((v) => v.status === 'active' && v.stake >= this.minStake)
            .sort((a, b) => {
            const weightA = a.trustScore.score * a.stake;
            const weightB = b.trustScore.score * b.stake;
            return weightB - weightA;
        });
        if (eligible.length === 0)
            return null;
        const totalWeight = eligible.reduce((sum, v) => sum + v.trustScore.score * v.stake, 0);
        let r = Math.random() * totalWeight;
        for (const v of eligible) {
            r -= v.trustScore.score * v.stake;
            if (r <= 0)
                return v;
        }
        return eligible[0];
    }
    async proposeBlock(proposerId, blockData, privateKey) {
        const validator = this.validators.get(proposerId);
        if (!validator || validator.status !== 'active')
            return null;
        const proposalId = node_crypto_1.default
            .createHash('sha256')
            .update(`${proposerId}:${this.blockHeight}:${blockData}:${Date.now()}`)
            .digest('hex');
        const signed = pq_crypto_js_1.PQCrypto.sign(blockData, privateKey);
        validator.trustScore.blocksProposed += 1;
        validator.trustScore.lastUpdate = Date.now();
        const proposal = {
            id: proposalId,
            type: 'block',
            proposer: proposerId,
            blockHeight: this.blockHeight,
            data: blockData,
            timestamp: Date.now(),
            signature: signed.signature,
            votes: [],
            tally: {
                yes: 0,
                no: 0,
                abstain: 0,
                totalPower: 0,
            },
        };
        this.proposals.set(proposalId, proposal);
        return proposal;
    }
    vote(validatorId, proposalId, vote, privateKey) {
        const proposal = this.proposals.get(proposalId);
        const validator = this.validators.get(validatorId);
        if (!proposal || !validator || validator.status !== 'active')
            return false;
        const voteMessage = `${proposalId}:${vote}:${validatorId}`;
        const signed = pq_crypto_js_1.PQCrypto.sign(voteMessage, privateKey);
        if (!pq_crypto_js_1.PQCrypto.verify(signed))
            return false;
        const existingVote = proposal.votes.find((v) => v.validator === validatorId);
        if (existingVote)
            return false;
        proposal.votes.push({
            validator: validatorId,
            vote,
            signature: signed.signature,
        });
        const power = validator.trustScore.score * validator.stake;
        switch (vote) {
            case 'yes':
                proposal.tally.yes += power;
                break;
            case 'no':
                proposal.tally.no += power;
                break;
            case 'abstain':
                proposal.tally.abstain += power;
                break;
        }
        proposal.tally.totalPower += power;
        validator.trustScore.blocksSigned += 1;
        validator.trustScore.lastUpdate = Date.now();
        this.updateUptime(validatorId);
        return true;
    }
    finalizeProposal(proposalId) {
        const proposal = this.proposals.get(proposalId);
        if (!proposal)
            return false;
        const totalPower = Array.from(this.validators.values())
            .filter((v) => v.status === 'active')
            .reduce((sum, v) => sum + v.trustScore.score * v.stake, 0);
        const yesRatio = (proposal.tally.yes / totalPower) * 100;
        const finalized = yesRatio >= this.config.trustThreshold;
        if (finalized) {
            this.blockHeight += 1;
            this.updateTrustScores();
        }
        return finalized;
    }
    verifySignature(message, signature, publicKey) {
        const signed = {
            message,
            signature,
            publicKey,
            algorithm: pq_crypto_js_1.PQCrypto.ALGORITHM,
        };
        return pq_crypto_js_1.PQCrypto.verify(signed);
    }
    updateTrustScores() {
        const now = Date.now();
        const votingPeriod = this.config.votingPeriod;
        for (const validator of this.validators.values()) {
            if (validator.status !== 'active')
                continue;
            const participation = validator.trustScore.blocksSigned > 0
                ? validator.trustScore.blocksSigned / Math.max(this.blockHeight, 1)
                : 0;
            const uptimeRatio = validator.trustScore.uptime / 100;
            const participationRatio = Math.min(participation, 1);
            const currentScore = validator.trustScore.score;
            const newScore = currentScore * 0.7 +
                (50 + 50 * uptimeRatio * participationRatio);
            validator.trustScore.score = Math.max(0, Math.min(100, newScore));
            validator.trustScore.reputation = newScore;
            validator.trustScore.lastUpdate = now;
            if (validator.trustScore.score < 30) {
                this.jailValidator(validator.id, 'Low trust score');
            }
        }
    }
    updateUptime(validatorId) {
        const validator = this.validators.get(validatorId);
        if (!validator)
            return;
        const expectedBlocks = Math.max(this.blockHeight, 1);
        const actualBlocks = validator.trustScore.blocksSigned;
        validator.trustScore.uptime = (actualBlocks / expectedBlocks) * 100;
    }
    jailValidator(validatorId, reason) {
        const validator = this.validators.get(validatorId);
        if (!validator)
            return;
        validator.status = 'jailed';
        validator.jailedUntil = Date.now() + this.config.jailDuration;
        this.slashingEvents.push({
            validator: validatorId,
            reason,
            amount: validator.stake * this.config.slashingFraction,
            timestamp: Date.now(),
            evidence: `trust-violation:${reason}`,
        });
    }
    unjailValidator(validatorId) {
        const validator = this.validators.get(validatorId);
        if (!validator || validator.status !== 'jailed')
            return false;
        if (validator.jailedUntil && Date.now() < validator.jailedUntil) {
            return false;
        }
        validator.status = 'standby';
        validator.jailedUntil = undefined;
        return true;
    }
    slashValidator(validatorId, reason, evidence) {
        const validator = this.validators.get(validatorId);
        if (!validator)
            return;
        validator.status = 'slashed';
        const penalty = validator.stake * this.config.slashingFraction;
        validator.stake = Math.max(0, validator.stake - penalty);
        this.slashingEvents.push({
            validator: validatorId,
            reason,
            amount: penalty,
            timestamp: Date.now(),
            evidence,
        });
    }
    getValidator(id) {
        return this.validators.get(id) || null;
    }
    getAllValidators() {
        return Array.from(this.validators.values());
    }
    getActiveValidators() {
        return Array.from(this.validators.values()).filter((v) => v.status === 'active');
    }
    activateValidator(validatorId) {
        const validator = this.validators.get(validatorId);
        if (!validator || validator.status === 'slashed')
            return false;
        if (validator.stake < this.minStake)
            return false;
        validator.status = 'active';
        return true;
    }
    getProposals() {
        return Array.from(this.proposals.values());
    }
    getProposal(id) {
        return this.proposals.get(id) || null;
    }
    getSlashingEvents() {
        return [...this.slashingEvents];
    }
    getTrustRankings() {
        return Array.from(this.validators.values())
            .map((v) => v.trustScore)
            .sort((a, b) => b.score - a.score);
    }
    getBlockHeight() {
        return this.blockHeight;
    }
    getConfig() {
        return { ...this.config };
    }
    updateConfig(updates) {
        this.config = { ...this.config, ...updates };
    }
    getValidatorCount() {
        return this.validators.size;
    }
    getActiveValidatorCount() {
        return this.getActiveValidators().length;
    }
    static createGenesisValidators(count, minStake) {
        return Array.from({ length: count }, () => ({
            stake: minStake + Math.floor(Math.random() * 5000),
        }));
    }
    static deriveKeyFromMnemonic(mnemonic, index = 0) {
        return pq_crypto_js_1.PQCrypto.generateKeyPair(mnemonic.join('') + index.toString());
    }
}
exports.PoDTConsensus = PoDTConsensus;
