import { HStack, Image, Script, Spacer, Text } from "scripting";

/** DeepSeek 官方鲸鱼图标（来自 www.deepseek.com favicon，品牌蓝） */
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
        {"DeepSeek"}
      </Text>
    </HStack>
  );
}
