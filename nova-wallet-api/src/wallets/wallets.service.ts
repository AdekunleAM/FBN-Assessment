import { Injectable } from "@nestjs/common";
import { ApiException } from "../common/exceptions/api.exception";
import { StoreService } from "../store.service";
import { createWallet, creditWallet, toWalletResponse } from "../wallet.model";

@Injectable()
export class WalletsService {
  constructor(private readonly store: StoreService) {}

  async createWallet() {
    const wallet = await this.store.withDb((db) => createWallet(db));
    return toWalletResponse(wallet);
  }

  getWallet(id: string) {
    const wallet = this.store.readDb().wallets[id];
    if (!wallet) {
      throw new ApiException(404, `Wallet ${id} not found`);
    }
    return toWalletResponse(wallet);
  }

  async creditWallet(id: string, amountKobo: number) {
    const wallet = await this.store.withDb((db) => creditWallet(db, id, amountKobo));
    return toWalletResponse(wallet);
  }
}
