import { Text, Gauge, Image, Script } from "scripting";

export function View({ percent, stale = false }: { percent: number; stale?: boolean }) {
  const size = 11;
  return (
    <Gauge
      gaugeStyle={"accessoryCircular"}
      min={0}
      max={100}
      value={percent}
      tint={"tertiaryLabel"}
      label={stale ? <Text font={"caption2"}>{"缓存"}</Text> : (
        <Image
          opacity={0.3}
          resizable={true}
          scaleToFit={true}
          frame={{ height: size, width: size }}
          filePath={{
            light: Script.directory + "/image/light.png",
            dark: Script.directory + "/image/dark.png",
          }}
        />
      )}
      currentValueLabel={<Text>{`${percent}%`}</Text>}
    />
  );
}
