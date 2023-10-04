import { Address, BigInt, store, log, ethereum } from "@graphprotocol/graph-ts"
import { Staked, Withdrawn } from "../generated/PikaStaking/PikaStaking"
import {Staker} from "../generated/schema";

export const START_TIME = BigInt.fromI32(1693468800)
export const END_TIME = BigInt.fromI32(1696060800)
export const THIRTY_DAYS = BigInt.fromI32(2592000)

export function handleStaked(event: Staked): void {
    if (event.block.timestamp.gt(END_TIME)) return
    let staker = Staker.load(event.params.user.toHexString())
    if (!staker) {
        staker = new Staker(event.params.user.toHexString())
        staker.amount = BigInt.fromI32(0)
    }
    staker.amount = staker.amount.plus(event.params.amount)
    staker.save()
}

export function handleWithdrawn(event: Withdrawn): void {
    if (event.block.timestamp.gt(END_TIME)) return
    let staker = Staker.load(event.params.user.toHexString())
    if (!staker) {
        return
    }
    staker.amount = staker.amount.minus(event.params.fee.plus(event.params.amount))
    staker.save()
}