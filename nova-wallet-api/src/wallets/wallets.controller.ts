import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from "@nestjs/common";
import { BearerAuthGuard } from "../common/guards/bearer-auth.guard";
import { CreditWalletDto } from "./dto/credit-wallet.dto";
import { WalletsService } from "./wallets.service";

@UseGuards(BearerAuthGuard)
@Controller("wallets")
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Post()
  @HttpCode(201)
  create() {
    return this.walletsService.createWallet();
  }

  @Get(":id")
  getOne(@Param("id") id: string) {
    return this.walletsService.getWallet(id);
  }

  @Post(":id/credit")
  @HttpCode(200)
  credit(@Param("id") id: string, @Body() dto: CreditWalletDto) {
    return this.walletsService.creditWallet(id, dto.amountKobo);
  }
}
