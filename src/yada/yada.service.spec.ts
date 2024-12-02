import { Test, TestingModule } from '@nestjs/testing';
import { YadaService } from './yada.service';

describe('YadaService', () => {
  let service: YadaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [YadaService],
    }).compile();

    service = module.get<YadaService>(YadaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
