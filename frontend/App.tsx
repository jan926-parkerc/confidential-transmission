import { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI, FHEVM_CONFIG, NETWORK_CONFIG } from './src/contract-config';
import WalletModal, { WalletType } from './src/components/WalletModal';
import './src/index.css';

// Type for FHEVM instance (UMD SDK) - Based on official Zama docs
interface FhevmInstance {
  createEncryptedInput(contractAddress: string, userAddress: string): any;
  getPublicKey(contractAddress: string): { publicKeyId: string; publicKey: Uint8Array } | string;
  createEIP712(
    publicKey: string,
    contractAddresses: string[],
    startTimestamp: string | number,
    durationDays: string | number
  ): {
    domain: any;
    types: {
      UserDecryptRequestVerification: Array<{ name: string; type: string }>;
    };
    message: any;
  };
  generateKeypair(): { publicKey: string; privateKey: string };
  userDecrypt(
    handleContractPairs: Array<{ handle: string; contractAddress: string }>,
    privateKey: string,
    publicKey: string,
    signature: string,
    contractAddresses: string[],
    userAddress: string,
    startTimestamp: string | number,
    durationDays: string | number
  ): Promise<Record<string, bigint>>;
}

// Declare global relayerSDK
declare global {
  interface Window {
    relayerSDK?: {
      initSDK(): Promise<void>;
      createInstance(config: {
        networkUrl: string;
        gatewayUrl?: string;
      }): Promise<FhevmInstance>;
      SepoliaConfig?: any;
    };
  }
}

/**
 * 🔐 ConfidentialTransmission - React Frontend
 * ============================================
 * 
 * End-to-End Encrypted File Transfer DApp
 * - AES-256 encryption for file content
 * - FHE protection for sender identity and key
 * - IPFS storage for encrypted files
 * - Only recipient can decrypt
 */

interface Message {
  id: number;
  recipient: string;
  contentCID: string;
  timestamp: number;
  isDeleted: boolean;
}

declare global {
  interface Window {
    ethereum?: any;
    zamaRelayerSDK?: {
      initSDK: () => Promise<void>;
      createInstance: (config: { networkUrl: string; gatewayUrl?: string }) => Promise<FhevmInstance>;
      SepoliaConfig?: any;
    };
  }
}

