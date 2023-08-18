import { Address, BigInt, store, log, ethereum } from "@graphprotocol/graph-ts"
import { Staked, Withdrawn } from "../generated/PikaStaking/PikaStaking"
import {Staker} from "../generated/schema";

export function handleStaked(event: Staked): void {
    let staker = Staker.load(event.params.user.toHexString())
    if (!staker) {
        staker = new Staker(event.params.user.toHexString())
    }
    staker.amount = staker.amount.plus(event.params.amount)
    staker.save()
}

export function handleWithdrawn(event: Withdrawn): void {
    let staker = Staker.load(event.params.user.toHexString())
    if (!staker) {
        return
    }
    staker.amount = staker.amount.minus(event.params.fee.plus(event.params.amount))
    staker.save()
}