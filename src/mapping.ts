import { Address, BigInt, store, log, ethereum } from "@graphprotocol/graph-ts"
import {
  AddMargin,
  ClosePosition,
  NewPosition,
  OwnerUpdated,
  PositionLiquidated,
  ProductAdded,
  ProductUpdated,
  Redeemed,
  Staked,
  VaultUpdated,
  ProtocolRewardDistributed,
  PikaRewardDistributed,
  VaultRewardDistributed, PikaPerpV3,
} from "../generated/PikaPerpV3/PikaPerpV3"
import {
  ClaimedReward,
  Reinvested
} from "../generated/VaultFeeReward/VaultFeeReward"
import {
  Vault,
  Product,
  Position,
  Transaction,
  Trade,
  VaultDayData,
  Stake,
  Liquidation,
  User,
  Order,
  MarketOrder,
  Activity
} from "../generated/schema"
import { VaultFeeReward } from "../generated/VaultFeeReward/VaultFeeReward"
export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'

export const ZERO_BI = BigInt.fromI32(0)
export const ONE_BI = BigInt.fromI32(1)
export const TWO_BI = BigInt.fromI32(2)
export const HUNDRED_BI = BigInt.fromI32(100)
export const UNIT_BI = BigInt.fromI32(100000000)
export const FEE_BI = BigInt.fromI32(10000)
export const START_TIME = BigInt.fromI32(1681718400)
export const END_TIME = BigInt.fromI32(1682928000)
function getVaultDayData(event: ethereum.Event): VaultDayData {

  let timestamp = event.block.timestamp.toI32()
  let day_id = timestamp / 86400
  let vaultDayData = VaultDayData.load(day_id.toString())

  if (vaultDayData == null) {
    vaultDayData = new VaultDayData(day_id.toString())
    vaultDayData.date = BigInt.fromI32(day_id * 86400)
    vaultDayData.cumulativeVolume = ZERO_BI
    vaultDayData.cumulativeMargin = ZERO_BI
    vaultDayData.cumulativePnl = ZERO_BI
    vaultDayData.cumulativeFee = ZERO_BI
    vaultDayData.positionCount = ZERO_BI
    vaultDayData.tradeCount = ZERO_BI
    vaultDayData.txCount = ZERO_BI
    vaultDayData.liquidatorReward = ZERO_BI
    vaultDayData.remainingReward = ZERO_BI
    vaultDayData.save()
  }

  return vaultDayData!

}

