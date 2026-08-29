const { rm } = require('node:fs/promises');
const { resolve, sep } = require('node:path');

async function cleanGeneratedApi() {
  const target = resolve(process.cwd(), 'src', 'generated', 'api');
  const expectedPrefix = `${resolve(process.cwd(), 'src', 'generated')}${sep}`;
  if (!target.startsWith(expectedPrefix)) throw new Error(`Unsafe generated target: ${target}`);
  await rm(target, { recursive: true, force: true });
}

cleanGeneratedApi().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
