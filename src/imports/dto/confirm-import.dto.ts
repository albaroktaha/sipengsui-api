import { ApiProperty } from '@nestjs/swagger';
import { ImportType } from '@prisma/client';
import { IsEnum, IsString, IsUUID } from 'class-validator';

export class ConfirmImportDto {
  @ApiProperty()
  @IsUUID()
  draftId!: string;

  @ApiProperty()
  @IsUUID()
  stationId!: string;

  @ApiProperty({
    enum: ImportType,
  })
  @IsEnum(ImportType)
  importType!: ImportType;

  @ApiProperty()
  @IsString()
  importedBy!: string;
}