export function handleNewPosition(event: NewPosition): void {
  let vault = Vault.load((1).toString())

  if (!vault) return

  let product = Product.load((event.params.productId).toString())
  if (!product) return
  vault.txCount = vault.txCount.plus(ONE_BI)
  // create transaction
  let transaction = new Transaction(event.params.positionId.toString() + event.transaction.hash.toHex() + vault.txCount.toString() + "0")
  transaction.count = vault.txCount
  transaction.txHash = event.transaction.hash.toHexString()
  transaction.positionId = event.params.positionId
  transaction.owner = event.params.user
  transaction.productId = event.params.productId
  transaction.margin = event.params.margin
  transaction.leverage = event.params.leverage
  let amount = event.params.margin.times(event.params.leverage).div(UNIT_BI)
  transaction.amount = amount
  transaction.price = event.params.price
  transaction.isLong = event.params.isLong
  transaction.timestamp = event.block.timestamp
  transaction.blockNumber = event.block.number

  // Create position
  let position = Position.load(event.params.positionId.toString())
  let singleAmount = ZERO_BI
  let singleMargin = ZERO_BI
  let singleLeverage = ZERO_BI
  if (!position) {
    position = new Position(event.params.positionId.toString())
    singleAmount = amount
    singleMargin = event.params.margin
    singleLeverage = event.params.leverage
    transaction.price = event.params.price
    position.createdAtTimestamp = event.block.timestamp
  } else {
    singleAmount = amount.minus(position.amount)
    singleMargin = event.params.margin.minus(position.margin)
    singleLeverage = singleAmount.div(singleMargin)
    transaction.price = (event.params.price.times(amount).minus(position.price.times(position.amount))).div(singleAmount)
  }
  let tradeFee = event.params.fee
  transaction.tradeFee = tradeFee
  transaction.singleAmount = singleAmount
  transaction.singleMargin = singleMargin
  transaction.singleLeverage = singleLeverage
  position.productId = event.params.productId
  position.leverage = event.params.leverage
  position.price = event.params.price
  position.oraclePrice = event.params.oraclePrice
  position.margin = event.params.margin
  position.amount = amount

  position.owner = event.params.user

  position.isLong = event.params.isLong
  position.funding = event.params.fundingRate

  // position.createdAtTimestamp = event.block.timestamp
  position.createdAtBlockNumber = event.block.number

  // Update liquidation price
  let liquidationPrice = ZERO_BI
  if (position.isLong) {
    liquidationPrice = position.price.minus((position.price.times(BigInt.fromI32(8000)).times(BigInt.fromI32(10000))).div(position.leverage))
  } else {
    liquidationPrice = position.price.plus((position.price.times(BigInt.fromI32(8000)).times(BigInt.fromI32(10000))).div(position.leverage))
  }
  position.liquidationPrice = liquidationPrice

  // volume updates
  vault.cumulativeVolume = vault.cumulativeVolume.plus(singleAmount)
  vault.cumulativeMargin = vault.cumulativeMargin.plus(event.params.margin)
  vault.positionCount = vault.positionCount.plus(ONE_BI)

  let vaultDayData = getVaultDayData(event)
  vaultDayData.cumulativeVolume = vaultDayData.cumulativeVolume.plus(singleAmount)
  vaultDayData.cumulativeMargin = vaultDayData.cumulativeMargin.plus(singleMargin)
  vaultDayData.cumulativeFee = vaultDayData.cumulativeFee.plus(tradeFee)
  vaultDayData.positionCount = vaultDayData.positionCount.plus(ONE_BI)
  vaultDayData.txCount = vaultDayData.txCount.plus(ONE_BI)

  product.cumulativeVolume = product.cumulativeVolume.plus(amount)
  product.cumulativeMargin = product.cumulativeMargin.plus(event.params.margin)
  product.positionCount = product.positionCount.plus(ONE_BI)

  if (position.isLong) {
    product.openInterestLong = product.openInterestLong.plus(amount)
  } else {
    product.openInterestShort = product.openInterestShort.plus(amount)
  }

  // Update user
  if (event.block.timestamp >= START_TIME && event.block.timestamp < END_TIME) {
    let user = User.load(event.params.user.toHexString())
    if (!user) {
      user = new User(event.params.user.toHexString())
      vault.userCount = vault.userCount.plus(ONE_BI)
      user.userNumber = vault.userCount
      user.createdAtTimestamp = event.block.timestamp
      user.depositAmount = ZERO_BI
      user.withdrawAmount = ZERO_BI
      user.shares = ZERO_BI
      user.reward = ZERO_BI
      user.remainingAmount = ZERO_BI
      user.netAmount = ZERO_BI
      user.netAmountWithReward = ZERO_BI
      user.tradeCount = ONE_BI
      user.volume = singleAmount
      user.fees = singleAmount.times(product.fee).div(FEE_BI)
      user.pnl = ZERO_BI
    } else {
      user.tradeCount = user.tradeCount.plus(ONE_BI)
      user.volume = user.volume.plus(singleAmount)
      user.fees = user.fees.plus(singleAmount.times(product.fee).div(FEE_BI))
    }

    user.save()
  }
  if (event.block.timestamp >= START_TIME && event.block.timestamp < END_TIME && position.createdAtTimestamp >= START_TIME) {
    transaction.save()
  }
  position.save()
  vault.save()
  vaultDayData.save()
  product.save()

}

