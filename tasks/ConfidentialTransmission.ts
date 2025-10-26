import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import { ethers as ethersLib } from "ethers";

/**
 * ConfidentialTransmission Task Suite
 * ====================================
 *
 * Send encrypted files (txt, images, etc.) to specific addresses.
 * Only the recipient can decrypt the message.
 *
 * Tutorial: Local Development (--network localhost)
 * ==================================================
 *
 * 1. Start local network:
 *    npx hardhat node
 *
 * 2. Deploy contract:
 *    npx hardhat --network localhost deploy
 *
 * 3. Send encrypted message:
 *    npx hardhat --network localhost confidential-transmission:send \
 *      --recipient 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
 *      --cid QmExampleCID123 \
 *      --key 0x1234...
 *
 * 4. List received messages:
 *    npx hardhat --network localhost confidential-transmission:list
 *
 * 5. Read message:
 *    npx hardhat --network localhost confidential-transmission:read --message-id 0
 *
 *
 * Tutorial: Sepolia Testnet (--network sepolia)
 * ==============================================
 *
 * Same commands, just replace --network localhost with --network sepolia
 */

/**
 * Get contract address
 * Example:
 *   npx hardhat --network localhost confidential-transmission:address
 */
task("confidential-transmission:address", "Prints the ConfidentialTransmission contract address").setAction(
  async function (_taskArguments: TaskArguments, hre) {
    const { deployments } = hre;

    const contract = await deployments.get("ConfidentialTransmission");
    console.log("\n📍 ConfidentialTransmission contract address:");
    console.log(`   ${contract.address}`);
    console.log("");
  },
);

/**
 * Get contract statistics
 * Example:
 *   npx hardhat --network localhost confidential-transmission:stats
 */
task("confidential-transmission:stats", "Display contract statistics")
  .addOptionalParam("address", "Optionally specify the contract address")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const contractDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("ConfidentialTransmission");

    const contract = await ethers.getContractAt("ConfidentialTransmission", contractDeployment.address);

    const totalMessages = await contract.getTotalMessages();

    console.log("\n📊 ConfidentialTransmission Statistics");
    console.log("====================================");
    console.log(`📍 Contract Address: ${contractDeployment.address}`);
    console.log(`📨 Total Messages  : ${totalMessages}`);
    console.log("");
  });

/**
 * Send encrypted message
 * Example:
 *   npx hardhat --network localhost confidential-transmission:send \
 *     --recipient 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
 *     --cid QmExampleCID123 \
 *     --key 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
 */
