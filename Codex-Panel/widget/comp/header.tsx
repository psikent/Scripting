import { HStack, Image, Link, Script, Spacer, Text } from "scripting";

export function View() {
  const size = 19;
  return (
    <Link url={"https://chatgpt.com"} buttonStyle={"plain"}>
      <HStack>
        <Image
          resizable={true}
          scaleToFit={true}
          frame={{ width: size, height: size }}
          filePath={{
            light: Script.directory + "/image/light.png",
            dark: Script.directory + "/image/dark.png",
          }}
        />
        <Spacer />
        <Text font={"headline"} padding={{ top: -2 }}>
          {"Codex"}
        </Text>
      </HStack>
    </Link>
  );
}
