import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Put,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';

import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';

import { RekomtekService } from './rekomtek.service';
import { RekomtekWorkflowService } from './rekomtek-workflow.service';
import { RejectionLetterApprovalService } from './rejection-letter-approval.service';
import { rekomtekFileContentDisposition } from './rekomtek-file-delivery';

import { CreateRekomtekDto } from './dto/create-rekomtek.dto';
import { UpdateRekomtekDto } from './dto/update-rekomtek.dto';
import { QueryRekomtekDto } from './dto/query-rekomtek.dto';
import { GeographicReferenceQueryDto } from './dto/geographic-reference-query.dto';
import {
  ApproveRejectionLetterDto,
  SaveRejectionLetterSettingsDto,
} from './dto/rejection-letter.dto';
import {
  AssignRekomtekTeamDto,
  CancelExposeDto,
  CompleteExposeDto,
  CompleteFieldVisitDto,
  CompletePostExposeCorrectionDto,
  CreateArtifactDto,
  CreateCouncilSessionDto,
  EvaluateInitialDto,
  EvaluateInitialRecheckDto,
  ExposeVerificationDto,
  IssueFieldVisitDto,
  IssueRejectionLetterDto,
  OfficialReviewDto,
  ResolveWorkflowMigrationDto,
  RescheduleExposeDto,
  ScheduleExposeDto,
  SubmitCorrectionDto,
  SuperiorApprovalDto,
  VerifyPostExposeCorrectionDto,
  WorkflowQueryDto,
} from './dto/workflow.dto';

@ApiTags('Rekomtek')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('rekomtek')
export class RekomtekController {
  constructor(
    private readonly rekomtekService: RekomtekService,
    private readonly workflowService: RekomtekWorkflowService,
    private readonly rejectionLetterApprovalService: RejectionLetterApprovalService,
  ) {}

  @Get('workflow/queue')
  @Permissions('rekomtek.workflow.read')
  @ApiOperation({ summary: 'Antrean workflow Rekomtek sesuai scope aktor' })
  workflowQueue(
    @Query() query: WorkflowQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.findQueue(query, user);
  }

  @Get('workflow/team-members')
  @Permissions('rekomtek.assign')
  @ApiOperation({
    summary: 'Daftar akun aktif yang dapat ditunjuk sebagai Pokja',
  })
  workflowTeamMembers(@CurrentUser() user: AuthenticatedUser) {
    return this.workflowService.getAssignableTeamMembers(user);
  }

  @Get('workflow/expose/occupied-slots')
  @Permissions('rekomtek.expose')
  @ApiOperation({
    summary: 'Daftar slot mulai Ekspose yang sedang digunakan',
  })
  workflowOccupiedExposeSlots(@CurrentUser() user: AuthenticatedUser) {
    return this.workflowService.getOccupiedExposeSlots(user);
  }

  @Get('notifications')
  @Permissions('rekomtek.read')
  @ApiOperation({ summary: 'Notifikasi workflow Rekomtek milik akun' })
  notifications(
    @Query('unread') unread: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.getNotifications(user, unread === 'true');
  }

  @Patch('notifications/:notificationId/read')
  @Permissions('rekomtek.read')
  @ApiOperation({ summary: 'Tandai notifikasi workflow sebagai dibaca' })
  markNotificationRead(
    @Param('notificationId') notificationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.markNotificationRead(notificationId, user);
  }

  @Get(':id/workflow')
  @Permissions('rekomtek.read')
  @ApiOperation({
    summary: 'Detail tahap, penugasan, artefak, dan audit workflow',
  })
  workflowDetail(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.getWorkflow(id, user);
  }

  @Patch(':id/workflow/migration')
  @Permissions('rekomtek.workflow.migrate')
  @ApiOperation({ summary: 'Petakan record Rekomtek legacy yang ambigu' })
  resolveWorkflowMigration(
    @Param('id') id: string,
    @Body() dto: ResolveWorkflowMigrationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.resolveWorkflowMigration(id, dto, user);
  }

  @Patch(':id/workflow/submit')
  @Permissions('rekomtek.submit')
  @ApiOperation({ summary: 'Ajukan Permohonan Rekomtek ke penunjukan Pokja' })
  submitWorkflow(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.submitApplication(id, user);
  }

