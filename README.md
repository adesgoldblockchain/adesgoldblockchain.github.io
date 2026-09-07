# AdesGold Wallet SDK

**Blockchain soberana con consenso PoDT y privacidad post-cuántica**

## Descripción

AdesGold es una blockchain que implementa:

- **PoDT (Proof of Digital Trust)**: Consenso basado en puntuaciones de confianza y reputación de validadores
- **Criptografía post-cuántica**: Firmas XMSS-SHA2-256, resistentes a computadoras cuánticas
- **Privacidad avanzada**: Direcciones stealth, transacciones confidenciales y firmas anónimas

## Instalación

```bash
npm install adesgold-wallet
```

## Uso

```typescript
import { AdesGoldWallet, PQCrypto, PoDTConsensus, PrivacyManager, ADES_GOLD } from 'adesgold-wallet';

// Wallet principal
const wallet = new AdesGoldWallet();
const masterWallet = wallet.createMasterWallet('usuario', '123456', 1000);

// Criptografía post-cuántica
const { publicKey, privateKey } = PQCrypto.generateKeyPair();
const signed = PQCrypto.sign('mensaje', privateKey);
console.log(PQCrypto.verify(signed)); // true

// Consenso PoDT
const consensus = new PoDTConsensus();
const proposer = consensus.selectProposer(1);

// Privacidad
const privacy = new PrivacyManager();
const stealth = privacy.generateStealthKeyPair();
```

## Token ADG

| Parámetro | Valor |
|-----------|-------|
| Símbolo | ADG |
| Suministro total | 100,000,000 |
| Distribución master wallets | 30% (30,000,000) |
| Distribución ecosistema | 70% (70,000,000) |
| Recompensa minero | 49% por bloque |
| Recompensa tesoro | 51% por bloque |

## Licencia

MIT
