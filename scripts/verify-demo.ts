import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";

const run = (command: string, args: string[]): Promise<string> =>
  new Promise((resolveOutput, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolveOutput(Buffer.concat(stdout).toString("utf8"));
      else reject(new Error(`${command} failed: ${Buffer.concat(stderr).toString("utf8")}`));
    });
  });

const video = resolve(process.argv[2] ?? "outputs/edituber-demo.mp4");
await access(video);
const metadata = JSON.parse(
  await run("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", video]),
) as { streams: Array<Record<string, string | number>>; format: { duration?: string } };
const videoStream = metadata.streams.find((stream) => stream.codec_type === "video");
const audioStream = metadata.streams.find((stream) => stream.codec_type === "audio");

const failures: string[] = [];
if (videoStream?.width !== 1080 || videoStream?.height !== 1080)
  failures.push("video is not 1080x1080");
if (videoStream?.avg_frame_rate !== "30/1") failures.push("video is not 30 FPS");
if (!audioStream) failures.push("audio stream is missing");
const duration = Number.parseFloat(metadata.format.duration ?? "0");
if (Math.abs(duration - 6) > 0.15) failures.push(`duration is ${duration}s instead of 6s`);

const signalData = await run("ffmpeg", [
  "-v",
  "error",
  "-i",
  video,
  "-vf",
  "signalstats,metadata=print:file='pipe\\:1'",
  "-f",
  "null",
  "-",
]);
const frameRecords = [...signalData.matchAll(/frame:(\d+)/g)];
const yAverages = [...signalData.matchAll(/lavfi\.signalstats\.YAVG=([0-9.]+)/g)].map((match) =>
  Number.parseFloat(match[1] ?? "255"),
);
if (frameRecords.length !== 180 || yAverages.length !== 180) {
  failures.push(`expected signal data for 180 frames, received ${yAverages.length}`);
}
if (yAverages.some((average) => average > 225)) {
  failures.push("a blank or near-white frame was detected");
}

if (failures.length > 0) throw new Error(`Demo verification failed: ${failures.join(", ")}`);
process.stdout.write(
  `${JSON.stringify({ ok: true, video, width: 1080, height: 1080, fps: 30, duration, audio: true }, null, 2)}\n`,
);
