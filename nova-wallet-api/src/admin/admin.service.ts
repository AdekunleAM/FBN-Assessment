import { Injectable } from "@nestjs/common";
import { StoreService } from "../store.service";
import { clearAllDataExceptAdmin } from "./admin.model";

@Injectable()
export class AdminService {
  constructor(private readonly store: StoreService) {}

  async clearAllDataExceptAdmin() {
    return this.store.withDb((db) => clearAllDataExceptAdmin(db));
  }
}
