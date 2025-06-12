import {
  Connection,
  PublicKey,
  Keypair,
  Transaction,
  VersionedTransaction,
  TransactionMessage,
  LAMPORTS_PER_SOL
} from '@solana/web3.js'

import {
  Liquidity,
  LiquidityPoolKeys,
  LiquidityPoolKeysV4,
  jsonInfo2PoolKeys,
  LiquidityPoolJsonInfo,
  TokenAccount,
  Token,
  TokenAmount,
  TOKEN_PROGRAM_ID,
  Percent,
  SPL_ACCOUNT_LAYOUT,
  LIQUIDITY_STATE_LAYOUT_V4,
  MARKET_STATE_LAYOUT_V3,
} from '@raydium-io/raydium-sdk'

import { Wallet } from '@project-serum/anchor'
import base58 from 'bs58'
import { AccountLayout } from "@solana/spl-token";
import { ethers } from 'ethers';

class RaydiumSwap {
  allPoolKeysJson: LiquidityPoolJsonInfo[]
  connection: Connection
  wallet: Wallet
  connection_balance: Connection
  poolInfo: LiquidityPoolKeysV4

  LIQUIDITY_URL: string = "https://api.raydium.io/v2/sdk/liquidity/mainnet.json";

  // constructor(RPC_URL: string, BALANCE_RPCURL: string, WALLET_PRIVATE_KEY: string) {
  //   this.connection = new Connection(RPC_URL, { commitment: 'confirmed' })
  //   this.wallet = new Wallet(Keypair.fromSecretKey(base58.decode(WALLET_PRIVATE_KEY)))
  //   this.connection_balance = new Connection(BALANCE_RPCURL, { commitment: 'confirmed' })
  // }

  // constructor(RPC_URL: string, BALANCE_RPCURL: string) {
  //   this.connection = new Connection(RPC_URL, { commitment: 'confirmed' })
  //   this.connection_balance = new Connection(BALANCE_RPCURL, { commitment: 'confirmed' })
  // }

  constructor(connection: Connection, WALLET_PRIVATE_KEY: string) {
    this.connection = connection;
    this.wallet = new Wallet(Keypair.fromSecretKey(base58.decode(WALLET_PRIVATE_KEY)));
  }

  updatePoolKeydata(_poolkeys: LiquidityPoolJsonInfo[]) {
    this.allPoolKeysJson = _poolkeys
  }

  // Define a function to fetch and decode Market accounts
  async fetchMarketAccounts(base: PublicKey, quote: PublicKey) {
    const accounts = await this.connection.getProgramAccounts(
      new PublicKey('srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX'),
      {
        commitment: 'processed',
        filters: [
          { dataSize: LIQUIDITY_STATE_LAYOUT_V4.span },
          {
            memcmp: {
              offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf("baseMint"),
              bytes: base.toBase58(),
            },
          },
          {
            memcmp: {
              offset: LIQUIDITY_STATE_LAYOUT_V4.offsetOf("quoteMint"),
              bytes: quote.toBase58(),
            },
          },
        ],
      }
    );

    return accounts.map(({ pubkey, account }) => ({
      id: pubkey.toString(),
      ...LIQUIDITY_STATE_LAYOUT_V4.decode(account.data),
    }));
  }

  async fetchOpenBookAccounts(baseMint: PublicKey, quoteMint: PublicKey,) {
    const accounts = await this.connection.getProgramAccounts(
      new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'),
      {
        commitment: 'processed',
        filters: [
          { dataSize: MARKET_STATE_LAYOUT_V3.span },
          {
            memcmp: {
              offset: MARKET_STATE_LAYOUT_V3.offsetOf("baseMint"),
              bytes: baseMint.toBase58(),
            },
          },
          {
            memcmp: {
              offset: MARKET_STATE_LAYOUT_V3.offsetOf("quoteMint"),
              bytes: quoteMint.toBase58(),
            },
          },
        ],
      }
    );
    return accounts.map(({ account }) => MARKET_STATE_LAYOUT_V3.decode(account.data));
  }

