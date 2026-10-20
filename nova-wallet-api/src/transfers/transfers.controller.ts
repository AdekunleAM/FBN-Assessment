import { Body, Controller, Headers, Post, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { BearerAuthGuard } from "../common/guards/bearer-auth.guard";
import { IdempotencyKeyGuard } from "../common/guards/idempotency-key.guard";
import { CreateTransferDto } from "./dto/create-transfer.dto";
import { TransfersService } from "./transfers.service";

@UseGuards(BearerAuthGuard)
@Controller("transfers")
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post()
  @UseGuards(IdempotencyKeyGuard)
  async create(
    @Headers("idempotency-key") idempotencyKey: string,
    @Body() dto: CreateTransferDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const result = await this.transfersService.transfer(idempotencyKey, dto);
    res.status(result.status);
    return result.body;
  }
}
