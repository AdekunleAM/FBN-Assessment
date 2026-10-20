import { Module } from "@nestjs/common";
import { StoreModule } from "../store.module";
import { TransfersController } from "./transfers.controller";
import { TransfersService } from "./transfers.service";

@Module({
  imports: [StoreModule],
  controllers: [TransfersController],
  providers: [TransfersService],
})
export class TransfersModule {}
