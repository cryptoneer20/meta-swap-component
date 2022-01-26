import {
  Connection,
  Keypair,
  Signer,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
  ConfirmOptions,
  sendAndConfirmRawTransaction,
  sendAndConfirmTransaction,
  RpcResponseAndContext,
  SimulatedTransactionResponse,
  Commitment,
  LAMPORTS_PER_SOL,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  clusterApiUrl
} from "@solana/web3.js"
import * as bs58 from 'bs58'
import fs from 'fs'
import * as anchor from '@project-serum/anchor'
import {AccountLayout,MintLayout,TOKEN_PROGRAM_ID,Token,ASSOCIATED_TOKEN_PROGRAM_ID} from "@solana/spl-token";
import { program } from 'commander';
import log from 'loglevel';

program.version('0.0.1');
log.setLevel('info');

const programId = new PublicKey('CVkpihd9wmAmCzDFrB5Bf75XczvGfGB6cLXB2TBW4m5R')
const idl=JSON.parse(fs.readFileSync('src/solana_anchor.json','utf8'))

const confirmOption : ConfirmOptions = {
    commitment : 'finalized',
    preflightCommitment : 'finalized',
    skipPreflight : false
}

const sleep = (ms : number) => {
    return new Promise(resolve => setTimeout(resolve, ms));
};

function loadWalletKey(keypair : any): Keypair {
  if (!keypair || keypair == '') {
    throw new Error('Keypair is required!');
  }
  const loaded = Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(fs.readFileSync(keypair).toString())),
  );
  log.info(`wallet public key: ${loaded.publicKey}`);
  return loaded;
}

