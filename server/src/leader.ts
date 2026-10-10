import http from "node:http";
import type { Duplex } from "node:stream";
import { Bridge } from "./bridge.js";
import { validateRpc } from "./schema.js";
import { executeSaveScreenshots, resolveBatchIcons, resolveSceneIcons } from "./tools.js";
import type { ExportFormat } from "./tools.js";
import { resolveIconifyIcon } from "./iconify.js";
import type { RPCRequest, RPCResponse } from "./types.js";
import { VERSION } from "./version.js";

/**
 * Leader owns the WebSocket bridge to Figma and exposes HTTP endpoints for followers.
 * Endpoints:
 *   /ws   — WebSocket upgrade for the Figma plugin
 *   /ping — Health check
 *   /rpc  — JSON RPC for follower tool calls
 */
export class Leader {
  private bridge: Bridge;
  private server: http.Server | null = null;

  constructor(private port: number) {
    this.bridge = new Bridge();
  }

  getBridge(): Bridge {
    return this.bridge;
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        if (req.url === "/ping" && req.method === "GET") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ status: "ok", version: VERSION }));
          return;
        }

        if (req.url === "/rpc" && req.method === "POST") {
          this.handleRPC(req, res);
          return;
        }

        res.writeHead(404);
        res.end("Not found");
      });

      server.on(
        "upgrade",
        (req: http.IncomingMessage, socket: Duplex, head: Buffer) => {
          if (req.url?.startsWith("/ws")) {
            this.bridge.handleUpgrade(req, socket, head);
          } else {
            socket.destroy();
          }
        }
      );

      server.once("error", (err: NodeJS.ErrnoException) => {
        reject(
          err.code === "EADDRINUSE"
            ? new Error(`Port ${this.port} already in use`)
            : err
        );
      });

      server.listen(this.port, () => {
        this.server = server;
        console.error(`Leader listening on :${this.port}`);
        resolve();
      });
    });
  }

  private handleRPC(req: http.IncomingMessage, res: http.ServerResponse): void {
    let body = "";
    req.on("data", (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on("end", async () => {
      try {
        const rpcReq: RPCRequest = JSON.parse(body);

        if (rpcReq.tool === "list_files") {
          this.sendJSON(res, 200, { data: this.bridge.listConnectedFiles() });
          return;
        }

        const validationError = validateRpc(
          rpcReq.tool,
          rpcReq.nodeIds,
          rpcReq.params
        );
        if (validationError) {
          this.sendJSON(res, 400, { error: validationError });
          return;
        }

        const fileKey = rpcReq.fileKey;

        if (rpcReq.tool === "save_screenshots") {
          const params = rpcReq.params ?? {};
          const sender = {
            sendWithParams: (
              requestType: string,
              nodeIds?: string[],
              sendParams?: Record<string, unknown>
            ) => this.bridge.sendWithParams(requestType, nodeIds, sendParams, fileKey),
          };
          const result = await executeSaveScreenshots(
            sender,
            params.items as Parameters<typeof executeSaveScreenshots>[1],
            params.format as ExportFormat | undefined,
            params.scale as number | undefined
          );
          this.sendJSON(res, 200, { data: result });
          return;
        }

        if (rpcReq.tool === "create_scene") {
          const params = rpcReq.params ?? {};
          const resp = await this.bridge.sendWithParams("create_scene", undefined, { ...params, nodes: await resolveSceneIcons(params.nodes as Parameters<typeof resolveSceneIcons>[0]) }, fileKey);
          this.sendJSON(res, 200, resp.error ? { error: resp.error } : { data: resp.data });
          return;
        }

        if (rpcReq.tool === "create_icon") {
          const params = rpcReq.params ?? {};
          const icon = await resolveIconifyIcon(params.iconSet as string | undefined, params.name as string);
          const base = { iconSet: icon.iconSet, name: icon.name, source: icon.source, ...(icon.sourceUrl ? { sourceUrl: icon.sourceUrl } : {}), size: params.size ?? 24, ...(params.color ? { color: params.color } : {}), dryRun: params.dryRun !== false };
          if (params.dryRun !== false) { this.sendJSON(res, 200, { data: base }); return; }
          const resp = await this.bridge.sendWithParams("create_icon", undefined, { ...params, svg: icon.svg }, fileKey);
          this.sendJSON(res, 200, resp.error ? { error: resp.error } : { data: { ...base, ...(resp.data as Record<string, unknown>) } });
          return;
        }
        const batchParams = rpcReq.tool === "batch_mutation" && rpcReq.params
          ? await resolveBatchIcons(rpcReq.params)
          : rpcReq.params;
        const resp = await this.bridge.sendWithParams(
           rpcReq.tool,
           rpcReq.nodeIds,
          batchParams,
           fileKey
         );

        this.sendJSON(
          res,
          200,
          resp.error ? { error: resp.error } : { data: resp.data }
        );
      } catch (err) {
        this.sendJSON(res, 200, {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });
  }

  private sendJSON(
    res: http.ServerResponse,
    status: number,
    body: RPCResponse
  ): void {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }

  stop(): void {
    this.bridge.close();
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}
