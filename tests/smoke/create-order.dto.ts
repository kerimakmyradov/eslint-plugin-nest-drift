import { IsEnum, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

enum Currency { Usd = 'usd', Eur = 'eur' }
enum Status { Open = 'open' }
class Discount { code!: string; }
class OrderLine { sku!: string; }

export class CreateOrderDto {
  @ApiProperty({ type: Number }) @IsString() amount!: number;
  @IsEnum(Status) currency!: Currency;
  @ValidateNested() @Type(() => Discount) lines!: OrderLine[];
  @IsInt() ids!: number[];
  @IsOptional() @IsString() note?: string | null;
  @ApiProperty() @IsString() comment!: string | null;
}
