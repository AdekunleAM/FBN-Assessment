import { IsEmail, IsString, MinLength } from "class-validator";

// Shared shape for POST /auth/login and POST /auth/me - both authenticate
// by email + password.
export class CredentialsDto {
  @IsEmail({}, { message: "email must be a valid email address" })
  email!: string;

  @IsString({ message: "password is required" })
  @MinLength(1, { message: "password is required" })
  password!: string;
}
