import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { analyzeSamples } from "./index";

const run = (command: string, args: string[]): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(stdout));
      else
        reject(new Error(`${command} failed (${code}): ${Buffer.concat(stderr).toString("utf8")}`));
    });
  });

export const hashFile = async (path: string): Promise<string> => {
  const contents = await readFile(path);
  return createHash("sha256").update(contents).digest("hex");
};

export const probeAudioDuration = async (path: string): Promise<number> => {
  const result = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    path,
  ]);
  const duration = Number.parseFloat(result.toString("utf8").trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("The audio duration is invalid");
  return duration;
};

export const analyzeAudioFile = async (path: string, fps: number, sampleRate = 48_000) => {
  const raw = await run("ffmpeg", [
    "-v",
    "error",
    "-i",
    path,
    "-ac",
    "1",
    "-ar",
    String(sampleRate),
    "-f",
    "f32le",
    "pipe:1",
  ]);
  const samples = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
  return analyzeSamples(samples, { fps, sampleRate, sourceHash: await hashFile(path) });
};