  async getSolBalance() {
    const balance = await this.connection.getBalance(this.wallet.publicKey)
    return Number(balance / LAMPORTS_PER_SOL)
  }

  async getTokenBalance(tokenMint: string) {
    let balances = {}
    let decimals = 0
    try {
      const tokenAccounts = await this.connection.getTokenAccountsByOwner(
        this.wallet.publicKey,
        {
          programId: TOKEN_PROGRAM_ID,
        }
      );
      tokenAccounts.value.forEach((tokenAccount) => {
        const accountData = AccountLayout.decode(tokenAccount.account.data);
        balances[accountData.mint.toBase58()] = accountData.amount

        // console.log(`${accountData.mint.toBase58()}   ${accountData.amount}`);
      })
      const tokenInfo = await this.connection.getParsedAccountInfo(new PublicKey(tokenMint))
      if (tokenInfo.value.data) {
        const { parsed }: any = tokenInfo.value.data
        decimals = parsed.info.decimals
      }

    } catch (error) {
      console.error(error)
      return 0
    }
    return balances[tokenMint] ? Number(ethers.formatUnits(balances[tokenMint].toString(), decimals)) : 0
  }

  async changeWalletKey(walletKey: string) {
    this.wallet = new Wallet(Keypair.fromSecretKey(base58.decode(walletKey)))
  }

  async loadPoolKeys(randomNumber: number) {
    console.time(`Bot Updated pool key data${randomNumber}`)
    console.log(`Bot Updated pool key data${randomNumber}`)

    const liquidityJsonResp = await fetch(this.LIQUIDITY_URL)
    if (!liquidityJsonResp.ok) return []
    const liquidityJson = (await liquidityJsonResp.json()) as { official: any; unOfficial: any }
    const allPoolKeysJson = [...(liquidityJson?.official ?? []), ...(liquidityJson?.unOfficial ?? [])]

    this.allPoolKeysJson = allPoolKeysJson
    console.timeEnd(`Bot Updated pool key data${randomNumber}`)

    console.log(allPoolKeysJson);

    return allPoolKeysJson
  }

  findPoolInfoForTokens(mintA: string, mintB: string) {
    try {
      const poolData = this.allPoolKeysJson.find(
        (i) => (i.baseMint === mintA && i.quoteMint === mintB) || (i.baseMint === mintB && i.quoteMint === mintA)
      )

      if (!poolData) return null

      return jsonInfo2PoolKeys(poolData) as LiquidityPoolKeys
    } catch (error) {
      return null
    }
  }