task("confidential-transmission:send", "Send an encrypted message to a specific address")
  .addOptionalParam("address", "Optionally specify the contract address")
  .addParam("recipient", "The recipient's Ethereum address")
  .addParam("cid", "IPFS CID of the encrypted content")
  .addParam("key", "AES encryption key (32 bytes hex)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    // Validate recipient address
    if (!ethersLib.isAddress(taskArguments.recipient)) {
      throw new Error(`Invalid recipient address: ${taskArguments.recipient}`);
    }

    // Validate key format
    const keyHex = taskArguments.key.startsWith("0x") ? taskArguments.key : `0x${taskArguments.key}`;
    if (keyHex.length !== 66) {
      // 0x + 64 hex chars = 32 bytes
      throw new Error(`Invalid key length. Expected 32 bytes (64 hex chars), got ${(keyHex.length - 2) / 2} bytes`);
    }

    await fhevm.initializeCLIApi();

    const contractDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("ConfidentialTransmission");

    console.log(`\n🔐 Sending Encrypted Message`);
    console.log(`============================`);
    console.log(`📍 Contract  : ${contractDeployment.address}`);
    console.log(`👤 Recipient : ${taskArguments.recipient}`);
    console.log(`📦 IPFS CID  : ${taskArguments.cid}`);

    const signers = await ethers.getSigners();
    const sender = signers[0];

    console.log(`✍️  Sender    : ${sender.address}`);

    const contract = await ethers.getContractAt("ConfidentialTransmission", contractDeployment.address);

    // Encrypt sender address
    const encryptedSenderInput = await fhevm
      .createEncryptedInput(contractDeployment.address, sender.address)
      .addAddress(sender.address)
      .encrypt();

    // Encrypt AES key
    const encryptedKeyInput = await fhevm
      .createEncryptedInput(contractDeployment.address, sender.address)
      .addBytes256(keyHex)
      .encrypt();

    console.log(`\n🔒 Encrypting sender and key with FHE...`);

    // Send transaction
    const tx = await contract
      .connect(sender)
      .sendMessage(
        taskArguments.recipient,
        taskArguments.cid,
        encryptedSenderInput.handles[0],
        encryptedSenderInput.inputProof,
        encryptedKeyInput.handles[0],
        encryptedKeyInput.inputProof,
      );

    console.log(`⏳ Waiting for transaction: ${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`✅ Transaction confirmed!`);
    console.log(`   Status: ${receipt?.status === 1 ? "Success" : "Failed"}`);
    console.log(`   Gas Used: ${receipt?.gasUsed.toString()}`);

    // Get message ID from event
    const messageCount = await contract.getTotalMessages();
    const messageId = messageCount - 1n;

    console.log(`\n📨 Message ID: ${messageId}`);
    console.log(`\n🎉 Message sent successfully!`);
    console.log(`   Only ${taskArguments.recipient} can decrypt this message.\n`);
  });

/**
 * List received messages
 * Example:
 *   npx hardhat --network localhost confidential-transmission:list
 *   npx hardhat --network localhost confidential-transmission:list --for 0x...
 */
task("confidential-transmission:list", "List received messages")
  .addOptionalParam("address", "Optionally specify the contract address")
  .addOptionalParam("for", "Optionally specify an address to list messages for (defaults to first signer)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const contractDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("ConfidentialTransmission");

    const signers = await ethers.getSigners();
    const queryAddress = taskArguments.for || signers[0].address;

    console.log(`\n📬 Received Messages for ${queryAddress}`);
    console.log(`====================================`);

    const contract = await ethers.getContractAt("ConfidentialTransmission", contractDeployment.address);

    const messageIds = await contract.getReceivedMessagesOf(queryAddress);

    if (messageIds.length === 0) {
      console.log(`\n   No messages received yet.\n`);
      return;
    }

    console.log(`\n   Total messages: ${messageIds.length}\n`);

    for (let i = 0; i < messageIds.length; i++) {
      const messageId = messageIds[i];
      const metadata = await contract.getMessageMetadata(messageId);

      console.log(`   📨 Message ID: ${messageId}`);
      console.log(`      📦 CID      : ${metadata.contentCID}`);
      console.log(`      ⏰ Time     : ${new Date(Number(metadata.timestamp) * 1000).toLocaleString()}`);
      console.log(`      🗑️  Deleted  : ${metadata.isDeleted ? "Yes" : "No"}`);
      console.log(``);
    }
  });

/**
 * Read and decrypt a message
 * Example:
 *   npx hardhat --network localhost confidential-transmission:read --message-id 0
 */
task("confidential-transmission:read", "Read and decrypt a message")
  .addOptionalParam("address", "Optionally specify the contract address")
  .addParam("messageId", "The ID of the message to read")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    const messageId = parseInt(taskArguments.messageId);
    if (!Number.isInteger(messageId) || messageId < 0) {
      throw new Error(`Invalid message ID: ${taskArguments.messageId}`);
    }

    await fhevm.initializeCLIApi();

    const contractDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("ConfidentialTransmission");

    const signers = await ethers.getSigners();
    const reader = signers[0];

    console.log(`\n🔓 Reading Message #${messageId}`);
    console.log(`============================`);
    console.log(`👤 Reader: ${reader.address}`);

    const contract = await ethers.getContractAt("ConfidentialTransmission", contractDeployment.address);

    // Get message
    const message = await contract.connect(reader).getMessage(messageId);

    console.log(`\n📦 Message Content:`);
    console.log(`   IPFS CID : ${message.contentCID}`);
    console.log(`   Timestamp: ${new Date(Number(message.timestamp) * 1000).toLocaleString()}`);

    console.log(`\n🔐 Decrypting FHE data...`);

    // Decrypt sender address
    const decryptedSender = await fhevm.userDecryptEaddress(
      message.encryptedSender,
      contractDeployment.address,
      reader,
    );

    // Decrypt AES key
    const decryptedKey = await fhevm.userDecryptEbytes256(message.encryptedKey, contractDeployment.address, reader);

    console.log(`\n✅ Decrypted Information:`);
    console.log(`   👤 Sender: ${decryptedSender}`);
    console.log(`   🔑 Key   : ${decryptedKey}`);

    console.log(`\n💡 Next Steps:`);
    console.log(`   1. Download encrypted content from IPFS: ${message.contentCID}`);
    console.log(`   2. Decrypt using AES key: ${decryptedKey}`);
    console.log(``);
  });

/**
 * Delete a message
 * Example:
 *   npx hardhat --network localhost confidential-transmission:delete --message-id 0
 */
task("confidential-transmission:delete", "Delete a message (soft delete)")
  .addOptionalParam("address", "Optionally specify the contract address")
  .addParam("messageId", "The ID of the message to delete")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const messageId = parseInt(taskArguments.messageId);
    if (!Number.isInteger(messageId) || messageId < 0) {
      throw new Error(`Invalid message ID: ${taskArguments.messageId}`);
    }

    const contractDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("ConfidentialTransmission");

    const signers = await ethers.getSigners();
    const deleter = signers[0];

    console.log(`\n🗑️  Deleting Message #${messageId}`);
    console.log(`============================`);
    console.log(`👤 Deleter: ${deleter.address}`);

    const contract = await ethers.getContractAt("ConfidentialTransmission", contractDeployment.address);

    const tx = await contract.connect(deleter).deleteMessage(messageId);
    console.log(`⏳ Waiting for transaction: ${tx.hash}...`);

    const receipt = await tx.wait();
    console.log(`✅ Message deleted successfully!`);
    console.log(`   Status: ${receipt?.status === 1 ? "Success" : "Failed"}`);
    console.log(``);
  });

/**
 * Check if user is recipient
 * Example:
 *   npx hardhat --network localhost confidential-transmission:is-recipient --message-id 0
 */
task("confidential-transmission:is-recipient", "Check if you are the recipient of a message")
  .addOptionalParam("address", "Optionally specify the contract address")
  .addParam("messageId", "The ID of the message to check")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const messageId = parseInt(taskArguments.messageId);
    if (!Number.isInteger(messageId) || messageId < 0) {
      throw new Error(`Invalid message ID: ${taskArguments.messageId}`);
    }

    const contractDeployment = taskArguments.address
      ? { address: taskArguments.address }
      : await deployments.get("ConfidentialTransmission");

    const signers = await ethers.getSigners();
    const user = signers[0];

    const contract = await ethers.getContractAt("ConfidentialTransmission", contractDeployment.address);

    const isRecipient = await contract.connect(user).isRecipient(messageId);

    console.log(`\n🔍 Checking Message #${messageId}`);
    console.log(`============================`);
    console.log(`👤 User      : ${user.address}`);
    console.log(`📨 Is Recipient: ${isRecipient ? "✅ YES" : "❌ NO"}`);
    console.log(``);
  });










