import { BigInt, store, log, ethereum } from "@graphprotocol/graph-ts"
import {
  PikaPerpV2,
  AddMargin,
  ClosePosition,
  NewPosition,
  NewPositionSettled,
  OwnerUpdated,
  PositionLiquidated,
  ProductAdded,
  ProductUpdated,
  ProtocolFeeUpdated,
  Redeemed,
  Staked,
  VaultUpdated
} from "../generated/PikaPerpV2/PikaPerpV2"
import { Vault, Product, Position, Trade, VaultDayData, Stake } from "../generated/schema"

export const ADDRESS_ZERO = '0x0000000000000000000000000000000000000000'

export const ZERO_BI = BigInt.fromI32(0)
export const ONE_BI = BigInt.fromI32(1)
export const UNIT_BI = BigInt.fromI32(100000000)

function getVaultDayData(event: ethereum.Event): VaultDayData {

  let timestamp = event.block.timestamp.toI32()
  let day_id = timestamp / 86400
  let vaultDayData = VaultDayData.load(day_id.toString())

  if (vaultDayData == null) {
    vaultDayData = new VaultDayData(day_id.toString())
    vaultDayData.date = BigInt.fromI32(day_id * 86400)
    vaultDayData.cumulativeVolume = ZERO_BI
    vaultDayData.cumulativeMargin = ZERO_BI
    vaultDayData.positionCount = ZERO_BI
    vaultDayData.tradeCount = ZERO_BI
    vaultDayData.save()
  }

  return vaultDayData!

}

export function handleNewPosition(event: NewPosition): void {

  // Create position
  let position = new Position(event.params.positionId.toString())

  position.productId = event.params.productId
  position.leverage = event.params.leverage
  position.price = event.params.price
  position.margin = event.params.margin

  let amount = event.params.margin.times(event.params.leverage).div(UNIT_BI)
  position.amount = amount

  position.owner = event.params.user

  position.isLong = event.params.isLong
  position.isSettling = true

  position.createdAtTimestamp = event.block.timestamp
  position.createdAtBlockNumber = event.block.number

  let product = Product.load((event.params.productId).toString())

  // volume updates
  let vault = Vault.load((1).toString())
  vault.cumulativeVolume = vault.cumulativeVolume.plus(amount)
  vault.cumulativeMargin = vault.cumulativeMargin.plus(event.params.margin)
  vault.positionCount = vault.positionCount.plus(ONE_BI)

  let vaultDayData = getVaultDayData(event)
  vaultDayData.cumulativeVolume = vaultDayData.cumulativeVolume.plus(amount)
  vaultDayData.cumulativeMargin = vaultDayData.cumulativeMargin.plus(event.params.margin)
  vaultDayData.positionCount = vaultDayData.positionCount.plus(ONE_BI)

  product.cumulativeVolume = product.cumulativeVolume.plus(amount)
  product.cumulativeMargin = product.cumulativeMargin.plus(event.params.margin)
  product.positionCount = product.positionCount.plus(ONE_BI)

  if (position.isLong) {
    product.openInterestLong = product.openInterestLong.plus(amount)
  } else {
    product.openInterestShort = product.openInterestShort.plus(amount)
  }

  position.save()
  vault.save()
  vaultDayData.save()
  product.save()

}

export function handleNewPositionSettled(event: NewPositionSettled): void {

  let position = Position.load(event.params.positionId.toString())

  if (position) {

    position.price = event.params.price
    position.isSettling = false

    position.settledAtTimestamp = event.block.timestamp
    position.settledAtBlockNumber = event.block.number
    position.isSettling

    let product = Product.load((position.productId).toString())

    let liquidationPrice = ZERO_BI
    if (position.isLong) {
      liquidationPrice = position.price.minus((position.price.times(product.liquidationThreshold).times(BigInt.fromI32(10000))).div(position.leverage))
    } else {
      liquidationPrice = position.price.plus((position.price.times(product.liquidationThreshold).times(BigInt.fromI32(10000))).div(position.leverage))
    }

    position.liquidationPrice = liquidationPrice

    position.save()

  }

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
    vault.cumulativeMargin = vault.cumulativeMargin.plus(event.params.margin)

    let vaultDayData = getVaultDayData(event)
    vaultDayData.cumulativeMargin = vaultDayData.cumulativeMargin.plus(event.params.margin)

    let product = Product.load((position.productId).toString())
    product.cumulativeMargin = product.cumulativeMargin.plus(event.params.margin)

    // Update liquidation price

    let liquidationPrice = ZERO_BI
    if (position.isLong) {
      liquidationPrice = position.price.minus((position.price.times(product.liquidationThreshold).times(BigInt.fromI32(10000))).div(position.leverage))
    } else {
      liquidationPrice = position.price.plus((position.price.times(product.liquidationThreshold).times(BigInt.fromI32(10000))).div(position.leverage))
    }

    position.liquidationPrice = liquidationPrice

    position.save()
    vault.save()
    vaultDayData.save()
    product.save()

  }

}

