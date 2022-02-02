import { Fragment, useRef, useState, useEffect } from 'react';
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  ConfirmOptions,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
  clusterApiUrl
} from '@solana/web3.js'
import {AccountLayout,MintLayout,TOKEN_PROGRAM_ID,ASSOCIATED_TOKEN_PROGRAM_ID,Token} from "@solana/spl-token";
// import useNotify from './notify'
import * as anchor from "@project-serum/anchor";
import {WalletConnect, WalletDisconnect} from '../wallet'
import { Container, Snackbar } from '@material-ui/core';
import Alert from '@material-ui/lab/Alert';
import { CircularProgress } from '@mui/material';

let wallet : any
let conn = new Connection(clusterApiUrl('mainnet-beta'))
// let notify: any

const confirmOption : ConfirmOptions = {commitment : 'finalized',preflightCommitment : 'finalized',skipPreflight : false}
const programId = new PublicKey('E86WfRXiK2M1vJbhBqeBWjgEpYTwJW7KJ8GTN4NqG1o8')
const idl = require('./solana_anchor.json')
const pool = new PublicKey('AXqbf8oJxyZDLhywWbgPXej3CCohJRov5fvvxPcbMuMA')
const TOKEN_MINT = new PublicKey('8S4TAhdeGcH4tPZZ8nM6WrW6KKvXC1dS3E4GiRFVXpYa')

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
  return (
    await PublicKey.findProgramAddress(
      [owner.toBuffer(), TOKEN_PROGRAM_ID.toBuffer(), mint.toBuffer()],
      ASSOCIATED_TOKEN_PROGRAM_ID
    )
  )[0];
}

interface AlertState {
  open: boolean;
  message: string;
  severity: 'success' | 'info' | 'warning' | 'error' | undefined;
  // duration: number | undefined;
}

export default function Swap(){
	wallet = useWallet()
	// notify = useNotify()

	const [sol, setSol] = useState('')
	const [crush, setCrush] = useState('')
	const [poolData, setPoolData] = useState<any>(null)
  const [alertState, setAlertState] = useState<AlertState>({open: false,message: '',severity: undefined})

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
	  	setAlertState({open: true, message:"Congratulations! Swap succeeded!",severity:'success'})
	  	// notify('success', 'Success!', hash);
	  } catch(e) {
	  	console.log(e)
	  	setAlertState({open: true, message:"Swap failed! Please try again!",severity:'error'})
	  	// notify('error', 'Failed Instruction!');
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
	}

	useEffect(()=>{
		getPoolData()
	},[pool])

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
									setAlertState({open: true, message:"Processing transaction",severity: "warning"})
									await minting()
								}}>Mint</button>
								<WalletDisconnect/>
							</>
						:
							<WalletConnect/>
					}
				</form>
			</div>
			<Snackbar
        open={alertState.open}
        autoHideDuration={alertState.severity != 'warning' ? 6000 : 100000}
        onClose={() => setAlertState({ ...alertState, open: false })}
      >
        <Alert
        	iconMapping={{warning : <CircularProgress size={24}/>}}
          onClose={() => setAlertState({ ...alertState, open: false })}
          severity={alertState.severity}
        >
          {alertState.message}
        </Alert>
      </Snackbar>
		</main>
	</>
}