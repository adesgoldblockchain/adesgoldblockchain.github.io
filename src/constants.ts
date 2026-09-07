export const ADES_GOLD = {
  DENOM: 'ADG',
  DECIMALS: 18,
  TOTAL_SUPPLY: 100_000_000,
  MASTER_WALLET_SHARE: 0.30,
  ECOSYSTEM_SHARE: 0.70,
  MINING_REWARD_SHARE: 0.49,
  TREASURY_REWARD_SHARE: 0.51,
  INITIAL_REWARD_PER_BLOCK: 50,
  BLOCK_TIME_SECONDS: 2,
  MIN_SWAP_FEE: 0.01,
  DEFAULT_FEE_RATE: 0.001,
  MASTER_WALLET_FEE_SHARE: 0.50,
  TOKEN_DISTRIBUTION: {
    masterWallets: 30_000_000,
    ecosystem: 70_000_000,
  },
} as const;

export const MASTER_WALLET_ADDRESS = 'tudor1treasury000000000000000000000000q3k8la';
export const ECO_WALLET_ADDRESS = 'tudor1ecosyste00000000000000000000000000000000ea';
export const FAUCET_ADDRESS = 'tudor1faucet000000000000000000000000007v3wep';

export const MNEMONIC_WORDS = [
  'abandon', 'ability', 'able', 'about', 'above', 'absent',
  'absorb', 'abstract', 'absurd', 'accelerate', 'accept', 'accident',
  'account', 'accuse', 'ache', 'achieve', 'acid', 'acoustic',
  'acquire', 'across', 'action', 'actor', 'adapt', 'add',
  'admin', 'admit', 'adult', 'after', 'again', 'against',
  'age', 'agency', 'agent', 'agree', 'ahead', 'aim',
  'air', 'all', 'allow', 'almost', 'alone', 'along',
];
