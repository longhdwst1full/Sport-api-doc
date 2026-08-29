import { ApiProperty } from '@nestjs/swagger';

export class SystemModuleDto {
  @ApiProperty() key: string;
  @ApiProperty() name: string;
  @ApiProperty({ enum: ['ACTIVE', 'SCAFFOLDED'] }) status: 'ACTIVE' | 'SCAFFOLDED';
  @ApiProperty({ type: [String] }) tables: string[];
  @ApiProperty() p0Count: number;
  @ApiProperty() p1Count: number;
}

export class SystemModuleListDto {
  @ApiProperty({ type: [SystemModuleDto] }) items: SystemModuleDto[];
  @ApiProperty({ example: 74 }) totalModels: number;
  @ApiProperty({ example: 43 }) p0Models: number;
  @ApiProperty({ example: 31 }) p1Models: number;
}
