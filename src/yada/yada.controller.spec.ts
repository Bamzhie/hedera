import { Test, TestingModule } from '@nestjs/testing';
import { YadaController } from './yada.controller';

describe('YadaController', () => {
  let controller: YadaController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [YadaController],
    }).compile();

    controller = module.get<YadaController>(YadaController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
