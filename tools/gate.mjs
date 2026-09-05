/* What every gate does with what it found. Shared so the three cannot drift into three formats. */
export function report(what, problems) {
  if (problems.length > 0) {
    console.error(`${what} check failed:\n`);
    for (const p of [...new Set(problems)]) console.error(`  ${p}`);
    console.error("");
    process.exit(1);
  }
}
