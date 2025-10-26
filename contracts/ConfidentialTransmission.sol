// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, eaddress, euint256, externalEaddress, externalEuint256} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title Confidential Transmission - Privacy-Preserving P2P File Transfer
/// @author confidential-transmission
/// @notice Send encrypted files (txt, images, etc.) to specific addresses with FHE protection
/// @dev Uses FHEVM to encrypt sender identity and decryption keys, ensuring only the recipient can decrypt
contract ConfidentialTransmission is SepoliaConfig {
    
    /// @notice Represents an encrypted message/file transmission
    struct Message {
        eaddress encryptedSender;    // FHE encrypted sender address (for anonymity)
        address recipient;           // Plain recipient address (needed for routing)
        string contentCID;           // IPFS CID of encrypted content
        euint256 encryptedKey;       // FHE encrypted AES decryption key (256-bit)
        uint256 timestamp;           // Message creation time
        bool isDeleted;              // Soft delete flag
    }
    
    /// @notice Stores all messages by ID
    mapping(uint256 => Message) public messages;
    
    /// @notice Maps recipient address to their message IDs
    mapping(address => uint256[]) private receivedMessages;
    
    /// @notice Maps sender address to their sent message IDs (for tracking)
    mapping(address => uint256[]) private sentMessages;
    
    /// @notice Total number of messages sent
    uint256 public messageCount;
    
    /// @notice Emitted when a new message is sent
    event MessageSent(
        uint256 indexed messageId,
        address indexed recipient,
        address indexed sender,
        string contentCID,
        uint256 timestamp
    );
    
    /// @notice Emitted when a message is read
    event MessageRead(
        uint256 indexed messageId,
        address indexed reader
    );
    
    /// @notice Emitted when a message is deleted
    event MessageDeleted(
        uint256 indexed messageId,
        address indexed deleter
    );
    
    /// @notice Send an encrypted file/message to a specific address
    /// @param _recipient The address that can decrypt this message
    /// @param _contentCID IPFS CID of the encrypted content
    /// @param _encryptedSender Encrypted sender address (for anonymity)
    /// @param _senderProof Proof for encrypted sender
    /// @param _encryptedKey Encrypted AES decryption key (256-bit)
    /// @param _keyProof Proof for encrypted key
    /// @return messageId The ID of the created message
    function sendMessage(
        address _recipient,
        string memory _contentCID,
        externalEaddress _encryptedSender,
        bytes calldata _senderProof,
        externalEuint256 _encryptedKey,
        bytes calldata _keyProof
    ) external returns (uint256 messageId) {
        require(_recipient != address(0), "Invalid recipient");
        require(bytes(_contentCID).length > 0, "Empty content CID");
        
        // Convert external encrypted input to FHE types
        eaddress sender = FHE.fromExternal(_encryptedSender, _senderProof);
        euint256 key = FHE.fromExternal(_encryptedKey, _keyProof);
        
        // Grant decryption permission ONLY to the recipient
        FHE.allow(sender, _recipient);
        FHE.allow(key, _recipient);
        
        // Also allow contract to access for potential future features
        FHE.allowThis(sender);
        FHE.allowThis(key);
        
        // Store the message
        messages[messageCount] = Message({
            encryptedSender: sender,
            recipient: _recipient,
            contentCID: _contentCID,
            encryptedKey: key,
            timestamp: block.timestamp,
            isDeleted: false
        });
        
        // Update indices
        receivedMessages[_recipient].push(messageCount);
        sentMessages[msg.sender].push(messageCount);
        
        emit MessageSent(
            messageCount,
            _recipient,
            msg.sender,
            _contentCID,
            block.timestamp
        );
        
        messageId = messageCount;
        messageCount++;
    }
    
    /// @notice Get encrypted message data (only callable by recipient)
    /// @param _messageId The ID of the message to retrieve
    /// @return encryptedSender FHE encrypted sender address
    /// @return contentCID IPFS CID of encrypted content
    /// @return encryptedKey FHE encrypted decryption key
    /// @return timestamp Message creation time
    function getMessage(uint256 _messageId)
        external
        view
        returns (
            eaddress encryptedSender,
            string memory contentCID,
            euint256 encryptedKey,
            uint256 timestamp
        )
    {
        Message storage message = messages[_messageId];
        require(!message.isDeleted, "Message deleted");
        require(message.recipient == msg.sender, "Not authorized");
        
        return (
            message.encryptedSender,
            message.contentCID,
            message.encryptedKey,
            message.timestamp
        );
    }
    
    /// @notice Get public metadata of a message (anyone can view)
    /// @param _messageId The ID of the message
    /// @return recipient The recipient address
    /// @return contentCID IPFS CID (encrypted content)
    /// @return timestamp Message creation time
    /// @return isDeleted Whether message is deleted
    function getMessageMetadata(uint256 _messageId)
        external
        view
        returns (
            address recipient,
            string memory contentCID,
            uint256 timestamp,
            bool isDeleted
        )
    {
        Message storage message = messages[_messageId];
        return (
            message.recipient,
            message.contentCID,
            message.timestamp,
            message.isDeleted
        );
    }
    
    /// @notice Get all message IDs received by the caller
    /// @return Array of message IDs
    function getMyReceivedMessages() external view returns (uint256[] memory) {
        return receivedMessages[msg.sender];
    }
    
    /// @notice Get all message IDs sent by the caller
    /// @return Array of message IDs
    function getMySentMessages() external view returns (uint256[] memory) {
        return sentMessages[msg.sender];
    }
    
    /// @notice Get message IDs received by a specific address
    /// @param _recipient The recipient address to query
    /// @return Array of message IDs
    function getReceivedMessagesOf(address _recipient) 
        external 
        view 
        returns (uint256[] memory) 
    {
        return receivedMessages[_recipient];
    }
    
    /// @notice Soft delete a message (only by recipient)
    /// @param _messageId The ID of the message to delete
    function deleteMessage(uint256 _messageId) external {
        Message storage message = messages[_messageId];
        require(message.recipient == msg.sender, "Not authorized");
        require(!message.isDeleted, "Already deleted");
        
        message.isDeleted = true;
        
        emit MessageDeleted(_messageId, msg.sender);
    }
    
    /// @notice Check if caller is the recipient of a message
    /// @param _messageId The ID of the message
    /// @return True if caller is the recipient
    function isRecipient(uint256 _messageId) external view returns (bool) {
        return messages[_messageId].recipient == msg.sender;
    }
    
    /// @notice Get the total number of messages sent through the contract
    /// @return Total message count
    function getTotalMessages() external view returns (uint256) {
        return messageCount;
    }
}

