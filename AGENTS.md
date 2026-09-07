# AGENTS.md — AdesGold Core

## Build & Test Commands

### Build
```bash
cargo build                    # Default build (Ed25519)
cargo build --features pqc     # Build with post-quantum crypto (ML-DSA-65, ML-KEM-768)
cargo build --release          # Optimized production build
```

### Test
```bash
cargo test                     # Run all unit + integration tests (69 unit + 10 integration)
cargo test --features pqc      # Include PQC tests (77 unit + 10 integration)
```

### Lint
```bash
cargo clippy                   # Lint warnings
cargo clippy --features pqc    # Lint with PQC feature
```

### Typecheck / Check
```bash
cargo check                    # Fast compile check
cargo check --features pqc     # Check with PQC feature
```

## Project Structure

```
adesgold/
├── Cargo.toml                 # Root config, dependencies
├── AGENTS.md                  # This file
├── src/
│   ├── main.rs                # CLI entry point
│   ├── lib.rs                 # Library module exports
│   ├── crypto/
│   │   ├── mod.rs             # Crypto module root
│   │   ├── hash.rs            # SHA-256, Keccak-256, Blake3, SHAKE-256, Merkle hashing
│   │   ├── signature.rs       # SignatureScheme trait, Ed25519 + ML-DSA-65
│   │   └── kem.rs             # Hybrid KEM (X25519 + ML-KEM-768) key exchange
│   ├── blockchain/
│   │   ├── mod.rs             # Blockchain module root
│   │   ├── block.rs           # Block, BlockHeader, Transaction types
│   │   ├── merkle.rs          # MerkleTree + MerkleProof
│   │   └── state.rs           # UTXO set + ChainState
│   ├── consensus/
│   │   ├── mod.rs             # Consensus module root
│   │   ├── podt.rs            # Proof-of-Download validation
│   │   └── engine.rs          # Consensus engine, difficulty, block validation
│   ├── wallet/
│   │   ├── mod.rs
│   │   ├── keys.rs            # Wallet, keypair, signing, encryption, mnemonic
│   │   └── address.rs         # Address (hex + Base58), RIPEMD-style via Keccak
│   └── cli/
│       └── mod.rs             # CLI structure (clap derive)
└── tests/
    └── integration.rs         # Integration tests
```

## Feature Flags

| Feature    | Description                                      |
|------------|--------------------------------------------------|
| (default)  | Standard crypto: Ed25519, X25519                 |
| `pqc`      | Post-quantum: ML-DSA-65 signatures, ML-KEM-768   |
| `full_crypto` | Alias for `pqc` — full hybrid crypto stack     |

## Crypto Architecture

```
Hybrid Crypto = X25519 (classical) + ML-KEM-768 (NIST PQC)
  │
  ├── Key Exchange: Encapsulate/Decapsulate with XOR-combined shared secrets
  └── Signatures: ML-DSA-65 (NIST PQC) or Ed25519 (fallback)
```
