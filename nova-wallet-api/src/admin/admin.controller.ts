import { Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "../common/guards/admin-auth.guard";
import { AdminService } from "./admin.service";

// Admin-only: AdminAuthGuard accepts only the exact static API_TOKEN, never
// a per-user JWT, since this endpoint is destructive.
@UseGuards(AdminAuthGuard)
@Controller("admin")
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Post("clear")
  @HttpCode(200)
  clear() {
    return this.adminService.clearAllDataExceptAdmin();
  }
}
