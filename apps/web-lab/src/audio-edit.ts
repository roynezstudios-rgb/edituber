import type { StateEvent } from "@edituber/contracts";
import { normalizeStateEvents, resolveStateAtFrame } from "@edituber/timeline-engine";

export interface PcmAudio {
  sampleRate: number;
  channels: Float32Array[];
}

export interface RemappedStateTimeline {
  defaultStateId: string;
  events: StateEvent[];
}

const writeAscii = (view: DataView, offset: number, value: string) => {
  for (let index = 0; index < value.length; index += 1)
    view.setUint8(offset + index, value.charCodeAt(index));
};

export const removePcmRange = (
  audio: PcmAudio,
  startSeconds: number,
  endSeconds: number,
): PcmAudio => {
  const length = audio.channels[0]?.length ?? 0;
  const start = Math.max(0, Math.min(length, Math.floor(startSeconds * audio.sampleRate)));
  const end = Math.max(start, Math.min(length, Math.ceil(endSeconds * audio.sampleRate)));
  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels.map((channel) => {
      const edited = new Float32Array(channel.length - (end - start));
      edited.set(channel.subarray(0, start));
      edited.set(channel.subarray(end), start);
      return edited;
    }),
  };
};

export const encodePcm16Wave = (audio: PcmAudio): ArrayBuffer => {
  const channelCount = Math.max(1, audio.channels.length);
  const frameCount = audio.channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const dataBytes = frameCount * channelCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, audio.sampleRate, true);
  view.setUint32(28, audio.sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, dataBytes, true);
  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channelCount; channel += 1) {
      const sample = Math.max(-1, Math.min(1, audio.channels[channel]?.[frame] ?? 0));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }
  return buffer;
};

export const decodeAndRemoveAudioRange = async (
  source: ArrayBuffer,
  startSeconds: number,
  endSeconds: number,
): Promise<ArrayBuffer> => {
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(source.slice(0));
    const pcm = removePcmRange(
      {
        sampleRate: decoded.sampleRate,
        channels: Array.from({ length: decoded.numberOfChannels }, (_, channel) =>
          decoded.getChannelData(channel).slice(),
        ),
      },
      startSeconds,
      endSeconds,
    );
    return encodePcm16Wave(pcm);
  } finally {
    await context.close();
  }
};

export const remapStateTimelineAfterDelete = (
  events: StateEvent[],
  defaultStateId: string,
  startFrame: number,
  endFrame: number,
): RemappedStateTimeline => {
  const safeStart = Math.max(0, Math.floor(startFrame));
  const safeEnd = Math.max(safeStart, Math.floor(endFrame));
  const stateAfterCut = resolveStateAtFrame(safeEnd, events, defaultStateId, 0).currentStateId;
  const nextDefaultStateId = safeStart === 0 ? stateAfterCut : defaultStateId;
  const shifted = events
    .filter((event) => event.frame < safeStart || event.frame >= safeEnd)
    .map((event) => ({
      ...event,
      frame: event.frame >= safeEnd ? event.frame - (safeEnd - safeStart) : event.frame,
    }));
  shifted.push({ frame: safeStart, stateId: stateAfterCut });
  return {
    defaultStateId: nextDefaultStateId,
    events: normalizeStateEvents(shifted, nextDefaultStateId),
  };
};
