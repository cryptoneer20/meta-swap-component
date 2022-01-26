import { Fragment, useRef, useState, useEffect } from 'react';
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  Connection,
  Keypair,
  Signer,
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionSignature,
  ConfirmOptions,
  RpcResponseAndContext,
  SimulatedTransactionResponse,
  Commitment,
  LAMPORTS_PER_SOL,
  SYSVAR_CLOCK_PUBKEY,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  clusterApiUrl
} from '@solana/web3.js'
import {AccountLayout,MintLayout,TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID} from "@solana/spl-token";
import useNotify from './notify'
import {sendTransactionWithRetry} from './utility'
import * as anchor from "@project-serum/anchor";
import {WalletConnect, WalletDisconnect} from '../wallet'

let wallet : any
let conn = new Connection(clusterApiUrl('devnet'))
let notify: any

const confirmOption : ConfirmOptions = {commitment : 'finalized',preflightCommitment : 'finalized',skipPreflight : false}
const programId = new PublicKey('CVkpihd9wmAmCzDFrB5Bf75XczvGfGB6cLXB2TBW4m5R')
const idl = require('./solana_anchor.json')
const pool = new PublicKey('6x6cXfkYKBwAhf9B5RrqUz3nwQY8LTJXZoUUoYofMqmj')
const TOKEN_MINT = new PublicKey('5Pdw82Xqs6kzSZf2p472LbKb4FqegtQkgoaXCnE4URfa')

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

const getTokenWallet = async (
  owner: PublicKey,
  mint: PublicKey
    ) => {
	console.log(owner.toBase58())
  return (
    await PublicKey.findProgramAddress(
      [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  )[0];
}

export default function Swap(){
	wallet = useWallet()
	notify = useNotify()

	const [sol, setSol] = useState('')
	const [crush, setCrush] = useState('')
	const [poolData, setPoolData] = useState<any>(null)

	const getPoolData = async() => {
		const wallet = new anchor.Wallet(Keypair.generate())
    const provider = new anchor.Provider(conn,wallet,confirmOption)
    const program = new anchor.Program(idl,programId,provider)
    const resp = await program.account.pool.fetch(pool)
    setPoolData({
    	solAddress : resp.solAddress,
    	coefficient : resp.priceNumerator.toNumber() / resp.priceDenominator.toNumber(),
    	tokenAddress : resp.tokenAddress,
    })
	}

	const minting = async() => {
		try{
			let provider = new anchor.Provider(conn, wallet as any, confirmOption)
	  	let program = new anchor.Program(idl,programId,provider)
	  	let tokenAddress = await getTokenWallet(wallet.publicKey, TOKEN_MINT)
	  	let transaction = new Transaction()
	  	if((await conn.getAccountInfo(tokenAddress)) == null){
	  		transaction.add(createAssociatedTokenAccountInstruction(tokenAddress, wallet.publicKey, wallet.publicKey, TOKEN_MINT))
	  	}
	  	transaction.add(program.instruction.exchage(new anchor.BN(Number(sol) * Math.pow(10,9)),{
	  		accounts:{
	  			owner : wallet.publicKey,
	  			pool : pool,
	  			solAddress : poolData.solAddress,
	  			tokenSender : poolData.tokenAddress,
	  			tokenReceiver : tokenAddress,
	  			tokenProgram : TOKEN_PROGRAM_ID,
	  			systemProgram : SystemProgram.programId,
	  		}
	  	}))
	  	let hash = await sendTransaction(transaction, [])
	  	notify('success', 'Success!', hash);
	  } catch(e) {
	  	console.log(e)
	  	notify('error', 'Failed Instruction!');
	  }
	}

	async function sendTransaction(transaction : Transaction,signers : Keypair[]) {
	  // try{
	    transaction.feePayer = wallet.publicKey
	    transaction.recentBlockhash = (await conn.getRecentBlockhash('max')).blockhash;
	    await transaction.setSigners(wallet.publicKey,...signers.map(s => s.publicKey));
	    if(signers.length != 0)
	      await transaction.partialSign(...signers)
	    const signedTransaction = await wallet.signTransaction(transaction);
	    let hash = await conn.sendRawTransaction(await signedTransaction.serialize());
	    await conn.confirmTransaction(hash);
	    return hash
	    // notify('success', 'Success!');
	  // } catch(err) {
	  //   console.log(err)
	  //   notify('error', 'Failed Instruction!');
	  // }
	}

	useEffect(()=>{
		getPoolData()
	},[pool])

	// return <div className="container-fluid mt-4 row">
	// 	<div className="col-lg-6">
 //      <div className="input-group mb-3">
 //        <span className="input-group-text">Sol</span>
 //        <input name="sol"  type="text" className="form-control" onChange={(event)=>{
 //        	setSol(event.target.value)
 //        	let temp = Number(event.target.value) / poolData.coefficient
 //        	setCrush(temp.toString())
 //        }} value={sol}/>
 //      </div>
 //      <div className="input-group mb-3">
 //        <span className="input-group-text">MetaCrush</span>
 //        <input name="crush"  type="text" className="form-control" onChange={(event)=>{
 //        	setCrush(event.target.value)
 //        	let temp = Number(event.target.value) * poolData.coefficient
 //        	setSol(temp.toString())
 //        }} value={crush}/>
 //      </div>
 //      {
	// 			wallet && wallet.connected && 
	// 			<div className="row container-fluid">
	// 				<button type="button" className="btn btn-primary mb3" onClick={async ()=>{
	// 					await minting()
	// 				}}>Mint</button>
	// 			</div>
	// 		}
	// 	</div>
	// </div>
	return <>
		<main className='content'>
			<div className='card'>
				<h6 className="card-title">Swap</h6>
				<form className="form">
					<div className="form-group">
						<label className="form-label"><img src={"sol_icon.svg"} style={{"width" : "20px"}}/>SOL</label>
						<input className="form-input" name="sol" type="number" placeholder="0.0" onChange={(event)=>{
							setSol(event.target.value)
							let temp = Math.round(Number(event.target.value) / poolData.coefficient * 10000) / 10000
							setCrush(temp.toString())
						}} value={sol}/>
					</div>
					<div className="form-group">
						<label className="form-label"><img src={"crush.png"} style={{"width" : "20px"}}/>CRUSH</label>
						<input className="form-input" name="to" type="number" placeholder="0.0"  onChange={(event)=>{
							setCrush(event.target.value)
							let temp = Math.round(Number(event.target.value) * poolData.coefficient * 10000) / 10000
							setSol(temp.toString())
						}}  value={crush}/>
					</div>
					{
						(wallet && wallet.connected) ?
							<>
								<button type="button" className="form-btn" style={{"justifyContent" : "center"}} onClick={async ()=>{
									await minting()
								}}>Mint</button>
								<WalletDisconnect/>
							</>
						:
							<WalletConnect/>
					}
				</form>
			</div>
		</main>
	</>
}