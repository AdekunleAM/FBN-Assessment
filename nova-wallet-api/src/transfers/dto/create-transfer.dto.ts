import { IsInt, IsNotEmpty, IsPositive, IsString } from "class-validator";

const ID_MESSAGE = "fromWalletId and toWalletId are required strings";
const AMOUNT_MESSAGE = "amountKobo must be a positive integer (amount in kobo)";

export class CreateTransferDto {
  @IsString({ message: ID_MESSAGE })
  @IsNotEmpty({ message: ID_MESSAGE })
  fromWalletId!: string;

  @IsString({ message: ID_MESSAGE })
  @IsNotEmpty({ message: ID_MESSAGE })
  toWalletId!: string;

  @IsInt({ message: AMOUNT_MESSAGE })
  @IsPositive({ message: AMOUNT_MESSAGE })
  amountKobo!: number;
}
