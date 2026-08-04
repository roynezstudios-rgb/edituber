export type TimelineTool = "emotions" | "cut";

export const resolveTimelineClick = (tool: TimelineTool, frame: number) => ({
  frame,
  pickerFrame: tool === "emotions" ? frame : null,
});