export function handleAddMargin(event: AddMargin): void {
  let position = Position.load(event.params.positionId.toString())

  if (position) {

    position.margin = event.params.newMargin
    position.leverage = event.params.newLeverage

    position.updatedAtTimestamp = event.block.timestamp
    position.updatedAtBlockNumber = event.block.number

    // volume updates

    let vault = Vault.load((1).toString())
    if (!vault) return
    vault.cumulativeMargin = vault.cumulativeMargin.plus(event.params.margin)

    let vaultDayData = getVaultDayData(event)
    vaultDayData.cumulativeMargin = vaultDayData.cumulativeMargin.plus(event.params.margin)

    let product = Product.load((position.productId).toString())
    if (!product) return
    product.cumulativeMargin = product.cumulativeMargin.plus(event.params.margin)

    // Update liquidation price

    let liquidationPrice = ZERO_BI
    if (position.isLong) {
      liquidationPrice = position.price.minus((position.price.times(BigInt.fromI32(8000)).times(BigInt.fromI32(10000))).div(position.leverage))
    } else {
      liquidationPrice = position.price.plus((position.price.times(BigInt.fromI32(8000)).times(BigInt.fromI32(10000))).div(position.leverage))
    }

    position.liquidationPrice = liquidationPrice

    let activity = new Activity(position.owner.toHexString() + event.block.timestamp.toString() + "Added margin")
    activity.account = event.params.user.toHexString()
    activity.action = "Added margin"
    activity.productId = position.productId
    activity.margin = event.params.margin
    activity.txHash = event.transaction.hash.toHexString()
    activity.timestamp = event.block.timestamp
    activity.save()

    position.save()
    vault.save()
    vaultDayData.save()
    product.save()

  }

}

