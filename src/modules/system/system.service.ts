import { Injectable } from '@nestjs/common';
import { BUSINESS_MODEL_REGISTRY } from './model-registry.data';
import { SystemModuleListDto } from './system.dto';

@Injectable()
export class SystemService {
  listModules(): SystemModuleListDto {
    const models = BUSINESS_MODEL_REGISTRY.flatMap((module) => module.models);
    return {
      items: BUSINESS_MODEL_REGISTRY.map((module) => ({
        key: module.key,
        name: module.name,
        status: module.status,
        tables: module.models.map((item) => item.table),
        p0Count: module.models.filter((item) => item.priority === 'P0').length,
        p1Count: module.models.filter((item) => item.priority === 'P1').length,
      })),
      totalModels: models.length,
      p0Models: models.filter((item) => item.priority === 'P0').length,
      p1Models: models.filter((item) => item.priority === 'P1').length,
    };
  }
}
