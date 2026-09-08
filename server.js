const express = require('express');
const cors = require('cors');
const crypto = require('node:crypto');
const { AdesGoldWallet, ADES_GOLD, QuantumCall } = require('./dist/index.js');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const adesGoldWallet = new AdesGoldWallet();

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'AdesGold Wallet API',
    version: '1.0.0',
    chain: 'AdesGold',
    consensus: 'PoDT',
    token: ADES_GOLD.DENOM,
    totalSupply: ADES_GOLD.TOTAL_SUPPLY,
  });
});

app.post('/api/wallet/create', (req, res) => {
  try {
    const { username, pinCode, initialBalance } = req.body;
    const wallet = adesGoldWallet.createMasterWallet(
      username,
      pinCode || crypto.randomInt(0, 1000000).toString().padStart(6, '0'),
      initialBalance || 0,
    );
    const { pinCodeHash, ...safeWallet } = wallet;
    res.json({
      ok: true,
      wallet: safeWallet,
      message: 'Cuenta madre creada. Guarda tu frase semilla en un lugar seguro.',
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/wallet/authenticate', (req, res) => {
  try {
    const { seedPhrase, pinCode } = req.body;
    const wallet = adesGoldWallet.authenticate(seedPhrase, pinCode);
    if (!wallet) {
      return res.status(401).json({ ok: false, error: 'PIN o frase semilla incorrectos' });
    }
    const { pinCodeHash, ...safeWallet } = wallet;
    res.json({ ok: true, wallet: safeWallet });
  } catch (err) {
    res.status(401).json({ ok: false, error: err.message });
  }
});

app.post('/api/wallet/login', (req, res) => {
  try {
    const { username, pinCode } = req.body;
    if (!username || !pinCode) {
      return res.status(400).json({ ok: false, error: 'Usuario y PIN son requeridos' });
    }
    const wallet = adesGoldWallet.getWalletByUsername(username);
    if (!wallet) {
      return res.status(401).json({ ok: false, error: 'Usuario no encontrado' });
    }
    const pinHash = crypto.createHash('sha256').update(pinCode).digest('hex');
    if (wallet.pinCodeHash !== pinHash) {
      return res.status(401).json({ ok: false, error: 'PIN incorrecto' });
    }
    const { pinCodeHash, ...safeWallet } = wallet;
    res.json({ ok: true, wallet: safeWallet });
  } catch (err) {
    res.status(401).json({ ok: false, error: err.message });
  }
});

app.post('/api/wallet/recover', (req, res) => {
  try {
    const { seedPhrase, username, pinCode } = req.body;
    if (!seedPhrase || !Array.isArray(seedPhrase) || seedPhrase.length !== 12) {
      return res.status(400).json({ ok: false, error: 'Debes ingresar exactamente 12 palabras de recuperación' });
    }
    const existing = adesGoldWallet.getWalletBySeedPhrase(seedPhrase);
    try {
      const wallet = adesGoldWallet.recoverWallet(seedPhrase, { username, pinCode });
      const safeWallet = existing
        ? (() => { const { pinCodeHash: _, seedPhrase: __, ...rest } = wallet; return rest; })()
        : (() => { const { pinCodeHash: _, seedPhrase: __, ...rest } = wallet; return rest; })();
      res.json({
        ok: true,
        wallet: safeWallet,
        recovered: !!existing,
        message: existing ? 'Cuenta recuperada y actualizada' : 'Cuenta creada desde frase de recuperación',
      });
    } catch (walletError) {
      console.error('Recover wallet error', walletError);
      res.status(400).json({ ok: false, error: walletError.message || 'Error al recuperar wallet' });
    }
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get('/api/wallet/balance/:address', (req, res) => {
  try {
    const address = req.params.address;
    const balance = adesGoldWallet.getBalance(address);
    const distribution = adesGoldWallet.getTokenDistribution();
    res.json({
      address,
      balance: balance.toString(),
      denom: ADES_GOLD.DENOM,
      distribution,
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get('/api/wallet/distribution', (req, res) => {
  try {
    const distribution = adesGoldWallet.getTokenDistribution();
    res.json(distribution);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get('/api/wallet/master-wallets', (req, res) => {
  try {
    const wallets = adesGoldWallet.getAllMasterWallets();
    res.json({ wallets, count: wallets.length });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get('/api/wallet/stats', (req, res) => {
  try {
    const stats = adesGoldWallet.getExchangeStats();
    const miningStats = {
      totalBlocksMined: adesGoldWallet.getTotalBlocksMined(),
      totalMinted: adesGoldWallet.totalMinted(),
      totalSupply: ADES_GOLD.TOTAL_SUPPLY,
      rewardPerBlock: ADES_GOLD.INITIAL_REWARD_PER_BLOCK,
      miningRewardShare: ADES_GOLD.MINING_REWARD_SHARE,
      treasuryRewardShare: ADES_GOLD.TREASURY_REWARD_SHARE,
      masterWalletAddress: adesGoldWallet.getMasterWalletAddress(),
    };
    res.json({ exchange: stats, mining: miningStats });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/wallet/send', async (req, res) => {
  try {
    const { sender, recipient, amount, denom } = req.body;
    const tx = await adesGoldWallet.send(sender, recipient, amount, denom || ADES_GOLD.DENOM);
    res.json({ ok: true, transaction: tx });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/wallet/swap', async (req, res) => {
  try {
    const { sender, fromDenom, toDenom, amount } = req.body;
    const tx = await adesGoldWallet.swap(sender, fromDenom, toDenom, amount);
    res.json({ ok: true, transaction: tx });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/wallet/mine', async (req, res) => {
  try {
    const { minerAddress } = req.body;
    const result = adesGoldWallet.mineBlock(minerAddress);
    if (!result) {
      return res.status(200).json({ ok: true, message: 'Minado no exitoso (PoW no alcanzado)' });
    }
    res.json({ ok: true, result });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get('/api/wallet/transactions/:address', (req, res) => {
  try {
    const address = req.params.address;
    const txs = adesGoldWallet.getTransactions(address);
    res.json({ transactions: txs });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/wallet/buy', async (req, res) => {
  try {
    const { buyer, amount, paymentDenom } = req.body;
    const tx = await adesGoldWallet.buy(buyer, amount, paymentDenom);
    res.json({ ok: true, transaction: tx });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/wallet/sell', async (req, res) => {
  try {
    const { seller, amount, targetDenom } = req.body;
    const tx = await adesGoldWallet.sell(seller, amount, targetDenom);
    res.json({ ok: true, transaction: tx });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/wallet/receive', async (req, res) => {
  try {
    const { sender, receiver, amount, denom } = req.body;
    const tx = await adesGoldWallet.receive(sender, receiver, amount, denom || ADES_GOLD.DENOM);
    res.json({ ok: true, transaction: tx });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get('/api/blockchain/info', (req, res) => {
  try {
    const masterWallet = adesGoldWallet.getMasterWalletAddress();
    const ecoWallet = adesGoldWallet.getEcoWalletAddress();
    const distribution = adesGoldWallet.getTokenDistribution();

    res.json({
      name: 'AdesGold',
      chainId: 'adesgold-1',
      consensus: 'PoDT (Proof of Digital Trust)',
      token: ADES_GOLD.DENOM,
      decimals: ADES_GOLD.DECIMALS,
      totalSupply: ADES_GOLD.TOTAL_SUPPLY,
      masterWalletsShare: ADES_GOLD.MASTER_WALLET_SHARE,
      ecosystemShare: ADES_GOLD.ECOSYSTEM_SHARE,
      wallets: {
        master: masterWallet,
        ecosystem: ecoWallet,
      },
      distribution,
      features: [
        'Post-Quantum Cryptography (XMSS-SHA2-256)',
        'Proof of Digital Trust (PoDT)',
        'Stealth Addresses',
        'Confidential Transactions',
        'Ring Signatures',
      ],
    });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

// ========== QuantumCall Endpoints ==========

app.post('/api/call/initiate', (req, res) => {
  try {
    const { callerAddress, calleeAddress, type, transport } = req.body;
    const quantumCall = new QuantumCall();
    quantumCall.bindWallet(callerAddress);
    const session = quantumCall.initiateCall(calleeAddress, type, transport);
    if (!session) {
      return res.status(400).json({ ok: false, error: 'No se pudo iniciar la llamada' });
    }
    res.json({ ok: true, session });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/call/answer', (req, res) => {
  try {
    const { callId, calleeAddress } = req.body;
    const quantumCall = new QuantumCall();
    quantumCall.bindWallet(calleeAddress);
    const session = quantumCall.answerCall(callId);
    if (!session) {
      return res.status(400).json({ ok: false, error: 'No se pudo responder la llamada' });
    }
    res.json({ ok: true, session });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.post('/api/call/end', (req, res) => {
  try {
    const { callId } = req.body;
    const quantumCall = new QuantumCall();
    const session = quantumCall.endCall(callId);
    if (!session) {
      return res.status(400).json({ ok: false, error: 'No se pudo finalizar la llamada' });
    }
    res.json({ ok: true, session });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get('/api/call/history', (req, res) => {
  try {
    const quantumCall = new QuantumCall();
    const history = quantumCall.getCallHistory();
    res.json({ calls: history });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

app.get('/api/call/security', (req, res) => {
  try {
    const quantumCall = new QuantumCall();
    const security = quantumCall.getSecurityStatus();
    res.json(security);
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message });
  }
});

const server = app.listen(PORT, () => {
  console.log(`\n=========================================`);
  console.log(`⛓️ AdesGold Wallet API corriendo en puerto ${PORT}`);
  console.log(`🔗 Health: http://localhost:${PORT}/health`);
  console.log(`💎 Wallet API: http://localhost:${PORT}/api/wallet`);
  console.log(`⛓️ Blockchain Info: http://localhost:${PORT}/api/blockchain/info`);
  console.log(`📞 QuantumCall API: http://localhost:${PORT}/api/call`);
  console.log(`=========================================\n`);
});

module.exports = { app, server };
