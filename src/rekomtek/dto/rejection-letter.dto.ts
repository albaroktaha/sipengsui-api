import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  REJECTION_LETTER_LAYOUT_BLOCKS,
  RejectionLetterAlignedBlockId,
  RejectionLetterLayoutBlockId,
  RejectionLetterTextAlignment,
} from '../rejection-letter-layout';

const REKOMTEK_TYPES = ['APU', 'PLTA', 'PLTM', 'PLTA_PLTM', 'GALIAN_C'];
const JENIS_PERMOHONAN = ['IZIN_BARU', 'PERPANJANGAN', 'PERSETUJUAN_TEKNIS'];

export class RejectionLetterLayoutConfigDto {
  @ApiProperty({ enum: ['A4', 'F4'] })
  @IsIn(['A4', 'F4'])
  pageSize!: 'A4' | 'F4';

  @ApiProperty({ minimum: 10, maximum: 40 })
  @Type(() => Number)
  @IsNumber()
  @Min(10)
  @Max(40)
  marginTopMm!: number;

  @ApiProperty({ minimum: 10, maximum: 40 })
  @Type(() => Number)
  @IsNumber()
  @Min(10)
  @Max(40)
  marginRightMm!: number;

  @ApiProperty({ minimum: 10, maximum: 40 })
  @Type(() => Number)
  @IsNumber()
  @Min(10)
  @Max(40)
  marginBottomMm!: number;

  @ApiProperty({ minimum: 10, maximum: 40 })
  @Type(() => Number)
  @IsNumber()
  @Min(10)
  @Max(40)
  marginLeftMm!: number;

  @ApiProperty({ minimum: 8, maximum: 14 })
  @Type(() => Number)
  @IsNumber()
  @Min(8)
  @Max(14)
  bodyFontSizePt!: number;

  @ApiProperty({ minimum: 0, maximum: 8 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(8)
  bodyLineGapPt!: number;

  @ApiProperty({ minimum: 0, maximum: 24 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(24)
  paragraphSpacingPt!: number;

  @ApiProperty({ enum: ['LEFT', 'CENTER', 'RIGHT'] })
  @IsIn(['LEFT', 'CENTER', 'RIGHT'])
  headerAlignment!: 'LEFT' | 'CENTER' | 'RIGHT';

  @ApiProperty({ enum: ['LEFT', 'RIGHT'] })
  @IsIn(['LEFT', 'RIGHT'])
  logoPosition!: 'LEFT' | 'RIGHT';

  @ApiPropertyOptional({ enum: REJECTION_LETTER_LAYOUT_BLOCKS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(REJECTION_LETTER_LAYOUT_BLOCKS.length)
  @ArrayMaxSize(REJECTION_LETTER_LAYOUT_BLOCKS.length)
  @ArrayUnique()
  @IsIn([...REJECTION_LETTER_LAYOUT_BLOCKS], { each: true })
  blockOrder?: RejectionLetterLayoutBlockId[];

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  blockAlignments?: Partial<
    Record<RejectionLetterAlignedBlockId, RejectionLetterTextAlignment>
  >;
}

export class RejectionLetterTemplateDto {
  @ApiProperty({ enum: REKOMTEK_TYPES })
  @IsIn(REKOMTEK_TYPES)
  rekomtekType!: string;

  @ApiProperty({ enum: JENIS_PERMOHONAN })
  @IsIn(JENIS_PERMOHONAN)
  jenisPermohonan!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  subjectTemplate!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(12000)
  bodyTemplate!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  closingTemplate!: string;

  @ApiPropertyOptional({ type: RejectionLetterLayoutConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => RejectionLetterLayoutConfigDto)
  layoutConfig?: RejectionLetterLayoutConfigDto;
}

export class SaveRejectionLetterSettingsDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  institutionName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  institutionAddress!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  issueCity!: string;

  @ApiPropertyOptional({
    description: 'Data URL logo resmi PNG/JPEG, opsional',
  })
  @IsOptional()
  @IsString()
  @MaxLength(700000)
  logoDataUrl?: string | null;

  @ApiProperty({ description: 'Origin HTTPS resmi, tanpa path' })
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  verificationDomain!: string;

  @ApiProperty({
    example: '{{sequence}}/{{classification}}/{{scope}}/{{year}}',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  outgoingNumberFormat!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  classificationCode!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  agendaSource!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  agendaScope!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000000000)
  initialLastNumber!: number;

  @ApiProperty({ enum: ['TAHUNAN', 'TIDAK_PERNAH'] })
  @IsIn(['TAHUNAN', 'TIDAK_PERNAH'])
  numberResetRule!: 'TAHUNAN' | 'TIDAK_PERNAH';

  @ApiProperty()
  @IsUUID('all')
  activeHeadUserId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  activeHeadName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  activeHeadPosition!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  activeHeadNip?: string | null;

  @ApiProperty()
  @IsDateString({ strict: true })
  authorityStartsAt!: string;

  @ApiProperty()
  @IsDateString({ strict: true })
  authorityEndsAt!: string;

  @ApiPropertyOptional({
    description: 'Metadata identitas sertifikat (bukan TTE)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  certificateIdentity?: string | null;

  @ApiProperty({ type: [RejectionLetterTemplateDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RejectionLetterTemplateDto)
  templates!: RejectionLetterTemplateDto[];
}

export class ApproveRejectionLetterDto {
  @ApiProperty({ description: 'updatedAt antrean yang telah dilihat' })
  @IsDateString({ strict: true })
  expectedUpdatedAt!: string;
}
