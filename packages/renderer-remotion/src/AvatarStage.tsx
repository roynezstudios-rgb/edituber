import type { EdituberBundle } from "@edituber/core";
import { resolveFrameState } from "@edituber/core";
import type { CSSProperties } from "react";
import { AbsoluteFill, Audio, Img, useCurrentFrame } from "remotion";

export interface AvatarStageProps extends Record<string, unknown> {
  bundle: EdituberBundle;
}

const imageStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  objectFit: "contain",
};

export const AvatarStage = ({ bundle }: AvatarStageProps) => {
  const frame = useCurrentFrame();
  const state = resolveFrameState(bundle, frame);
  const size = Math.min(bundle.project.width, bundle.project.height) * 0.76;

  return (
    <AbsoluteFill
      style={{
        backgroundColor:
          state.backgroundType === "transparent" ? "transparent" : state.backgroundColor,
        overflow: "hidden",
      }}
    >
      <Audio src={bundle.audioSource} />
      {state.backgroundType === "image" && state.backgroundImage ? (
        <Img src={state.backgroundImage} style={{ ...imageStyle, objectFit: "cover" }} />
      ) : null}
      {state.avatarVisible ? (
        <div
          data-avatar-parent="true"
          style={{
            position: "absolute",
            left: `${state.positionX * 100}%`,
            top: `${state.positionY * 100}%`,
            width: size,
            height: size,
            transform: `translate(-50%, -50%) translate(${state.avatar.transform.translateX}px, ${state.avatar.transform.translateY}px) rotate(${state.avatar.transform.rotation}deg) scale(${state.scale * state.avatar.transform.scaleX}, ${state.scale * state.avatar.transform.scaleY})`,
            transformOrigin: "center",
            filter: `brightness(${state.avatar.transform.brightness})`,
            imageRendering: state.avatar.imageMode === "pixel" ? "pixelated" : "auto",
          }}
        >
          <Img src={state.avatar.shell} style={imageStyle} />
          {state.avatar.previousFace ? (
            <Img
              src={state.avatar.previousFace}
              style={{ ...imageStyle, opacity: state.avatar.previousOpacity }}
            />
          ) : null}
          <Img
            src={state.avatar.currentFace}
            style={{ ...imageStyle, opacity: state.avatar.currentOpacity }}
          />
        </div>
      ) : null}
    </AbsoluteFill>
  );
};
