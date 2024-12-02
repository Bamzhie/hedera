import { Module } from '@nestjs/common';
import { YadaService } from './yada.service';
import { YadaController } from './yada.controller';

@Module({
  providers: [YadaService],
  controllers: [YadaController]
})
export class YadaModule {}
