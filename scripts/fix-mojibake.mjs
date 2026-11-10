/**
 * Repairs text that was imported before the spreadsheet reader decoded CSVs as
 * UTF-8 (lib/spreadsheet.ts). Those rows hold the UTF-8 bytes re-read through
 * Windows-1252, so "Athlete’s" was stored as "Athleteâ€™s".
 *
 * Dry run:  node scripts/fix-mojibake.mjs
 * Apply:    node scripts/fix-mojibake.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY.");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const db = createClient(url, key, { auth: { persistSession: false } });

/** The 27 printable characters Windows-1252 puts in 0x80–0x9F, reversed. */
const CP1252_HIGH = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

const decoder = new TextDecoder("utf-8", { fatal: true });

/** One Windows-1252 round trip, or null if the text isn't mojibake. */
function undoOnce(text) {
  // A lone sequence like "café" would re-encode to bytes that are not valid
  // UTF-8 and throw below, but require a telltale character first so healthy
  // accented text is never even a candidate.
  if (!/[ÂÃâãàáåÎÐ][\u0080-¿–—‘’“”†™€œŠšŽžŸƒˆ˜…‰‹›‚„•‡]/.test(text)) {
    return null;
  }
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const byte = code <= 0xff ? code : CP1252_HIGH[code];
    if (byte === undefined) return null;
    bytes[i] = byte;
  }
  try {
    const decoded = decoder.decode(bytes);
    return decoded === text ? null : decoded;
  } catch {
    return null;
  }
}

/** Repairs text that was mangled more than once, stopping at a fixed point. */
function repair(text) {
  let current = text;
  for (let pass = 0; pass < 5; pass++) {
    const next = undoOnce(current);
    if (next === null) break;
    current = next;
  }
  return current === text ? null : current;
}

/** Supabase caps a response at 1000 rows, so every table has to be paged. */
async function* allRows(table, columns) {
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await db
      .from(table)
      .select(`id, ${columns.join(", ")}`)
      .order("id")
      .range(from, from + size - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    yield* data;
    if (data.length < size) return;
  }
}

const TABLES = [
  ["questions", ["question_text", "correct_answer", "explanation", "topic"]],
  ["answer_choices", ["answer_text"]],
  ["decks", ["name", "description"]],
  ["courses", ["name", "description"]],
];

let scanned = 0;
let broken = 0;
const samples = [];

for (const [table, columns] of TABLES) {
  let tableRows = 0;
  let tableBroken = 0;

  for await (const row of allRows(table, columns)) {
    scanned++;
    tableRows++;
    const patch = {};
    for (const column of columns) {
      const value = row[column];
      if (typeof value !== "string") continue;
      const fixed = repair(value);
      if (fixed !== null) patch[column] = fixed;
    }
    if (Object.keys(patch).length === 0) continue;

    broken++;
    tableBroken++;
    if (samples.length < 12) {
      const [column, fixed] = Object.entries(patch)[0];
      samples.push(`  ${table}.${column}\n    ${row[column]}\n -> ${fixed}`);
    }
    if (apply) {
      const { error } = await db.from(table).update(patch).eq("id", row.id);
      if (error) throw new Error(`${table} ${row.id}: ${error.message}`);
    }
  }

  console.log(`${table}: ${tableBroken} of ${tableRows} rows affected`);
}

if (samples.length > 0) console.log(`\nSamples:\n${samples.join("\n")}`);
console.log(
  `\n${scanned} rows scanned, ${broken} affected. ` +
    (apply ? "Repaired." : "Dry run — pass --apply to write."),
);
