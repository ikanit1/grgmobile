/**
 * HTTP client for go2rtc media server REST API.
 * Registers Uniview RTSP streams on demand, returns HLS URLs for WAN access.
 * Docs: https://github.com/AlexxIT/go2rtc/tree/master/api
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class Go2rtcClient {
  private readonly logger = new Logger(Go2rtcClient.name);
  private readonly internalUrl: string | null;
  private readonly publicUrl: string | null;

  constructor(@Optional() private readonly http: HttpService) {
    this.internalUrl = process.env.GO2RTC_URL ?? null;
    this.publicUrl = process.env.GO2RTC_PUBLIC_URL ?? null;
  }

  get isConfigured(): boolean {
    return !!this.internalUrl && !!this.publicUrl;
  }

  /**
   * Ensure an RTSP stream is registered in go2rtc.
   * Idempotent — safe to call on every getLiveUrl request.
   * @param name  Stream name, e.g. "device_5_ch1_main"
   * @param rtspUrl  Full RTSP URL including credentials, e.g. "rtsp://user:pass@192.168.1.100:554/..."
   */
  async ensureStream(name: string, rtspUrl: string): Promise<void> {
    if (!this.isConfigured || !this.http) return;
    try {
      // Use ffmpeg source to transcode audio (G.711/PCMU → AAC) for HLS compatibility.
      // Video is copied without re-encoding. Works even when camera has no audio.
      const src = `ffmpeg:${rtspUrl}#video=copy#audio=aac`;
      const params = `name=${encodeURIComponent(name)}&src=${encodeURIComponent(src)}`;
      await firstValueFrom(
        this.http.put(`${this.internalUrl}/api/streams?${params}`, null),
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`go2rtc ensureStream "${name}" failed: ${msg}`);
    }
  }

  /**
   * Remove a stream from go2rtc (call on device delete).
   */
  async deleteStream(name: string): Promise<void> {
    if (!this.isConfigured || !this.http) return;
    try {
      await firstValueFrom(
        this.http.delete(`${this.internalUrl}/api/streams?name=${encodeURIComponent(name)}`),
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`go2rtc deleteStream "${name}" failed: ${msg}`);
    }
  }

  /**
   * Return the public HLS playlist URL for a registered stream (for web/browser use).
   */
  getHlsUrl(name: string): string | null {
    if (!this.publicUrl) return null;
    return `${this.publicUrl}/api/stream.m3u8?src=${encodeURIComponent(name)}`;
  }

  /**
   * Return the public RTSP proxy URL for a registered stream.
   * go2rtc exposes an RTSP server on port 8554 that proxies the stream.
   * Mobile clients (mpv) use this — RTSP handles startup delay gracefully,
   * unlike HLS which returns empty m3u8 while FFmpeg is starting.
   */
  getRtspProxyUrl(name: string): string | null {
    if (!this.publicUrl) return null;
    try {
      const host = new URL(this.publicUrl).hostname;
      return `rtsp://${host}:8554/${name}`;
    } catch {
      return null;
    }
  }

  /**
   * Build a canonical stream name from device ID, channel, and stream type.
   */
  static streamName(deviceId: number, channel: number, streamType: string): string {
    return `device_${deviceId}_ch${channel}_${streamType}`;
  }
}
