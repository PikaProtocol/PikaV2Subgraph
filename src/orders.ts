import {
    BigInt,
    Address,
    Bytes,
    // TypedMap,
    // ethereum,
    // store,
    log
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
    Position,
    OrderStat,
    Activity
} from "../generated/schema"

import { PikaPerpV4 } from "../generated/PikaPerpV4/PikaPerpV4";

import {UNIT_BI} from "./mapping";

export const BASE = BigInt.fromI32(100000000)
export const PERP_ADDRESS = "0x56B1103A375d6E12Be3bD9f23332558f570F7a8b";

function _getId(account: Address, isOpen: boolean, index: BigInt): string {
    let id = account.toHexString() + "-" + isOpen.toString() + "-" + index.toString()
    return id
}

function _storeActivity(account: Address, action: String, order: Order | null, marketOrder: MarketOrder | null, txHash: String, timestamp: BigInt): void {
    let activityId: String
    if (order) {
        activityId = account.toHexString() + timestamp.toString() + action + order.type
    } else if (marketOrder) {
        activityId = account.toHexString() + timestamp.toString() + action + "market"
    } else {
        activityId = account.toHexString() + timestamp.toString() + action
    }
    let activity = new Activity(activityId)
    activity.account = account.toHexString()
    activity.action = action
    if (order) {
        activity.type = order.type
        activity.margin = order.margin
        activity.productId = order.productId
        activity.isOpen = order.isOpen
        activity.isLong = order.isLong
        activity.size = order.size
        activity.triggerPrice = order.triggerPrice
        activity.triggerAboveThreshold = order.triggerAboveThreshold
    } else if (marketOrder) {
        activity.type = "market"
        activity.margin = marketOrder.margin
        activity.productId = marketOrder.productId
        activity.isOpen = marketOrder.isOpen
        activity.isLong = marketOrder.isLong
        activity.size = marketOrder.size
        activity.acceptablePrice = marketOrder.acceptablePrice
    }
    activity.txHash = txHash
    activity.timestamp = timestamp
    activity.save()
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

function _handleCreateOrder(account: Address, isOpen: boolean, type: string, index: BigInt, productId: BigInt,
                            margin: BigInt, leverage: BigInt, size: BigInt, tradeFee: BigInt, isLong: boolean, triggerPrice: BigInt,
                            triggerAboveThreshold: boolean, executionFee: BigInt, txHash: String, timestamp: BigInt): void {
    let id = _getId(account, isOpen, index)
    let order = new Order(id)
    if (!order) return
    order.type = type
    order.account = account.toHexString()
    order.index = index
    order.isLong = isLong
    order.isOpen = isOpen
    order.productId = productId
    order.status = "open"
    order.margin = margin
    order.leverage = leverage
    order.size = size
    order.tradeFee = tradeFee
    order.triggerPrice = triggerPrice
    order.triggerAboveThreshold = triggerAboveThreshold
    order.executionFee = executionFee
    order.createdTimestamp = timestamp.toI32()

    order.save()
    let action = ""
    if (isOpen) {
        action = "Created open order"
    } else {
        action = "Created close order"
    }
    _storeActivity(account, action, order, null, txHash, timestamp)
}

function _handleCreatePosition(account: Address, isOpen: boolean, index: BigInt, productId: BigInt, margin: BigInt,
                               leverage: BigInt, size: BigInt, tradeFee: BigInt, isLong: boolean, acceptablePrice: BigInt, executionFee: BigInt,
                               blockNumber: BigInt, txHash: String, blockTime: BigInt): void {
    let id = _getId(account, isOpen, index)
    let order = new MarketOrder(id)
    if (!order) return
    order.account = account.toHexString()
    order.index = index
    order.isLong = isLong
    order.isOpen = isOpen
    order.productId = productId
    order.status = "open"
    order.margin = margin
    order.leverage = leverage
    order.tradeFee = tradeFee
    order.size = size
    order.acceptablePrice = acceptablePrice
    order.executionFee = executionFee
    order.createdBlockNumber = blockNumber.toI32()
    order.createdTimestamp = blockTime.toI32()

    order.save()
    let action = ""
    if (isOpen) {
        action = "Created open order"
    } else {
        action = "Created close order"
    }
    _storeActivity(account, action, null, order as MarketOrder, txHash, blockTime)
}

function _handleCancelOrder(account: Address, isOpen: boolean, index: BigInt, txHash: String, timestamp: BigInt): void {
    let id = account.toHexString() + "-" + isOpen.toString() + "-" + index.toString()
    let order = Order.load(id)
    if (!order) return
    order.status = "cancelled"
    order.cancelledTimestamp = timestamp.toI32()

    order.save()
    let action = ""
    if (isOpen) {
        action = "Cancelled open order"
    } else {
        action = "Cancelled close order"
    }
    _storeActivity(account, action, order as Order, null, txHash, timestamp)
}

function _handleCancelPosition(account: Address, isOpen: boolean, index: BigInt, blockGap: BigInt, timeGap: BigInt, txHash: String, timestamp: BigInt): void {
    let id = account.toHexString() + "-" + isOpen.toString() + "-" + index.toString()
    let order = MarketOrder.load(id)
    if (order == null) {
        return
    }

    order.status = "cancelled"
    order.cancelledBlockGap = blockGap.toI32()
    order.cancelledTimeGap = timeGap.toI32()

    order.save()
    let action = ""
    if (isOpen) {
        action = "Cancelled open order"
    } else {
        action = "Cancelled close order"
    }
    _storeActivity(account, action, null, order as MarketOrder, txHash, timestamp)
}

function _handleExecuteOrder(account: Address, isOpen: boolean, index: BigInt, txHash: String, timestamp: BigInt): void {
    let id = account.toHexString() + "-" + isOpen.toString() + "-" + index.toString()
    let order = Order.load(id)
    if (!order) return
    order.status = "executed"
    order.executedTimestamp = timestamp.toI32()

    order.save()
    let action = ""
    if (isOpen) {
        action = "Executed open order"
    } else {
        action = "Executed close order"
    }
    _storeActivity(account, action, order as Order, null, txHash, timestamp)
}

function _handleExecutePosition(account: Address, isOpen: boolean, index: BigInt, timeGap: BigInt, txHash: String, timestamp: BigInt): void {
    let id = account.toHexString() + "-" + isOpen.toString() + "-" + index.toString()
    let order = MarketOrder.load(id)
    if (order == null) {
        return
    }
    order.status = "executed"
    order.executedTimeGap = timeGap.toI32()

    order.save()
    let action = ""
    if (isOpen) {
        action = "Executed open order"
    } else {
        action = "Executed close order"
    }
    _storeActivity(account, action, null, order as MarketOrder, txHash, timestamp)
}

function _handleUpdateOpenOrder(account: Address, type: string, index: BigInt, margin: BigInt, leverage: BigInt, size: BigInt, tradeFee: BigInt,
                            triggerPrice: BigInt, triggerAboveThreshold: boolean, txHash: String, timestamp: BigInt): void {
    let id = account.toHexString() + "-" + "true" + "-" + index.toString()
    let order = Order.load(id)
    if (!order) return
    order.type = type
    order.margin = margin
    order.leverage = leverage
    order.size = size
    order.tradeFee = tradeFee
    order.triggerPrice = triggerPrice
    order.triggerAboveThreshold = triggerAboveThreshold
    order.createdTimestamp = timestamp.toI32()

    order.save()
    _storeActivity(account, "Updated open order", order as Order, null, txHash, timestamp)
}

function _handleUpdateCloseOrder(account: Address, index: BigInt, size: BigInt,
                                triggerPrice: BigInt, triggerAboveThreshold: boolean, txHash: String, timestamp: BigInt): void {
    let id = account.toHexString() + "-" + "false" + "-" + index.toString()
    let order = Order.load(id)
    if (!order) return
    order.size = size
    order.triggerPrice = triggerPrice
    order.triggerAboveThreshold = triggerAboveThreshold
    order.createdTimestamp = timestamp.toI32()

    order.save()
    _storeActivity(account, "Updated close order", order as Order, null, txHash, timestamp)
}


export function handleCreateOpenOrder(event: CreateOpenOrder): void {
    let type = ""
    if ((event.params.isLong && !event.params.triggerAboveThreshold) ||
        (!event.params.isLong && event.params.triggerAboveThreshold)) {
        type = "limit"
    } else {
        type = "stop"
    }
    _handleCreateOrder(event.params.account, true, type, event.params.orderIndex, event.params.productId,
        event.params.margin, event.params.leverage, (event.params.margin).times(event.params.leverage).div(BASE),
        event.params.tradeFee, event.params.isLong, event.params.triggerPrice, event.params.triggerAboveThreshold, event.params.executionFee, event.transaction.hash.toHexString(), event.block.timestamp);
    // _storeStats("createOpenTrigger", null)
}

export function handleCancelOpenOrder(event: CancelOpenOrder): void {
    _handleCancelOrder(event.params.account, true, event.params.orderIndex, event.transaction.hash.toHexString(), event.block.timestamp);
    // _storeStats("cancelledOpenTrigger", "createOpenTrigger")
}

export function handleExecuteOpenOrder(event: ExecuteOpenOrder): void {
    _handleExecuteOrder(event.params.account, true, event.params.orderIndex, event.transaction.hash.toHexString(), event.block.timestamp);
    // _storeStats("executedOpenTrigger", "createOpenTrigger")
}

export function handleUpdateOpenOrder(event: UpdateOpenOrder): void {
    let type = ""
    if ((event.params.isLong && !event.params.triggerAboveThreshold) ||
        (!event.params.isLong && event.params.triggerAboveThreshold)) {
        type = "limit"
    } else {
        type = "stop"
    }
    _handleUpdateOpenOrder(event.params.account, type, event.params.orderIndex, event.params.margin, event.params.leverage,
        (event.params.margin).times(event.params.leverage).div(BASE), event.params.tradeFee, event.params.triggerPrice,
        event.params.triggerAboveThreshold, event.transaction.hash.toHexString(), event.params.orderTimestamp);
}

export function handleCreateCloseOrder(event: CreateCloseOrder): void {
    let type = ""
    if ((event.params.isLong && event.params.triggerAboveThreshold) ||
        (!event.params.isLong && !event.params.triggerAboveThreshold)) {
        type = "limit"
    } else {
        type = "stop"
    }
    let perpContract = PikaPerpV4.bind(
        Address.fromString(PERP_ADDRESS)
    );
    let position = perpContract.getPosition(event.params.account, event.params.productId, event.params.isLong);
    _handleCreateOrder(event.params.account, false, type, event.params.orderIndex, event.params.productId,
        position.value4, position.value1, event.params.size, event.params.size.div(BigInt.fromI32(1000)), event.params.isLong, event.params.triggerPrice,
        event.params.triggerAboveThreshold, event.params.executionFee, event.transaction.hash.toHexString(), event.block.timestamp);
    // _storeStats("createCloseTrigger", null)
}

export function handleCancelCloseOrder(event: CancelCloseOrder): void {
    _handleCancelOrder(event.params.account, false, event.params.orderIndex, event.transaction.hash.toHexString(), event.block.timestamp);
    // _storeStats("cancelledCloseTrigger", "createCloseTrigger")
}

export function handleExecuteCloseOrder(event: ExecuteCloseOrder): void {
    _handleExecuteOrder(event.params.account, false, event.params.orderIndex, event.transaction.hash.toHexString(), event.block.timestamp);
    // _storeStats("executedCloseTrigger", "createCloseTrigger")
}

export function handleUpdateCloseOrder(event: UpdateCloseOrder): void {
    _handleUpdateCloseOrder(event.params.account, event.params.orderIndex, event.params.size, event.params.triggerPrice,
        event.params.triggerAboveThreshold, event.transaction.hash.toHexString(), event.params.orderTimestamp);
}

export function handleCreateOpenPosition(event: CreateOpenPosition): void {
    _handleCreatePosition(event.params.account, true, event.params.index, event.params.productId, event.params.margin,
        event.params.leverage, (event.params.margin).times(event.params.leverage).div(BASE), event.params.tradeFee, event.params.isLong,
        event.params.acceptablePrice, event.params.executionFee, event.params.blockNumber, event.transaction.hash.toHexString(), event.params.blockTime);
    // _storeStats("createOpenMarket", null)
}

export function handleCancelOpenPosition(event: CancelOpenPosition): void {
    _handleCancelPosition(event.params.account, true, event.params.index, event.params.blockGap, event.params.timeGap, event.transaction.hash.toHexString(), event.block.timestamp);
    // _storeStats("cancelledOpenMarket", "createOpenMarket")
}

export function handleExecuteOpenPosition(event: ExecuteOpenPosition): void {
    _handleExecutePosition(event.params.account, true, event.params.index, event.params.timeGap, event.transaction.hash.toHexString(), event.block.timestamp);
    // _storeStats("executedOpenMarket", "createOpenMarket")
}

export function handleCreateClosePosition(event: CreateClosePosition): void {
    let perpContract = PikaPerpV4.bind(
        Address.fromString(PERP_ADDRESS)
    );
    let position = perpContract.getPosition(event.params.account, event.params.productId, event.params.isLong);
    // log.info('order: {}, {}', [order.leverage.toString(), order.tradeFee.toString()])
    _handleCreatePosition(event.params.account, false, event.params.index, event.params.productId, event.params.margin,
        position.value1, (event.params.margin).times(position.value1).div(BASE), BigInt.fromI32(0), event.params.isLong, event.params.acceptablePrice,
        event.params.executionFee, event.params.blockNumber, event.transaction.hash.toHexString(), event.params.blockTime);
    // _storeStats("createCloseMarket", null)
}

export function handleCancelClosePosition(event: CancelClosePosition): void {
    _handleCancelPosition(event.params.account, false, event.params.index, event.params.blockGap, event.params.timeGap, event.transaction.hash.toHexString(), event.block.timestamp);
    // _storeStats("cancelledCloseMarket", "createCloseMarket")
}

export function handleExecuteClosePosition(event: ExecuteClosePosition): void {
    _handleExecutePosition(event.params.account, false, event.params.index, event.params.timeGap, event.transaction.hash.toHexString(), event.block.timestamp);
    // _storeStats("executedCloseMarket", "createCloseMarket")
}
