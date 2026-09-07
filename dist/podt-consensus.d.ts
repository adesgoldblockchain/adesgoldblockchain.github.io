import { PQKeyPair, PQPubKey, PQPrivKey, PQSignature } from './pq-crypto.js';
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
export declare const DEFAULT_PODT_CONFIG: PoDTConfig;
export declare class PoDTConsensus {
    private validators;
    private proposals;
    private slashingEvents;
    private config;
    private readonly minStake;
    private blockHeight;
    constructor(config?: Partial<PoDTConfig>, minStake?: number, initialValidators?: Partial<Validator>[]);
    addValidator(validator: Partial<Validator>): Validator;
    private generateValidatorId;
    selectProposer(height: number): Validator | null;
    proposeBlock(proposerId: string, blockData: string, privateKey: PQPrivKey): Promise<Proposal | null>;
    vote(validatorId: string, proposalId: string, vote: VoteOption, privateKey: PQPrivKey): boolean;
    finalizeProposal(proposalId: string): boolean;
    verifySignature(message: string, signature: PQSignature, publicKey: PQPubKey): boolean;
    private updateTrustScores;
    private updateUptime;
    jailValidator(validatorId: string, reason: string): void;
    unjailValidator(validatorId: string): boolean;
    slashValidator(validatorId: string, reason: string, evidence: string): void;
    getValidator(id: string): Validator | null;
    getAllValidators(): Validator[];
    getActiveValidators(): Validator[];
    activateValidator(validatorId: string): boolean;
    getProposals(): Proposal[];
    getProposal(id: string): Proposal | null;
    getSlashingEvents(): SlashingEvent[];
    getTrustRankings(): TrustScore[];
    getBlockHeight(): number;
    getConfig(): PoDTConfig;
    updateConfig(updates: Partial<PoDTConfig>): void;
    getValidatorCount(): number;
    getActiveValidatorCount(): number;
    static createGenesisValidators(count: number, minStake: number): Partial<Validator>[];
    static deriveKeyFromMnemonic(mnemonic: string[], index?: number): PQKeyPair;
}
