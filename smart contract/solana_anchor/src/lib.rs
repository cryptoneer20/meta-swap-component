pub mod utils;
use borsh::{BorshDeserialize,BorshSerialize};
use {
    crate::utils::*,
    anchor_lang::{
        prelude::*,
        AnchorDeserialize,
        AnchorSerialize,
        Key,
        solana_program::{
            system_instruction,
            program::{invoke},
            program_pack::Pack,
            msg
        }      
    },
    spl_token::state,
};
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod solana_anchor {
    use super::*;

    pub fn init_pool(
        ctx : Context<InitPool>,
        _bump : u8,
        _price_numerator : u64,
        _price_denominator : u64,
        )->ProgramResult{
        msg!("+ init_pool");
        let pool = &mut ctx.accounts.pool;
        let token_address : state::Account = state::Account::unpack_from_slice(&ctx.accounts.token_address.data.borrow())?;
        let token_mint : state::Mint = state::Mint::unpack_from_slice(&ctx.accounts.token_mint.data.borrow())?;
        if token_address.owner != pool.key(){
            msg!("Owner of token account must be pool");
            return Err(PoolError::InvalidTokenAccount.into());
        }
        pool.owner = *ctx.accounts.owner.key;
        pool.rand = *ctx.accounts.rand.key;
        pool.sol_address = *ctx.accounts.sol_address.key;
        pool.token_address = *ctx.accounts.token_address.key;
        pool.price_numerator = _price_numerator;
        pool.price_denominator = _price_denominator;
        pool.decimals = token_mint.decimals;
        pool.bump = _bump;
        Ok(())
    }

    pub fn update_price(
        ctx : Context<UpdatePrice>,
        _price_numerator : u64,
        _price_denominator : u64,
        ) -> ProgramResult {
        msg!("+ update_price");
        let pool = &mut ctx.accounts.pool;
        pool.price_denominator = _price_denominator;
        pool.price_numerator = _price_numerator;
        Ok(())
    }

    pub fn change_sol_address(
        ctx : Context<ChangeSolAddress>,
        ) -> ProgramResult{
        msg!("+ change_sol_address");
        let pool = &mut ctx.accounts.pool;
        pool.sol_address = *ctx.accounts.sol_address.key;
        Ok(())
    }


    pub fn exchage(
        ctx : Context<Exchange>,
        amount : u64
        )->ProgramResult{
        msg!("+ exchange");
        let pool = &mut ctx.accounts.pool;
        let token_receiver : state::Account = state::Account::unpack_from_slice(&ctx.accounts.token_receiver.data.borrow())?;
        let token_sender : state::Account = state::Account::unpack_from_slice(&ctx.accounts.token_sender.data.borrow())?;
        if token_receiver.mint != token_sender.mint {
            msg!("Token not matched");
            return Err(PoolError::TokenNotMatched.into());
        }
        if pool.token_address != *ctx.accounts.token_sender.key {
            msg!("Token sender must be token address of pool");
            return Err(PoolError::InvalidTokenAccount.into());
        }
        if pool.sol_address != *ctx.accounts.sol_address.key {
            msg!("");
        }
        let token_amount = (amount as u128 * pool.price_denominator as u128  * 10u128.pow(pool.decimals as u32)
                    / pool.price_numerator as u128 / 10u128.pow(9 as u32)) as u64;
        if token_sender.amount < token_amount {
            msg!("Token not enough");
            return Err(PoolError::NotEnoughAmount.into());
        }
        let ix = system_instruction::transfer(ctx.accounts.owner.key, ctx.accounts.sol_address.key, amount);
        invoke(&ix,&[ctx.accounts.owner.clone(),ctx.accounts.sol_address.clone()])?;
        let pool_seeds = &[pool.rand.as_ref(),&[pool.bump]];
        spl_token_transfer(
            TokenTransferParams{
                source : ctx.accounts.token_sender.clone(),
                destination : ctx.accounts.token_receiver.clone(),
                authority : pool.to_account_info().clone(),
                authority_signer_seeds : pool_seeds,
                token_program : ctx.accounts.token_program.clone(),
                amount : token_amount,
            }
        )?;
        Ok(())
    }

}

#[derive(Accounts)]
pub struct UpdatePrice<'info>{
    #[account(mut,signer)]
    owner : AccountInfo<'info>,

    #[account(mut,has_one=owner)]
    pool : ProgramAccount<'info,Pool>,   
}

#[derive(Accounts)]
pub struct ChangeSolAddress<'info>{
    #[account(mut,signer)]
    owner : AccountInfo<'info>,

    #[account(mut,has_one=owner)]
    pool : ProgramAccount<'info,Pool>,  

    sol_address : AccountInfo<'info>,    
}

#[derive(Accounts)]
pub struct Exchange<'info>{
    #[account(mut,signer)]
    owner : AccountInfo<'info>,

    #[account(mut)]
    pool : ProgramAccount<'info,Pool>,

    #[account(mut)]
    sol_address : AccountInfo<'info>,

    #[account(mut,owner=spl_token::id())]
    token_sender : AccountInfo<'info>,

    #[account(mut,owner=spl_token::id())]
    token_receiver : AccountInfo<'info>,

    #[account(address=spl_token::id())]
    token_program : AccountInfo<'info>,   

    system_program : Program<'info, System>
}


#[derive(Accounts)]
#[instruction(_bump : u8)]
pub struct InitPool<'info>{
    #[account(mut,signer)]
    owner : AccountInfo<'info>,

    #[account(init,seeds=[(*rand.key).as_ref()], bump=_bump, payer=owner, space=8+POOL_SIZE)]
    pool : ProgramAccount<'info,Pool>,

    rand : AccountInfo<'info>,

    #[account(owner=system_program.key())]
    sol_address : AccountInfo<'info>,

    #[account(owner=spl_token::id())]
    token_mint : AccountInfo<'info>,

    #[account(owner=spl_token::id())]
    token_address : AccountInfo<'info>,

    system_program : Program<'info, System>
}

pub const POOL_SIZE : usize = 32 + 32 + 32 + 32 + 8 + 8 + 1 + 1;

#[account]
pub struct Pool{
    pub owner : Pubkey,
    pub rand : Pubkey,
    pub sol_address : Pubkey,
    pub token_address : Pubkey,
    pub price_numerator : u64,
    pub price_denominator : u64,
    pub decimals : u8,
    pub bump : u8,
}

#[error]
pub enum PoolError {
    #[msg("Token mint to failed")]
    TokenMintToFailed,

    #[msg("Token set authority failed")]
    TokenSetAuthorityFailed,

    #[msg("Token transfer failed")]
    TokenTransferFailed,

    #[msg("Token burn failed")]
    TokenBurnFailed,

    #[msg("Invalid token account")]
    InvalidTokenAccount,

    #[msg("Token not matched")]
    TokenNotMatched,

    #[msg("Not enough amount")]
    NotEnoughAmount,
}