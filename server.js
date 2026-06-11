const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const youtubeDl = require("youtube-dl-exec");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
const { Innertube } = require("youtubei.js");
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const TMP_DIR = os.tmpdir();
const FFMPEG_DIR = path.dirname(ffmpegInstaller.path);

console.log("ffmpeg path:", ffmpegInstaller.path);
console.log("ffmpeg dir:", FFMPEG_DIR);

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.get("/api/info", async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Missing url" });
  }

  try {
    const yt = await Innertube.create();

    const videoId = url.match(
      /(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/,
    )?.[1];

    if (!videoId) {
      return res.status(400).json({ error: "URL YouTube không hợp lệ." });
    }

    const info = await yt.getInfo(videoId);

    return res.json({
      id: videoId,
      title: info.basic_info.title,
      channel: info.basic_info.author,
      duration: info.basic_info.duration,
      thumbnail: info.basic_info.thumbnail?.[0]?.url,
      view_count: info.basic_info.view_count,
    });
  } catch (e) {
    return res.status(400).json({
      error: "Không lấy được thông tin video.",
      detail: e.message,
    });
  }
});

app.get("/api/download", async (req, res) => {
  const { url, format = "mp3", quality = "192" } = req.query;

  if (!url) {
    return res.status(400).json({ error: "Missing url" });
  }

  const ext = format === "mp3" ? "mp3" : "mp4";
  const fileId = `yt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const tmpFile = path.join(TMP_DIR, fileId);
  const outFile = `${tmpFile}.${ext}`;

  try {
    if (format === "mp3") {
      await youtubeDl(url, {
        noPlaylist: true,
        extractAudio: true,
        audioFormat: "mp3",
        audioQuality: quality,
        output: outFile,
        ffmpegLocation: FFMPEG_DIR,

        // Tạm tắt thumbnail metadata cho Vercel để tránh cần ffprobe / file phụ
        addMetadata: false,
        embedThumbnail: false,
        writeThumbnail: false,
      });
    } else {
      await youtubeDl(url, {
        noPlaylist: true,
        format: "best[ext=mp4]/best",
        output: outFile,
        ffmpegLocation: FFMPEG_DIR,

        addMetadata: false,
        embedThumbnail: false,
        writeThumbnail: false,
      });
    }

    if (!fs.existsSync(outFile)) {
      return res.status(500).json({
        error: "File không tồn tại sau khi xử lý.",
      });
    }

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="download.${ext}"`,
    );
    res.setHeader(
      "Content-Type",
      format === "mp3" ? "audio/mpeg" : "video/mp4",
    );

    const stream = fs.createReadStream(outFile);

    stream.pipe(res);

    const cleanup = () => {
      fs.unlink(outFile, () => {});
    };

    stream.on("end", cleanup);
    stream.on("error", cleanup);
    res.on("close", cleanup);
  } catch (e) {
    return res.status(500).json({
      error: "Download thất bại.",
      detail: e.message,
    });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

if (require.main === module) {
  const PORT = process.env.PORT || 3456;

  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}

module.exports = app;
