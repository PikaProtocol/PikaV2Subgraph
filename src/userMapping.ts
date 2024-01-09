import { Address, BigInt, store, log, ethereum } from "@graphprotocol/graph-ts"
import { ProxySet } from "../generated/UserMapping/UserMapping"
import { UserToProxy } from "../generated/schema";

export function handleProxySet(event: ProxySet): void {
    let userToProxy = UserToProxy.load(event.params.userAddress.toHexString())
    if (!userToProxy) {
        userToProxy = new UserToProxy(event.params.userAddress.toHexString())
        userToProxy.proxy = event.params.proxyAddress.toHexString()
    }
    userToProxy.save()

}