function App() {
  // State
  const [signer, setSigner] = useState<ethers.Signer | null>(null);
  const [contract, setContract] = useState<ethers.Contract | null>(null);
  const [fhevmInstance, setFhevmInstance] = useState<FhevmInstance | null>(null);
  const [account, setAccount] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  
  // Messages
  const [receivedMessages, setReceivedMessages] = useState<Message[]>([]);
  const [sentMessages, setSentMessages] = useState<Message[]>([]);
  
  // Send form
  const [recipientAddress, setRecipientAddress] = useState('');
  const [messageType, setMessageType] = useState<'text' | 'file'>('text'); // Message type
  const [textMessage, setTextMessage] = useState(''); // Text message content
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [sendStatus, setSendStatus] = useState('');
  
  // Decryption success modal
  const [showDecryptSuccess, setShowDecryptSuccess] = useState(false);
  const [decryptedInfo, setDecryptedInfo] = useState<{
    messageId: number;
    sender: string;
    filename: string;
    size: number;
    type: string;
  } | null>(null);
  
  // Prepare status
  const [isPrepared, setIsPrepared] = useState(false);
  const [preparedCid, setPreparedCid] = useState('');
  const [preparedKey, setPreparedKey] = useState('');
  const [preparing, setPreparing] = useState(false);
  
  // UI
  const [activeTab, setActiveTab] = useState<'send' | 'received' | 'sent'>('send');
  const [loading, setLoading] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [sdkStatus, setSdkStatus] = useState<'loading' | 'success' | 'error'>('loading');

  // Initialize on mount
  useEffect(() => {
    checkConnection();
    
    // Monitor account/network changes
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);
      
      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, []);

  const handleAccountsChanged = (accounts: string[]) => {
    if (accounts.length === 0) {
      disconnectWallet();
    } else {
      connectWallet();
    }
  };

  const handleChainChanged = () => {
    window.location.reload();
  };

  // Check if already connected
  const checkConnection = async () => {
    if (window.ethereum) {
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        if (accounts.length > 0) {
          await connectWallet();
        }
      } catch (error) {
        console.error('Check connection error:', error);
      }
    }
  };

  // Handle wallet connection from modal
  const handleWalletConnect = async (walletType: WalletType) => {
    setConnecting(true);
    
    try {
      // Currently only MetaMask is fully implemented
      if (walletType === 'metamask') {
        await connectWallet();
        setShowWalletModal(false);
      } else {
        alert(`${walletType} support coming soon! Please use MetaMask for now.`);
      }
    } catch (error) {
      console.error('Connection error:', error);
    } finally {
      setConnecting(false);
    }
  };

  // Connect wallet with Sepolia network check
  const connectWallet = async () => {
    try {
      if (!window.ethereum) {
        alert('❌ Please install MetaMask!');
        return;
      }

      setLoading(true);

      // Request account access
      await window.ethereum.request({ method: 'eth_requestAccounts' });

      // Initialize provider
      const ethProvider = new ethers.BrowserProvider(window.ethereum);
      const ethSigner = await ethProvider.getSigner();
      const userAccount = await ethSigner.getAddress();
      const network = await ethProvider.getNetwork();
      const currentChainId = Number(network.chainId);

      // ✅ Check if on Sepolia network
      const targetChainId = NETWORK_CONFIG.sepolia.chainId;
      if (currentChainId !== targetChainId) {
        const switchSuccess = await switchToSepolia();
        if (!switchSuccess) {
          alert(`❌ Please switch to ${NETWORK_CONFIG.sepolia.name} network (Chain ID: ${targetChainId})`);
          setLoading(false);
          return;
        }
        // Reload after network switch
        window.location.reload();
        return;
      }

      setSigner(ethSigner);
      setAccount(userAccount);

      // Initialize contract
      const contractInstance = new ethers.Contract(
        CONTRACT_ADDRESS,
        CONTRACT_ABI,
        ethSigner
      );
      setContract(contractInstance);

      // Initialize FHEVM - Using UMD SDK (relayerSDK)
      try {
        setSdkStatus('loading');
        const sdk = window.relayerSDK;
        
        if (!sdk) {
          throw new Error('Zama Relayer SDK not loaded, please check index.html');
        }
        
        // Initialize WASM
        await sdk.initSDK();
        
        // Use SDK built-in SepoliaConfig (includes KMS address)
        const config = sdk.SepoliaConfig || {
          networkUrl: FHEVM_CONFIG.networkUrl,
          gatewayUrl: FHEVM_CONFIG.gatewayUrl || undefined,
        };
        
        // Create FHEVM instance
        const fheInstance = await sdk.createInstance(config);
        setFhevmInstance(fheInstance);
        setSdkStatus('success');
        
      } catch (fheError) {
        console.error('❌ FHEVM SDK initialization failed:', fheError);
        setSdkStatus('error');
      }

      setIsConnected(true);
      
      // Load messages
      await loadMessages(contractInstance);
    } catch (error: any) {
      console.error('❌ Connection error:', error);
      alert('Failed to connect: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Switch to Sepolia network
  const switchToSepolia = async (): Promise<boolean> => {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: NETWORK_CONFIG.sepolia.chainIdHex }],
      });
      return true;
    } catch (switchError: any) {
      // This error code indicates that the chain has not been added to MetaMask
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: NETWORK_CONFIG.sepolia.chainIdHex,
              chainName: NETWORK_CONFIG.sepolia.name,
              rpcUrls: [NETWORK_CONFIG.sepolia.rpcUrl],
              blockExplorerUrls: [NETWORK_CONFIG.sepolia.blockExplorer],
              nativeCurrency: {
                name: 'Sepolia ETH',
                symbol: 'ETH',
                decimals: 18
              }
            }],
          });
          return true;
        } catch (addError) {
          console.error('Failed to add network:', addError);
          return false;
        }
      }
      console.error('Failed to switch network:', switchError);
      return false;
    }
  };

  // Disconnect wallet
  const disconnectWallet = () => {
    setSigner(null);
    setContract(null);
    setFhevmInstance(null);
    setAccount('');
    setIsConnected(false);
    setReceivedMessages([]);
    setSentMessages([]);
  };

  // Load messages
  const loadMessages = async (contractInstance?: ethers.Contract) => {
    const activeContract = contractInstance || contract;
    if (!activeContract) return;

    try {
      setLoading(true);

      // Load received messages
      const receivedIds = await activeContract.getMyReceivedMessages();
      const received: Message[] = [];
      for (const id of receivedIds) {
        const messageId = Number(id);
        const metadata = await activeContract.getMessageMetadata(messageId);
        received.push({
          id: messageId,
          recipient: metadata.recipient,
          contentCID: metadata.contentCID,
          timestamp: Number(metadata.timestamp),
          isDeleted: metadata.isDeleted,
        });
      }
      setReceivedMessages(received);

      // Load sent messages
      const sentIds = await activeContract.getMySentMessages();
      const sent: Message[] = [];
      for (const id of sentIds) {
        const messageId = Number(id);
        const metadata = await activeContract.getMessageMetadata(messageId);
        sent.push({
          id: messageId,
          recipient: metadata.recipient,
          contentCID: metadata.contentCID,
          timestamp: Number(metadata.timestamp),
          isDeleted: metadata.isDeleted,
        });
      }
      setSentMessages(sent);
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setLoading(false);
    }
  };

  // Upload to Pinata via backend script
  const uploadToPinata = async (encryptedData: any): Promise<string> => {
    const apiKey = import.meta.env.VITE_PINATA_API_KEY;
    const secretKey = import.meta.env.VITE_PINATA_SECRET_KEY;
    
    if (!apiKey || !secretKey) {
      throw new Error('⚠️ Pinata API keys not configured.\n\nPlease:\n1. Copy frontend/env.example to frontend/.env\n2. Add your Pinata API keys\n3. Restart the dev server');
    }
    
    try {
      const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'pinata_api_key': apiKey,
          'pinata_secret_api_key': secretKey,
        },
        body: JSON.stringify({
          pinataContent: encryptedData,
          pinataMetadata: {
            name: `encrypted-message-${Date.now()}.json`,
          },
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Pinata upload failed: ${response.status} - ${errorText}`);
      }
      
      const result = await response.json();
      console.log('✅ Uploaded to Pinata:', result);
      return result.IpfsHash;
    } catch (error: any) {
      console.error('❌ Pinata upload error:', error);
      throw new Error(`Failed to upload to Pinata: ${error.message}`);
    }
  };

  // Encrypt file with AES-256-CBC (supports both text and binary files)
  const encryptFileWithAES = async (content: string | ArrayBuffer): Promise<{ encrypted: string; key: Uint8Array; iv: string }> => {
    const crypto = window.crypto;
    
    // Generate random AES-256 key
    const aesKey = crypto.getRandomValues(new Uint8Array(32));
    
    // Generate random IV (16 bytes for CBC)
    const iv = crypto.getRandomValues(new Uint8Array(16));
    
    // Import key for Web Crypto API
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      aesKey,
      { name: 'AES-CBC' },
      false,
      ['encrypt']
    );
    
    // Convert content to bytes
    let contentBytes: Uint8Array;
    if (typeof content === 'string') {
      // Text content
      const encoder = new TextEncoder();
      contentBytes = encoder.encode(content);
    } else {
      // Binary content (ArrayBuffer from image/pdf/zip etc)
      contentBytes = new Uint8Array(content);
    }
    
    // Encrypt
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-CBC', iv },
      cryptoKey,
      contentBytes
    );
    
    // Convert to hex
    const encryptedArray = new Uint8Array(encryptedBuffer);
    const encryptedHex = Array.from(encryptedArray)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    const ivHex = Array.from(iv)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    return {
      encrypted: encryptedHex,
      key: aesKey,
      iv: ivHex
    };
  };

  // Step 1: Prepare encryption (encrypt content and upload to IPFS)
  const handlePrepareMessage = async () => {
    if (!contract || !fhevmInstance || !signer) {
      alert('Please connect wallet first');
      return;
    }

    // Validate input
    if (messageType === 'text' && !textMessage.trim()) {
      alert('❌ Please enter a text message');
      return;
    }
    
    if (messageType === 'file' && !selectedFile) {
      alert('❌ Please select a file');
      return;
    }

    if (!ethers.isAddress(recipientAddress)) {
      alert('❌ Invalid recipient address');
      return;
    }

    setPreparing(true);
    setSendStatus('');
    setIsPrepared(false);

    try {
      let fileContent: string | ArrayBuffer;
      let fileName: string;
      let fileSize: number;
      let fileType: string;

      // 1. Get content (text or file)
      if (messageType === 'text') {
        setSendStatus('📝 Processing text message...');
        fileContent = textMessage;
        fileName = 'message.txt';
        fileSize = new Blob([textMessage]).size;
        fileType = 'text/plain';
      } else {
        setSendStatus('📖 Reading file...');
        // Check if file is text or binary
        const isTextFile = selectedFile!.type.startsWith('text/') || 
                          selectedFile!.name.endsWith('.txt') ||
                          selectedFile!.name.endsWith('.md') ||
                          selectedFile!.name.endsWith('.json');
        
        if (isTextFile) {
          // Text files: read as text
          fileContent = await selectedFile!.text();
        } else {
          // Binary files (images, PDFs, etc): read as ArrayBuffer
          fileContent = await selectedFile!.arrayBuffer();
        }
        
        fileName = selectedFile!.name;
        fileSize = selectedFile!.size;
        fileType = selectedFile!.type || 'application/octet-stream';
      }

      // 2. Encrypt with AES-256-CBC
      setSendStatus('🔐 Encrypting with AES-256-CBC...');
      const { encrypted, key, iv } = await encryptFileWithAES(fileContent);
      
      const encryptedData = {
        iv,
        content: encrypted,
        algorithm: 'aes-256-cbc',
        filename: fileName,
        size: fileSize,
        type: fileType,
        messageType: messageType // Add message type identifier
      };

      // 3. Upload to IPFS via Pinata
      setSendStatus('📤 Uploading to IPFS (Pinata)...');
      
      const keyHex = '0x' + Array.from(key).map(b => b.toString(16).padStart(2, '0')).join('');
      const typeLabel = messageType === 'text' ? '📝 Text Message' : '📁 File';
      
      // Check if Pinata is configured
      const hasPinataConfig = import.meta.env.VITE_PINATA_API_KEY && import.meta.env.VITE_PINATA_SECRET_KEY;
      
      if (!hasPinataConfig) {
        // Manual mode: Show instructions
        setSendStatus(`⚠️ Pinata not configured - Manual mode\n\nType: ${typeLabel}\nFilename: ${fileName}\nSize: ${(fileSize / 1024).toFixed(2)} KB\n\nNext steps:\n1. Run: node test/send-test-message.js\n2. Use generated CID and key with Hardhat task\n\nAES Key: ${keyHex}\n\n💡 To enable automatic upload:\n- Configure Pinata API keys in .env file`);
        return;
      }
      
      // Automatic mode: Upload to Pinata
      try {
        const ipfsCid = await uploadToPinata(encryptedData);
        // Save prepared data
        setPreparedCid(ipfsCid);
        setPreparedKey(keyHex);
        setIsPrepared(true);
        setSendStatus(`✅ Prepared!`);
      } catch (uploadError: any) {
        console.error('Upload failed:', uploadError);
        setSendStatus(`⚠️ Upload failed, using manual mode\n\nType: ${typeLabel}\nFilename: ${fileName}\nSize: ${(fileSize / 1024).toFixed(2)} KB\n\nError: ${uploadError.message}\n\nNext steps:\n1. Run: node test/send-test-message.js\n2. Use generated CID and key with Hardhat task\n\nAES Key: ${keyHex}`);
      }
      
    } catch (error: any) {
      console.error('❌ Prepare error:', error);
      setSendStatus(`❌ Error: ${error.message}`);
      alert('Failed to prepare: ' + error.message);
    } finally {
      setPreparing(false);
    }
  };

  // Step 2: Confidential send (call contract to send message)
  const handleConfidentialSend = async () => {
    if (!contract || !fhevmInstance || !signer || !isPrepared) {
      alert('Please prepare the message first');
      return;
    }

    setSending(true);
    setSendStatus('🚀 Sending via smart contract...');

    try {
      const userAddress = await signer.getAddress();
      
      // 1. Encrypt sender address with FHE
      setSendStatus('🔐 Encrypting sender address with FHE...');
      const senderInput = fhevmInstance.createEncryptedInput(CONTRACT_ADDRESS, userAddress);
      senderInput.addAddress(userAddress);
      const encryptedSender = await senderInput.encrypt();
      
      console.log('🔍 Encrypted Sender:', encryptedSender);
      console.log('🔍 Sender Handle:', encryptedSender.handles[0]);
      console.log('🔍 Sender Proof:', encryptedSender.inputProof);

      // 2. Encrypt the AES key with FHE
      setSendStatus('🔐 Encrypting AES key with FHE...');
      const keyInput = fhevmInstance.createEncryptedInput(CONTRACT_ADDRESS, userAddress);
      keyInput.add256(BigInt(preparedKey));
      const encryptedKey = await keyInput.encrypt();
      
      console.log('🔍 Encrypted Key:', encryptedKey);
      console.log('🔍 Key Handle:', encryptedKey.handles[0]);
      console.log('🔍 Key Proof:', encryptedKey.inputProof);

      // 3. Send transaction
      setSendStatus('📡 Sending transaction to blockchain...');
      
      // Pass Uint8Array directly (same as test script)
      // Do NOT convert to hex strings or wrap in arrays
      console.log('🔍 Transaction params:');
      console.log('  - Recipient:', recipientAddress);
      console.log('  - Content CID:', preparedCid);
      console.log('  - Sender Handle:', ethers.hexlify(encryptedSender.handles[0]));
      console.log('  - Key Handle:', ethers.hexlify(encryptedKey.handles[0]));
      
      const tx = await contract.sendMessage(
        recipientAddress,
        preparedCid,
        ethers.hexlify(encryptedSender.handles[0]),   // Convert to bytes32 hex string
        encryptedSender.inputProof,                   // bytes type, pass Uint8Array directly
        ethers.hexlify(encryptedKey.handles[0]),      // Convert to bytes32 hex string
        encryptedKey.inputProof                       // bytes type, pass Uint8Array directly
      );

      setSendStatus('⏳ Waiting for confirmation...');
      const receipt = await tx.wait();

      setSendStatus(`✅ Message sent successfully!\n\nTransaction: ${receipt.hash}\nRecipient: ${recipientAddress}\nIPFS CID: ${preparedCid}`);
      
      // Reset status
      setTextMessage('');
      setSelectedFile(null);
      setRecipientAddress('');
      setIsPrepared(false);
      setPreparedCid('');
      setPreparedKey('');
      
      // Refresh messages
      await loadMessages();

    } catch (error: any) {
      console.error('❌ Send error:', error);
      setSendStatus(`❌ Error: ${error.message}`);
      alert('Failed to send: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  // Decrypt file content with AES-256-CBC (returns ArrayBuffer for both text and binary)
  const decryptFileContent = async (encryptedHex: string, key: Uint8Array, iv: Uint8Array): Promise<ArrayBuffer> => {
    // Import AES key
    const cryptoKey = await window.crypto.subtle.importKey(
      'raw',
      key,
      { name: 'AES-CBC' },
      false,
      ['decrypt']
    );
    
    // Convert hex to bytes
    const encryptedBytes = new Uint8Array(
      encryptedHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
    );
    
    // Decrypt
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-CBC', iv },
      cryptoKey,
      encryptedBytes
    );
    
    return decryptedBuffer;
  };

  // Decrypt and download message
  const handleDecryptMessage = async (messageId: number) => {
    if (!contract || !fhevmInstance || !signer) {
      alert('❌ Please connect wallet first');
      return;
    }

    try {
      setLoading(true);
      setSendStatus('🔍 Fetching encrypted message...');

      // 1. Get message from contract
      const message = await contract.getMessage(messageId);
      const contentCID = message.contentCID;
      const encryptedSenderHandle = message.encryptedSender;
      const encryptedKeyHandle = message.encryptedKey;
      
      setSendStatus(`📦 IPFS CID: ${contentCID}\n🔐 Encrypted Sender Handle: ${encryptedSenderHandle}\n🔐 Encrypted Key Handle: ${encryptedKeyHandle}\n\n⏳ Decrypting FHE data...`);

      // 2. Decrypt FHE-encrypted sender and AES key using userDecrypt (official Zama SDK method)
      let senderAddress: string;
      let aesKeyHex: string;
      
      try {
        const userAddress = await signer.getAddress();
        
        // Generate keypair for user decryption (as per official docs)
        const keypair = fhevmInstance.generateKeypair();
        
        // Prepare handle-contract pairs for both sender and key
        const handleContractPairs = [
          { handle: encryptedSenderHandle, contractAddress: CONTRACT_ADDRESS },
          { handle: encryptedKeyHandle, contractAddress: CONTRACT_ADDRESS }
        ];
        
        // Create EIP712 signature for user decryption permission (official format)
        const startTimestamp = Math.floor(Date.now() / 1000).toString();
        const durationDays = '10'; // 10 days validity
        const contractAddresses = [CONTRACT_ADDRESS];
        
        const eip712 = fhevmInstance.createEIP712(
          keypair.publicKey,
          contractAddresses,
          startTimestamp,
          durationDays
        );
        
        setSendStatus('✍️ Please sign the decryption permission...');
        
        // Sign with the correct EIP712 type structure (as per official docs)
        const signature = await signer.signTypedData(
          eip712.domain,
          {
            UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification,
          },
          eip712.message
        );
        
        // Decrypt both sender and key using userDecrypt (official method)
        setSendStatus('🔓 Decrypting FHE data...');
        const results = await fhevmInstance.userDecrypt(
          handleContractPairs,
          keypair.privateKey,
          keypair.publicKey,
          signature.replace('0x', ''), // Remove 0x prefix as per docs
          contractAddresses,
          userAddress,
          startTimestamp,
          durationDays
        );
        
        // Extract decrypted values
        const decryptedSender = results[encryptedSenderHandle];
        const decryptedKey = results[encryptedKeyHandle];
        
        // Convert sender BigInt to address
        let senderHex = decryptedSender.toString(16);
        if (senderHex.startsWith('0x')) {
          senderHex = senderHex.slice(2);
        }
        senderHex = senderHex.padStart(40, '0');
        senderAddress = ethers.getAddress('0x' + senderHex);
        
        console.log('✅ Decrypted Sender:', senderAddress);
        
        // Convert AES key BigInt to hex
        let keyHex = decryptedKey.toString(16);
        if (keyHex.startsWith('0x')) {
          keyHex = keyHex.slice(2);
        }
        keyHex = keyHex.padStart(64, '0');
        aesKeyHex = keyHex;
        
        console.log('✅ Decrypted AES Key:', '0x' + aesKeyHex);
        
        setSendStatus(`✅ FHE decryption successful!\n\n👤 Sender: ${senderAddress}\n🔑 AES Key: 0x${aesKeyHex.substring(0, 16)}...\n\n📥 Downloading from IPFS...`);
        
      } catch (userDecryptError: any) {
        console.error('❌ FHE decryption failed:', userDecryptError);
        setSendStatus(`❌ FHE decryption failed: ${userDecryptError.message}\n\n⚠️ This might be due to:\n1. Gateway connection issues\n2. Permission denied (ACL not set)\n3. Invalid key handle\n\nPlease try using the Hardhat task:\nnpx hardhat confidential-transmission:receive --id ${messageId}`);
        return;
      }

      // 3. Download encrypted content from IPFS
      setSendStatus('📥 Downloading from IPFS...');
      const ipfsGateway = 'https://gateway.pinata.cloud/ipfs/';
      const response = await fetch(`${ipfsGateway}${contentCID}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch from IPFS: ${response.status}`);
      }
      
      const encryptedData = await response.json();
      
      // 4. Decrypt content with AES-256-CBC
      setSendStatus('🔐 Decrypting content with AES-256-CBC...');
      
      const aesKey = new Uint8Array(
        aesKeyHex.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16))
      );
      
      const iv = new Uint8Array(
        encryptedData.iv.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16))
      );
      
      const decryptedBuffer = await decryptFileContent(
        encryptedData.content,
        aesKey,
        iv
      );
      
      // 5. Download the decrypted file
      setSendStatus('💾 Preparing download...');
      
      // Create blob with the correct MIME type
      const blob = new Blob([decryptedBuffer], { type: encryptedData.type || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = encryptedData.filename || `message-${messageId}.bin`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setSendStatus('✅ Message decrypted successfully!');
      
      // Show success modal with beautiful UI
      setDecryptedInfo({
        messageId,
        sender: senderAddress,
        filename: encryptedData.filename,
        size: encryptedData.size,
        type: encryptedData.messageType === 'text' ? 'Text Message' : 'File'
      });
      setShowDecryptSuccess(true);
      
    } catch (error: any) {
      console.error('❌ Decrypt error:', error);
      const errorMsg = `❌ Decryption failed: ${error.message}\n\n💡 Troubleshooting:\n1. Make sure you are the recipient\n2. Check your network connection\n3. Verify IPFS gateway is accessible\n\nAlternatively, use the Hardhat task:\nnpx hardhat confidential-transmission:receive --id ${messageId}`;
      setSendStatus(errorMsg);
      alert(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Delete message
  const handleDeleteMessage = async (messageId: number) => {
    if (!contract) return;
    
    if (!confirm(`Delete message #${messageId}?`)) return;

    try {
      setLoading(true);
      const tx = await contract.deleteMessage(messageId);
      await tx.wait();
      alert('✅ Message deleted!');
      await loadMessages();
    } catch (error: any) {
      console.error('❌ Delete error:', error);
      alert('Failed to delete: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="container">
          <h1>Confidential Transmission</h1>
          <p className="subtitle">End-to-End Encrypted File Transfer • Sepolia Testnet • Powered by FHEVM & IPFS</p>
          
          {!isConnected ? (
            <button onClick={() => setShowWalletModal(true)} disabled={loading} className="btn-primary">
              {loading ? '🔄 Connecting...' : '🔌 Connect Wallet'}
            </button>
          ) : (
            <div className="account-info">
              <div className="account-badge">
                <span className="account-label">👤 Account:</span>
                <span className="account-address">{account.slice(0, 6)}...{account.slice(-4)}</span>
              </div>
              <div className="account-badge">
                <span className="account-label">🌐 Network:</span>
                <span className="account-address">{NETWORK_CONFIG.sepolia.name}</span>
              </div>
              <div className="account-badge">
                <span className="account-label">⚙️ SDK:</span>
                <span className="sdk-status-indicator">
                  {sdkStatus === 'loading' && <span className="status-dot status-loading" title="SDK Initializing...">🟡</span>}
                  {sdkStatus === 'success' && <span className="status-dot status-success" title="SDK Ready">🟢</span>}
                  {sdkStatus === 'error' && <span className="status-dot status-error" title="SDK Initialization Failed">🔴</span>}
                </span>
              </div>
              <button onClick={disconnectWallet} className="btn-secondary">
                Disconnect
              </button>
            </div>
          )}
        </div>
      </header>

      {isConnected && (
        <main className="container main-content">
          {/* Tabs */}
          <div className="tabs">
            <button
              className={`tab ${activeTab === 'send' ? 'active' : ''}`}
              onClick={() => setActiveTab('send')}
            >
              📤 Send Message
            </button>
            <button
              className={`tab ${activeTab === 'received' ? 'active' : ''}`}
              onClick={() => setActiveTab('received')}
            >
              📬 Received ({receivedMessages.length})
            </button>
            <button
              className={`tab ${activeTab === 'sent' ? 'active' : ''}`}
              onClick={() => setActiveTab('sent')}
            >
              📨 Sent ({sentMessages.length})
            </button>
          </div>

          {/* Send Tab */}
          {activeTab === 'send' && (
            <div className="card">
              <h2>📤 Send Encrypted Message</h2>
              
              <div className="form-group">
                <label>Recipient Address</label>
                <input
                  type="text"
                  placeholder="0x..."
                  value={recipientAddress}
                  onChange={(e) => setRecipientAddress(e.target.value)}
                  className="input"
                />
              </div>

              {/* Message Type Selection */}
              <div className="form-group">
                <label>Message Type</label>
                <div className="message-type-selector">
                  <button
                    type="button"
                    className={`type-option ${messageType === 'text' ? 'active' : ''}`}
                    onClick={() => setMessageType('text')}
                  >
                    📝 Text Message
                  </button>
                  <button
                    type="button"
                    className={`type-option ${messageType === 'file' ? 'active' : ''}`}
                    onClick={() => setMessageType('file')}
                  >
                    📁 File / Image
                  </button>
                </div>
              </div>

              {/* Text Input Area */}
              {messageType === 'text' && (
                <div className="form-group">
                  <label>Text Message</label>
                  <textarea
                    placeholder="Enter your encrypted message here..."
                    value={textMessage}
                    onChange={(e) => setTextMessage(e.target.value)}
                    className="input textarea"
                    rows={6}
                  />
                  {textMessage && (
                    <div className="file-info">
                      📊 {textMessage.length} characters ({(new Blob([textMessage]).size / 1024).toFixed(2)} KB)
                    </div>
                  )}
                </div>
              )}

              {/* File Upload Area */}
              {messageType === 'file' && (
                <div className="form-group">
                  <label>Select File</label>
                  <div className="file-upload-container">
                    <input
                      type="file"
                      id="file-upload"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                      className="file-input-hidden"
                      accept=".txt,.pdf,.jpg,.jpeg,.png,.gif,.doc,.docx"
                    />
                    <label htmlFor="file-upload" className="file-drop-zone">
                      <div className="file-drop-icon">📁</div>
                      <div className="file-drop-text">
                        {selectedFile ? (
                          <>
                            <div className="file-selected">✅ File Selected</div>
                            <div className="file-name">{selectedFile.name}</div>
                            <div className="file-size">{(selectedFile.size / 1024).toFixed(2)} KB</div>
                          </>
                        ) : (
                          <>
                            <div className="file-drop-title">Click to select or drag & drop</div>
                            <div className="file-drop-hint">Supports: TXT, PDF, Images, DOC, DOCX</div>
                          </>
                        )}
                      </div>
                    </label>
                  </div>
                </div>
              )}

              {/* Pinata Configuration Status */}
              <div className="config-status">
                {import.meta.env.VITE_PINATA_API_KEY && import.meta.env.VITE_PINATA_SECRET_KEY ? (
                  <div className="config-status-good">
                    ✅ <strong>Auto Mode</strong> - Pinata configured
                  </div>
                ) : (
                  <div className="config-status-warning">
                    ⚙️ <strong>Manual Mode</strong> - Pinata not configured
                    <a href="./PINATA_SETUP.md" target="_blank" rel="noopener noreferrer" style={{ marginLeft: '10px', fontSize: '0.9em' }}>
                      📖 Setup Guide
                    </a>
                  </div>
                )}
              </div>

              {/* Step 1: Prepare Encryption */}
              <button
                onClick={handlePrepareMessage}
                disabled={
                  preparing || 
                  isPrepared ||
                  !recipientAddress || 
                  (messageType === 'text' ? !textMessage.trim() : !selectedFile)
                }
                className="btn-primary btn-large"
              >
                {preparing ? '🔄 Processing...' : isPrepared ? '✅ Prepared' : '🔐 Encrypt & Prepare'}
              </button>

              {/* Step 2: Confidential Send */}
              <button
                onClick={handleConfidentialSend}
                disabled={!isPrepared || sending}
                className="btn-primary btn-large"
                style={{ 
                  marginTop: '10px',
                  backgroundColor: isPrepared ? '#10b981' : '#6b7280',
                  cursor: isPrepared ? 'pointer' : 'not-allowed'
                }}
              >
                {sending ? '🚀 Sending...' : '📡 Confidential Send'}
              </button>

              {sendStatus && (
                <div className="status-box">
                  <pre>{sendStatus}</pre>
                </div>
              )}

              <div className="info-box">
                <h3>💡 Instructions</h3>
                <ol>
                  <li>Enter recipient's Ethereum address</li>
                  <li>Select message type:
                    <ul>
                      <li>📝 <strong>Text Message</strong> - Enter text content directly</li>
                      <li>📁 <strong>File/Image</strong> - Upload file (txt, image, pdf, etc.)</li>
                    </ul>
                  </li>
                  <li>Enter content or select file based on type</li>
                  <li>Click <strong>"🔐 Encrypt & Prepare"</strong> to encrypt and upload to IPFS</li>
                  <li>After preparation, click <strong>"📡 Confidential Send"</strong> to send via contract</li>
                </ol>
                
                <h3>🔒 Privacy Guarantee</h3>
                <ul>
                  <li>✅ Content encrypted with AES-256-CBC</li>
                  <li>✅ Sender identity protected by FHE</li>
                  <li>✅ Decryption key protected by FHE</li>
                  <li>✅ Only designated recipient can decrypt</li>
                  <li>✅ Supports both text and file types</li>
                </ul>
              </div>
            </div>
          )}

          {/* Received Messages Tab */}
          {activeTab === 'received' && (
            <div className="card">
              <div className="card-header">
                <h2>📬 Received Messages</h2>
                <button onClick={() => loadMessages()} className="btn-secondary" disabled={loading}>
                  {loading ? '🔄' : '🔄 Refresh'}
                </button>
              </div>

              {/* Decryption Status Display */}
              {sendStatus && activeTab === 'received' && (
                <div className="status-box" style={{ marginBottom: '20px' }}>
                  <pre>{sendStatus}</pre>
                </div>
              )}

              {receivedMessages.filter(msg => !msg.isDeleted).length === 0 ? (
                <p className="empty-message">No messages received yet</p>
              ) : (
                <div className="message-list">
                  {receivedMessages
                    .filter(msg => !msg.isDeleted)
                    .map((msg) => (
                    <div key={msg.id} className="message-card">
                      <div className="message-header">
                        <strong>📨 Message #{msg.id}</strong>
                      </div>
                      <div className="message-body">
                        <div>📦 IPFS CID: <code>{msg.contentCID}</code></div>
                        <div>⏰ Time: {new Date(msg.timestamp * 1000).toLocaleString()}</div>
                      </div>
                      <div className="message-actions">
                        <button
                          onClick={() => handleDecryptMessage(msg.id)}
                          className="btn-primary"
                          disabled={loading}
                        >
                          {loading ? '🔄 Decrypting...' : '🔓 Decrypt & Download'}
                        </button>
                        <button
                          onClick={() => handleDeleteMessage(msg.id)}
                          className="btn-danger"
                          disabled={loading}
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Decryption Instructions */}
              <div className="info-box" style={{ marginTop: '20px' }}>
                <h3>🔓 How to Decrypt Messages</h3>
                <ol>
                  <li>Click <strong>"🔓 Decrypt & Download"</strong> on any received message</li>
                  <li>Sign the decryption permission request in MetaMask</li>
                  <li>Wait for the FHE gateway to decrypt the AES key</li>
                  <li>The file will automatically download to your Downloads folder</li>
                </ol>
                
                <h3>⚠️ Troubleshooting</h3>
                <ul>
                  <li>If decryption fails, make sure you are the designated recipient</li>
                  <li>Check that the FHEVM gateway is accessible</li>
                  <li>Verify your network connection</li>
                  <li>Alternatively, use the Hardhat task: <code>npx hardhat confidential-transmission:receive --id MESSAGE_ID</code></li>
                </ul>
              </div>
            </div>
          )}

          {/* Sent Messages Tab */}
          {activeTab === 'sent' && (
            <div className="card">
              <div className="card-header">
                <h2>📨 Sent Messages</h2>
                <button onClick={() => loadMessages()} className="btn-secondary" disabled={loading}>
                  {loading ? '🔄' : '🔄 Refresh'}
                </button>
              </div>

              {sentMessages.filter(msg => !msg.isDeleted).length === 0 ? (
                <p className="empty-message">No messages sent yet</p>
              ) : (
                <div className="message-list">
                  {sentMessages
                    .filter(msg => !msg.isDeleted)
                    .map((msg) => (
                    <div key={msg.id} className="message-card">
                      <div className="message-header">
                        <strong>📨 Message #{msg.id}</strong>
                      </div>
                      <div className="message-body">
                        <div>👤 To: <code>{msg.recipient}</code></div>
                        <div>📦 IPFS CID: <code>{msg.contentCID}</code></div>
                        <div>⏰ Time: {new Date(msg.timestamp * 1000).toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      )}

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          <p>
            🔐 Powered by <a href="https://docs.zama.ai/fhevm" target="_blank">Zama FHEVM</a> • 
            📦 <a href="https://ipfs.tech/" target="_blank">IPFS</a> • 
            🔗 Contract: <code>{CONTRACT_ADDRESS.slice(0, 6)}...{CONTRACT_ADDRESS.slice(-4)}</code>
          </p>
        </div>
      </footer>

      {/* Wallet Connection Modal */}
      <WalletModal
        isOpen={showWalletModal}
        onClose={() => setShowWalletModal(false)}
        onConnect={handleWalletConnect}
        connecting={connecting}
      />

      {/* Decryption Success Modal */}
      {showDecryptSuccess && decryptedInfo && (
        <div className="modal-overlay" onClick={() => setShowDecryptSuccess(false)}>
          <div className="modal-content success-modal" onClick={(e) => e.stopPropagation()}>
            <div className="success-header">
              <div className="success-icon">✅</div>
              <h2>Message Decrypted Successfully!</h2>
              <p className="success-subtitle">Your file has been downloaded to your Downloads folder</p>
            </div>
            
            <div className="success-body">
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">📬 Message ID</span>
                  <span className="info-value">#{decryptedInfo.messageId}</span>
                </div>
                
                <div className="info-item">
                  <span className="info-label">👤 Sender</span>
                  <span className="info-value mono">{decryptedInfo.sender.slice(0, 8)}...{decryptedInfo.sender.slice(-6)}</span>
                </div>
                
                <div className="info-item">
                  <span className="info-label">📄 Filename</span>
                  <span className="info-value">{decryptedInfo.filename}</span>
                </div>
                
                <div className="info-item">
                  <span className="info-label">📊 File Size</span>
                  <span className="info-value">{(decryptedInfo.size / 1024).toFixed(2)} KB</span>
                </div>
                
                <div className="info-item">
                  <span className="info-label">📝 Type</span>
                  <span className="info-value">{decryptedInfo.type}</span>
                </div>
              </div>
              
              <div className="success-message">
                <div className="success-badge">
                  <span className="badge-icon">🔓</span>
                  <span>End-to-End Encryption Verified</span>
                </div>
                <p className="success-description">
                  This message was encrypted with AES-256 and protected by FHEVM. 
                  Only you, as the intended recipient, could decrypt it.
                </p>
              </div>
            </div>
            
            <div className="success-footer">
              <button 
                className="btn-success" 
                onClick={() => setShowDecryptSuccess(false)}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
