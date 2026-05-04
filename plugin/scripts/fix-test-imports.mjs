import { readFile, writeFile } from "node:fs/promises";

const replacements = [
  [new URL("../dist-test/src/main/write.js", import.meta.url), [['"./serializer"', '"./serializer.js"']]],
  [new URL("../dist-test/src/main/tokenUsage.js", import.meta.url), [['"./tokens"', '"./tokens.js"']]],
  [
    new URL("../dist-test/src/main/tokenAudit.js", import.meta.url),
    [
      ['"./tokens"', '"./tokens.js"'],
      ['"./tokenUsage"', '"./tokenUsage.js"'],
    ],
  ],
  [
    new URL("../dist-test/src/main/tokenPropose.js", import.meta.url),
    [
      ['"./tokenAudit"', '"./tokenAudit.js"'],
      ['"./tokens"', '"./tokens.js"'],
      ['"./tokenUsage"', '"./tokenUsage.js"'],
    ],
  ],
  [
    new URL("../dist-test/src/main/tokenCreate.js", import.meta.url),
    [
      ['"./tokens"', '"./tokens.js"'],
    ],
  ],
];

for (const [filePath, fileReplacements] of replacements) {
  const source = await readFile(filePath, "utf8");
  let updated = source;

  for (const [find, replace] of fileReplacements) {
    updated = updated.replace(find, replace);
  }

  if (updated !== source) {
    await writeFile(filePath, updated);
  }
}
