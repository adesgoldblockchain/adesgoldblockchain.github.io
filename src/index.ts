import crypto from 'node:crypto';
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

export class AdesGoldWallet {
  private masterWalletAddress: string;
  private ecoWalletAddress: string;
  private bankBalances: Map<string, number> = new Map();
  private masterWallets: Map<string, MasterWalletData> = new Map();
  private transactions: TransactionRecord[] = [];
  private totalToMasterWallets: number = 0;
  private totalToEcosystem: number = 0;

  constructor(
    masterWalletAddress: string = MASTER_WALLET_ADDRESS,
    ecoWalletAddress: string = ECO_WALLET_ADDRESS,
  ) {
    this.masterWalletAddress = masterWalletAddress.toLowerCase();
    this.ecoWalletAddress = ecoWalletAddress.toLowerCase();
    this.initializeBalances();
  }

  private initializeBalances(): void {
    this.bankBalances.set(this.masterWalletAddress, ADES_GOLD.TOKEN_DISTRIBUTION.masterWallets);
    this.bankBalances.set(this.ecoWalletAddress, ADES_GOLD.TOKEN_DISTRIBUTION.ecosystem);
  }

  public generateSeedPhrase(numWords: number = 12): string[] {
    const words: string[] = [];
    for (let i = 0; i < numWords; i++) {
      const idx = crypto.randomInt(0, MNEMONIC_WORDS.length);
      words.push(MNEMONIC_WORDS[idx]);
    }
    return words;
  }

  public validateSeedPhrase(words: string[]): boolean {
    return words.length === 12 && words.every((w) => typeof w === 'string' && w.length > 0);
  }

  public validatePinCode(pin: string): boolean {
    return /^\d{6}$/.test(pin);
  }

  public hashPinCode(pin: string): string {
    if (!this.validatePinCode(pin)) {
      throw new Error('El PIN debe ser un código numérico de 6 dígitos');
    }
    return crypto.createHash('sha256').update(pin).digest('hex');
  }

  public deriveAddress(seedPhrase: string[]): string {
    const seed = crypto
      .createHash('sha256')
      .update(seedPhrase.join(''))
      .digest('hex');
    return `adg1${seed.slice(0, 20)}`;
  }

  public createMasterWallet(
    username: string,
    pinCode: string,
    initialBalance: number = 0,
    seedPhrase?: string[],
  ): MasterWalletData {
    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername || cleanUsername.length < 3 || cleanUsername.length > 20) {
      throw new Error('El nombre de usuario debe tener entre 3 y 20 caracteres');
    }
    if (!/^[a-z0-9_]+$/.test(cleanUsername)) {
      throw new Error('El nombre de usuario solo puede contener letras, números y guiones bajos');
    }
    if (!this.validatePinCode(pinCode)) {
      throw new Error('El PIN debe ser un código numérico de 6 dígitos');
    }

    const finalSeedPhrase = seedPhrase && seedPhrase.length === 12 ? seedPhrase.map((w) => w.toLowerCase()) : this.generateSeedPhrase(12);
    const walletAddress = this.deriveAddress(finalSeedPhrase);

    if (this.masterWallets.has(walletAddress)) {
      throw new Error('Esta wallet ya está registrada como cuenta madre');
    }

    const pinCodeHash = this.hashPinCode(pinCode);
    const allocation = initialBalance > 0 ? initialBalance : 1000;

    const wallet: MasterWalletData = {
      username: cleanUsername,
      walletAddress,
      seedPhrase: finalSeedPhrase,
      pinCodeHash,
      balance: allocation,
      isActive: true,
      createdAt: Date.now(),
      tokenDistribution: {
        masterWalletsShare: ADES_GOLD.MASTER_WALLET_SHARE,
        ecosystemShare: ADES_GOLD.ECOSYSTEM_SHARE,
        totalAllocated: allocation,
      },
    };

    this.masterWallets.set(walletAddress, wallet);

    const masterBalance = this.getBalance(this.masterWalletAddress);
    if (masterBalance >= allocation) {
      this.bankBalances.set(this.masterWalletAddress, masterBalance - allocation);
    }
    const currentBalance = this.getBalance(walletAddress);
    this.bankBalances.set(walletAddress, currentBalance + allocation);

