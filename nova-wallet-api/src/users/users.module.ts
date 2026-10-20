import { Module, OnModuleInit } from "@nestjs/common";
import { StoreModule } from "../store.module";
import { StoreService } from "../store.service";
import { AuthController } from "./auth.controller";
import { seedDefaultUserIfMissing } from "./user.model";
import { UsersService } from "./users.service";

@Module({
  imports: [StoreModule],
  controllers: [AuthController],
  providers: [UsersService],
})
export class UsersModule implements OnModuleInit {
  constructor(private readonly store: StoreService) {}

  onModuleInit(): void {
    this.store.mutateIfNeeded((db) => seedDefaultUserIfMissing(db));
  }
}
