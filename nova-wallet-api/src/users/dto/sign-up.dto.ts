import { IsEmail, IsNotEmpty, IsString, MinLength } from "class-validator";

export class SignUpDto {
  @IsEmail({}, { message: "email must be a valid email address" })
  email!: string;

  @IsString({ message: "fullName is required" })
  @IsNotEmpty({ message: "fullName is required" })
  fullName!: string;

  @IsString({ message: "password must be at least 8 characters" })
  @MinLength(8, { message: "password must be at least 8 characters" })
  password!: string;
}
