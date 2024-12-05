import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Hbar,
  Client,
  PrivateKey,
  AccountBalanceQuery,
  AccountCreateTransaction,
  Mnemonic,
  TransferTransaction,
  AccountId,
  TokenCreateTransaction,
  TokenType,
} from '@hashgraph/sdk';
import { PrismaService } from 'src/prisma/prisma.service';
import { HDNode as EthersHdNode } from '@ethersproject/hdnode';
import axios from 'axios';
import { JsonRpcProvider } from '@ethersproject/providers';
import { Wallet } from '@ethersproject/wallet';
import { ContractFactory } from '@ethersproject/contracts';
import * as fs from 'node:fs/promises';

@Injectable()
export class HederaService {
  private client: Client;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.environmentSetup();
    // Configure the Hedera client
  }
  async deriveAccountDetails() {
    try {
      // Ensure the seed phrase is available
      const seedPhrase = this.config.get<string>('SEED_PHRASE');
      if (!seedPhrase) {
        throw new Error('Seed phrase is not set in environment variables');
      }

      // Derive private key using BIP-39 seed phrase and HD Wallet derivation path
      const hdNodeRoot = EthersHdNode.fromMnemonic(seedPhrase);
      const accountHdPath = `m/44'/60'/0'/0/0`;
      const hdNode = hdNodeRoot.derivePath(accountHdPath);

      // Convert to Hedera-compatible private key
      const privateKey = PrivateKey.fromStringECDSA(hdNode.privateKey);
      const privateKeyHex = `0x${privateKey.toStringRaw()}`;

      // Generate EVM address
      const evmAddress = `0x${privateKey.publicKey.toEvmAddress()}`;
      const accountExplorerUrl = `https://hashscan.io/testnet/account/${evmAddress}`;
      const accountBalanceFetchApiUrl = `https://testnet.mirrornode.hedera.com/api/v1/balances?account.id=${evmAddress}&limit=1&order=asc`;

      // Fetch balance details
      const { accountId, accountBalanceTinybar, accountBalanceHbar } =
        await this.fetchAccountBalance(accountBalanceFetchApiUrl);

      console.log(`Private Key Hex: ${privateKeyHex}`);
      console.log(`EVM Address: ${evmAddress}`);
      console.log(`Account Explorer URL: ${accountExplorerUrl}`);
      console.log(`Account ID: ${accountId}`);
      console.log(`Account Balance (HBAR): ${accountBalanceHbar}`);

      return {
        privateKeyHex,
        evmAddress,
        accountExplorerUrl,
        accountBalanceFetchApiUrl,
        accountBalanceHbar,
        accountBalanceTinybar,
      };
    } catch (error) {
      Logger.error(`Error deriving account details: ${error.message}`);
      throw error;
    }
  }

  private async fetchAccountBalance(apiUrl: string) {
    try {
      const response = await axios.get(apiUrl);
      const accountBalanceJson = response.data;
      const accountId = accountBalanceJson?.balances[0]?.account;
      const accountBalanceTinybar = accountBalanceJson?.balances[0]?.balance;

      let accountBalanceHbar: string | undefined = undefined;
      if (accountBalanceTinybar) {
        accountBalanceHbar = new Intl.NumberFormat('en-GB', {
          minimumFractionDigits: 8,
          maximumFractionDigits: 8,
        }).format(accountBalanceTinybar * 10 ** -8);
      }

      return { accountId, accountBalanceTinybar, accountBalanceHbar };
    } catch (error) {
      Logger.warn(`Error fetching account balance: ${error.message}`);
      return {
        accountId: undefined,
        accountBalanceTinybar: undefined,
        accountBalanceHbar: undefined,
      };
    }
  }

  async environmentSetup() {
    const myAccountId = this.config.get<string>('MY_ACCOUNT_ID');
    const myMnemonic = this.config.get<string>('MY_MNEMONIC');

    console.log('Account ID:', myAccountId);
    console.log('Mnemonic:', myMnemonic);

    if (!myAccountId || !myMnemonic) {
      throw new Error(
        'Environment variables MY_ACCOUNT_ID and MY_MNEMONIC must be present',
      );
    }

    try {
      const mnemonic = await Mnemonic.fromString(myMnemonic);
      // const myPrivateKey = this.config.get<string>('MY_PRIVATE_KEY');
      const myPrivateKey = await mnemonic.toEd25519PrivateKey();

      console.log('Derived private key:', myPrivateKey.toString());

      this.client = Client.forTestnet();
      this.client.setOperator(myAccountId, myPrivateKey);
      this.client.setDefaultMaxTransactionFee(new Hbar(100));
      this.client.setMaxQueryPayment(new Hbar(50));

      console.log('Hedera environment setup complete');
    } catch (error) {
      throw new Error(
        `Failed to derive private key from mnemonic: ${error.message}`,
      );
    }
  }

  async createAccount() {
    try {
      console.log('Starting account creation...');

      // Ensure the Hedera client is initialized
      if (!this.client) {
        throw new Error('Hedera client is not initialized');
      }

      // Generate new ED25519 keys for the account
      const newAccountPrivateKey = PrivateKey.generateED25519();
      const newAccountPublicKey = newAccountPrivateKey.publicKey;

      console.log('New private key:', newAccountPrivateKey.toString());
      console.log('New public key:', newAccountPublicKey.toString());

      // const evmAddress = `0x${newAccountPublicKey.toEvmAddress()}`;

      // console.log('evm address: ', evmAddress);

      // Create a new Hedera account with an initial balance
      const newAccountTransaction = await new AccountCreateTransaction()
        .setKey(newAccountPublicKey)
        .setInitialBalance(Hbar.fromTinybars(20000)) // Ensure operator account has enough balance
        .execute(this.client);

      // Retrieve the account creation receipt
      const receipt = await newAccountTransaction.getReceipt(this.client);
      const newAccountId = receipt.accountId;

      if (!newAccountId) {
        throw new Error('Failed to retrieve the new account ID');
      }

      console.log('New account ID:', newAccountId);

      // Verify the new account balance
      const accountBalance = await new AccountBalanceQuery()
        .setAccountId(newAccountId)
        .execute(this.client);

      console.log(
        'The new account balance is:',
        accountBalance.hbars.toTinybars(),
        'tinybars.',
      );

      // Save the new account details in the database
      const savedAccount = await this.prisma.account_details_tb.create({
        data: {
          account_id: newAccountId.toString(), // Save Hedera account ID as a string
          private_key: newAccountPrivateKey.toString(), // Save private key
          public_key: newAccountPublicKey.toString(), // Save public key
        },
      });

      console.log('Account successfully saved to the database:', savedAccount);

      // Return the account details
      return {
        accountId: newAccountId.toString(),
        privateKey: newAccountPrivateKey.toString(),
        publicKey: newAccountPublicKey.toString(),
      };
    } catch (error) {
      console.error('Error during account creation:', error.message);
      throw new Error(`Failed to create a new account: ${error.message}`);
    }
  }

  async transferHbar() {
    try {
      // Ensure the Hedera client is initialized
      if (!this.client) {
        throw new Error('Hedera client is not initialized');
      }

      console.log('Starting HBAR transfer...');

      // Extract operator account ID from environment setup
      const myAccountId = this.config.get<string>('MY_ACCOUNT_ID');
      if (!myAccountId) {
        throw new Error('MY_ACCOUNT_ID is not configured');
      }

      // Retrieve the new account ID (e.g., from your database or directly after createAccount)
      const newAccount = await this.prisma.account_details_tb.findFirst({
        orderBy: { created: 'desc' }, // Assuming the latest created account is the one to transfer HBAR to
      });

      if (!newAccount) {
        throw new Error('No account found in the database');
      }

      const newAccountId = newAccount.account_id;

      console.log(
        `Transferring HBAR from ${myAccountId} to ${newAccountId}...`,
      );

      // Create and execute a transfer transaction
      const sendHbar = await new TransferTransaction()
        .addHbarTransfer(myAccountId, Hbar.fromTinybars(-10000)) // Deduct 10,000 tinybars from the sender
        .addHbarTransfer(newAccountId, Hbar.fromTinybars(10000)) // Add 10,000 tinybars to the receiver
        .execute(this.client);

      // Get the receipt of the transaction
      const receipt = await sendHbar.getReceipt(this.client);

      console.log('Transfer transaction status:', receipt.status.toString());

      return {
        status: receipt.status.toString(),
        transactionId: sendHbar.transactionId.toString(),
      };
    } catch (error) {
      console.error('Error during HBAR transfer:', error.message);
      throw new Error(`Failed to transfer HBAR: ${error.message}`);
    }
  }

  async queryBalance(accountId: string) {
    try {
      const queryCost = await new AccountBalanceQuery()
        .setAccountId(accountId)
        .getCost(this.client);

      console.log('the query cost is ' + queryCost);

      const accountBalance = await new AccountBalanceQuery()
        .setAccountId(accountId)
        .execute(this.client);

      return {
        balance: accountBalance.hbars.toTinybars(),
        queryCost: queryCost.toString(),
      };
    } catch (error) {
      return {
        status: 'error',
        message: `error: ${error.message}`,
      };
    }
  }

  async createToken() {
    const accountId = this.config.get<string>('ACCOUNT_ID');
    const privateKey = this.config.get<string>('ACCOUNT_PRIVATE_KEY');

    if (!accountId || !privateKey) {
      Logger.error('Missing required environment variables for Hedera');
      throw new Error(
        'ACCOUNT_ID and ACCOUNT_PRIVATE_KEY must be set in the environment',
      );
    }

    const operatorId = AccountId.fromString(accountId);
    const operatorKey = PrivateKey.fromStringECDSA(privateKey);
    this.client = Client.forTestnet().setOperator(operatorId, operatorKey);
    try {
      console.log('Starting token creation process...');

      // Token creation details
      const tokenCreateTx = await new TokenCreateTransaction()
        .setTokenType(TokenType.FungibleCommon)
        .setTokenName('bamzhie coin') // Set your token name
        .setTokenSymbol('BZT') // Set your token symbol
        .setDecimals(2) // Set token decimals
        .setInitialSupply(1_000_000) // Set initial supply
        .setTreasuryAccountId(accountId)
        .setAdminKey(operatorKey)
        .setFreezeDefault(false)
        .freezeWith(this.client);

      // Sign and submit the transaction
      const tokenCreateTxSigned = await tokenCreateTx.sign(operatorKey);
      const tokenCreateTxSubmitted = await tokenCreateTxSigned.execute(
        this.client,
      );

      // Retrieve the receipt and token ID
      const tokenCreateTxReceipt = await tokenCreateTxSubmitted.getReceipt(
        this.client,
      );
      const tokenId = tokenCreateTxReceipt.tokenId;
      const tokenExplorerUrl = `https://hashscan.io/testnet/token/${tokenId}`;

      // Wait for mirror node ingestion
      await this.delay(3000);

      // Fetch token balance
      const accountBalanceFetchApiUrl = `https://testnet.mirrornode.hedera.com/api/v1/accounts/${accountId}/tokens?token.id=${tokenId}&limit=1&order=desc`;
      const accountBalanceFetch = await fetch(accountBalanceFetchApiUrl);
      const accountBalanceJson = await accountBalanceFetch.json();
      const accountBalanceToken = accountBalanceJson?.tokens?.find(
        (token: any) => token.token_id === tokenId.toString(),
      )?.balance;

      Logger.log('Token creation successful');
      Logger.log(`Token ID: ${tokenId}`);
      Logger.log(`Explorer URL: ${tokenExplorerUrl}`);
      Logger.log(`Token Balance: ${accountBalanceToken}`);

      // Return results
      return {
        accountId: this.client.operatorAccountId.toString(),
        tokenId: tokenId.toString(),
        tokenExplorerUrl,
        accountBalanceToken,
        accountBalanceFetchApiUrl,
      };
    } catch (error) {
      Logger.error(
        `Error during token creation: ${error.message}`,
        error.stack,
      );
      throw error;
    } finally {
      this.client.close();
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async smartContract() {
    const rpcUrl = this.config.get<string>('RPC_URL');
    const accountId = this.config.get<string>('ACCOUNT_ID');
    const accountKey = this.config.get<string>('ACCOUNT_PRIVATE_KEY');

    // initialise account
    const rpcProvider = new JsonRpcProvider(rpcUrl);
    const accountWallet = new Wallet(accountKey, rpcProvider);
    const accountAddress = accountWallet.address;
    const accountExplorerUrl = `https://hashscan.io/testnet/address/${accountAddress}`;

    // deploy smart contract
    const abi = await fs.readFile(
      '/home/bamzhie/Documents/yada/yada_1/src/hedera/my_contract_sol_MyContract.abi',
      {
        encoding: 'utf8',
      },
    );
    const evmBytecode = await fs.readFile(
      'src/hedera/my_contract_sol_MyContract.bin',
      {
        encoding: 'utf8',
      },
    );
    // NOTE: Prepare smart contract for deployment
    // Step (2) in the accompanying tutorial
    const myContractFactory = new ContractFactory(
      abi,
      evmBytecode,
      accountWallet,
    );
    const myContract = await myContractFactory.deploy();
    await myContract.deployTransaction.wait();
    const myContractAddress = myContract.address;
    const myContractExplorerUrl = `https://hashscan.io/testnet/address/${myContractAddress}`;

    // write data to smart contract
    // NOTE: Invoke a smart contract transaction
    // Step (3) in the accompanying tutorial
    const myContractWriteTxRequest =
      await myContract.functions.introduce('bamzhie');
    const myContractWriteTxReceipt = await myContractWriteTxRequest.wait();
    const myContractWriteTxHash = myContractWriteTxReceipt.transactionHash;
    const myContractWriteTxExplorerUrl = `https://hashscan.io/testnet/transaction/${myContractWriteTxHash}`;

    // read data from smart contract
    // NOTE: Invoke a smart contract query
    // Step (4) in the accompanying tutorial
    const [myContractQueryResult] = await myContract.functions.greet();

    // output results
    console.log(`accountId: ${accountId}`);
    console.log(`accountAddress: ${accountAddress}`);
    console.log(`accountExplorerUrl: ${accountExplorerUrl}`);
    console.log(`myContractAddress: ${myContractAddress}`);
    console.log(`myContractExplorerUrl: ${myContractExplorerUrl}`);
    console.log(`myContractWriteTxHash: ${myContractWriteTxHash}`);
    console.log(
      `myContractWriteTxExplorerUrl: ${myContractWriteTxExplorerUrl}`,
    );
    console.log(`myContractQueryResult: ${myContractQueryResult}`);

    return {
      accountId,
      accountAddress,
      accountExplorerUrl,
      myContractAddress,
      myContractExplorerUrl,
      myContractWriteTxHash,
      myContractWriteTxExplorerUrl,
      myContractQueryResult,
    };
  }
}
