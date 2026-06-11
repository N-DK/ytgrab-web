const express = require("express");
const path = require("path");
const fs = require("fs");
const os = require("os");
const youtubeDl = require("youtube-dl-exec");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
const ffprobeInstaller = require("@ffprobe-installer/ffprobe");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const TMP_DIR = os.tmpdir();

// Log để kiểm tra path
console.log("ffmpeg path:", ffmpegInstaller.path);
console.log("ffprobe path:", ffprobeInstaller.path);

app.get("/api/info", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url" });

  try {
    const info = await youtubeDl(url, {
      dumpSingleJson: true,
      noPlaylist: true,
      ffmpegLocation: ffmpegInstaller.path,
    });

    res.json({
      id: info.id,
      title: info.title,
      channel: info.uploader,
      duration: info.duration,
      thumbnail: info.thumbnail,
      view_count: info.view_count,
    });
  } catch (e) {
    res
      .status(400)
      .json({ error: "Không lấy được thông tin video.", detail: e.message });
  }
});

app.get("/api/download", async (req, res) => {
  const { url, format = "mp3", quality = "192" } = req.query;
  if (!url) return res.status(400).json({ error: "Missing url" });

  const tmpFile = path.join(TMP_DIR, `yt_${Date.now()}`);
  const ext = format === "mp3" ? "mp3" : "mp4";
  const outFile = `${tmpFile}.${ext}`;

  try {
    if (format === "mp3") {
      await youtubeDl(url, {
        noPlaylist: true,
        extractAudio: true,
        audioFormat: "mp3",
        audioQuality: quality,
        output: `${tmpFile}.%(ext)s`,
        ffmpegLocation: path.dirname(ffmpegInstaller.path), // yt-dlp cần dirname, không phải full path
        writeThumbnail: true, // ← tải thumbnail về
        embedThumbnail: true, // ← nhúng vào file MP3
        addMetadata: true, // ← thêm title, artist luôn cho đẹp
      });
    } else {
      await youtubeDl(url, {
        noPlaylist: true,
        format: "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
        output: `${tmpFile}.%(ext)s`,
        ffmpegLocation: path.dirname(ffmpegInstaller.path),
        writeThumbnail: true, // ← tải thumbnail về
        embedThumbnail: true, // ← nhúng vào file MP4
        addMetadata: true,
      });
    }

    if (!fs.existsSync(outFile)) {
      return res
        .status(500)
        .json({ error: "File không tồn tại sau khi convert" });
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
    stream.on("end", () => fs.unlink(outFile, () => {}));
    stream.on("error", () => fs.unlink(outFile, () => {}));
  } catch (e) {
    res.status(500).json({ error: "Download thất bại", detail: e.message });
  }
});

const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
