import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  RekomtekArtifactType,
  RekomtekExposeMethod,
  RekomtekWorkflowStage,
} from '@prisma/client';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AssignRekomtekTeamDto {
  @ApiProperty({ description: 'ID koordinator Pokja Rekomtek' })
  @IsUUID()
  coordinatorId!: string;

  @ApiProperty({
    description:
      'ID seluruh anggota aktif; koordinator boleh dicantumkan atau tidak',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  memberIds!: string[];

  @ApiProperty({ description: 'Tujuan penugasan Pokja' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  purpose!: string;

  @ApiPropertyOptional({ description: 'Awal masa aktif penugasan' })
  @IsOptional()
  @IsDateString()
  startsAt?: string;
}

export class ReviewFindingInputDto {
  @ApiProperty({ description: 'ID Berkas Persyaratan yang bermasalah' })
  @IsUUID()
  berkasId!: string;

  @ApiProperty({ description: 'Temuan yang dapat ditindaklanjuti' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  note!: string;
}

export class EvaluateInitialDto {
  @ApiProperty({ enum: ['MEMENUHI', 'DIKEMBALIKAN'] })
  @IsIn(['MEMENUHI', 'DIKEMBALIKAN'])
  decision!: 'MEMENUHI' | 'DIKEMBALIKAN';

  @ApiPropertyOptional({ type: [ReviewFindingInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewFindingInputDto)
  findings?: ReviewFindingInputDto[];

  @ApiPropertyOptional({ description: 'Ringkasan evaluasi' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;
}

export class CorrectionResponseDto {
  @ApiProperty({ description: 'ID temuan koreksi' })
  @IsUUID()
  findingId!: string;

  @ApiProperty({ description: 'Jawaban atau penjelasan perbaikan pemohon' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  response!: string;
}

export class SubmitCorrectionDto {
  @ApiProperty({ type: [CorrectionResponseDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CorrectionResponseDto)
  responses!: CorrectionResponseDto[];
}

export class EvaluateInitialRecheckDto {
  @ApiProperty({ enum: ['MEMENUHI', 'TIDAK_MEMENUHI'] })
  @IsIn(['MEMENUHI', 'TIDAK_MEMENUHI'])
  decision!: 'MEMENUHI' | 'TIDAK_MEMENUHI';

  @ApiPropertyOptional({ type: [ReviewFindingInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewFindingInputDto)
  findings?: ReviewFindingInputDto[];

  @ApiPropertyOptional({ description: 'Ringkasan evaluasi ulang' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;
}

export class ExternalExposeParticipantDto {
  @ApiProperty({ description: 'Nama peserta dari instansi/OPD eksternal' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ description: 'Nama instansi atau OPD peserta' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  organization!: string;

  @ApiPropertyOptional({ description: 'Jabatan peserta (opsional)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  position?: string;

  @ApiPropertyOptional({ description: 'Email peserta (opsional)' })
  @IsOptional()
  @IsEmail()
  @MaxLength(320)
  email?: string;

  @ApiPropertyOptional({
    description:
      'Nomor WhatsApp peserta; akan dinormalisasi ke format E.164 dan hanya digunakan setelah verifikasi serta persetujuan dari nomor tersebut',
    example: '+6281234567890',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  whatsappNumber?: string;
}

export class ScheduleExposeDto {
  @ApiProperty({ description: 'Waktu mulai dalam zona waktu aplikasi' })
  @IsDateString()
  startsAt!: string;

  @ApiProperty({ description: 'Waktu selesai; harus setelah mulai' })
  @IsDateString()
  endsAt!: string;

  @ApiProperty({ enum: RekomtekExposeMethod })
  @IsEnum(RekomtekExposeMethod)
  method!: RekomtekExposeMethod;

  @ApiPropertyOptional({ description: 'Tempat untuk LURING/HIBRID' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  venue?: string;

  @ApiPropertyOptional({ description: 'Tautan rapat untuk DARING/HIBRID' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  meetingUrl?: string;

  @ApiProperty({ description: 'Agenda Ekspose' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  agenda!: string;

  @ApiProperty({
    description: 'ID peserta/undangan, minimal Pemohon, Pejabat, Pokja',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(3)
  @IsUUID('4', { each: true })
  participantIds!: string[];

  @ApiPropertyOptional({
    description: 'Peserta manual dari instansi/OPD di luar akun SIPENGSUI',
    type: [ExternalExposeParticipantDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExternalExposeParticipantDto)
  externalParticipants?: ExternalExposeParticipantDto[];

  @ApiProperty({ description: 'Penanggung jawab jadwal' })
  @IsUUID()
  responsibleUserId!: string;

  @ApiProperty({ description: 'Nomor undangan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  invitationNumber!: string;

  @ApiProperty({ description: 'ID artefak UNDANGAN_EKSPOSE final' })
  @IsUUID()
  invitationArtifactId!: string;
}

export class CompleteExposeDto {
  @ApiProperty({ description: 'Waktu mulai realisasi Ekspose' })
  @IsDateString()
  actualStartsAt!: string;

  @ApiProperty({ description: 'Waktu selesai realisasi Ekspose' })
  @IsDateString()
  actualEndsAt!: string;

  @ApiPropertyOptional({ description: 'Catatan pelaksanaan' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ExposeVerificationDto {
  @ApiProperty({ enum: ['LENGKAP', 'KURANG'] })
  @IsIn(['LENGKAP', 'KURANG'])
  decision!: 'LENGKAP' | 'KURANG';

  @ApiPropertyOptional({ type: [ReviewFindingInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReviewFindingInputDto)
  findings?: ReviewFindingInputDto[];

  @ApiPropertyOptional({ description: 'Ringkasan verifikasi hasil Ekspose' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;
}

export class CompletePostExposeCorrectionDto {
  @ApiProperty({ type: [CorrectionResponseDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CorrectionResponseDto)
  responses!: CorrectionResponseDto[];
}

export class VerifyPostExposeCorrectionDto {
  @ApiProperty({ enum: ['LENGKAP', 'LANJUT_PERBAIKAN'] })
  @IsIn(['LENGKAP', 'LANJUT_PERBAIKAN'])
  decision!: 'LENGKAP' | 'LANJUT_PERBAIKAN';

  @ApiPropertyOptional({
    description: 'Alasan permintaan pelengkapan lanjutan',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;
}

export class CreateArtifactDto {
  @ApiProperty({ enum: RekomtekArtifactType })
  @IsEnum(RekomtekArtifactType)
  type!: RekomtekArtifactType;

  @ApiPropertyOptional({
    description: 'ID draft yang menjadi sumber Dokumen Rekomtek final',
  })
  @IsOptional()
  @IsUUID()
  sourceArtifactId?: string;

  @ApiPropertyOptional({
    description: 'Metadata aman artefak dalam JSON string multipart',
  })
  @IsOptional()
  @IsString()
  metadata?: string;
}

export class IssueFieldVisitDto {
  @ApiProperty({ description: 'Nomor SPT Lapangan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  sptNumber!: string;

  @ApiProperty({ description: 'Tanggal penerbitan SPT' })
  @IsDateString()
  issuedAt!: string;

  @ApiProperty({ description: 'Petugas yang ditugaskan' })
  @IsUUID()
  petugasId!: string;

  @ApiProperty({ description: 'Lokasi kunjungan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  location!: string;

  @ApiProperty({ description: 'Waktu mulai kunjungan' })
  @IsDateString()
  scheduledStartsAt!: string;

  @ApiProperty({ description: 'Waktu selesai kunjungan' })
  @IsDateString()
  scheduledEndsAt!: string;

  @ApiProperty({ description: 'Ruang lingkup kunjungan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  scope!: string;

  @ApiProperty({ description: 'ID artefak SPT_LAPANGAN final' })
  @IsUUID()
  artifactId!: string;
}

export class CompleteFieldVisitDto {
  @ApiProperty({ description: 'Waktu realisasi kunjungan' })
  @IsDateString()
  realizedAt!: string;

  @ApiProperty({ description: 'Catatan realisasi kunjungan' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  realizationNotes!: string;
}

export class CreateCouncilSessionDto {
  @ApiProperty({ description: 'Waktu sidang' })
  @IsDateString()
  scheduledAt!: string;

  @ApiProperty({ description: 'Waktu sidang selesai' })
  @IsDateString()
  completedAt!: string;

  @ApiProperty({ description: 'Daftar peserta sidang', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  participantIds!: string[];

  @ApiProperty({ description: 'Keputusan Sidang Rekomtek' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  decision!: string;

  @ApiPropertyOptional({ description: 'Catatan sidang' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class OfficialReviewDto {
  @ApiProperty({ enum: ['KEMBALIKAN', 'TERUSKAN'] })
  @IsIn(['KEMBALIKAN', 'TERUSKAN'])
  decision!: 'KEMBALIKAN' | 'TERUSKAN';

  @ApiPropertyOptional({ description: 'Wajib ketika mengembalikan' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class SuperiorApprovalDto {
  @ApiProperty({ enum: ['KEMBALIKAN', 'SETUJUI'] })
  @IsIn(['KEMBALIKAN', 'SETUJUI'])
  decision!: 'KEMBALIKAN' | 'SETUJUI';

  @ApiPropertyOptional({ description: 'Wajib ketika mengembalikan' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class WorkflowQueryDto {
  @ApiPropertyOptional({ description: 'Tahap workflow' })
  @IsOptional()
  @IsString()
  stage?: string;

  @ApiPropertyOptional({ description: 'ID petugas/aktor yang ditugaskan' })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;

  @ApiPropertyOptional({ description: 'Kata kunci nomor atau judul' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class ResolveWorkflowMigrationDto {
  @ApiProperty({ enum: RekomtekWorkflowStage })
  @IsEnum(RekomtekWorkflowStage)
  workflowStage!: RekomtekWorkflowStage;

  @ApiProperty({ description: 'Alasan dan bukti pemetaan record legacy' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  note!: string;
}