  @Post(':id/workflow/team')
  @Permissions('rekomtek.assign')
  @ApiOperation({ summary: 'Tunjuk koordinator dan anggota Pokja Rekomtek' })
  assignTeam(
    @Param('id') id: string,
    @Body() dto: AssignRekomtekTeamDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.assignTeam(id, dto, user);
  }

  @Post(':id/workflow/evaluate-initial')
  @Permissions('rekomtek.evaluate')
  @ApiOperation({
    summary: 'Evaluasi Dokumen Awal dan satu kali Perbaikan Awal',
  })
  evaluateInitial(
    @Param('id') id: string,
    @Body() dto: EvaluateInitialDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.evaluateInitial(id, dto, user);
  }

  @Post(':id/workflow/submit-initial-correction')
  @Permissions('rekomtek.correct.initial')
  @ApiOperation({ summary: 'Pemohon mengirim Perbaikan Dokumen Awal' })
  submitInitialCorrection(
    @Param('id') id: string,
    @Body() dto: SubmitCorrectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.submitInitialCorrection(id, dto, user);
  }

  @Post(':id/workflow/evaluate-initial-recheck')
  @Permissions('rekomtek.evaluate')
  @ApiOperation({ summary: 'Evaluasi ulang setelah Perbaikan Awal' })
  evaluateInitialRecheck(
    @Param('id') id: string,
    @Body() dto: EvaluateInitialRecheckDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.evaluateInitialRecheck(id, dto, user);
  }

  @Get(':id/workflow/rejection/context')
  @Permissions('rekomtek.reject', 'rekomtek.artifact')
  @ApiOperation({
    summary: 'Data pemohon dan hasil evaluasi untuk Surat Penolakan',
  })
  rejectionLetterContext(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.getRejectionLetterContext(id, user);
  }