export function handleClosePosition(event: ClosePosition): void {

  let position = Position.load(event.params.positionId.toString())

  if (position) {

    let vault = Vault.load((1).toString())
    let vaultDayData = getVaultDayData(event)
    let product = Product.load((event.params.productId).toString())

    vault.tradeCount = vault.tradeCount.plus(ONE_BI)

    let amount = event.params.margin.times(event.params.leverage).div(UNIT_BI)

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
    trade.pnlIsNegative = event.params.pnlIsNegative
    trade.wasLiquidated = event.params.wasLiquidated
    trade.isFullClose = event.params.isFullClose

    trade.isLong = position.isLong

    trade.timestamp = event.block.timestamp
    trade.blockNumber = event.block.number

    // Update position

    if (event.params.isFullClose) {
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
      vault.balance = vault.balance.minus(event.params.pnl)
      vaultDayData.cumulativePnl = vaultDayData.cumulativePnl.plus(event.params.pnl)
      product.cumulativePnl = product.cumulativePnl.plus(event.params.pnl)
    }

    vaultDayData.cumulativeVolume = vaultDayData.cumulativeVolume.plus(amount)
    vaultDayData.cumulativeMargin = vaultDayData.cumulativeMargin.plus(event.params.margin)
    vaultDayData.tradeCount = vaultDayData.tradeCount.plus(ONE_BI)

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

    trade.save()
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

    product.feed = event.params.product.feed
    product.maxLeverage = event.params.product.maxLeverage
    product.fee = BigInt.fromI32(event.params.product.fee)

    product.isActive = true
    product.maxExposure = event.params.product.maxExposure

    product.openInterestLong = ZERO_BI
    product.openInterestShort = ZERO_BI

    product.interest = BigInt.fromI32(event.params.product.interest)
    product.settlementTime = event.params.product.settlementTime
    product.minTradeDuration = BigInt.fromI32(event.params.product.minTradeDuration)
    product.liquidationThreshold = BigInt.fromI32(event.params.product.liquidationThreshold)
    product.liquidationBounty = BigInt.fromI32(event.params.product.liquidationBounty)

    product.save()

  }

}

export function handleProductUpdated(event: ProductUpdated): void {

  let product = Product.load(event.params.productId.toString())

  if (product) {

    product.updatedAtTimestamp = event.block.timestamp
    product.updatedAtBlockNumber = event.block.number

    product.feed = event.params.product.feed
    product.maxLeverage = event.params.product.maxLeverage
    product.fee = BigInt.fromI32(event.params.product.fee)

    product.isActive = event.params.product.isActive
    product.maxExposure = event.params.product.maxExposure

    product.interest = BigInt.fromI32(event.params.product.interest)
    product.settlementTime = event.params.product.settlementTime
    product.minTradeDuration = BigInt.fromI32(event.params.product.minTradeDuration)
    product.liquidationThreshold = BigInt.fromI32(event.params.product.liquidationThreshold)
    product.liquidationBounty = BigInt.fromI32(event.params.product.liquidationBounty)

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

    vault.cumulativePnl = ZERO_BI
    vault.cumulativeVolume = ZERO_BI
    vault.cumulativeMargin = ZERO_BI

    vault.positionCount = ZERO_BI
    vault.tradeCount = ZERO_BI

  }

  vault.updatedAtTimestamp = event.block.timestamp
  vault.updatedAtBlockNumber = event.block.number

  vault.cap = event.params.vault.cap

  vault.stakingPeriod = event.params.vault.stakingPeriod
  vault.redemptionPeriod = event.params.vault.redemptionPeriod

  vault.maxDailyDrawdown = event.params.vault.maxDailyDrawdown

  vault.save()

}

export function handleStaked(event: Staked): void {

  let vault = Vault.load((1).toString())
  vault.balance = vault.balance.plus(event.params.amount)
  vault.staked = vault.staked.plus(event.params.amount)
  vault.save()

  // create stake
  let stake = new Stake(event.params.stakeId.toString())

  stake.owner = event.params.user
  stake.amount = event.params.amount
  stake.timestamp = event.block.timestamp

  stake.save()

}

export function handleRedeemed(event: Redeemed): void {

  let vault = Vault.load((1).toString())
  vault.balance = vault.balance.minus(event.params.amount)
  vault.staked = vault.staked.minus(event.params.amount)
  vault.save()

  let stake = Stake.load(event.params.stakeId.toString())

  if (event.params.isFullRedeem) {
    store.remove('Stake', event.params.stakeId.toString())
  } else {
    stake.amount = stake.amount.minus(event.params.amount)
    stake.save()
  }

}

export function handleOwnerUpdated(event: OwnerUpdated): void {}
export function handleProtocolFeeUpdated(event: ProtocolFeeUpdated): void {}
export function handlePositionLiquidated(event: PositionLiquidated): void {}
