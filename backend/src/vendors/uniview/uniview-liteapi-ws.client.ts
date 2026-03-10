/**
 * LiteAPI Over WebSocket client (doc: LiteAPI Over Websocket Document for IPC V5.05 / NVR V5.08).
 * Format: Request { RequestURL, Method, Cseq, Data }; Response { ResponseURL, ResponseCode, Cseq, Data }.
 */
import WebSocket from 'ws';

export interface LiteApiWsRequest {
  RequestURL: string;
  Method: string;
  Cseq: number;
  Data?: Record<string, unknown>;
}

export interface LiteApiWsResponse {
  ResponseURL?: string;
  ResponseCode?: number;
  ResponseString?: string;
  Cseq?: number;
  Data?: unknown;
}

export type LiteApiEventCallback = (payload: LiteApiWsResponse | Record<string, unknown>) => void;

export class UniviewLiteapiWsClient {
  private ws: WebSocket | null = null;
  private cseq = 0;
  private pending = new Map<number, { resolve: (v: LiteApiWsResponse) => void; reject: (e: Error) => void }>();
  private eventCallback: LiteApiEventCallback | null = null;
  private url: string;

  constructor(wsUrl: string) {
    this.url = wsUrl;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);
      this.ws.on('open', () => resolve());
      this.ws.on('error', reject);
      this.ws.on('message', (raw: Buffer) => {
        try {
          const msg = JSON.parse(raw.toString()) as LiteApiWsResponse & { Cseq?: number; ResponseCode?: number };
          const cseq = msg.Cseq;
          if (typeof cseq === 'number' && this.pending.has(cseq)) {
            const p = this.pending.get(cseq)!;
            this.pending.delete(cseq);
            p.resolve(msg);
          } else if (msg.ResponseCode === undefined && this.eventCallback) {
            this.eventCallback(msg);
          } else if (this.eventCallback) {
            this.eventCallback(msg);
          }
        } catch {
          // ignore non-JSON
        }
      });
    });
  }

  onEvent(cb: LiteApiEventCallback): void {
    this.eventCallback = cb;
  }

  sendRequest(requestUrl: string, method: string, data?: Record<string, unknown>): Promise<LiteApiWsResponse> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('WebSocket not connected'));
    }
    const Cseq = ++this.cseq;
    const body: LiteApiWsRequest = { RequestURL: requestUrl, Method: method, Cseq, Data: data ?? {} };
    return new Promise((resolve, reject) => {
      this.pending.set(Cseq, { resolve, reject });
      this.ws!.send(JSON.stringify(body));
    });
  }

  /** Event subscription (LiteAPI doc 6.4 Event Subscription). */
  async subscribeEvents(): Promise<LiteApiWsResponse> {
    return this.sendRequest('/LAPI/V1.0/Event/Subscribe', 'POST', {});
  }

  disconnect(): void {
    this.pending.forEach(({ reject }) => reject(new Error('WebSocket closed')));
    this.pending.clear();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
