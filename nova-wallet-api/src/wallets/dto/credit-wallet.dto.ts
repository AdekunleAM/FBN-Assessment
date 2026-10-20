import { IsInt, IsPositive } from "class-validator";

const AMOUNT_MESSAGE = "amountKobo must be a positive integer (amount in kobo)";

export class CreditWalletDto {
  @IsInt({ message: AMOUNT_MESSAGE })
  @IsPositive({ message: AMOUNT_MESSAGE })
  amountKobo!: number;
}
