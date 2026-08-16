import { HStack, Image, Script, Spacer, Text } from "scripting";

/** ZCode 图标（来自 zcode.z.ai favicon，深灰 + 白双版本适配深浅色） */
export function Logo({ size = 19 }: { size?: number }) {
  return (
    <Image
      resizable={true}
      scaleToFit={true}
      frame={{ width: size, height: size }}
      filePath={{
        light: Script.directory + "/image/logo.png",
        dark: Script.directory + "/image/logo_white.png",
      }}
    />
  );
}

export function Header() {
  const size = 19;
  return (
    <HStack>
      <Logo size={size} />
      <Spacer />
      <Text font={"headline"} padding={{ top: -2 }}>
        {"ZCode"}
      </Text>
    </HStack>
  );
}
