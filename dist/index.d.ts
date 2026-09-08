import { ADES_GOLD, MNEMONIC_WORDS, MASTER_WALLET_ADDRESS, ECO_WALLET_ADDRESS } from './constants.js';
import { PQCrypto, PQKeyPair, PQPubKey, PQPrivKey, PQSignature, PQSharedSecret, SignedMessage } from './pq-crypto.js';
import { PoDTConsensus, Validator, TrustScore, Proposal, SlashingEvent, PoDTConfig, DEFAULT_PODT_CONFIG, ValidatorStatus, VoteOption, ProposalType } from './podt-consensus.js';
import { PrivacyManager, StealthKeyPair, StealthAddress, ConfidentialTx, PaymentOutput, RangeProof } from './privacy.js';
import { QuantumCall, QuantumCallSession, PeerInfo, CallOffer, CallAnswer, QuantumCallConfig, DEFAULT_QUANTUM_CALL_CONFIG, CallStatus, CallType, TransportMode } from './quantum-call.js';
export { ADES_GOLD, MNEMONIC_WORDS, MASTER_WALLET_ADDRESS, ECO_WALLET_ADDRESS };
export { PQCrypto, PQKeyPair, PQPubKey, PQPrivKey, PQSignature, PQSharedSecret, SignedMessage };
export { PoDTConsensus, Validator, TrustScore, Proposal, SlashingEvent, PoDTConfig, DEFAULT_PODT_CONFIG, ValidatorStatus, VoteOption, ProposalType };
export { PrivacyManager, StealthKeyPair, StealthAddress, ConfidentialTx, PaymentOutput, RangeProof };
export { QuantumCall, QuantumCallSession, PeerInfo, CallOffer, CallAnswer, QuantumCallConfig, DEFAULT_QUANTUM_CALL_CONFIG, CallStatus, CallType, TransportMode };
export interface MasterWalletData {
    username: string;
    walletAddress: string;
    seedPhrase: string[];
    pinCodeHash: string;
    balance: number;
    isActive: boolean;
    createdAt: number;
    tokenDistribution: {
        masterWalletsShare: number;
        ecosystemShare: number;
        totalAllocated: number;
    };
}
export interface AuthPayload {
    username: string;
    seedPhrase: string[];
    pinCode: string;
}
export interface TokenDistribution {
    totalSupply: number;
    masterWalletsShare: number;
    ecosystemShare: number;
    masterWalletsTotal: number;
    ecosystemTotal: number;
    masterWalletCount: number;
}
export interface TransactionRecord {
    txHash: string;
    type: 'send' | 'receive' | 'buy' | 'sell' | 'exchange' | 'mine' | 'distribution';
    from: string;
    to: string;
    amount: number;
    denom: string;
    fee: number;
    timestamp: number;
    status: 'pending' | 'completed' | 'failed';
    orderId?: string;
}
export declare class AdesGoldWallet {
    private masterWalletAddress;
    private ecoWalletAddress;
    private bankBalances;
    private masterWallets;
    private transactions;
    private totalToMasterWallets;
    private totalToEcosystem;
    constructor(masterWalletAddress?: string, ecoWalletAddress?: string);
    private initializeBalances;
    generateSeedPhrase(numWords?: number): string[];
    validateSeedPhrase(words: string[]): boolean;
    validatePinCode(pin: string): boolean;
    hashPinCode(pin: string): string;
    deriveAddress(seedPhrase: string[]): string;
    createMasterWallet(username: string, pinCode: string, initialBalance?: number, seedPhrase?: string[]): MasterWalletData;
    authenticate(seedPhrase: string[], pinCode: string): MasterWalletData | null;
    getWalletByAddress(address: string): MasterWalletData | null;
    getWalletByUsername(username: string): MasterWalletData | null;
    recoverWallet(seedPhrase: string[], options?: {
        username?: string;
        pinCode?: string;
    }): MasterWalletData;
    getWalletBySeedPhrase(seedPhrase: string[]): MasterWalletData | null;
    private sanitizeWallet;
    getAllMasterWallets(): MasterWalletData[];
    getMasterWalletCount(): number;
    getTokenDistribution(): TokenDistribution;
    getBalance(address: string): number;
    isValidAddress(address: string): boolean;
    calculateFee(amount: number): number;
    swap(traderAddress: string, fromDenom: string, toDenom: string, amount: number): Promise<TransactionRecord>;
    buy(buyerAddress: string, amount: number, paymentDenom: string): Promise<TransactionRecord>;
    sell(sellerAddress: string, amount: number, targetDenom: string): Promise<TransactionRecord>;
    send(senderAddress: string, recipientAddress: string, amount: number, denom?: string): Promise<TransactionRecord>;
    receive(senderAddress: string, receiverAddress: string, amount: number, denom?: string): Promise<TransactionRecord>;
    convert(holderAddress: string, fromDenom: string, toDenom: string, amount: number): Promise<TransactionRecord>;
    mineBlock(minerAddress: string): {
        blockNumber: number;
        reward: number;
        nonce: string;
    } | null;
    private miningEnabled;
    private totalBlocksMined;
    private totalMintedCache;
    totalMinted(): number;
    getTotalBlocksMined(): number;
    setMiningEnabled(enabled: boolean): void;
    distributeTokens(totalAmount: number, masterWalletCount: number): void;
    getTransactions(address?: string): TransactionRecord[];
    getExchangeStats(): {
        totalTrades: number;
        totalVolume: number;
        totalFeesCollected: number;
        feesToMasterWallet: number;
    };
    getMasterWalletAddress(): string;
    getEcoWalletAddress(): string;
}