const getTokenWallet = async (
  wallet: anchor.web3.PublicKey,
  mint: anchor.web3.PublicKey
    ) => {
  return (
    await anchor.web3.PublicKey.findProgramAddress(
      [wallet.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  )[0];
}

const createAssociatedTokenAccountInstruction = (
  associatedTokenAddress: PublicKey,
  payer: PublicKey,
  walletAddress: PublicKey,
  splTokenMintAddress: PublicKey
    ) => {
  const keys = [
    { pubkey: payer, isSigner: true, isWritable: true },
    { pubkey: associatedTokenAddress, isSigner: false, isWritable: true },
    { pubkey: walletAddress, isSigner: false, isWritable: false },
    { pubkey: splTokenMintAddress, isSigner: false, isWritable: false },
    {
      pubkey: SystemProgram.programId,
      isSigner: false,
      isWritable: false,
    },
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    {
      pubkey: SYSVAR_RENT_PUBKEY,
      isSigner: false,
      isWritable: false,
    },
  ];
  return new TransactionInstruction({
    keys,
    programId: ASSOCIATED_TOKEN_PROGRAM_ID,
    data: Buffer.from([]),
  });
}

programCommand('init_pool')
  .requiredOption(
    '-k, --keypair <path>',
    'Solana wallet location'
  )
  .requiredOption(
    '-t, --token <string>',
    'token address'
  )
  .option(
    '-s, --sol-address <string>',
    'sol address'
  )
  .option(
    '-pn, --price-numerator <number>',
    'price numerator'
  )
  .option(
    '-pd, --price-denominator <number>',
    'price denominator'
  )
  .action(async (directory,cmd)=>{
    const {env,keypair,token,solAddress,priceNumerator,priceDenominator} = cmd.opts()
    const conn = new Connection(clusterApiUrl(env))
    const owner = loadWalletKey(keypair)
    const tokenMint = new PublicKey(token)
    let solReceiver = owner.publicKey
    if(solAddress != null) solReceiver = new PublicKey(solAddress)
    const rand = Keypair.generate().publicKey;
    const [pool, bump] = await PublicKey.findProgramAddress([rand.toBuffer()],programId)
    let transaction = new Transaction()
    let poolToken = await getTokenWallet(pool, tokenMint)
    transaction.add(createAssociatedTokenAccountInstruction(poolToken, owner.publicKey, pool, tokenMint))
    const wallet = new anchor.Wallet(owner)
    const provider = new anchor.Provider(conn,wallet,confirmOption)
    const program = new anchor.Program(idl,programId,provider)
    transaction.add(program.instruction.initPool(
      new anchor.BN(bump),
      new anchor.BN(priceNumerator),
      new anchor.BN(priceDenominator),
      {
        accounts:{
          owner : owner.publicKey,
          pool : pool,
          rand : rand,
          solAddress : solReceiver,
          tokenMint : tokenMint,
          tokenAddress : poolToken,
          systemProgram : SystemProgram.programId
        }
      }
    ))
    const hash = await sendAndConfirmTransaction(conn, transaction, [owner], confirmOption)
    console.log("POOL : "+pool.toBase58())
    console.log("Transaction ID : " + hash)
  })

programCommand('get_pool')
  .option(
    '-p, --pool <string>',
    'pool address'
  )
  .action(async (directory,cmd)=>{
    const {env, pool} = cmd.opts()
    const conn = new Connection(clusterApiUrl(env))
    const poolAddress = new PublicKey(pool)
    const wallet = new anchor.Wallet(Keypair.generate())
    const provider = new anchor.Provider(conn,wallet,confirmOption)
    const program = new anchor.Program(idl,programId,provider)
    const poolData = await program.account.pool.fetch(poolAddress)
    const resp = await conn.getTokenAccountBalance(poolData.tokenAddress, "max")
    const amount = resp.value.uiAmountString
    console.log("        Pool Data")
    console.log("Owner : " + poolData.owner.toBase58())
    console.log("Sol Dest : " + poolData.solAddress.toBase58())
    console.log("Token Address : " + poolData.tokenAddress.toBase58())
    console.log("Price (token / sol): " + poolData.priceNumerator.toNumber() + "/" + poolData.priceDenominator.toNumber())
    console.log("Token Amount : " + amount)
  })

programCommand('change_sol_address')
  .requiredOption(
    '-k, --keypair <path>',
    'Solana wallet location'
  )
  .option(
    '-p, --pool <string>',
    'pool address'
  )
  .option(
    '-s, --sol-address <string>',
    'sol address'
  )
  .action(async (directory,cmd)=>{
    const {env, keypair, pool, solAddress} = cmd.opts()
    const conn = new Connection(clusterApiUrl(env))
    const owner = loadWalletKey(keypair)
    const poolAddress = new PublicKey(pool)
    const solReceiver = new PublicKey(solAddress)
    let transaction = new Transaction()
    const wallet = new anchor.Wallet(owner)
    const provider = new anchor.Provider(conn,wallet,confirmOption)
    const program = new anchor.Program(idl,programId,provider)
    transaction.add(program.instruction.changeSolAddress(
      {
        accounts : {
          owner : owner.publicKey,
          pool : poolAddress,
          solAddress : solReceiver
        }
      }
    ))
    const hash = await sendAndConfirmTransaction(conn, transaction, [owner], confirmOption)
    console.log("Updated successfully.")
    console.log("Transaction ID : " + hash)
  })

programCommand('update_price')
  .requiredOption(
    '-k, --keypair <path>',
    'Solana wallet location'
  )
  .option(
    '-p, --pool <string>',
    'pool address'
  )
  .option(
    '-pn, --price-numerator <number>',
    'price numerator'
  )
  .option(
    '-pd, --price-denominator <number>',
    'price denominator'
  )
  .action(async (directory,cmd)=>{
    const {env, keypair, pool, priceNumerator, priceDenominator} = cmd.opts()
    const conn = new Connection(clusterApiUrl(env))
    const owner = loadWalletKey(keypair)
    const poolAddress = new PublicKey(pool)
    let transaction = new Transaction()
    const wallet = new anchor.Wallet(owner)
    const provider = new anchor.Provider(conn,wallet,confirmOption)
    const program = new anchor.Program(idl,programId,provider)
    transaction.add(program.instruction.updatePrice(
      new anchor.BN(priceNumerator),
      new anchor.BN(priceDenominator),
      {
        accounts : {
          owner : owner.publicKey,
          pool : poolAddress,
        }
      }
    ))
    const hash = await sendAndConfirmTransaction(conn, transaction, [owner], confirmOption)
    console.log("Updated successfully.")
    console.log("Transaction ID : " + hash)
  })  

function programCommand(name: string) {
  return program
    .command(name)
    .option(
      '-e, --env <string>',
      'Solana cluster env name',
      'devnet',
    )
    .option('-l, --log-level <string>', 'log level', setLogLevel);
}

function setLogLevel(value : any, prev : any) {
  if (value === undefined || value === null) {
    return;
  }
  console.log('setting the log value to: ' + value);
  log.setLevel(value);
}

program.parse(process.argv)