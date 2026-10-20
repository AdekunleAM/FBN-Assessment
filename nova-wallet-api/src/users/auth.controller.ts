import { Body, Controller, HttpCode, Post, UseGuards } from "@nestjs/common";
import { BearerAuthGuard } from "../common/guards/bearer-auth.guard";
import { CredentialsDto } from "./dto/credentials.dto";
import { SignUpDto } from "./dto/sign-up.dto";
import { UsersService } from "./users.service";

// Signup/login are deliberately public (no guard) - a client has no bearer
// token yet when calling either of them. Every other route in the app,
// including /auth/me, still requires the usual Authorization header.
@Controller("auth")
export class AuthController {
  constructor(private readonly usersService: UsersService) {}

  @Post("signup")
  @HttpCode(201)
  signUp(@Body() dto: SignUpDto) {
    return this.usersService.signUp(dto);
  }

  @Post("login")
  @HttpCode(200)
  login(@Body() dto: CredentialsDto) {
    return this.usersService.login(dto);
  }

  @UseGuards(BearerAuthGuard)
  @Post("me")
  @HttpCode(200)
  getUserInfo(@Body() dto: CredentialsDto) {
    return this.usersService.getUserInfo(dto);
  }
}
