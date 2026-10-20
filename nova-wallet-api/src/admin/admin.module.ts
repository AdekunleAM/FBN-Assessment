import { Module } from "@nestjs/common";
import { StoreModule } from "../store.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [StoreModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
