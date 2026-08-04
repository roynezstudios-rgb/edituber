import type { AudioEnvelopeV1, AvatarManifestV1, EdituberProjectV1 } from "@edituber/contracts";
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

const avatar: AvatarManifestV1 = {
  schemaVersion: 1,
  avatarId: "9223eae6-96a7-4cab-8906-e5cf35cf0f19",
  name: "Robot Cyan Fixture",
  canvas: { width: 800, height: 800 },
  shell: shellUrl,
  defaultExpression: "🙂",
  expressions: [
    {
      id: "2522cfb9-01e1-47c6-9e61-e6e5a4ae3ef0",
      emoji: "🙂",
      blinkPolicy: "auto",
      states: {
        eyesOpenMouthClosed: smileOpenClosed,
        eyesOpenMouthOpen: smileOpenOpen,
        eyesClosedMouthClosed: smileClosedClosed,
        eyesClosedMouthOpen: smileClosedOpen,
      },
    },
    {
      id: "c114b68a-1653-4186-ad11-f380d2ea9379",
      emoji: "🤔",
      blinkPolicy: "auto",
      states: {
        eyesOpenMouthClosed: thinkOpenClosed,
        eyesOpenMouthOpen: thinkOpenOpen,
        eyesClosedMouthClosed: thinkClosedClosed,
        eyesClosedMouthOpen: thinkClosedOpen,
      },
    },
    {
      id: "041731df-94b8-492b-a8cc-9e4300c4dc2f",
      emoji: "😮",
      blinkPolicy: "auto",
      states: {
        eyesOpenMouthClosed: surpriseOpenClosed,
        eyesOpenMouthOpen: surpriseOpenOpen,
        eyesClosedMouthClosed: surpriseClosedClosed,
        eyesClosedMouthOpen: surpriseClosedOpen,
      },
    },
  ],
};

export const fixtureBundle: EdituberBundle = {
  project: projectJson as EdituberProjectV1,
  avatar,
  envelope: envelopeJson as AudioEnvelopeV1,
  audioSource: audioUrl,
};
