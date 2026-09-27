import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { plainToInstance } from 'class-transformer';

@Entity()
export class Payment {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column('decimal', { precision: 12, scale: 2 }) amount!: number;
  @Column('varchar') currency!: string;
}

export class PaymentDto { id!: string; total!: number; currency!: number; }
export const toDto = (payment: Payment) => plainToInstance(PaymentDto, payment);