export function handleClosePosition(event: ClosePosition): void {
  let product = Product.load((event.params.productId).toString())

  let position = Position.load(event.params.positionId.toString())

  if (position) {

    let vault = Vault.load((1).toString())
    if (!vault) return
    let vaultDayData = getVaultDayData(event)
    let product = Product.load((event.params.productId).toString())
    if (!product) return
    vault.tradeCount = vault.tradeCount.plus(ONE_BI)
    vault.txCount = vault.txCount.plus(ONE_BI)

    // create transaction
    let transaction = new Transaction(event.params.positionId.toString() + event.transaction.hash.toHex() + vault.txCount.toString() +"1")
    transaction.count = vault.txCount
    transaction.txHash = event.transaction.hash.toHexString()
    transaction.positionId = event.params.positionId
    transaction.owner = event.params.user
    transaction.productId = event.params.productId
    transaction.margin = event.params.margin
    transaction.leverage = event.params.leverage
    let amount = event.params.margin.times(event.params.leverage).div(UNIT_BI)
    transaction.amount = amount
    transaction.singleAmount = amount
    transaction.singleMargin = event.params.margin
    transaction.price = event.params.price
    transaction.isLong = !position.isLong
    let tradeFee = event.params.fee
    transaction.tradeFee = tradeFee
    transaction.pnl = event.params.pnl
    transaction.wasLiquidated = event.params.wasLiquidated
    transaction.timestamp = event.block.timestamp
    transaction.blockNumber = event.block.number

    // create new trade
    let trade = new Trade(vault.tradeCount.toString())
    trade.txHash = event.transaction.hash.toHexString()

    trade.positionId = event.params.positionId
    trade.productId = event.params.productId
    trade.leverage = event.params.leverage
    trade.amount = amount

    trade.entryPrice = event.params.entryPrice
    trade.closePrice = event.params.price

    trade.margin = event.params.margin
    trade.owner = event.params.user

    trade.pnl = event.params.pnl
    trade.pnlIsNegative = !trade.pnl.gt(ZERO_BI)

    trade.wasLiquidated = event.params.wasLiquidated
    trade.isFullClose = event.params.margin == position.margin

    let activity = new Activity(event.params.user.toHexString() + event.block.timestamp.toString() + "Liquidated")
    if (trade.wasLiquidated) {
      trade.tradeFee = tradeFee.times(ONE_BI)
      transaction.tradeFee = ZERO_BI
      activity.account = event.params.user.toHexString()
      activity.action = "Liquidated"
      activity.type = "market"
      activity.productId = event.params.productId
      activity.isLong = position.isLong
      activity.margin = event.params.margin
      activity.size = amount
      activity.price = event.params.price
      activity.txHash = event.transaction.hash.toHexString()
      activity.timestamp = event.block.timestamp
      activity.save()
    } else {
      trade.tradeFee = tradeFee.times(TWO_BI)
    }
    trade.fundingPayment = event.params.fundingPayment

    trade.isLong = position.isLong

    trade.timestamp = event.block.timestamp
    trade.blockNumber = event.block.number

    // Update position

    if (trade.isFullClose) {
      store.remove('Position', event.params.positionId.toString())
      vault.positionCount = vault.positionCount.minus(ONE_BI)
      product.positionCount = product.positionCount.minus(ONE_BI)
    } else {
      // Update position with partial close, e.g. subtract margin
      position.margin = position.margin.minus(event.params.margin)
      position.amount = position.amount.minus(amount)
      position.save()
    }

    // update volumes

    vault.cumulativeVolume = vault.cumulativeVolume.plus(amount)
    vault.cumulativeMargin = vault.cumulativeMargin.plus(event.params.margin)

    if (trade.pnlIsNegative) {
      vault.cumulativePnl = vault.cumulativePnl.minus(event.params.pnl)
      vault.balance = vault.balance.plus(event.params.pnl)
      vaultDayData.cumulativePnl = vaultDayData.cumulativePnl.minus(event.params.pnl)
      product.cumulativePnl = product.cumulativePnl.minus(event.params.pnl)
    } else {
      vault.cumulativePnl = vault.cumulativePnl.plus(event.params.pnl)
      vault.balance = !trade.wasLiquidated ? vault.balance.minus(event.params.pnl) : vault.balance.plus(event.params.pnl)
      vaultDayData.cumulativePnl = vaultDayData.cumulativePnl.plus(event.params.pnl)
      product.cumulativePnl = product.cumulativePnl.plus(event.params.pnl)
    }

    vaultDayData.cumulativeVolume = vaultDayData.cumulativeVolume.plus(amount)
    vaultDayData.cumulativeMargin = vaultDayData.cumulativeMargin.plus(event.params.margin)
    vaultDayData.cumulativeFee = vaultDayData.cumulativeFee.plus(transaction.tradeFee)
    vaultDayData.tradeCount = vaultDayData.tradeCount.plus(ONE_BI)
    vaultDayData.txCount = vaultDayData.txCount.plus(ONE_BI)

    product.cumulativeVolume = product.cumulativeVolume.plus(amount)
    product.cumulativeMargin = product.cumulativeMargin.plus(event.params.margin)
    product.tradeCount = product.tradeCount.plus(ONE_BI)

    if (position.isLong) {
      if (product.openInterestLong.minus(amount).lt(ZERO_BI)) {
        product.openInterestLong = ZERO_BI
      } else {
        product.openInterestLong = product.openInterestLong.minus(amount)
      }
    } else {
      if (product.openInterestShort.minus(amount).lt(ZERO_BI)) {
        product.openInterestShort = ZERO_BI
      } else {
        product.openInterestShort = product.openInterestShort.minus(amount)
      }
    }

    if (event.block.timestamp >= START_TIME && event.block.timestamp < END_TIME) {
      // Update user
      let user = User.load(event.params.user.toHexString())
      if (!user) {
        user = new User(event.params.user.toHexString())
        vault.userCount = vault.userCount.plus(ONE_BI)
        user.userNumber = vault.userCount
        user.createdAtTimestamp = event.block.timestamp
        user.depositAmount = ZERO_BI
        user.withdrawAmount = ZERO_BI
        user.shares = ZERO_BI
        user.reward = ZERO_BI
        user.remainingAmount = ZERO_BI
        user.netAmount = ZERO_BI
        user.netAmountWithReward = ZERO_BI
        user.tradeCount = ZERO_BI
        user.volume = ZERO_BI
        user.fees = ZERO_BI
        user.pnl = ZERO_BI
      }
      // Update user data
      user.tradeCount = user.tradeCount.plus(ONE_BI)
      user.volume = user.volume.plus(amount)
      if (!trade.wasLiquidated) {
        user.fees = user.fees.plus(tradeFee)
      }

      user.pnl = user.pnl.plus(event.params.pnl)
      user.save()
    }

    if (event.block.timestamp >= START_TIME && event.block.timestamp < END_TIME && position.createdAtTimestamp >= START_TIME) {
      trade.save()
      transaction.save()
    }
    vault.save()
    vaultDayData.save()
    product.save()

  }

}

