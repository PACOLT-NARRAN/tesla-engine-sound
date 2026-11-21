/**
 * FUTURE backend contracts for custom recordings (spec section H, levels 3 and 4; section AC).
 *
 * Types only — nothing in this build calls a server. They describe the boundary a later
 * implementation must fill, so the UI can be written against them without fake behaviour.
 * Payment, entitlement and upload authorisation must be verified by the backend; the
 * frontend never decides them (no fake frontend security).
 */

/** Step 1: the browser asks the backend for permission to upload one file. */
export interface UploadAuthorizationRequest {
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  /** Required for third-party publication later: "I created this recording or I have permission…". */
  ownershipConfirmed: boolean;
}

export interface UploadAuthorization {
  uploadId: string;
  /** Short-lived URL for protected object storage (e.g. a presigned PUT). */
  uploadUrl: string;
  expiresAt: string;
  maxBytes: number;
}

/** Server-side processing stages (worker pipeline: validate → transcode → analyse → build). */
export type JobStage = 'queued' | 'validating' | 'transcoding' | 'analysing' | 'segmenting' | 'building-profile';

export type ProcessingJobStatus =
  | { state: 'pending'; stage: JobStage; progress: number }
  | { state: 'succeeded'; profileId: string }
  | { state: 'failed'; reason: 'invalid-file' | 'too-long' | 'unsupported-codec' | 'internal'; retryable: boolean }
  | { state: 'deleted' };

export interface ProcessingJob {
  jobId: string;
  uploadId: string;
  createdAt: string;
  status: ProcessingJobStatus;
}

/** Results a worker could produce. RPM values are estimates and must be labelled as such. */
export interface ProcessedAssets {
  /** Browser-ready loops (e.g. Opus) with their measured loop points. */
  loops: { url: string; loopStartS: number; loopEndS: number; load: 'low' | 'high' }[];
  waveformUrl: string;
  loudnessLufs: number;
  estimatedRpmRange: { min: number; max: number; confidence: number } | null;
}

export interface RetentionPolicy {
  /** Days the original upload is kept after processing; 0 = deleted right away. */
  sourceRetentionDays: number;
  userCanDelete: true;
}

/** What a future backend client must implement. No implementation exists in this build. */
export interface RecordingBackend {
  authorizeUpload(req: UploadAuthorizationRequest): Promise<UploadAuthorization>;
  startJob(uploadId: string): Promise<ProcessingJob>;
  getJob(jobId: string): Promise<ProcessingJob>;
  retryJob(jobId: string): Promise<ProcessingJob>;
  /** Deletes the source file, processed assets and the job. */
  deleteRecording(uploadId: string): Promise<void>;
  retention(): Promise<RetentionPolicy>;
}

/** This build has no backend; the UI uses it to keep every message local. */
export const RECORDING_BACKEND: RecordingBackend | null = null;
