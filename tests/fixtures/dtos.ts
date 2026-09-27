// DTOs declared in another file than the plainToInstance() call.
import { Exclude, Expose } from 'class-transformer';

export class PaymentDto {
  id!: string;
  amount!: number;
}

@Exclude()
export class ExposedPaymentDto {
  @Expose() id!: string;
  @Expose() amount!: number;
  @Expose() accountId!: string;
  internal!: string;
}

@Exclude()
export class BaseResponseDto {
  @Expose() id!: string;
}