  async getOwnerTokenAccounts() {
    const walletTokenAccount = await this.connection.getTokenAccountsByOwner(this.wallet.publicKey, {
      programId: TOKEN_PROGRAM_ID,
    })

    return walletTokenAccount.value.map((i) => ({
      pubkey: i.pubkey,
      programId: i.account.owner,
      accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data),
    }))
  }

  //  main swap function
  async getSwapTransaction(
    toToken: string,
    amount: number,
    poolKeys: LiquidityPoolKeys,
    units: number = 140000,
    maxLamports: number = 100000,
    useVersionedTransaction = true,
    fixedSide: 'in' | 'out' = 'in'
  ): Promise<Transaction | VersionedTransaction> {
    const directionIn = poolKeys.quoteMint.toString() == toToken
    const { minAmountOut, amountIn } = await this.calcAmountOut(poolKeys, amount, directionIn)

    const userTokenAccounts = await this.getOwnerTokenAccounts()
    const swapTransaction = await Liquidity.makeSwapInstructionSimple({
      connection: this.connection,
      makeTxVersion: useVersionedTransaction ? 0 : 1,
      poolKeys: {
        ...poolKeys,
      },
      userKeys: {
        tokenAccounts: userTokenAccounts,
        owner: this.wallet.publicKey,
      },
      amountIn: amountIn,
      amountOut: minAmountOut,
      fixedSide: fixedSide,
      config: {
        bypassAssociatedCheck: false,
      },
      computeBudgetConfig: {
        units,
        microLamports: maxLamports,
      },
    })

    const recentBlockhashForSwap = await this.connection.getLatestBlockhash()
    const instructions = swapTransaction.innerTransactions[0].instructions.filter(Boolean)

    if (useVersionedTransaction) {
      const versionedTransaction = new VersionedTransaction(
        new TransactionMessage({
          payerKey: this.wallet.publicKey,
          recentBlockhash: recentBlockhashForSwap.blockhash,
          instructions: instructions,
        }).compileToV0Message()
      )

      versionedTransaction.sign([this.wallet.payer])

      return versionedTransaction
    }

    const legacyTransaction = new Transaction({
      blockhash: recentBlockhashForSwap.blockhash,
      lastValidBlockHeight: recentBlockhashForSwap.lastValidBlockHeight,
      feePayer: this.wallet.publicKey,
    })

    legacyTransaction.add(...instructions)

    return legacyTransaction
  }

  async sendLegacyTransaction(tx: Transaction) {
    const txid = await this.connection.sendTransaction(tx, [this.wallet.payer], {
      skipPreflight: true,
      maxRetries: 2,
    })
    await this.connection.confirmTransaction(txid);

    return txid
  }

  async sendVersionedTransaction(tx: VersionedTransaction) {
    const txid = await this.connection.sendTransaction(tx, {
      skipPreflight: true,
      maxRetries: 5,
    })
    await this.connection.confirmTransaction(txid);

    return txid
  }

  async simulateLegacyTransaction(tx: Transaction) {
    const txid = await this.connection.simulateTransaction(tx, [this.wallet.payer])

    return txid
  }

  async simulateVersionedTransaction(tx: VersionedTransaction) {
    const txid = await this.connection.simulateTransaction(tx)
    return txid
  }

  getTokenAccountByOwnerAndMint(mint: PublicKey) {
    return {
      programId: TOKEN_PROGRAM_ID,
      pubkey: PublicKey.default,
      accountInfo: {
        mint: mint,
        amount: 0,
      },
    } as unknown as TokenAccount
  }

  async calcAmountOut(poolKeys: LiquidityPoolKeys, rawAmountIn: number, swapInDirection: boolean) {
    const poolInfo = await Liquidity.fetchInfo({ connection: this.connection, poolKeys })

    let currencyInMint = poolKeys.baseMint
    let currencyInDecimals = poolInfo.baseDecimals
    let currencyOutMint = poolKeys.quoteMint
    let currencyOutDecimals = poolInfo.quoteDecimals

    if (!swapInDirection) {
      currencyInMint = poolKeys.quoteMint
      currencyInDecimals = poolInfo.quoteDecimals
      currencyOutMint = poolKeys.baseMint
      currencyOutDecimals = poolInfo.baseDecimals
    }

    const currencyIn = new Token(TOKEN_PROGRAM_ID, currencyInMint, currencyInDecimals)
    const amountIn = new TokenAmount(currencyIn, rawAmountIn, false)
    const currencyOut = new Token(TOKEN_PROGRAM_ID, currencyOutMint, currencyOutDecimals)
    const slippage = new Percent(100, 100) // 5% slippage

    const { amountOut, minAmountOut, currentPrice, executionPrice, priceImpact, fee } = Liquidity.computeAmountOut({
      poolKeys,
      poolInfo,
      amountIn,
      currencyOut,
      slippage,
    })

    return {
      amountIn,
      amountOut,
      minAmountOut,
      currentPrice,
      executionPrice,
      priceImpact,
      fee,
    }
  }

  //  set & get poolInfo
  setPoolKey(poolInfo: LiquidityPoolKeysV4) {
    this.poolInfo = poolInfo;
  }

  getPoolKey() {
    return this.poolInfo;
  }
}

export default RaydiumSwap
