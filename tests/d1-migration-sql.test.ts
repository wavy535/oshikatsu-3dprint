import { DatabaseSync } from "node:sqlite";
import { expect, test } from "vitest";
import { parenthesizeCases } from "../scripts/d1/remote-sql.mjs";

test("remote-compatible CASE expressions preserve nested guards, literals and trigger endings", () => {
  const original = `CREATE TABLE example (value INTEGER, "END" TEXT);
CREATE TRIGGER guard BEFORE INSERT ON example BEGIN
  -- CASE END in a comment is not SQL
  /* CASE END */
  SELECT CASE WHEN NEW.value < 0 THEN RAISE(ABORT, 'CASE isn''t END')
    ELSE CASE WHEN NEW.value = 0 THEN NULL ELSE 1 END END;
END;`;
  const converted = parenthesizeCases(original);
  expect(converted).toContain("ELSE (CASE WHEN NEW.value = 0 THEN NULL ELSE 1 END) END);");
  expect(converted).toContain("'CASE isn''t END'");
  expect(converted).toContain('"END" TEXT');
  expect(converted).toContain("/* CASE END */");
  expect(converted).toMatch(/\nEND;$/);
  for (const sql of [original, converted]) {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(sql);
      db.exec("INSERT INTO example(value) VALUES(0),(1)");
      expect(() => db.exec("INSERT INTO example(value) VALUES(-1)")).toThrow("CASE isn't END");
      expect(db.prepare("SELECT count(*) AS count FROM example").get()).toEqual({ count: 2 });
    } finally {
      db.close();
    }
  }
});

test("incomplete generated CASE expressions fail before writing a migration", () => {
  expect(() => parenthesizeCases("SELECT CASE WHEN 1 THEN 2;")).toThrow("Unclosed CASE");
});
