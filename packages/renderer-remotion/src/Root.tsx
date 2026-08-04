import type { EdituberBundle } from "@edituber/core";
import { Composition } from "remotion";
import { z } from "zod";
import { AvatarStage, type AvatarStageProps } from "./AvatarStage";

const emptyBundle = {} as EdituberBundle;
const schema = z.object({ bundle: z.any() });

export const RemotionRoot = () => (
  // biome-ignore lint/correctness/useUniqueElementIds: Remotion composition IDs must be stable for headless selection
  <Composition<typeof schema, AvatarStageProps>
    id="EdituberPerformance"
    component={AvatarStage}
    durationInFrames={1}
    fps={30}
    width={1080}
    height={1080}
    schema={schema}
    defaultProps={{ bundle: emptyBundle }}
    calculateMetadata={({ props }: { props: AvatarStageProps }) => ({
      durationInFrames: props.bundle.project.durationInFrames,
      fps: props.bundle.project.fps,
      width: props.bundle.project.width,
      height: props.bundle.project.height,
    })}
  />
);
