# 🔐 Confidential Transmission

> Privacy-Preserving Peer-to-Peer File Transfer with Fully Homomorphic Encryption

**Confidential Transmission** is a decentralized application (dApp) built on Zama's FHEVM (Fully Homomorphic Encryption Virtual Machine) that enables users to send encrypted files and messages to specific blockchain addresses with complete privacy protection.

[![License](https://img.shields.io/badge/license-BSD--3--Clause--Clear-blue.svg)](LICENSE)
[![Solidity](https://img.shields.io/badge/solidity-^0.8.24-brightgreen.svg)](https://soliditylang.org/)
[![FHEVM](https://img.shields.io/badge/FHEVM-v0.8.0-purple.svg)](https://github.com/zama-ai/fhevm)

## 🌟 Features

- **🔒 End-to-End Encryption**: Files are encrypted with AES-256 before being uploaded to IPFS
- **🎭 Anonymous Sender**: Sender addresses are encrypted using FHE, ensuring complete anonymity
- **🔑 Secure Key Distribution**: Decryption keys are encrypted and only accessible to the intended recipient
- **📦 Decentralized Storage**: Encrypted content is stored on IPFS for censorship resistance
- **🚫 Recipient-Only Access**: Only the designated recipient can decrypt and view the content
- **⛓️ Blockchain-Powered**: Built on Ethereum with Zama's FHEVM for on-chain privacy

## 🏗️ Architecture

```
┌─────────────┐     Encrypted      ┌──────────────┐
│   Sender    │────────File────────▶│     IPFS     │
│  (Anonymous)│                     │   (Content)  │
└─────────────┘                     └──────────────┘
       │                                    │
       │ FHE Encrypted                     │
       │ (Sender + Key)                    │
       ▼                                    ▼
┌─────────────────────────────────────────────────┐
│         ConfidentialTransmission.sol            │
│  ┌──────────────────────────────────────────┐  │
│  │ • Encrypted Sender Address (eaddress)    │  │
│  │ • Encrypted Decryption Key (euint256)    │  │
│  │ • Content CID (IPFS hash)                │  │
│  │ • Recipient Address (plain)              │  │
│  └──────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
                     │
                     │ FHE Decrypt (recipient only)
                     ▼
              ┌─────────────┐
              │  Recipient  │
              │ (Authorized)│
              └─────────────┘
```

## 🔧 Technology Stack

### Smart Contract Layer
- **Solidity ^0.8.24**: Smart contract language
- **FHEVM**: Fully Homomorphic Encryption on EVM
- **Hardhat**: Development environment
- **TypeChain**: TypeScript bindings for contracts

### Frontend Layer
- **React + TypeScript**: Modern UI framework
- **Vite**: Fast build tool
- **ethers.js**: Ethereum interaction library
- **Zama Relayer SDK**: FHE encryption/decryption
- **IPFS**: Decentralized file storage

### Encryption
- **FHE (Fully Homomorphic Encryption)**: On-chain encrypted computation
- **AES-256**: Off-chain file encryption
- **Zama's Encrypted Types**: `eaddress`, `euint256`

## 📋 Prerequisites

- **Node.js** >= 20.0.0
- **npm** >= 7.0.0
- **MetaMask** or compatible Web3 wallet
- **Git**

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/jan926-parkerc/confidential-transmission.git
cd confidential-transmission
```

### 2. Install Dependencies

```bash
# Install smart contract dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### 3. Configure Environment

Create a `.env` file in the root directory:

```env
# Private key for deployment (without 0x prefix)
PRIVATE_KEY=your_private_key_here

# Sepolia RPC URL
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_INFURA_KEY

# Etherscan API key for contract verification
ETHERSCAN_API_KEY=your_etherscan_api_key
```

### 4. Compile Smart Contracts

```bash
npm run compile
```

### 5. Deploy to Sepolia Testnet

```bash
npm run deploy:sepolia
```

### 6. Run Frontend

```bash
cd frontend
npm run dev
```

Visit `http://localhost:5173` to access the application.

## 📝 Smart Contract API

### Core Functions

#### `sendMessage()`
Send an encrypted file/message to a specific address.

```solidity
function sendMessage(
    address _recipient,
    string memory _contentCID,
    externalEaddress _encryptedSender,
    bytes calldata _senderProof,
    externalEuint256 _encryptedKey,
    bytes calldata _keyProof
) external returns (uint256 messageId)
```

**Parameters:**
- `_recipient`: The address that can decrypt this message
- `_contentCID`: IPFS CID of the encrypted content
- `_encryptedSender`: FHE encrypted sender address (for anonymity)
- `_senderProof`: Proof for encrypted sender
- `_encryptedKey`: FHE encrypted AES-256 decryption key
- `_keyProof`: Proof for encrypted key

**Returns:**
- `messageId`: Unique identifier for the message

#### `getMessage()`
Retrieve encrypted message data (recipient only).

```solidity
function getMessage(uint256 _messageId)
    external
    view
    returns (
        eaddress encryptedSender,
        string memory contentCID,
        euint256 encryptedKey,
        uint256 timestamp
    )
```

#### `getMyReceivedMessages()`
Get all message IDs received by the caller.

```solidity
function getMyReceivedMessages() external view returns (uint256[] memory)
```

#### `deleteMessage()`
Soft delete a message (recipient only).

```solidity
function deleteMessage(uint256 _messageId) external
```

## 🔒 Security Features

### 1. FHE Encrypted Sender Identity
```solidity
eaddress encryptedSender;  // Only recipient can decrypt
```

### 2. FHE Encrypted Decryption Key
```solidity
euint256 encryptedKey;  // 256-bit AES key, encrypted with FHE
```

### 3. Access Control
- Only the recipient can decrypt sender identity and file key
- Only the recipient can delete their messages
- Content stored on IPFS is encrypted before upload

### 4. Permission Management
```solidity
// Grant decryption permission ONLY to recipient
FHE.allow(sender, _recipient);
FHE.allow(key, _recipient);
```

## 📊 Use Cases

### 1. Confidential Document Sharing
- Legal firms sending sensitive documents to clients
- Healthcare providers sharing patient records

### 2. Anonymous Whistleblowing
- Secure, anonymous submission of sensitive information
- Protected identity of the sender

### 3. Private Messaging
- End-to-end encrypted communication
- Decentralized alternative to traditional messaging apps

### 4. Secure File Transfer
- Transfer of proprietary business documents
- Sharing of personal sensitive information

## 🧪 Testing

```bash
# Run all tests
npm test

# Run tests on Sepolia testnet
npm run test:sepolia

# Generate coverage report
npm run coverage
```

## 📦 Project Structure

```
confidential-transmission/
├── contracts/
│   └── ConfidentialTransmission.sol    # Main smart contract
├── deploy/
│   └── deploy.ts                       # Deployment script
├── frontend/
│   ├── src/
│   │   ├── components/                 # React components
│   │   ├── contract-config.ts          # Contract configuration
│   │   └── main.tsx                    # Entry point
│   ├── App.tsx                         # Main application
│   └── vite.config.ts                  # Vite configuration
├── tasks/
│   └── ConfidentialTransmission.ts     # Hardhat tasks
├── test/                               # Test files
├── hardhat.config.ts                   # Hardhat configuration
└── package.json                        # Dependencies
```

## 🛠️ Development

### Available Scripts

```bash
npm run compile        # Compile smart contracts
npm run test          # Run tests
npm run deploy:sepolia # Deploy to Sepolia
npm run lint          # Lint code
npm run prettier:write # Format code
npm run clean         # Clean build artifacts
```

### Frontend Development

```bash
cd frontend
npm run dev           # Start development server
npm run build         # Build for production
npm run preview       # Preview production build
```

## 🌐 Deployed Contracts

### Sepolia Testnet
- **Contract Address**: `[Your Contract Address]`
- **Network**: Sepolia Testnet
- **Explorer**: [View on Etherscan](https://sepolia.etherscan.io/address/YOUR_ADDRESS)

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the **BSD-3-Clause-Clear License**. See the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **[Zama](https://www.zama.ai/)** - For the FHEVM technology
- **[IPFS](https://ipfs.io/)** - For decentralized storage
- **[Hardhat](https://hardhat.org/)** - For development tools
- **[OpenZeppelin](https://www.openzeppelin.com/)** - For smart contract libraries

## 📚 Resources

- [Zama FHEVM Documentation](https://docs.zama.ai/fhevm)
- [FHEVM Solidity Library](https://github.com/zama-ai/fhevm-solidity)
- [Hardhat Documentation](https://hardhat.org/docs)
- [IPFS Documentation](https://docs.ipfs.io/)

## 📧 Contact

- **Project Repository**: [github.com/jan926-parkerc/confidential-transmission](https://github.com/jan926-parkerc/confidential-transmission)
- **Issues**: [Report a Bug](https://github.com/jan926-parkerc/confidential-transmission/issues)

## ⚠️ Disclaimer

This project is experimental and should be used for educational purposes only. Do not use it to transmit highly sensitive information without proper security audits. The developers are not responsible for any loss of data or security breaches.

---

**Built with ❤️ using Zama's FHEVM | Making Privacy Possible on Blockchain**

