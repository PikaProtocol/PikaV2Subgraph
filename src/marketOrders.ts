import {
    BigInt,
    Address,
    // TypedMap,
    // ethereum,
    // store,
    // log
} from "@graphprotocol/graph-ts"
import {
    CreateOpenOrder,
    CreateCloseOrder,
    CancelOpenOrder,
    UpdateOpenOrder,
    CancelCloseOrder,
    ExecuteOpenOrder,
    ExecuteCloseOrder,
    UpdateCloseOrder
} from "../generated/PositionManager/OrderBook"

import {
    Order,
    OrderStat
} from "../generated/schema"

export const BASE = BigInt.fromI32(100000000)

function _getId(account: Address, isOpen: Boolean, index: BigInt): string {
    let id = account.toHexString() + "-" + isOpen.toString() + "-" + index.toString()
    return id
}

function _storeStats(incrementProp: string, decrementProp: string | null): void {
    let entity = OrderStat.load("total")
    if (entity == null) {
        entity = new OrderStat("total")
        entity.openSwap = 0 as i32
        entity.openIncrease = 0 as i32
        entity.openDecrease = 0 as i32
        entity.cancelledSwap = 0 as i32
        entity.cancelledIncrease = 0 as i32
        entity.cancelledDecrease = 0 as i32
        entity.executedSwap = 0 as i32
        entity.executedIncrease = 0 as i32
        entity.executedDecrease = 0 as i32
        entity.period = "total"
    }

    entity.setI32(incrementProp, entity.getI32(incrementProp) + 1)
    if (decrementProp != null) {
        entity.setI32(decrementProp, entity.getI32(decrementProp) - 1)
    }

    entity.save()
}

function _handleCreateOrder(account: Address, isOpen: Boolean, index: BigInt, size: BigInt, isLong: Boolean,
                            triggerAboveThreshold: Boolean, timestamp: BigInt): void {
    let id = _getId(account, isOpen, index)
    let order = new Order(id)

    order.account = account.toHexString()
    order.createdTimestamp = timestamp.toI32()
    order.index = index
    order.isOpen = isOpen
    order.status = "open"
    order.size = size
    if ((isOpen && isLong && !triggerAboveThreshold) || (isOpen && !isLong && triggerAboveThreshold) ||
        (!isOpen && isLong && triggerAboveThreshold) || (!isOpen && !isLong && !triggerAboveThreshold)) {
        order.type = "limit"
    } else {
        order.type = "stopMarket"
    }

    order.save()
}

function _handleCancelOrder(account: Address, isOpen: Boolean, index: BigInt, timestamp: BigInt): void {
    let id = account.toHexString() + "-" + isOpen + "-" + index.toString()
    let order = Order.load(id)

    order.status = "cancelled"
    order.cancelledTimestamp = timestamp.toI32()

    order.save()
}

function _handleExecuteOrder(account: Address, isOpen: Boolean, index: BigInt, timestamp: BigInt): void {
    let id = account.toHexString() + "-" + isOpen + "-" + index.toString()
    let order = Order.load(id)

    order.status = "executed"
    order.executedTimestamp = timestamp.toI32()

    order.save()
}

function _handleUpdateOrder(account: Address, isOpen: Boolean, index: BigInt, size: BigInt, timestamp: BigInt): void {
    let id = account.toHexString() + "-" + isOpen + "-" + index.toString()
    let order = Order.load(id)

    order.size = size
    order.createdTimestamp = timestamp.toI32()

    order.save()
}

export function handleCreateOpenOrder(event: CreateOpenOrder): void {
    _handleCreateOrder(event.params.account, true, event.params.orderIndex,
        (event.params.margin).times(event.params.leverage).div(BASE), event.params. isLong,
        event.params.triggerAboveThreshold, event.block.timestamp);
    _storeStats("createOpen", null)
}

export function handleCancelOpenOrder(event: CancelOpenOrder): void {
    _handleCancelOrder(event.params.account, true, event.params.orderIndex, event.block.timestamp);
    _storeStats("cancelledOpen", "createOpen")
}

export function handleExecuteOpenOrder(event: ExecuteOpenOrder): void {
    _handleExecuteOrder(event.params.account, true, event.params.orderIndex, event.block.timestamp);
    _storeStats("executedOpen", "createOpen")
}

export function handleUpdateOpenOrder(event: UpdateOpenOrder): void {
    _handleUpdateOrder(event.params.account, true, event.params.orderIndex,
        (event.params.margin).times(event.params.leverage).div(BASE), event.block.timestamp);
}

export function handleCreateCloseOrder(event: CreateCloseOrder): void {
    _handleCreateOrder(event.params.account, false, event.params.orderIndex,
        (event.params.margin).times(event.params.leverage).div(BASE), event.params. isLong,
        event.params.triggerAboveThreshold, event.block.timestamp);
    _storeStats("createClose", null)
}

export function handleCancelCloseOrder(event: CancelCloseOrder): void {
    _handleCancelOrder(event.params.account, false, event.params.orderIndex, event.block.timestamp);
    _storeStats("cancelledClose", "createClose")
}

export function handleExecuteCloseOrder(event: ExecuteCloseOrder): void {
    _handleExecuteOrder(event.params.account, false, event.params.orderIndex, event.block.timestamp);
    _storeStats("executedClose", "createClose")
}

export function handleUpdateCloseOrder(event: UpdateCloseOrder): void {
    _handleUpdateOrder(event.params.account, false, event.params.orderIndex,
        (event.params.margin).times(event.params.leverage).div(BASE), event.block.timestamp);
}
