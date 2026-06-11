import { buildNotesIndex } from "../server/notes-core.mjs";

async function main() {
  const index = await buildNotesIndex();
  console.log(
    `Validated ${index.count} visible markdown files and ${index.hiddenCount} hidden markdown files`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
