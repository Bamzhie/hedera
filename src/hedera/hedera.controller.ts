import { Controller, Post, Res, HttpStatus, Get, Param } from '@nestjs/common';
import { Response } from 'express';
import { HederaService } from './hedera.service';

@Controller('hedera')
export class HederaController {
  constructor(private readonly hederaService: HederaService) {}

  @Post('create-account')
  async createAccount() {
    console.log('Received request to create account');

    const accountDetails = await this.hederaService.createAccount();
    return {
      message: 'Account created successfully',
      accountDetails,
    };
  }

  @Post('transfer')
  async transferHbar() {
    const result = await this.hederaService.transferHbar();
    return {
      success: true,
      message: 'Transfer successful',
      result,
    };
  }

  @Get('balance/:account_id')
  async checkBalance(@Param('account_id') accountId: string) {
    const result = await this.hederaService.queryBalance(accountId);
    return {
      success: true,
      message: 'Account balance retrieved successfully',
      data: result,
    };
  }

  @Get('create-token')
  async createToken() {
    return this.hederaService.createToken();
  }

  @Get('details')
  async getDetails() {
    const details = await this.hederaService.deriveAccountDetails();
    return {
      success: true,
      message: 'Account details retrieved successfully',
      data: details,
    };
  }
}
