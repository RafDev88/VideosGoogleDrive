const { spawnSync } = require("node:child_process");

function resolveFfmpegCommand(config) {
  return config.ffmpegPath || "ffmpeg";
}

function probeFfmpeg(config) {
  if (!config.enableTranscode) {
    return { available: false, command: "", reason: "Transcodificacao desativada." };
  }

  const command = resolveFfmpegCommand(config);

  try {
    const result = spawnSync(command, ["-version"], {
      windowsHide: true,
      encoding: "utf8"
    });

    if (result.status === 0) {
      return {
        available: true,
        command,
        reason: ""
      };
    }

    return {
      available: false,
      command,
      reason: result.stderr?.trim() || "FFmpeg nao encontrado."
    };
  } catch (error) {
    return {
      available: false,
      command,
      reason: error.message || "FFmpeg nao encontrado."
    };
  }
}

function buildTranscodeArgs() {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    "pipe:0",
    "-map",
    "0:v:0",
    "-map",
    "0:a?",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-movflags",
    "frag_keyframe+empty_moov+faststart",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-f",
    "mp4",
    "pipe:1"
  ];
}

module.exports = {
  buildTranscodeArgs,
  probeFfmpeg,
  resolveFfmpegCommand
};
