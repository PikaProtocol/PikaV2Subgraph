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
} from "../generated/OrderBook/OrderBook"

import {
    CreateOpenPosition,
    CreateClosePosition,
    CancelOpenPosition,
    CancelClosePosition,
    ExecuteOpenPosition,
    ExecuteClosePosition
} from "../generated/PositionManager/PositionManager"

import {
    Order,
    MarketOrder,
    OrderStat
} from "../generated/schema"

export const BASE = BigInt.fromI32(100000000)

function _getId(account: Address, isOpen: boolean, index: BigInt): string {
    let id = account.toHexString() + "-" + isOpen.toString() + "-" + index.toString()
    return id
}

function _storeStats(incrementProp: string, decrementProp: string | null): void {
    let entity = OrderStat.load("1")
    if (entity == null) {
        entity = new OrderStat("1")
        entity.createOpenTrigger = 0 as i32
        entity.createCloseTrigger = 0 as i32
        entity.cancelledOpenTrigger = 0 as i32
        entity.cancelledCloseTrigger = 0 as i32
        entity.executedOpenTrigger = 0 as i32
        entity.executedCloseTrigger = 0 as i32

        entity.createOpenMarket = 0 as i32
        entity.createCloseMarket = 0 as i32
        entity.cancelledOpenMarket = 0 as i32
        entity.cancelledCloseMarket = 0 as i32
        entity.executedOpenMarket = 0 as i32
        entity.executedCloseMarket = 0 as i32
    }

    entity.setI32(incrementProp, entity.getI32(incrementProp) + 1)
    if (decrementProp != null) {
        entity.setI32(decrementProp, entity.getI32(decrementProp) - 1)
    }
    entity.save()
}

function _handleCreateOrder(account: Address, isOpen: boolean, type: String, index: BigInt, productId: BigInt,
                            margin: BigInt, leverage: BigInt, size: BigInt, isLong: boolean, triggerPrice: BigInt,
                            triggerAboveThreshold: boolean, executionFee: BigInt, timestamp: BigInt): void {
    let id = _getId(account, isOpen, index)
    let order = new Order(id)

    order.account = account.toHexString()
    order.index = index
    order.isOpen = isOpen
    order.productId = productId
    order.status = "open"
    order.margin = margin
    order.leverage = leverage
    order.size = size
    order.triggerPrice = triggerPrice
    order.triggerAboveThreshold = triggerAboveThreshold
    order.executionFee = executionFee
    order.createdTimestamp = timestamp.toI32()

    order.save()
}

function _handleCreatePosition(account: Address, isOpen: boolean, index: BigInt, productId: BigInt, margin: BigInt,
                               leverage: BigInt, size: BigInt, isLong: boolean, acceptablePrice: BigInt, executionFee: BigInt,
                               blockNumber: BigInt, blockTime: BigInt): void {
    let id = _getId(account, isOpen, index)
    let order = new MarketOrder(id)

    order.account = account.toHexString()
    order.index = index
    order.isOpen = isOpen
    order.productId = productId
    order.status = "open"
    order.margin = margin
    order.leverage = leverage
    order.size = size
    order.acceptablePrice = acceptablePrice
    order.executionFee = executionFee
    order.createdBlockNumber = blockNumber.toI32()
    order.createdTimestamp = blockTime.toI32()

    order.save()
}

function _handleCancelOrder(account: Address, isOpen: boolean, index: BigInt, timestamp: BigInt): void {
    let id = account.toHexString() + "-" + isOpen.toString() + "-" + index.toString()
    let order = Order.load(id)

    order.status = "cancelled"
    order.cancelledTimestamp = timestamp.toI32()

    order.save()
}

function _handleCancelPosition(account: Address, isOpen: boolean, index: BigInt, blockGap: BigInt, timeGap: BigInt): void {
    let id = account.toHexString() + "-" + isOpen.toString() + "-" + index.toString()
    let order = MarketOrder.load(id)

    order.status = "cancelled"
    order.cancelledBlockGap = blockGap.toI32()
    order.cancelledTimeGap = timeGap.toI32()

    order.save()
}

function _handleExecuteOrder(account: Address, isOpen: boolean, index: BigInt, timestamp: BigInt): void {
    let id = account.toHexString() + "-" + isOpen.toString() + "-" + index.toString()
    let order = Order.load(id)

    order.status = "executed"
    order.cancelledTimestamp = timestamp.toI32()

    order.save()
}

function _handleExecutePosition(account: Address, isOpen: boolean, index: BigInt,  blockGap: BigInt, timeGap: BigInt): void {
    let id = account.toHexString() + "-" + isOpen.toString() + "-" + index.toString()
    let order = MarketOrder.load(id)

    order.status = "executed"
    order.executedBlockGap = blockGap.toI32()
    order.executedTimeGap = timeGap.toI32()

    order.save()
}

function _handleUpdateOrder(account: Address, isOpen: boolean, index: BigInt, size: BigInt,
                            triggerPrice: BigInt, triggerAboveThreshold: boolean, timestamp: BigInt): void {
    let id = account.toHexString() + "-" + isOpen.toString() + "-" + index.toString()
    let order = Order.load(id)

    order.size = size
    order.triggerPrice = triggerPrice
    order.triggerAboveThreshold = triggerAboveThreshold
    order.createdTimestamp = timestamp.toI32()

    order.save()
}