export function handleProductAdded(event: ProductAdded): void {

  let product = Product.load(event.params.productId.toString())

  if (product == null) {

    product = new Product(event.params.productId.toString())

    product.createdAtTimestamp = event.block.timestamp
    product.createdAtBlockNumber = event.block.number

    product.cumulativePnl = ZERO_BI
    product.cumulativeVolume = ZERO_BI
    product.cumulativeMargin = ZERO_BI

    product.positionCount = ZERO_BI
    product.tradeCount = ZERO_BI

    product.productToken = event.params.product.productToken
    product.maxLeverage = event.params.product.maxLeverage
    product.fee = BigInt.fromI32(event.params.product.fee)

    product.isActive = true

    product.openInterestLong = ZERO_BI
    product.openInterestShort = ZERO_BI

    product.minPriceChange = event.params.product.minPriceChange
    product.weight = event.params.product.weight
    product.reserve = event.params.product.reserve

    product.save()

  }

}

export function handleProductUpdated(event: ProductUpdated): void {

  let product = Product.load(event.params.productId.toString())

  if (product) {

    product.updatedAtTimestamp = event.block.timestamp
    product.updatedAtBlockNumber = event.block.number

    product.productToken = event.params.product.productToken
    product.maxLeverage = event.params.product.maxLeverage
    product.fee = BigInt.fromI32(event.params.product.fee)

    product.isActive = event.params.product.isActive

    product.minPriceChange = event.params.product.minPriceChange
    product.weight = event.params.product.weight
    product.reserve = event.params.product.reserve

    product.save()
  }

}

export function handleVaultUpdated(event: VaultUpdated): void {

  let vault = Vault.load((1).toString())

  if (vault == null) {

    vault = new Vault((1).toString())

    vault.createdAtTimestamp = event.block.timestamp
    vault.createdAtBlockNumber = event.block.number

    vault.balance = ZERO_BI
    vault.staked = ZERO_BI
    vault.shares = ZERO_BI

    vault.cumulativePnl = ZERO_BI
    vault.cumulativeVolume = ZERO_BI
    vault.cumulativeMargin = ZERO_BI
    vault.cumulativeFee = ZERO_BI

    vault.positionCount = ZERO_BI
    vault.tradeCount = ZERO_BI
    vault.txCount = ZERO_BI
    vault.liquidationCount = ZERO_BI
    vault.userCount = ZERO_BI
    vault.protocolReward = ZERO_BI
    vault.pikaReward = ZERO_BI
    vault.vaultReward = ZERO_BI
  }

  vault.updatedAtTimestamp = event.block.timestamp
  vault.updatedAtBlockNumber = event.block.number

  vault.cap = event.params.vault.cap

  vault.stakingPeriod = event.params.vault.stakingPeriod

  vault.save()

}

