import crypto from 'node:crypto';
import { PQCrypto, PQKeyPair, PQPubKey, PQPrivKey, PQSignature, SignedMessage } from './pq-crypto.js';

export type ValidatorStatus = 'active' | 'standby' | 'jailed' | 'slashed';
export type VoteOption = 'yes' | 'no' | 'abstain';
export type ProposalType = 'block' | 'parameter' | 'upgrade';

export interface TrustScore {
  validator: string;
  score: number;
  reputation: number;
  lastUpdate: number;
  blocksProposed: number;
  blocksSigned: number;
  uptime: number;
}

export interface Validator {
  id: string;
  address: string;
  publicKey: PQPubKey;
  status: ValidatorStatus;
  trustScore: TrustScore;
  stake: number;
  jailedUntil?: number;
}

export interface Proposal {
  id: string;
  type: ProposalType;
  proposer: string;
  blockHeight: number;
  data: string;
  timestamp: number;
  signature: PQSignature;
  votes: Array<{
    validator: string;
    vote: VoteOption;
    signature: PQSignature;
  }>;
  tally: {
    yes: number;
    no: number;
    abstain: number;
    totalPower: number;
  };
}

export interface SlashingEvent {
  validator: string;
  reason: string;
  amount: number;
  timestamp: number;
  evidence: string;
}

export interface PoDTConfig {
  minValidators: number;
  maxValidators: number;
  trustThreshold: number;
  slashingFraction: number;
  jailDuration: number;
  proposalThreshold: number;
  votingPeriod: number;
}

export const DEFAULT_PODT_CONFIG: PoDTConfig = {
  minValidators: 4,
  maxValidators: 100,
  trustThreshold: 66.67,
  slashingFraction: 0.05,
  jailDuration: 3600000,
  proposalThreshold: 33.34,
  votingPeriod: 300000,
};

export class PoDTConsensus {
  private validators: Map<string, Validator> = new Map();
  private proposals: Map<string, Proposal> = new Map();
  private slashingEvents: SlashingEvent[] = [];
  private config: PoDTConfig;
  private readonly minStake: number;
  private blockHeight: number = 0;

  constructor(
    config: Partial<PoDTConfig> = {},
    minStake: number = 1000,
    initialValidators: Partial<Validator>[] = [],
  ) {
    this.config = { ...DEFAULT_PODT_CONFIG, ...config };
    this.minStake = minStake;

    for (const v of initialValidators) {
      this.addValidator(v);
    }
  }