export function handleCreateOpenOrder(event: CreateOpenOrder): void {
    let type = ""
    if ((event.params.isLong && !event.params.triggerAboveThreshold) ||
        (!event.params.isLong && event.params.triggerAboveThreshold)) {
        type = "limit"
    } else {
        type = "stopMarket"
    }
    _handleCreateOrder(event.params.account, true, type, event.params.orderIndex, event.params.productId,
        event.params.margin, event.params.leverage, (event.params.margin).times(event.params.leverage).div(BASE),
        event.params.isLong, event.params.triggerPrice, event.params.triggerAboveThreshold, event.params.executionFee, event.block.timestamp);
    _storeStats("createOpenTrigger", null)
}

export function handleCancelOpenOrder(event: CancelOpenOrder): void {
    _handleCancelOrder(event.params.account, true, event.params.orderIndex, event.block.timestamp);
    _storeStats("cancelledOpenTrigger", "createOpenTrigger")
}

export function handleExecuteOpenOrder(event: ExecuteOpenOrder): void {
    _handleExecuteOrder(event.params.account, true, event.params.orderIndex, event.block.timestamp);
    _storeStats("executedOpenTrigger", "createOpenTrigger")
}

export function handleUpdateOpenOrder(event: UpdateOpenOrder): void {
    _handleUpdateOrder(event.params.account, true, event.params.orderIndex,
        (event.params.margin).times(event.params.leverage).div(BASE), event.params.triggerPrice,
        event.params.triggerAboveThreshold, event.params.orderTimestamp);
}

export function handleCreateCloseOrder(event: CreateCloseOrder): void {
    let type = ""
    if ((event.params.isLong && event.params.triggerAboveThreshold) ||
        (!event.params.isLong && !event.params.triggerAboveThreshold)) {
        type = "limit"
    } else {
        type = "stopMarket"
    }
    _handleCreateOrder(event.params.account, true, type, event.params.orderIndex, event.params.productId,
        null, null, event.params.size, event.params.isLong, event.params.triggerPrice,
        event.params.triggerAboveThreshold, event.params.executionFee, event.block.timestamp);
    _storeStats("createCloseTrigger", null)
}

export function handleCancelCloseOrder(event: CancelCloseOrder): void {
    _handleCancelOrder(event.params.account, false, event.params.orderIndex, event.block.timestamp);
    _storeStats("cancelledCloseTrigger", "createCloseTrigger")
}

export function handleExecuteCloseOrder(event: ExecuteCloseOrder): void {
    _handleExecuteOrder(event.params.account, false, event.params.orderIndex, event.block.timestamp);
    _storeStats("executedCloseTrigger", "createCloseTrigger")
}

export function handleUpdateCloseOrder(event: UpdateCloseOrder): void {
    _handleUpdateOrder(event.params.account, false, event.params.orderIndex, event.params.size, event.params.triggerPrice,
        event.params.triggerAboveThreshold, event.params.orderTimestamp);
}

export function handleCreateOpenPosition(event: CreateOpenPosition): void {
    _handleCreatePosition(event.params.account, true, event.params.index, event.params.productId, event.params.margin,
        event.params.leverage, (event.params.margin).times(event.params.leverage).div(BASE), event.params.isLong,
        event.params.acceptablePrice, event.params.executionFee, event.params.blockNumber, event.params.blockTime);
    _storeStats("createOpenMarket", null)
}

export function handleCancelOpenPosition(event: CancelOpenPosition): void {
    _handleCancelPosition(event.params.account, true, event.params.index, event.params.blockGap, event.params.timeGap);
    _storeStats("cancelledOpenMarket", "createOpenMarket")
}

export function handleExecuteOpenPosition(event: ExecuteOpenPosition): void {
    _handleExecutePosition(event.params.account, true, event.params.index, event.params.blockGap, event.params.timeGap);
    _storeStats("executedOpenMarket", "createOpenMarket")
}

export function handleCreateClosePosition(event: CreateClosePosition): void {
    let id = event.params.account.toHexString() + "-" + "true" + "-" + event.params.index.toString()
    let order = MarketOrder.load(id)
    _handleCreatePosition(event.params.account, false, event.params.index, event.params.productId, event.params.margin,
        order.leverage, (event.params.margin).times(order.leverage).div(BASE), event.params.isLong, event.params.acceptablePrice,
        event.params.executionFee, event.params.blockNumber, event.params.blockTime);
    _storeStats("createCloseMarket", null)
}

export function handleCancelClosePosition(event: CancelClosePosition): void {
    _handleCancelPosition(event.params.account, true, event.params.index, event.params.blockGap, event.params.timeGap);
    _storeStats("cancelledCloseMarket", "createOpenMarket")
}

export function handleExecuteClosePosition(event: ExecuteClosePosition): void {
    _handleExecutePosition(event.params.account, true, event.params.index, event.params.blockGap, event.params.timeGap);
    _storeStats("executedCloseMarket", "createOpenMarket")
}
