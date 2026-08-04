import type { AudioEnvelopeV1, AvatarManifestV2, EdituberProjectV2 } from "@edituber/contracts";
import type { EdituberBundle } from "@edituber/core";
import audioUrl from "../../../fixtures/audio/demo.wav?url";
import envelopeJson from "../../../fixtures/audio/demo-envelope.json";
import smileClosedClosed from "../../../fixtures/avatars/robot/faces/smile-closed-eyes-closed-mouth.svg?url";
import smileClosedOpen from "../../../fixtures/avatars/robot/faces/smile-closed-eyes-open-mouth.svg?url";
import smileOpenClosed from "../../../fixtures/avatars/robot/faces/smile-open-eyes-closed-mouth.svg?url";
import smileOpenOpen from "../../../fixtures/avatars/robot/faces/smile-open-eyes-open-mouth.svg?url";
import surpriseClosedClosed from "../../../fixtures/avatars/robot/faces/surprise-closed-eyes-closed-mouth.svg?url";
import surpriseClosedOpen from "../../../fixtures/avatars/robot/faces/surprise-closed-eyes-open-mouth.svg?url";
import surpriseOpenClosed from "../../../fixtures/avatars/robot/faces/surprise-open-eyes-closed-mouth.svg?url";
import surpriseOpenOpen from "../../../fixtures/avatars/robot/faces/surprise-open-eyes-open-mouth.svg?url";
import thinkClosedClosed from "../../../fixtures/avatars/robot/faces/think-closed-eyes-closed-mouth.svg?url";
import thinkClosedOpen from "../../../fixtures/avatars/robot/faces/think-closed-eyes-open-mouth.svg?url";
import thinkOpenClosed from "../../../fixtures/avatars/robot/faces/think-open-eyes-closed-mouth.svg?url";
import thinkOpenOpen from "../../../fixtures/avatars/robot/faces/think-open-eyes-open-mouth.svg?url";
import shellUrl from "../../../fixtures/avatars/robot/shell.svg?url";
import projectJson from "../../../fixtures/projects/demo.edituber.json";

const avatar: AvatarManifestV2 = {
  schemaVersion: 2,
  avatarId: "9223eae6-96a7-4cab-8906-e5cf35cf0f19",
  name: "Robot Cyan Fixture",
  canvas: { width: 800, height: 800 },
  shell: shellUrl,
  defaultStateId: "2522cfb9-01e1-47c6-9e61-e6e5a4ae3ef0",
  states: [
    {
      id: "2522cfb9-01e1-47c6-9e61-e6e5a4ae3ef0",
      emoji: "🙂",
      name: "Sonrisa",
      blinkPolicy: "auto",
      motionPreset: "idle",
      images: {
        eyesOpen: { mouthClosed: smileOpenClosed, mouthOpen: smileOpenOpen },
        eyesClosed: { mouthClosed: smileClosedClosed, mouthOpen: smileClosedOpen },
      },
    },
    {
      id: "c114b68a-1653-4186-ad11-f380d2ea9379",
      emoji: "🤔",
      name: "Pensando",
      blinkPolicy: "auto",
      motionPreset: "idle",
      images: {
        eyesOpen: { mouthClosed: thinkOpenClosed, mouthOpen: thinkOpenOpen },
        eyesClosed: { mouthClosed: thinkClosedClosed, mouthOpen: thinkClosedOpen },
      },
    },
    {
      id: "041731df-94b8-492b-a8cc-9e4300c4dc2f",
      emoji: "😮",
      name: "Sorpresa",
      blinkPolicy: "auto",
      motionPreset: "surprise",
      images: {
        eyesOpen: { mouthClosed: surpriseOpenClosed, mouthOpen: surpriseOpenOpen },
        eyesClosed: { mouthClosed: surpriseClosedClosed, mouthOpen: surpriseClosedOpen },
      },
    },
    {
      id: "ba1ef770-0f9c-4a62-a358-c39653e9ec42",
      emoji: "✨",
      name: "Simple reactivo",
      blinkPolicy: "disabled",
      blink: {
        intervalMinSeconds: 2.3,
        intervalMaxSeconds: 5,
        durationMilliseconds: 130,
        syncAnimatedImages: true,
        playAnimationToEnd: false,
      },
      imageMode: "smooth",
      resetAnimationOnEnter: true,
      effects: {
        mouthClosed: [
          {
            id: "18518776-1336-4e22-85fa-6784945ae28c",
            type: "waveMove",
            enabled: true,
            preset: "breathing",
            amountX: 0,
            amountY: 4,
            periodSeconds: 2.4,
            phaseOffset: 0,
          },
        ],
        mouthOpen: [
          {
            id: "02a21d60-704f-411a-93e6-5c86ea9a36e8",
            type: "jump",
            enabled: true,
            preset: "happy",
            amountX: 2,
            amountY: 24,
            frequencyHz: 2.4,
          },
        ],
        closedToOpen: [
          {
            id: "5be1f67b-8ae1-47b7-b3ce-c49f297bff8a",
            type: "jump",
            enabled: true,
            amount: 18,
            durationMilliseconds: 180,
          },
        ],
        openToClosed: [],
        stateEnter: [
          {
            id: "7d935dc7-a1ae-4337-92ef-f1c4e90aa6e8",
            type: "stateEnter",
            enabled: true,
            amount: 20,
            durationMilliseconds: 280,
          },
        ],
      },
      images: { eyesOpen: { mouthClosed: smileOpenClosed } },
    },
  ],
};

export const fixtureBundle: EdituberBundle = {
  project: projectJson as EdituberProjectV2,
  avatar,
  envelope: envelopeJson as AudioEnvelopeV1,
  audioSource: audioUrl,
};
