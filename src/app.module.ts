import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { YadaModule } from './yada/yada.module';
import { HederaModule } from './hedera/hedera.module';
import { PrismaModule } from './prisma/prisma.module';
import { ChecksModule } from './checks/checks.module';

@Module({
  imports: [YadaModule, HederaModule, PrismaModule, ChecksModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
