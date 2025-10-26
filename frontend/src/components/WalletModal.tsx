import React from 'react';
import './WalletModal.css';

export type WalletType = 'metamask' | 'walletconnect' | 'coinbase' | 'trust';

interface WalletOption {
  id: WalletType;
  name: string;
  icon: string;
  description: string;
  downloadUrl?: string;
}

interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConnect: (walletType: WalletType) => void;
  connecting: boolean;
}

const walletOptions: WalletOption[] = [
  {
    id: 'metamask',
    name: 'MetaMask',
    icon: '🦊',
    description: 'Connect using MetaMask wallet',
    downloadUrl: 'https://metamask.io/download/'
  },
  {
    id: 'walletconnect',
    name: 'WalletConnect',
    icon: '🔗',
    description: 'Scan with mobile wallet',
  },
  {
    id: 'coinbase',
    name: 'Coinbase Wallet',
    icon: '💼',
    description: 'Connect using Coinbase Wallet',
    downloadUrl: 'https://www.coinbase.com/wallet'
  },
  {
    id: 'trust',
    name: 'Trust Wallet',
    icon: '🛡️',
    description: 'Connect using Trust Wallet',
    downloadUrl: 'https://trustwallet.com/'
  }
];

export const WalletModal: React.FC<WalletModalProps> = ({
  isOpen,
  onClose,
  onConnect,
  connecting
}) => {
  if (!isOpen) return null;

  const handleWalletClick = (walletType: WalletType) => {
    if (connecting) return;
    onConnect(walletType);
  };

  const checkWalletInstalled = (walletType: WalletType): boolean => {
    if (typeof window === 'undefined') return false;
    
    switch (walletType) {
      case 'metamask':
        return !!(window.ethereum?.isMetaMask);
      case 'coinbase':
        return !!(window.ethereum?.isCoinbaseWallet);
      case 'trust':
        return !!(window.ethereum?.isTrust);
      default:
        return true;
    }
  };

  return (
    <div className="wallet-modal-overlay" onClick={onClose}>
      <div className="wallet-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="wallet-modal-header">
          <h2>🔐 Connect Wallet</h2>
          <button 
            className="wallet-modal-close" 
            onClick={onClose}
            disabled={connecting}
          >
            ✕
          </button>
        </div>

        {/* Description */}
        <p className="wallet-modal-description">
          Choose a wallet to connect to ConfidentialTransmission
        </p>

        {/* Wallet Options */}
        <div className="wallet-options">
          {walletOptions.map((wallet) => {
            const isInstalled = checkWalletInstalled(wallet.id);
            
            return (
              <button
                key={wallet.id}
                className={`wallet-option ${connecting ? 'disabled' : ''} ${!isInstalled ? 'not-installed' : ''}`}
                onClick={() => handleWalletClick(wallet.id)}
                disabled={connecting}
              >
                <div className="wallet-option-icon">{wallet.icon}</div>
                <div className="wallet-option-content">
                  <div className="wallet-option-name">
                    {wallet.name}
                    {!isInstalled && (
                      <span className="wallet-badge">Not Installed</span>
                    )}
                  </div>
                  <div className="wallet-option-description">
                    {wallet.description}
                  </div>
                </div>
                {!isInstalled && wallet.downloadUrl && (
                  <a
                    href={wallet.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="wallet-download-link"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Download
                  </a>
                )}
              </button>
            );
          })}
        </div>

        {/* Loading State */}
        {connecting && (
          <div className="wallet-connecting">
            <div className="spinner"></div>
            <p>Connecting to wallet...</p>
          </div>
        )}

        {/* Footer */}
        <div className="wallet-modal-footer">
          <p className="wallet-modal-help">
            New to Ethereum wallets? 
            <a 
              href="https://ethereum.org/en/wallets/" 
              target="_blank" 
              rel="noopener noreferrer"
            >
              Learn more
            </a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default WalletModal;










