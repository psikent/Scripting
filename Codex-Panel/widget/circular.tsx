import { Text, Gauge, Image, Script } from "scripting";

export function View({ percent }: { percent: number }) {
  const size = 11;
  return (
    <Gauge
      gaugeStyle={"accessoryCircular"}
      min={0}
      max={100}
      value={percent}
      tint={"tertiaryLabel"}
      label={
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
      }
      currentValueLabel={<Text>{`${percent}%`}</Text>}
    />
  );
}
