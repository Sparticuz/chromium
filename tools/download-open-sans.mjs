import { exec } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const FONT_URL = [
  "https://raw.githubusercontent.com/googlefonts/opensans/main/fonts/ttf/OpenSans-Bold.ttf",
  "https://raw.githubusercontent.com/googlefonts/opensans/main/fonts/ttf/OpenSans-Italic.ttf",
  "https://raw.githubusercontent.com/googlefonts/opensans/main/fonts/ttf/OpenSans-Regular.ttf",
];
const FONTS_DIR = join("fonts", "fonts", "Open_Sans");

console.log(FONTS_DIR);

async function downloadFonts() {
  await mkdir(FONTS_DIR, { recursive: true });

  for (const font of FONT_URL) {
    // eslint-disable-next-line n/no-unsupported-features/node-builtins
    const res = await fetch(font);
    if (!res.ok) {
      throw new Error(`Failed to download font: ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    const fontFileName = font.split("/").pop();
    const FONT_PATH = join(FONTS_DIR, fontFileName ?? "OpenSans.ttf");
    await writeFile(FONT_PATH, Buffer.from(arrayBuffer));
  }
}

await downloadFonts();

console.log("Fonts downloaded successfully.");

const execAsync = promisify(exec);

const tarFile = join("bin", "fonts.tar");
await execAsync(`tar -cf ${tarFile} -C fonts fonts.conf fonts`);

console.log(`Fonts folder archived to ${tarFile}`);

const brotliFile = `${tarFile}.br`;
await execAsync(`brotli --best --force --rm --output=${brotliFile} ${tarFile}`);

console.log(`Tar file compressed to ${brotliFile}`);
