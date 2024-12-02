import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EnvironmentCheckService } from './checks.service';

@Module({
  imports: [ConfigModule],
  providers: [EnvironmentCheckService],
})
export class ChecksModule {}
