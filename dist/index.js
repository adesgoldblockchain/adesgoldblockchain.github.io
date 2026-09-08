"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdesGoldWallet = exports.DEFAULT_QUANTUM_CALL_CONFIG = exports.QuantumCall = exports.PrivacyManager = exports.DEFAULT_PODT_CONFIG = exports.PoDTConsensus = exports.PQCrypto = exports.ECO_WALLET_ADDRESS = exports.MASTER_WALLET_ADDRESS = exports.MNEMONIC_WORDS = exports.ADES_GOLD = void 0;
const node_crypto_1 = __importDefault(require("node:crypto"));
const constants_js_1 = require("./constants.js");
Object.defineProperty(exports, "ADES_GOLD", { enumerable: true, get: function () { return constants_js_1.ADES_GOLD; } });
Object.defineProperty(exports, "MNEMONIC_WORDS", { enumerable: true, get: function () { return constants_js_1.MNEMONIC_WORDS; } });
Object.defineProperty(exports, "MASTER_WALLET_ADDRESS", { enumerable: true, get: function () { return constants_js_1.MASTER_WALLET_ADDRESS; } });
Object.defineProperty(exports, "ECO_WALLET_ADDRESS", { enumerable: true, get: function () { return constants_js_1.ECO_WALLET_ADDRESS; } });
const pq_crypto_js_1 = require("./pq-crypto.js");
Object.defineProperty(exports, "PQCrypto", { enumerable: true, get: function () { return pq_crypto_js_1.PQCrypto; } });
const podt_consensus_js_1 = require("./podt-consensus.js");
Object.defineProperty(exports, "PoDTConsensus", { enumerable: true, get: function () { return podt_consensus_js_1.PoDTConsensus; } });
Object.defineProperty(exports, "DEFAULT_PODT_CONFIG", { enumerable: true, get: function () { return podt_consensus_js_1.DEFAULT_PODT_CONFIG; } });
const privacy_js_1 = require("./privacy.js");
Object.defineProperty(exports, "PrivacyManager", { enumerable: true, get: function () { return privacy_js_1.PrivacyManager; } });
const quantum_call_js_1 = require("./quantum-call.js");
Object.defineProperty(exports, "QuantumCall", { enumerable: true, get: function () { return quantum_call_js_1.QuantumCall; } });
Object.defineProperty(exports, "DEFAULT_QUANTUM_CALL_CONFIG", { enumerable: true, get: function () { return quantum_call_js_1.DEFAULT_QUANTUM_CALL_CONFIG; } });
class AdesGoldWallet {
    constructor(masterWalletAddress = constants_js_1.MASTER_WALLET_ADDRESS, ecoWalletAddress = constants_js_1.ECO_WALLET_ADDRESS) {
        this.bankBalances = new Map();
        this.masterWallets = new Map();
        this.transactions = [];
        this.totalToMasterWallets = 0;
        this.totalToEcosystem = 0;
        this.miningEnabled = true;
        this.totalBlocksMined = 0;
        this.totalMintedCache = 0;
        this.masterWalletAddress = masterWalletAddress.toLowerCase();
        this.ecoWalletAddress = ecoWalletAddress.toLowerCase();
        this.initializeBalances();
    }
    initializeBalances() {
        this.bankBalances.set(this.masterWalletAddress, constants_js_1.ADES_GOLD.TOKEN_DISTRIBUTION.masterWallets);
        this.bankBalances.set(this.ecoWalletAddress, constants_js_1.ADES_GOLD.TOKEN_DISTRIBUTION.ecosystem);
    }
    generateSeedPhrase(numWords = 12) {
        const words = [];
        for (let i = 0; i < numWords; i++) {
            const idx = node_crypto_1.default.randomInt(0, constants_js_1.MNEMONIC_WORDS.length);
            words.push(constants_js_1.MNEMONIC_WORDS[idx]);
        }
        return words;
    }
    validateSeedPhrase(words) {
        return words.length === 12 && words.every((w) => typeof w === 'string' && w.length > 0);
    }
    validatePinCode(pin) {
        return /^\d{6}$/.test(pin);
    }
    hashPinCode(pin) {
        if (!this.validatePinCode(pin)) {
            throw new Error('El PIN debe ser un código numérico de 6 dígitos');
        }
        return node_crypto_1.default.createHash('sha256').update(pin).digest('hex');
    }
    deriveAddress(seedPhrase) {
        const seed = node_crypto_1.default
            .createHash('sha256')
            .update(seedPhrase.join(''))
            .digest('hex');
        return `adg1${seed.slice(0, 20)}`;
    }
    createMasterWallet(username, pinCode, initialBalance = 0) {
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
        const seedPhrase = this.generateSeedPhrase(12);
        const walletAddress = this.deriveAddress(seedPhrase);
        if (this.masterWallets.has(walletAddress)) {
            throw new Error('Esta wallet ya está registrada como cuenta madre');
        }
        const pinCodeHash = this.hashPinCode(pinCode);
        const allocation = initialBalance > 0 ? initialBalance : 1000;
        const wallet = {
            username: cleanUsername,
            walletAddress,
            seedPhrase,
            pinCodeHash,
            balance: allocation,
            isActive: true,
            createdAt: Date.now(),
            tokenDistribution: {
                masterWalletsShare: constants_js_1.ADES_GOLD.MASTER_WALLET_SHARE,
                ecosystemShare: constants_js_1.ADES_GOLD.ECOSYSTEM_SHARE,
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
            txHash: `init_${node_crypto_1.default.randomBytes(8).toString('hex')}`,
            type: 'distribution',
            from: this.masterWalletAddress,
            to: walletAddress,
            amount: initialBalance,
            denom: constants_js_1.ADES_GOLD.DENOM,
            fee: 0,
            timestamp: Date.now(),
            status: 'completed',
        });
        return wallet;
    }
    authenticate(seedPhrase, pinCode) {
        if (!this.validateSeedPhrase(seedPhrase) || !this.validatePinCode(pinCode)) {
            return null;
        }
        const walletAddress = this.deriveAddress(seedPhrase);
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
    getWalletByAddress(address) {
        const wallet = this.masterWallets.get(address.toLowerCase());
        if (!wallet)
            return null;
        const { pinCodeHash, seedPhrase, ...safeWallet } = wallet;
        return { ...safeWallet, pinCodeHash, seedPhrase };
    }
    getWalletByUsername(username) {
        for (const wallet of this.masterWallets.values()) {
            if (wallet.username === username.trim().toLowerCase()) {
                return this.sanitizeWallet(wallet);
            }
        }
        return null;
    }
    sanitizeWallet(wallet) {
        const { pinCodeHash, seedPhrase, ...safe } = wallet;
        return { ...safe, pinCodeHash, seedPhrase };
    }
    getAllMasterWallets() {
        return Array.from(this.masterWallets.values()).map((w) => this.sanitizeWallet(w));
    }
    getMasterWalletCount() {
        return this.masterWallets.size;
    }
    getTokenDistribution() {
        const masterTotal = Array.from(this.masterWallets.values()).reduce((sum, w) => sum + w.balance, 0);
        return {
            totalSupply: constants_js_1.ADES_GOLD.TOTAL_SUPPLY,
            masterWalletsShare: constants_js_1.ADES_GOLD.MASTER_WALLET_SHARE,
            ecosystemShare: constants_js_1.ADES_GOLD.ECOSYSTEM_SHARE,
            masterWalletsTotal: masterTotal,
            ecosystemTotal: constants_js_1.ADES_GOLD.TOTAL_SUPPLY - masterTotal,
            masterWalletCount: this.masterWallets.size,
        };
    }
    getBalance(address) {
        return this.bankBalances.get(address.toLowerCase()) || 0;
    }
    isValidAddress(address) {
        return /^adg1[a-f0-9]{20}$/.test(address.toLowerCase());
    }
    calculateFee(amount) {
        return Math.max(amount * constants_js_1.ADES_GOLD.DEFAULT_FEE_RATE, constants_js_1.ADES_GOLD.MIN_SWAP_FEE);
    }
    async swap(traderAddress, fromDenom, toDenom, amount) {
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
        const masterFee = fee * constants_js_1.ADES_GOLD.MASTER_WALLET_FEE_SHARE;
        const netAmount = amount - fee;
        const rates = {
            'ADGS->ADG': 1,
            'ADG->ADGS': 1,
        };
        const rateKey = `${fromDenom}->${toDenom}`;
        const rate = rates[rateKey] || 1;
        const outputAmount = netAmount * rate;
        this.bankBalances.set(fromAddr, balance - amount);
        const masterBalance = this.getBalance(this.masterWalletAddress);
        this.bankBalances.set(this.masterWalletAddress, masterBalance + masterFee);
        const txHash = `swap_${node_crypto_1.default.randomBytes(16).toString('hex')}`;
        const record = {
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
    async buy(buyerAddress, amount, paymentDenom) {
        if (paymentDenom === 'ADG') {
            throw new Error('Usa sell() para convertir ADG a TUDOR');
        }
        return this.swap(buyerAddress, paymentDenom, 'ADG', amount);
    }
    async sell(sellerAddress, amount, targetDenom) {
        if (targetDenom === 'ADG') {
            throw new Error('Usa buy() para comprar ADG');
        }
        return this.swap(sellerAddress, 'ADG', targetDenom, amount);
    }
    async send(senderAddress, recipientAddress, amount, denom = constants_js_1.ADES_GOLD.DENOM) {
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
        const txHash = `send_${node_crypto_1.default.randomBytes(16).toString('hex')}`;
        const record = {
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
    async receive(senderAddress, receiverAddress, amount, denom = constants_js_1.ADES_GOLD.DENOM) {
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
        const txHash = `recv_${node_crypto_1.default.randomBytes(16).toString('hex')}`;
        const record = {
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
    async convert(holderAddress, fromDenom, toDenom, amount) {
        return this.swap(holderAddress, fromDenom, toDenom, amount);
    }
    mineBlock(minerAddress) {
        if (!this.miningEnabled) {
            return null;
        }
        if (this.totalMinted() + constants_js_1.ADES_GOLD.INITIAL_REWARD_PER_BLOCK > constants_js_1.ADES_GOLD.TOTAL_SUPPLY) {
            return null;
        }
        const nonce = node_crypto_1.default.randomBytes(32).toString('hex');
        const hash = node_crypto_1.default
            .createHash('sha256')
            .update(`${this.totalBlocksMined}:${minerAddress}:${nonce}:${Date.now()}`)
            .digest('hex');
        const blockNumber = this.totalBlocksMined + 1;
        const minerReward = constants_js_1.ADES_GOLD.INITIAL_REWARD_PER_BLOCK * constants_js_1.ADES_GOLD.MINING_REWARD_SHARE;
        const treasuryReward = constants_js_1.ADES_GOLD.INITIAL_REWARD_PER_BLOCK * constants_js_1.ADES_GOLD.TREASURY_REWARD_SHARE;
        this.totalBlocksMined += 1;
        this.totalMintedCache += constants_js_1.ADES_GOLD.INITIAL_REWARD_PER_BLOCK;
        const minerBalance = this.getBalance(minerAddress);
        this.bankBalances.set(minerAddress, minerBalance + minerReward);
        const masterBalance = this.getBalance(this.masterWalletAddress);
        this.bankBalances.set(this.masterWalletAddress, masterBalance + treasuryReward);
        const txHash = `mine_${node_crypto_1.default.randomBytes(16).toString('hex')}`;
        this.transactions.push({
            txHash,
            type: 'mine',
            from: 'mining',
            to: minerAddress,
            amount: minerReward + treasuryReward,
            denom: constants_js_1.ADES_GOLD.DENOM,
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
    totalMinted() {
        return this.totalMintedCache;
    }
    getTotalBlocksMined() {
        return this.totalBlocksMined;
    }
    setMiningEnabled(enabled) {
        this.miningEnabled = enabled;
    }
    distributeTokens(totalAmount, masterWalletCount) {
        const masterTotal = totalAmount * constants_js_1.ADES_GOLD.MASTER_WALLET_SHARE;
        const ecoTotal = totalAmount * constants_js_1.ADES_GOLD.ECOSYSTEM_SHARE;
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
            txHash: `dist_${node_crypto_1.default.randomBytes(16).toString('hex')}`,
            type: 'distribution',
            from: 'genesis',
            to: this.masterWalletAddress,
            amount: totalAmount,
            denom: constants_js_1.ADES_GOLD.DENOM,
            fee: 0,
            timestamp: Date.now(),
            status: 'completed',
        });
    }
    getTransactions(address) {
        let txs = this.transactions;
        if (address) {
            const addr = address.toLowerCase();
            txs = txs.filter((t) => t.from === addr || t.to === addr);
        }
        return [...txs].reverse();
    }
    getExchangeStats() {
        const trades = this.transactions.filter((t) => t.type === 'exchange');
        const sends = this.transactions.filter((t) => t.type === 'send' || t.type === 'receive');
        const allFees = [...trades, ...sends];
        const totalFees = allFees.reduce((sum, t) => sum + t.fee, 0);
        const feesToMaster = allFees.reduce((sum, t) => sum + t.fee * constants_js_1.ADES_GOLD.MASTER_WALLET_FEE_SHARE, 0);
        return {
            totalTrades: trades.length + sends.length,
            totalVolume: trades.reduce((sum, t) => sum + t.amount, 0) + sends.reduce((sum, t) => sum + t.amount, 0),
            totalFeesCollected: totalFees,
            feesToMasterWallet: feesToMaster,
        };
    }
    getMasterWalletAddress() {
        return this.masterWalletAddress;
    }
    getEcoWalletAddress() {
        return this.ecoWalletAddress;
    }
}
exports.AdesGoldWallet = AdesGoldWallet;
