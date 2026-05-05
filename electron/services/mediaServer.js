const http = require("node:http");
const { spawn } = require("node:child_process");
const { Readable } = require("node:stream");
const { createDriveService } = require("./driveService");
const { buildTranscodeArgs, probeFfmpeg } = require("./ffmpegService");

async function createMediaServer() {
  const driveService = await createDriveService();
  const ffmpegStatus = probeFfmpeg(driveService.config);

  async function fetchDriveStream(fileId, rangeHeader = "") {
    const accessToken = await driveService.getAccessToken();
    const driveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    const headers = {
      Authorization: `Bearer ${accessToken}`
    };

    if (rangeHeader) {
      headers.Range = rangeHeader;
    }

    return fetch(driveUrl, { headers });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const requestUrl = new URL(req.url, `http://${req.headers.host}`);

      if (!requestUrl.pathname.startsWith("/stream/") && !requestUrl.pathname.startsWith("/transcode/")) {
        res.writeHead(404).end("Not found");
        return;
      }

      const isTranscode = requestUrl.pathname.startsWith("/transcode/");
      const fileId = requestUrl.pathname.replace(isTranscode ? "/transcode/" : "/stream/", "");
      if (!fileId) {
        res.writeHead(400).end("Arquivo invalido");
        return;
      }

      if (isTranscode) {
        if (!ffmpegStatus.available) {
          res.writeHead(501).end(ffmpegStatus.reason || "FFmpeg nao disponivel para transcodificacao.");
          return;
        }

        const upstream = await fetchDriveStream(fileId);
        if (!upstream.ok || !upstream.body) {
          const message = await upstream.text();
          res.writeHead(upstream.status || 502).end(message || "Falha ao abrir video para transcodificar");
          return;
        }

        const ffmpeg = spawn(ffmpegStatus.command, buildTranscodeArgs(), {
          stdio: ["pipe", "pipe", "pipe"],
          windowsHide: true
        });

        res.writeHead(200, {
          "Content-Type": "video/mp4",
          "Transfer-Encoding": "chunked",
          "Cache-Control": "no-store"
        });

        Readable.fromWeb(upstream.body).pipe(ffmpeg.stdin);
        ffmpeg.stdout.pipe(res);

        ffmpeg.stderr.on("data", () => {});
        req.on("close", () => {
          ffmpeg.kill("SIGKILL");
        });

        return;
      }

      const upstream = await fetchDriveStream(fileId, req.headers.range || "");
      if (!upstream.ok || !upstream.body) {
        const message = await upstream.text();
        res.writeHead(upstream.status || 502).end(message || "Falha ao reproduzir video");
        return;
      }

      const responseHeaders = {
        "Content-Type": upstream.headers.get("content-type") || "video/mp4",
        "Accept-Ranges": upstream.headers.get("accept-ranges") || "bytes"
      };

      const contentLength = upstream.headers.get("content-length");
      const contentRange = upstream.headers.get("content-range");

      if (contentLength) {
        responseHeaders["Content-Length"] = contentLength;
      }
      if (contentRange) {
        responseHeaders["Content-Range"] = contentRange;
      }

      res.writeHead(upstream.status, responseHeaders);
      Readable.fromWeb(upstream.body).pipe(res);
    } catch (error) {
      res.writeHead(500).end(error.message);
    }
  });

  const port = driveService.config.mediaPort;

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  return {
    driveService,
    ffmpegAvailable: ffmpegStatus.available,
    ffmpegReason: ffmpegStatus.reason,
    port,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      })
  };
}

module.exports = {
  createMediaServer
};
