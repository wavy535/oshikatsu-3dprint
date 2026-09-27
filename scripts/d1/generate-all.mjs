// The pinned oracle is the only input. No connection to a database is needed.
for (const name of [
  "schema",
  "policies",
  "triggers",
  "commands",
  "versions",
  "column-grants",
])
  await import(`./generate-${name}.mjs`);
