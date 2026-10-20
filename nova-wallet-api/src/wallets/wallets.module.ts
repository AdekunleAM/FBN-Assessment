import { Module } from "@nestjs/common";
import { StoreModule } from "../store.module";
import { WalletsController } from "./wallets.controller";
import { WalletsService } from "./wallets.service";

@Module({
  imports: [StoreModule],
  controllers: [WalletsController],
  providers: [WalletsService],
})
export class WalletsModule {}