  @Get(':id/workflow/rejection/prepared-preview')
  @ApiOperation({
    summary: 'Unduh draf surat penolakan milik pemohon setelah disiapkan',
  })
  async getApplicantRejectionLetterDraft(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const draft =
      await this.rejectionLetterApprovalService.getApplicantPreparedPreview(
        id,
        user,
      );
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${draft.fileName}"`,
    );
    response.setHeader('Content-Length', draft.buffer.length);
    return response.status(200).send(draft.buffer);
  }

  @Post(':id/workflow/rejection/preview')
  @Permissions('rekomtek.reject', 'rekomtek.artifact')
  @ApiOperation({
    summary:
      'Endpoint preview manual lama dinonaktifkan; gunakan antrean persetujuan',
  })
  previewRejectionLetter(
    @Param('id') id: string,
    @Body() dto: IssueRejectionLetterDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.previewRejectionLetter(id, dto, user);
  }

  @Post(':id/workflow/rejection/generate-and-issue')
  @Permissions('rekomtek.reject', 'rekomtek.artifact')
  @ApiOperation({
    summary: 'Endpoint penerbitan langsung dinonaktifkan sampai TTE ditetapkan',
  })
  generateAndIssueRejection(
    @Param('id') id: string,
    @Body() dto: IssueRejectionLetterDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.generateAndIssueRejection(id, dto, user);
  }

  @Get('rejection-letter/settings')
  @Permissions('rekomtek.rejection-letter.manage')
  @ApiOperation({ summary: 'Pengaturan templat dan penomoran surat penolakan' })
  getRejectionLetterSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.rejectionLetterApprovalService.getSettings(user);
  }

  @Get('rejection-letter/eligible-heads')
  @Permissions('rekomtek.rejection-letter.manage')
  @ApiOperation({ summary: 'Kepala Bidang aktif yang berhak menyetujui surat' })
  eligibleRejectionLetterHeads(@CurrentUser() user: AuthenticatedUser) {
    return this.rejectionLetterApprovalService.listEligibleHeads(user);
  }

  @Put('rejection-letter/settings')
  @Permissions('rekomtek.rejection-letter.manage')
  @ApiOperation({
    summary: 'Simpan pengaturan dan versi templat surat penolakan',
  })
  saveRejectionLetterSettings(
    @Body() dto: SaveRejectionLetterSettingsDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rejectionLetterApprovalService.saveSettings(dto, user);
  }

  @Get('workflow/rejection-letters/queue')
  @Permissions('rekomtek.approve.final')
  @ApiOperation({
    summary: 'Antrean persetujuan surat penolakan Kepala Bidang',
  })
  rejectionLetterApprovalQueue(@CurrentUser() user: AuthenticatedUser) {
    return this.rejectionLetterApprovalService.listApprovalQueue(user);
  }

  @Get('workflow/rejection-letters/:jobId/preview')
  @Permissions('rekomtek.approve.final')
  @ApiOperation({ summary: 'Pratinjau surat sebelum alokasi nomor' })
  rejectionLetterApprovalPreview(
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rejectionLetterApprovalService.getApprovalPreview(jobId, user);
  }

  @Post('workflow/rejection-letters/:jobId/approve')
  @Permissions('rekomtek.approve.final')
  @ApiOperation({
    summary: 'Setujui dan terbitkan surat penolakan resmi dengan QR verifikasi',
  })
  approveRejectionLetter(
    @Param('jobId') jobId: string,
    @Body() dto: ApproveRejectionLetterDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rejectionLetterApprovalService.approveAndPreparePreview(
      jobId,
      dto,
      user,
    );
  }

  @Post('workflow/rejection-letters/:jobId/test-qr-publish')
  @Permissions('rekomtek.approve.final')
  @ApiOperation({
    summary: 'Terbitkan QR uji lokal untuk job backfill yang ditandai uji',
  })
  publishLocalQrTestJob(
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rejectionLetterApprovalService.publishLocalQrTestJob(
      jobId,
      user,
    );
  }

  @Get('workflow/rejection-letters/:jobId/prepared-preview')
  @Permissions('rekomtek.approve.final')
  @ApiOperation({
    summary: 'Unduh pratinjau internal yang belum ditandatangani',
  })
  async getPreparedRejectionLetterPreview(
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() response: Response,
  ) {
    const preview =
      await this.rejectionLetterApprovalService.getPreparedPreview(jobId, user);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${preview.fileName}"`,
    );
    response.setHeader('Content-Length', preview.buffer.length);
    return response.status(200).send(preview.buffer);
  }

  @Post(':id/workflow/artifacts')
  @Permissions('rekomtek.artifact')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'type'],
      properties: {
        file: { type: 'string', format: 'binary' },
        type: { type: 'string' },
        sourceArtifactId: { type: 'string' },
        metadata: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  uploadWorkflowArtifact(
    @Param('id') id: string,
    @Body() dto: CreateArtifactDto,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.uploadArtifact(id, dto, file, user);
  }

  @Post(':id/workflow/artifacts/:artifactId/finalize')
  @Permissions('rekomtek.artifact')
  @ApiOperation({ summary: 'Finalisasi artefak workflow secara immutable' })
  finalizeWorkflowArtifact(
    @Param('id') id: string,
    @Param('artifactId') artifactId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.finalizeArtifact(id, artifactId, user);
  }

  @Get(':id/workflow/artifacts/:artifactId/file')
  @Permissions('rekomtek.read')
  @ApiOperation({ summary: 'Unduh Artefak Proses final dengan otorisasi' })
  async getWorkflowArtifactFile(
    @Param('id') id: string,
    @Param('artifactId') artifactId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Headers('x-sipengsui-download-mode') downloadMode: string | undefined,
    @Res() response: Response,
  ) {
    const file = await this.workflowService.getArtifactFile(
      id,
      artifactId,
      user,
    );
    response.setHeader('Content-Type', file.mimeType);
    response.setHeader('Content-Length', file.size);
    response.setHeader(
      'Content-Disposition',
      rekomtekFileContentDisposition(file.fileName, downloadMode),
    );
    response.setHeader('X-Content-Type-Options', 'nosniff');
    (file.stream as { pipe: (target: Response) => void }).pipe(response);
  }

  @Post(':id/workflow/expose/schedule')
  @Permissions('rekomtek.expose')
  @ApiOperation({ summary: 'Pejabat membuat jadwal dan undangan Ekspose' })
  scheduleExpose(
    @Param('id') id: string,
    @Body() dto: ScheduleExposeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.scheduleExpose(id, dto, user);
  }

  @Post(':id/workflow/expose/:scheduleId/reschedule')
  @Permissions('rekomtek.expose')
  @ApiOperation({ summary: 'Ubah jadwal Ekspose dan beri tahu peserta' })
  rescheduleExpose(
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
    @Body() dto: RescheduleExposeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.rescheduleExpose(id, scheduleId, dto, user);
  }

  @Post(':id/workflow/expose/:scheduleId/cancel')
  @Permissions('rekomtek.expose')
  @ApiOperation({ summary: 'Batalkan jadwal Ekspose dan beri tahu peserta' })
  cancelExpose(
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
    @Body() dto: CancelExposeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.cancelExpose(id, scheduleId, dto, user);
  }

  @Post(':id/workflow/expose/:scheduleId/complete')
  @Permissions('rekomtek.expose')
  @ApiOperation({ summary: 'Tandai pelaksanaan Ekspose selesai' })
  completeExpose(
    @Param('id') id: string,
    @Param('scheduleId') scheduleId: string,
    @Body() dto: CompleteExposeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.completeExpose(id, scheduleId, dto, user);
  }

  @Post(':id/workflow/expose/verify')
  @Permissions('rekomtek.expose')
  @ApiOperation({
    summary: 'Verifikasi hasil Ekspose atau catat kekurangan pasca-Ekspose',
  })
  verifyExpose(
    @Param('id') id: string,
    @Body() dto: ExposeVerificationDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.verifyExpose(id, dto, user);
  }

  @Post(':id/workflow/expose/ready')
  @Permissions('rekomtek.expose')
  @ApiOperation({ summary: 'Ajukan Berita Acara Ekspose ke tahap verifikasi' })
  openExposeVerification(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.openExposeVerification(id, user);
  }

  @Post(':id/workflow/post-expose-correction')
  @Permissions('rekomtek.correct.post-expose')
  @ApiOperation({ summary: 'Pemohon mengirim Pelengkapan Pasca-Ekspose' })
  submitPostExposeCorrection(
    @Param('id') id: string,
    @Body() dto: CompletePostExposeCorrectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.submitPostExposeCorrection(id, dto, user);
  }

  @Post(':id/workflow/post-expose/verify')
  @Permissions('rekomtek.evaluate')
  @ApiOperation({ summary: 'Verifikasi Pelengkapan Pasca-Ekspose' })
  verifyPostExposeCorrection(
    @Param('id') id: string,
    @Body() dto: VerifyPostExposeCorrectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.verifyPostExposeCorrection(id, dto, user);
  }

  @Post(':id/workflow/field-visit/issue')
  @Permissions('rekomtek.field')
  @ApiOperation({ summary: 'Terbitkan SPT Lapangan dan tugaskan petugas' })
  issueFieldVisit(
    @Param('id') id: string,
    @Body() dto: IssueFieldVisitDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.issueFieldVisit(id, dto, user);
  }

  @Post(':id/workflow/field-visit/:visitId/complete')
  @Permissions('rekomtek.field')
  @ApiOperation({ summary: 'Catat realisasi Kunjungan Lapangan' })
  completeFieldVisit(
    @Param('id') id: string,
    @Param('visitId') visitId: string,
    @Body() dto: CompleteFieldVisitDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.completeFieldVisit(id, visitId, dto, user);
  }

  @Post(':id/workflow/field-visit/verify')
  @Permissions('rekomtek.field')
  @ApiOperation({ summary: 'Verifikasi Berita Acara Lapangan' })
  verifyFieldArtifact(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.verifyFieldArtifact(id, user);
  }

  @Post(':id/workflow/council')
  @Permissions('rekomtek.council')
  @ApiOperation({ summary: 'Catat pelaksanaan Sidang Rekomtek' })
  createCouncilSession(
    @Param('id') id: string,
    @Body() dto: CreateCouncilSessionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.createCouncilSession(id, dto, user);
  }

  @Post(':id/workflow/prepare-result')
  @Permissions('rekomtek.draft')
  @ApiOperation({
    summary: 'Ajukan hasil dan draft Rekomtek ke pemeriksaan pejabat',
  })
  prepareResult(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.prepareResult(id, user);
  }

  @Post(':id/workflow/prepare-result/open')
  @Permissions('rekomtek.draft')
  @ApiOperation({
    summary: 'Buka tahap penyusunan hasil setelah BA Sidang tersedia',
  })
  openResultPreparation(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.openResultPreparation(id, user);
  }

  @Post(':id/workflow/official-review')
  @Permissions('rekomtek.inspect')
  @ApiOperation({ summary: 'Pemeriksaan Pejabat Rekomtek' })
  officialReview(
    @Param('id') id: string,
    @Body() dto: OfficialReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.officialReview(id, dto, user);
  }

  @Post(':id/workflow/superior-approval')
  @Permissions('rekomtek.approve.final')
  @ApiOperation({ summary: 'Persetujuan Atasan Pejabat' })
  superiorApproval(
    @Param('id') id: string,
    @Body() dto: SuperiorApprovalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.superiorApproval(id, dto, user);
  }

  @Post(':id/workflow/publish-final')
  @Permissions('rekomtek.publish.final')
  @ApiOperation({ summary: 'Terbitkan Dokumen Rekomtek final' })
  publishFinal(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.workflowService.publishFinal(id, user);
  }

  @Post()
  @Permissions('rekomtek.create')
  @ApiOperation({ summary: 'Buat rekomtek baru (status: DRAFT)' })
  create(
    @Body() dto: CreateRekomtekDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rekomtekService.create(dto, user);
  }

  @Get()
  @Permissions('rekomtek.read')
  @ApiOperation({ summary: 'Daftar rekomtek (paginated, filterable)' })
  findAll(
    @Query() query: QueryRekomtekDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rekomtekService.findAll(query, user);
  }

  @Get('geographic-reference')
  @Permissions('rekomtek.create')
  @ApiOperation({ summary: 'Cocokkan titik dengan referensi geografis' })
  resolveGeographicReference(
    @Query() query: GeographicReferenceQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rekomtekService.resolveGeographicReference(query, user);
  }

  @Get(':id')
  @Permissions('rekomtek.read')
  @ApiOperation({ summary: 'Detail rekomtek' })
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.rekomtekService.findOne(id, user);
  }

  @Patch(':id')
  @Permissions('rekomtek.update')
  @ApiOperation({ summary: 'Update rekomtek' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRekomtekDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.rekomtekService.update(id, dto, user);
  }

  @Delete(':id')
  @Permissions('rekomtek.delete')
  @ApiOperation({ summary: 'Hapus rekomtek' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.rekomtekService.remove(id, user);
  }

  @Patch(':id/submit')
  @Permissions('rekomtek.submit')
  @ApiOperation({ summary: 'Ajukan rekomtek untuk review (DRAFT → REVIEW)' })
  submit(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.workflowService.submitApplication(id, user);
  }

  @Post(':id/reapply')
  @Permissions('rekomtek.submit')
  @ApiOperation({ summary: 'Buat revision baru dari rekomtek REJECTED' })
  reapply(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.rekomtekService.reapply(id, user);
  }

  @Patch(':id/approve')
  @Permissions('rekomtek.approve')
  @ApiOperation({ summary: 'Setujui rekomtek (REVIEW → APPROVED)' })
  approve(
    @Param('id') id: string,
    @Body('reviewedBy') reviewedBy: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    void reviewedBy;
    return this.workflowService.legacyApprove(id, user);
  }

  @Patch(':id/reject')
  @Permissions('rekomtek.approve')
  @ApiOperation({ summary: 'Tolak rekomtek (REVIEW → REJECTED)' })
  reject(
    @Param('id') id: string,
    @Body('reviewedBy') reviewedBy: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    void reviewedBy;
    return this.workflowService.legacyReject(id, user);
  }

  @Patch(':id/publish')
  @Permissions('rekomtek.publish')
  @ApiOperation({ summary: 'Publikasikan rekomtek (APPROVED → PUBLISHED)' })
  publish(
    @Param('id') id: string,
    @Body('approvedBy') approvedBy: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    void approvedBy;
    return this.workflowService.legacyPublish(id, user);
  }
}