  addValidator(validator: Partial<Validator>): Validator {
    const id = validator.id || this.generateValidatorId();
    const address = validator.address || `val1${crypto.randomBytes(10).toString('hex')}`;
    const keyPair = PQCrypto.generateKeyPair(validator.id);

    const newValidator: Validator = {
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

  private generateValidatorId(): string {
    return `val_${crypto.randomBytes(8).toString('hex')}`;
  }

  selectProposer(height: number): Validator | null {
    const eligible = Array.from(this.validators.values())
      .filter((v) => v.status === 'active' && v.stake >= this.minStake)
      .sort((a, b) => {
        const weightA = a.trustScore.score * a.stake;
        const weightB = b.trustScore.score * b.stake;
        return weightB - weightA;
      });

    if (eligible.length === 0) return null;

    const totalWeight = eligible.reduce((sum, v) => sum + v.trustScore.score * v.stake, 0);
    let r = Math.random() * totalWeight;

    for (const v of eligible) {
      r -= v.trustScore.score * v.stake;
      if (r <= 0) return v;
    }

    return eligible[0];
  }

  async proposeBlock(
    proposerId: string,
    blockData: string,
    privateKey: PQPrivKey,
  ): Promise<Proposal | null> {
    const validator = this.validators.get(proposerId);
    if (!validator || validator.status !== 'active') return null;

    const proposalId = crypto
      .createHash('sha256')
      .update(`${proposerId}:${this.blockHeight}:${blockData}:${Date.now()}`)
      .digest('hex');

    const signed = PQCrypto.sign(blockData, privateKey);

    validator.trustScore.blocksProposed += 1;
    validator.trustScore.lastUpdate = Date.now();

    const proposal: Proposal = {
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

  vote(
    validatorId: string,
    proposalId: string,
    vote: VoteOption,
    privateKey: PQPrivKey,
  ): boolean {
    const proposal = this.proposals.get(proposalId);
    const validator = this.validators.get(validatorId);

    if (!proposal || !validator || validator.status !== 'active') return false;

    const voteMessage = `${proposalId}:${vote}:${validatorId}`;
    const signed = PQCrypto.sign(voteMessage, privateKey);

    if (!PQCrypto.verify(signed)) return false;

    const existingVote = proposal.votes.find((v) => v.validator === validatorId);
    if (existingVote) return false;

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

  finalizeProposal(proposalId: string): boolean {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) return false;

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

  verifySignature(message: string, signature: PQSignature, publicKey: PQPubKey): boolean {
    const signed: SignedMessage = {
      message,
      signature,
      publicKey,
      algorithm: PQCrypto.ALGORITHM,
    };
    return PQCrypto.verify(signed);
  }

  private updateTrustScores(): void {
    const now = Date.now();
    const votingPeriod = this.config.votingPeriod;

    for (const validator of this.validators.values()) {
      if (validator.status !== 'active') continue;

      const participation =
        validator.trustScore.blocksSigned > 0
          ? validator.trustScore.blocksSigned / Math.max(this.blockHeight, 1)
          : 0;

      const uptimeRatio = validator.trustScore.uptime / 100;
      const participationRatio = Math.min(participation, 1);

      const currentScore = validator.trustScore.score;
      const newScore =
        currentScore * 0.7 +
        (50 + 50 * uptimeRatio * participationRatio);

      validator.trustScore.score = Math.max(0, Math.min(100, newScore));
      validator.trustScore.reputation = newScore;
      validator.trustScore.lastUpdate = now;

      if (validator.trustScore.score < 30) {
        this.jailValidator(validator.id, 'Low trust score');
      }
    }
  }

  private updateUptime(validatorId: string): void {
    const validator = this.validators.get(validatorId);
    if (!validator) return;

    const expectedBlocks = Math.max(this.blockHeight, 1);
    const actualBlocks = validator.trustScore.blocksSigned;
    validator.trustScore.uptime = (actualBlocks / expectedBlocks) * 100;
  }

  jailValidator(validatorId: string, reason: string): void {
    const validator = this.validators.get(validatorId);
    if (!validator) return;

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

  unjailValidator(validatorId: string): boolean {
    const validator = this.validators.get(validatorId);
    if (!validator || validator.status !== 'jailed') return false;

    if (validator.jailedUntil && Date.now() < validator.jailedUntil) {
      return false;
    }

    validator.status = 'standby';
    validator.jailedUntil = undefined;
    return true;
  }

  slashValidator(validatorId: string, reason: string, evidence: string): void {
    const validator = this.validators.get(validatorId);
    if (!validator) return;

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

  getValidator(id: string): Validator | null {
    return this.validators.get(id) || null;
  }

  getAllValidators(): Validator[] {
    return Array.from(this.validators.values());
  }

  getActiveValidators(): Validator[] {
    return Array.from(this.validators.values()).filter((v) => v.status === 'active');
  }

  activateValidator(validatorId: string): boolean {
    const validator = this.validators.get(validatorId);
    if (!validator || validator.status === 'slashed') return false;

    if (validator.stake < this.minStake) return false;

    validator.status = 'active';
    return true;
  }

  getProposals(): Proposal[] {
    return Array.from(this.proposals.values());
  }

  getProposal(id: string): Proposal | null {
    return this.proposals.get(id) || null;
  }

  getSlashingEvents(): SlashingEvent[] {
    return [...this.slashingEvents];
  }

  getTrustRankings(): TrustScore[] {
    return Array.from(this.validators.values())
      .map((v) => v.trustScore)
      .sort((a, b) => b.score - a.score);
  }

  getBlockHeight(): number {
    return this.blockHeight;
  }

  getConfig(): PoDTConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<PoDTConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  getValidatorCount(): number {
    return this.validators.size;
  }

  getActiveValidatorCount(): number {
    return this.getActiveValidators().length;
  }

  static createGenesisValidators(
    count: number,
    minStake: number,
  ): Partial<Validator>[] {
    return Array.from({ length: count }, () => ({
      stake: minStake + Math.floor(Math.random() * 5000),
    }));
  }

  static deriveKeyFromMnemonic(mnemonic: string[], index: number = 0): PQKeyPair {
    return PQCrypto.generateKeyPair(mnemonic.join('') + index.toString());
  }
}
