import { Injectable } from "@nestjs/common";
import crypto from "node:crypto";
import { v4 as uuidv4 } from "uuid";
import { ApiException } from "../common/exceptions/api.exception";
import { StoreService } from "../store.service";
import { Transfer } from "../types";
import { DAILY_OUTBOUND_LIMIT_KOBO, ensureDailyWindow, getWalletOrThrow } from "../wallet.model";
import { CreateTransferDto } from "./dto/create-transfer.dto";

interface TransferResult {
  status: number;
  body: unknown;
}

@Injectable()
export class TransfersService {
  constructor(private readonly store: StoreService) {}

  async transfer(idempotencyKey: string, dto: CreateTransferDto): Promise<TransferResult> {
    const { fromWalletId, toWalletId, amountKobo } = dto;

    if (fromWalletId === toWalletId) {
      throw new ApiException(400, "fromWalletId and toWalletId must differ");
    }

    // Hash the semantic request so a reused Idempotency-Key with a different
    // payload is rejected instead of silently replaying the wrong result.
    const requestHash = crypto
      .createHash("sha256")
      .update(JSON.stringify({ fromWalletId, toWalletId, amountKobo }))
      .digest("hex");

    return this.store.withDb<TransferResult>((db) => {
      const existing = db.idempotencyKeys[idempotencyKey];
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ApiException(
            409,
            "Idempotency-Key was already used with a different request payload"
          );
        }
        return { status: existing.statusCode, body: existing.responseBody };
      }

      const fromWallet = getWalletOrThrow(db, fromWalletId);
      const toWallet = getWalletOrThrow(db, toWalletId);

      ensureDailyWindow(fromWallet);

      if (fromWallet.balanceKobo < amountKobo) {
        throw new ApiException(422, "Insufficient funds");
      }
      if (fromWallet.dailyOutbound.totalKobo + amountKobo > DAILY_OUTBOUND_LIMIT_KOBO) {
        throw new ApiException(
          422,
          `Daily outbound transfer limit of ${DAILY_OUTBOUND_LIMIT_KOBO} kobo exceeded`
        );
      }

      // All validations passed - mutate balances and persist the transfer
      // and idempotency record together so a crash can't leave one without
      // the other.
      fromWallet.balanceKobo -= amountKobo;
      toWallet.balanceKobo += amountKobo;
      fromWallet.dailyOutbound.totalKobo += amountKobo;

      const transfer: Transfer = {
        id: uuidv4(),
        fromWalletId,
        toWalletId,
        amountKobo,
        idempotencyKey,
        createdAt: new Date().toISOString(),
      };
      db.transfers.push(transfer);

      const responseBody = {
        transferId: transfer.id,
        fromWalletId,
        toWalletId,
        amountKobo,
        fromBalanceKobo: fromWallet.balanceKobo,
        toBalanceKobo: toWallet.balanceKobo,
        createdAt: transfer.createdAt,
      };

      db.idempotencyKeys[idempotencyKey] = {
        key: idempotencyKey,
        requestHash,
        statusCode: 201,
        responseBody,
        createdAt: transfer.createdAt,
      };

      return { status: 201, body: responseBody };
    });
  }
}
