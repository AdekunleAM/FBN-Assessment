import { Module } from "@nestjs/common";
import { AdminModule } from "./admin/admin.module";
import { AppController } from "./app.controller";
import { TransfersModule } from "./transfers/transfers.module";
import { UsersModule } from "./users/users.module";
import { WalletsModule } from "./wallets/wallets.module";

@Module({
  imports: [WalletsModule, TransfersModule, UsersModule, AdminModule],
  controllers: [AppController],
})
export class AppModule {}