    this.totalToMasterWallets += allocation;

    this.transactions.push({
      txHash: `init_${crypto.randomBytes(8).toString('hex')}`,
      type: 'distribution',
      from: this.masterWalletAddress,
      to: walletAddress,
      amount: initialBalance,
      denom: ADES_GOLD.DENOM,
      fee: 0,
      timestamp: Date.now(),
      status: 'completed',
    });

    return wallet;
  }

  public authenticate(seedPhrase: string[], pinCode: string): MasterWalletData | null {
    const normalizedSeed = seedPhrase.map((w) => String(w).toLowerCase());
    if (!this.validateSeedPhrase(normalizedSeed) || !this.validatePinCode(pinCode)) {
      return null;
    }

    const walletAddress = this.deriveAddress(normalizedSeed);
    const wallet = this.masterWallets.get(walletAddress);

    if (!wallet) {
      return null;
    }

    const pinHash = this.hashPinCode(pinCode);
    if (wallet.pinCodeHash !== pinHash) {
      return null;
    }

    return { ...wallet };
  }

  public getWalletByAddress(address: string): MasterWalletData | null {
    const wallet = this.masterWallets.get(address.toLowerCase());
    if (!wallet) return null;
    const { pinCodeHash, seedPhrase, ...safeWallet } = wallet;
    return { ...safeWallet, pinCodeHash, seedPhrase } as MasterWalletData;
  }

  public getWalletByUsername(username: string): MasterWalletData | null {
    for (const wallet of this.masterWallets.values()) {
      if (wallet.username === username.trim().toLowerCase()) {
        return this.sanitizeWallet(wallet);
      }
    }
    return null;
  }

  public recoverWallet(seedPhrase: string[], options?: { username?: string; pinCode?: string }): MasterWalletData {
    const normalizedSeed = seedPhrase.map((w) => String(w).toLowerCase());
    if (!this.validateSeedPhrase(normalizedSeed)) {
      throw new Error('Frase semilla inválida');
    }

    const walletAddress = this.deriveAddress(normalizedSeed);
    let wallet = this.masterWallets.get(walletAddress);

    if (!wallet) {
      const cleanUsername = options?.username?.trim().toLowerCase() || `wallet_${walletAddress.slice(-6)}`;
      if (!/^[a-z0-9_]{3,20}$/.test(cleanUsername)) {
        throw new Error('Nombre de usuario inválido');
      }
      if (options?.pinCode && !this.validatePinCode(options.pinCode)) {
        throw new Error('PIN inválido');
      }
      const pinCodeHash = options?.pinCode ? this.hashPinCode(options.pinCode) : crypto.createHash('sha256').update('000000').digest('hex');
      const allocation = 0;

      wallet = {
        username: cleanUsername,
        walletAddress,
        seedPhrase: normalizedSeed,
        pinCodeHash,
        balance: allocation,
        isActive: true,
        createdAt: Date.now(),
        tokenDistribution: {
          masterWalletsShare: ADES_GOLD.MASTER_WALLET_SHARE,
          ecosystemShare: ADES_GOLD.ECOSYSTEM_SHARE,
          totalAllocated: allocation,
        },
      };

      this.masterWallets.set(walletAddress, wallet);
      this.bankBalances.set(walletAddress, allocation);

      this.transactions.push({
        txHash: `recover_${crypto.randomBytes(8).toString('hex')}`,
        type: 'distribution',
        from: 'recovery',
        to: walletAddress,
        amount: allocation,
        denom: ADES_GOLD.DENOM,
        fee: 0,
        timestamp: Date.now(),
        status: 'completed',
      });
    } else if (options?.pinCode) {
      if (!this.validatePinCode(options.pinCode)) {
        throw new Error('PIN inválido');
      }
      wallet.pinCodeHash = this.hashPinCode(options.pinCode);
      if (options.username && options.username.trim()) {
        wallet.username = options.username.trim().toLowerCase();
      }
    }

    return { ...wallet };
  }

  public getWalletBySeedPhrase(seedPhrase: string[]): MasterWalletData | null {
    const normalizedSeed = seedPhrase.map((w) => String(w).toLowerCase());
    if (!this.validateSeedPhrase(normalizedSeed)) {
      return null;
    }
    const address = this.deriveAddress(normalizedSeed);
    const wallet = this.masterWallets.get(address);
    if (!wallet) return null;
    return this.sanitizeWallet(wallet);
  }

  private sanitizeWallet(wallet: MasterWalletData): MasterWalletData | null {
    const { pinCodeHash, seedPhrase, ...safe } = wallet;
    return { ...safe, pinCodeHash, seedPhrase } as MasterWalletData;
  }

  public getAllMasterWallets(): MasterWalletData[] {
    return Array.from(this.masterWallets.values()).map((w) => this.sanitizeWallet(w)!);
  }

  public getMasterWalletCount(): number {
    return this.masterWallets.size;
  }

  public getTokenDistribution(): TokenDistribution {
    const masterTotal = Array.from(this.masterWallets.values()).reduce(
      (sum, w) => sum + w.balance,
      0,
    );
    return {
      totalSupply: ADES_GOLD.TOTAL_SUPPLY,
      masterWalletsShare: ADES_GOLD.MASTER_WALLET_SHARE,
      ecosystemShare: ADES_GOLD.ECOSYSTEM_SHARE,
      masterWalletsTotal: masterTotal,
      ecosystemTotal: ADES_GOLD.TOTAL_SUPPLY - masterTotal,
      masterWalletCount: this.masterWallets.size,
    };
  }

  public getBalance(address: string): number {
    return this.bankBalances.get(address.toLowerCase()) || 0;
  }

  public isValidAddress(address: string): boolean {
    return /^adg1[a-f0-9]{20}$/.test(address.toLowerCase());
  }

  public calculateFee(amount: number): number {
    return Math.max(amount * ADES_GOLD.DEFAULT_FEE_RATE, ADES_GOLD.MIN_SWAP_FEE);
  }

  public async swap(
    traderAddress: string,
    fromDenom: string,
    toDenom: string,
    amount: number,
  ): Promise<TransactionRecord> {
    if (fromDenom === toDenom) {
      throw new Error('No se puede intercambiar el mismo token');
    }
    if (amount <= 0) {
      throw new Error('La cantidad debe ser mayor a 0');
    }

    const fromAddr = traderAddress.toLowerCase();
    const balance = this.getBalance(fromAddr);
    if (balance < amount) {
      throw new Error(`Saldo insuficiente: tiene ${balance} ${fromDenom}, necesita ${amount}`);
    }

    const fee = this.calculateFee(amount);
    const masterFee = fee * ADES_GOLD.MASTER_WALLET_FEE_SHARE;
    const netAmount = amount - fee;

    const rates: Record<string, number> = {
      'ADGS->ADG': 1,
      'ADG->ADGS': 1,
    };
    const rateKey = `${fromDenom}->${toDenom}`;
    const rate = rates[rateKey] || 1;
    const outputAmount = netAmount * rate;

    this.bankBalances.set(fromAddr, balance - amount);
    const masterBalance = this.getBalance(this.masterWalletAddress);
    this.bankBalances.set(this.masterWalletAddress, masterBalance + masterFee);

    const txHash = `swap_${crypto.randomBytes(16).toString('hex')}`;
    const record: TransactionRecord = {
      txHash,
      type: 'exchange',
      from: fromAddr,
      to: toDenom,
      amount,
      denom: fromDenom,
      fee,
      timestamp: Date.now(),
      status: 'completed',
      orderId: txHash,
    };

    this.transactions.push(record);
    return record;
  }

  public async buy(
    buyerAddress: string,
    amount: number,
    paymentDenom: string,
  ): Promise<TransactionRecord> {
    if (paymentDenom === 'ADG') {
      throw new Error('Usa sell() para convertir ADG a TUDOR');
    }
    return this.swap(buyerAddress, paymentDenom, 'ADG', amount);
  }

  public async sell(
    sellerAddress: string,
    amount: number,
    targetDenom: string,
  ): Promise<TransactionRecord> {
    if (targetDenom === 'ADG') {
      throw new Error('Usa buy() para comprar ADG');
    }
    return this.swap(sellerAddress, 'ADG', targetDenom, amount);
  }

  public async send(
    senderAddress: string,
    recipientAddress: string,
    amount: number,
    denom: string = ADES_GOLD.DENOM,
  ): Promise<TransactionRecord> {
    if (amount <= 0) {
      throw new Error('La cantidad a enviar debe ser mayor a 0');
    }

    const fee = this.calculateFee(amount);
    const amountAfterFee = amount - fee;
    if (amountAfterFee <= 0) {
      throw new Error('La tarifa es mayor que el monto a enviar');
    }

    const fromAddr = senderAddress.toLowerCase();
    const toAddr = recipientAddress.toLowerCase();

    if (!this.isValidAddress(toAddr)) {
      throw new Error(`Dirección inválida: ${recipientAddress}`);
    }

    const fromBalance = this.getBalance(fromAddr);
    if (fromBalance < amount) {
      throw new Error(`Saldo insuficiente: tiene ${fromBalance} ${denom}, necesita ${amount}`);
    }

    this.bankBalances.set(fromAddr, fromBalance - amount);
    const toBalance = this.getBalance(toAddr);
    this.bankBalances.set(toAddr, toBalance + amountAfterFee);
    const masterBalance = this.getBalance(this.masterWalletAddress);
    this.bankBalances.set(this.masterWalletAddress, masterBalance + fee);

    const txHash = `send_${crypto.randomBytes(16).toString('hex')}`;
    const record: TransactionRecord = {
      txHash,
      type: 'send',
      from: fromAddr,
      to: toAddr,
      amount: amountAfterFee,
      denom,
      fee,
      timestamp: Date.now(),
      status: 'completed',
    };

    this.transactions.push(record);
    return record;
  }

  public async receive(
    senderAddress: string,
    receiverAddress: string,
    amount: number,
    denom: string = ADES_GOLD.DENOM,
  ): Promise<TransactionRecord> {
    const fee = this.calculateFee(amount);
    const amountAfterFee = amount - fee;
    if (amountAfterFee <= 0) {
      throw new Error('La tarifa es mayor que el monto a recibir');
    }

    const fromAddr = senderAddress.toLowerCase();
    const toAddr = receiverAddress.toLowerCase();

    const fromBalance = this.getBalance(fromAddr);
    if (fromBalance < amount) {
      throw new Error(`Saldo insuficiente: tiene ${fromBalance} ${denom}, necesita ${amount}`);
    }

    this.bankBalances.set(fromAddr, fromBalance - amount);
    const toBalance = this.getBalance(toAddr);
    this.bankBalances.set(toAddr, toBalance + amountAfterFee);
    const masterBalance = this.getBalance(this.masterWalletAddress);
    this.bankBalances.set(this.masterWalletAddress, masterBalance + fee);

    const txHash = `recv_${crypto.randomBytes(16).toString('hex')}`;
    const record: TransactionRecord = {
      txHash,
      type: 'receive',
      from: fromAddr,
      to: toAddr,
      amount: amountAfterFee,
      denom,
      fee,
      timestamp: Date.now(),
      status: 'completed',
    };

    this.transactions.push(record);
    return record;
  }

  public async convert(
    holderAddress: string,
    fromDenom: string,
    toDenom: string,
    amount: number,
  ): Promise<TransactionRecord> {
    return this.swap(holderAddress, fromDenom, toDenom, amount);
  }

  public mineBlock(minerAddress: string): { blockNumber: number; reward: number; nonce: string } | null {
    if (!this.miningEnabled) {
      return null;
    }

    if (this.totalMinted() + ADES_GOLD.INITIAL_REWARD_PER_BLOCK > ADES_GOLD.TOTAL_SUPPLY) {
      return null;
    }

    const nonce = crypto.randomBytes(32).toString('hex');
    const hash = crypto
      .createHash('sha256')
      .update(`${this.totalBlocksMined}:${minerAddress}:${nonce}:${Date.now()}`)
      .digest('hex');

    const blockNumber = this.totalBlocksMined + 1;
    const minerReward = ADES_GOLD.INITIAL_REWARD_PER_BLOCK * ADES_GOLD.MINING_REWARD_SHARE;
    const treasuryReward = ADES_GOLD.INITIAL_REWARD_PER_BLOCK * ADES_GOLD.TREASURY_REWARD_SHARE;

    this.totalBlocksMined += 1;
    this.totalMintedCache += ADES_GOLD.INITIAL_REWARD_PER_BLOCK;

    const minerBalance = this.getBalance(minerAddress);
    this.bankBalances.set(minerAddress, minerBalance + minerReward);

    const masterBalance = this.getBalance(this.masterWalletAddress);
    this.bankBalances.set(this.masterWalletAddress, masterBalance + treasuryReward);

    const txHash = `mine_${crypto.randomBytes(16).toString('hex')}`;
    this.transactions.push({
      txHash,
      type: 'mine',
      from: 'mining',
      to: minerAddress,
      amount: minerReward + treasuryReward,
      denom: ADES_GOLD.DENOM,
      fee: 0,
      timestamp: Date.now(),
      status: 'completed',
    });

    return {
      blockNumber,
      reward: minerReward + treasuryReward,
      nonce: hash,
    };
  }

  private miningEnabled: boolean = true;
  private totalBlocksMined: number = 0;
  private totalMintedCache: number = 0;

  public totalMinted(): number {
    return this.totalMintedCache;
  }

  public getTotalBlocksMined(): number {
    return this.totalBlocksMined;
  }

  public setMiningEnabled(enabled: boolean): void {
    this.miningEnabled = enabled;
  }

  public distributeTokens(totalAmount: number, masterWalletCount: number): void {
    const masterTotal = totalAmount * ADES_GOLD.MASTER_WALLET_SHARE;
    const ecoTotal = totalAmount * ADES_GOLD.ECOSYSTEM_SHARE;
    const perWallet = masterWalletCount > 0 ? masterTotal / masterWalletCount : 0;

    for (const wallet of this.masterWallets.values()) {
      if (wallet.isActive) {
        const current = this.getBalance(wallet.walletAddress);
        this.bankBalances.set(wallet.walletAddress, current + perWallet);
        wallet.balance += perWallet;
        this.totalToMasterWallets += perWallet;
      }
    }

    const masterBal = this.getBalance(this.masterWalletAddress);
    this.bankBalances.set(this.masterWalletAddress, masterBal + ecoTotal);
    this.totalToEcosystem += ecoTotal;

    this.transactions.push({
      txHash: `dist_${crypto.randomBytes(16).toString('hex')}`,
      type: 'distribution',
      from: 'genesis',
      to: this.masterWalletAddress,
      amount: totalAmount,
      denom: ADES_GOLD.DENOM,
      fee: 0,
      timestamp: Date.now(),
      status: 'completed',
    });
  }

  public getTransactions(address?: string): TransactionRecord[] {
    let txs = this.transactions;
    if (address) {
      const addr = address.toLowerCase();
      txs = txs.filter((t) => t.from === addr || t.to === addr);
    }
    return [...txs].reverse();
  }

  public getExchangeStats(): {
    totalTrades: number;
    totalVolume: number;
    totalFeesCollected: number;
    feesToMasterWallet: number;
  } {
    const trades = this.transactions.filter((t) => t.type === 'exchange');
    const sends = this.transactions.filter((t) => t.type === 'send' || t.type === 'receive');
    const allFees = [...trades, ...sends];

    const totalFees = allFees.reduce((sum, t) => sum + t.fee, 0);
    const feesToMaster = allFees.reduce(
      (sum, t) => sum + t.fee * ADES_GOLD.MASTER_WALLET_FEE_SHARE,
      0,
    );

    return {
      totalTrades: trades.length + sends.length,
      totalVolume: trades.reduce((sum, t) => sum + t.amount, 0) + sends.reduce((sum, t) => sum + t.amount, 0),
      totalFeesCollected: totalFees,
      feesToMasterWallet: feesToMaster,
    };
  }

  public getMasterWalletAddress(): string {
    return this.masterWalletAddress;
  }

  public getEcoWalletAddress(): string {
    return this.ecoWalletAddress;
  }
}
