import * as XLSX from "xlsx";

import { summarizeAnswers } from "@/lib/grading";
import type { AnswerMode } from "@/lib/types";

export type ColumnRole = "question" | "correctAnswer" | "choice" | "explanation" | "topic" | "ignore";

export type ColumnMapping = {
  question: number | null;
  correctAnswer: number | null;
  choices: number[];
  explanation: number | null;
  topic: number | null;
};

export type SheetData = {
  sheetNames: string[];
  sheetName: string;
  headers: string[];
  /** Data rows only — the detected header row is already removed. */
  rows: string[][];
  headerRowIndex: number;
};

export type ParsedRow = {
  /** 1-based row number in the original sheet, for error messages. */
  rowNumber: number;
  questionText: string;
  /** Readable summary of the answer set; the single answer in single mode. */
  correctAnswer: string;
  /** Every correct answer. One entry in single mode, several in multi. */
  correctAnswers: string[];
  answerMode: AnswerMode;
  distractors: string[];
  explanation: string;
  topic: string;
  valid: boolean;
  issues: string[];
  /** Row number of the earlier row this duplicates, if any. */
  duplicateOf: number | null;
  hasImportedChoices: boolean;
};

export type ImportSummary = {
  totalRows: number;
  valid: number;
  invalid: number;
  withImportedChoices: number;
  needGeneratedDistractors: number;
  duplicates: number;
  multiSelect: number;
};

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

const cell = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
};

const isBlankRow = (row: string[]) => row.every((value) => value === "");

/**
 * Text formats (CSV/TSV) carry no encoding in the bytes, so the reader falls
 * back to a legacy codepage and turns UTF-8 punctuation into mojibake —
 * "Athlete’s" arrives as "Athleteâ€™s". Decode text files as UTF-8 ourselves
 * and leave the binary formats, which declare their own encoding, to the reader.
 */
function decodeTextFile(data: ArrayBuffer): string | null {
  const bytes = new Uint8Array(data);
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b; // xlsx, ods
  const isOle = bytes[0] === 0xd0 && bytes[1] === 0xcf; // legacy xls
  if (isZip || isOle) return null;
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  } catch {
    // Not UTF-8 — let the reader apply its own codepage detection.
    return null;
  }
}

export function readWorkbook(data: ArrayBuffer, sheetName?: string): SheetData {
  const text = decodeTextFile(data);
  const workbook =
    text === null
      ? XLSX.read(data, { type: "array", cellDates: true })
      : XLSX.read(text, { type: "string", cellDates: true });
  const sheetNames = workbook.SheetNames;
  if (sheetNames.length === 0) throw new Error("This file does not contain any sheets.");

  const chosen = sheetName && sheetNames.includes(sheetName) ? sheetName : sheetNames[0];
  const sheet = workbook.Sheets[chosen];

  const raw = XLSX.utils
    .sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: "" })
    .map((row) => (Array.isArray(row) ? row.map(cell) : []))
    .filter((row) => !isBlankRow(row));

  if (raw.length === 0) throw new Error("This sheet is empty.");

  const headerRowIndex = detectHeaderRow(raw);
  const headerRow = raw[headerRowIndex] ?? [];
  const width = Math.max(...raw.map((row) => row.length));
  const headers = Array.from({ length: width }, (_, i) => headerRow[i] ?? "");

  const rows = raw
    .slice(headerRowIndex + 1)
    .map((row) => Array.from({ length: width }, (_, i) => row[i] ?? ""))
    .filter((row) => !isBlankRow(row));

  return { sheetNames, sheetName: chosen, headers, rows, headerRowIndex };
}

/**
 * Spreadsheets exported from a course site often carry a title row or two
 * before the real headers, so scan the first few rows for one that looks like
 * a header rather than assuming row 1.
 */
function detectHeaderRow(rows: string[][]): number {
  const limit = Math.min(rows.length, 10);
  for (let i = 0; i < limit; i++) {
    const row = rows[i];
    const filled = row.filter((value) => value !== "");
    if (filled.length < 2) continue;
    const looksLikeHeader = row.some(
      (value) => classifyHeader(value) === "question" || classifyHeader(value) === "correctAnswer",
    );
    if (looksLikeHeader) return i;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Column detection
// ---------------------------------------------------------------------------

const clean = (header: string) =>
  header
    .toLowerCase()
    .replace(/[._#:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const CHOICE_PATTERNS = [
  /^(choice|option|answer|opt|distractor|ans)\s*[a-h]$/,
  /^(choice|option|answer|opt|distractor|ans)\s*[1-8]$/,
  /^[a-h]\)?$/,
  /^(wrong|incorrect)\s*(answer)?\s*[a-h1-8]?$/,
];

const QUESTION_PATTERNS = [/^(question|question text|prompt|q|term|front|item)$/];

const ANSWER_PATTERNS = [
  /^(correct answer|correct|answer|solution|key|answer key|correct option|correct choice|back|definition|ans)$/,
];

const EXPLANATION_PATTERNS = [/^(explanation|rationale|why|reason|note|notes|feedback|comment|comments)$/];

const TOPIC_PATTERNS = [/^(topic|category|chapter|unit|subject|tag|tags|section|module|lecture)$/];

/** Classify one header cell. Choice columns are checked before the generic
 * "answer" pattern so that "Answer A" is a choice and "Answer" is the key. */
export function classifyHeader(header: string): ColumnRole {
  const value = clean(header);
  if (!value) return "ignore";
  if (CHOICE_PATTERNS.some((re) => re.test(value))) return "choice";
  if (ANSWER_PATTERNS.some((re) => re.test(value))) return "correctAnswer";
  if (QUESTION_PATTERNS.some((re) => re.test(value))) return "question";
  if (EXPLANATION_PATTERNS.some((re) => re.test(value))) return "explanation";
  if (TOPIC_PATTERNS.some((re) => re.test(value))) return "topic";

  // Looser fallbacks for headers like "Question Stem" or "Correct Answer (text)".
  if (/\bquestion\b|\bprompt\b/.test(value)) return "question";
  if (/\bcorrect\b|\banswer\b|\bsolution\b/.test(value)) return "correctAnswer";
  if (/\bexplanation\b|\brationale\b/.test(value)) return "explanation";
  if (/\btopic\b|\bcategory\b|\bchapter\b|\btag\b/.test(value)) return "topic";
  return "ignore";
}

export function detectColumns(sheet: SheetData): ColumnMapping {
  const mapping: ColumnMapping = {
    question: null,
    correctAnswer: null,
    choices: [],
    explanation: null,
    topic: null,
  };

  sheet.headers.forEach((header, index) => {
    switch (classifyHeader(header)) {
      case "question":
        if (mapping.question === null) mapping.question = index;
        break;
      case "correctAnswer":
        if (mapping.correctAnswer === null) mapping.correctAnswer = index;
        break;
      case "choice":
        mapping.choices.push(index);
        break;
      case "explanation":
        if (mapping.explanation === null) mapping.explanation = index;
        break;
      case "topic":
        if (mapping.topic === null) mapping.topic = index;
        break;
    }
  });

  // Headerless files: fall back to position for the two-column minimal format.
  if (mapping.question === null && mapping.correctAnswer === null && sheet.headers.length >= 2) {
    mapping.question = 0;
    mapping.correctAnswer = 1;
  } else if (mapping.question === null) {
    const used = new Set([mapping.correctAnswer, ...mapping.choices, mapping.explanation, mapping.topic]);
    const firstFree = sheet.headers.findIndex((_, i) => !used.has(i));
    if (firstFree >= 0) mapping.question = firstFree;
  }

  return mapping;
}

// ---------------------------------------------------------------------------
// Row building and validation
// ---------------------------------------------------------------------------

const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

/** "B", "b)", "(C)" etc. — a key that points at a choice column. */
function letterIndex(value: string): number | null {
  const match = /^\(?([a-h])[).:]?$/i.exec(value.trim());
  if (!match) return null;
  return match[1].toLowerCase().charCodeAt(0) - 97;
}

/** Stems that promise more than one answer, used to flag a suspect key. */
const SELECT_ALL = /\b(select|choose|mark|pick)\s+(all|every|each)\b|\ball that apply\b|\bwhich\s+(two|three|four)\b/i;

/**
 * Read the answer-key cell, which may name one answer or several.
 *
 * Multiple answers are written either as choice letters ("A, C") or as the
 * answer texts separated by a pipe or semicolon. A comma only splits when
 * every part resolves to a letter or to a choice cell, because an ordinary
 * prose answer — "Water availability, wildfires and heat" — contains commas
 * of its own and must not be torn into three answers.
 */
function parseAnswerKey(
  cell: string,
  rawChoices: readonly string[],
): { answers: string[]; byLetter: boolean } {
  const resolve = (part: string): string | null => {
    const trimmed = part.trim();
    if (!trimmed) return null;
    const index = letterIndex(trimmed);
    if (index !== null && index < rawChoices.length) return rawChoices[index];
    const match = rawChoices.find((choice) => normalize(choice) === normalize(trimmed));
    return match ?? trimmed;
  };

  // A letter may point at a blank choice cell, which resolves to nothing and
  // must not count towards the answer set — otherwise "A, E" with an empty
  // column E would read as a two-answer question with one real answer.
  const unique = (parts: (string | null)[]) => [
    ...new Map(
      parts
        .filter((p): p is string => p !== null && p.trim() !== "")
        .map((p) => [normalize(p), p]),
    ).values(),
  ];

  const isLetter = (part: string) => {
    const index = letterIndex(part);
    return index !== null && index < rawChoices.length;
  };

  const explicit = cell.split(/\s*[|;]\s*/).filter((part) => part.trim() !== "");
  if (explicit.length > 1) {
    return { answers: unique(explicit.map(resolve)), byLetter: explicit.every(isLetter) };
  }

  const commaParts = cell.split(/\s*,\s*/).filter((part) => part.trim() !== "");
  if (commaParts.length > 1) {
    const allResolvable = commaParts.every(
      (part) => isLetter(part) || rawChoices.some((choice) => normalize(choice) === normalize(part)),
    );
    if (allResolvable) {
      return { answers: unique(commaParts.map(resolve)), byLetter: commaParts.every(isLetter) };
    }
  }

  const single = resolve(cell);
  return { answers: single === null ? [] : [single], byLetter: isLetter(cell) };
}

export function buildRows(sheet: SheetData, mapping: ColumnMapping): ParsedRow[] {
  const seen = new Map<string, number>();
  const firstDataRowNumber = sheet.headerRowIndex + 2; // 1-based, header excluded

  return sheet.rows.map((row, i) => {
    const rowNumber = firstDataRowNumber + i;
    const issues: string[] = [];

    const questionText = mapping.question === null ? "" : (row[mapping.question] ?? "").trim();
    // Positional, so a letter key still lines up when a choice cell is blank.
    const choiceCells = mapping.choices.map((index) => (row[index] ?? "").trim());
    const rawChoices = choiceCells.filter(Boolean);
    const keyCell = mapping.correctAnswer === null ? "" : (row[mapping.correctAnswer] ?? "").trim();

    const { answers: parsedAnswers, byLetter } = parseAnswerKey(keyCell, choiceCells);

    // Sheets that encode a multi answer as "A; B; C" usually repeat that whole
    // joined string as one of the choice cells. Split into its parts it is the
    // correct set, so leaving it in the list would offer the answer twice —
    // once as the options to find, once as a single giveaway option.
    const correctKeys = new Set([...parsedAnswers.map(normalize), normalize(keyCell)]);
    const multiDistractors = rawChoices.filter((choice) => !correctKeys.has(normalize(choice)));

    // Splitting the key is only an improvement if the sheet also supplies
    // something wrong to choose. Where it does not, every option would be
    // correct. A key written out in full can still fall back to its own text
    // as a single answer, which is how such a row imported before. A key
    // written as letters cannot: "A, B, C, D" is not an answer, so the row
    // has to be fixed in the sheet rather than quietly imported as nonsense.
    const degraded = parsedAnswers.length > 1 && multiDistractors.length === 0;
    const unsalvageable = degraded && byLetter;
    const answerMode: AnswerMode = parsedAnswers.length > 1 && !degraded ? "multi" : "single";
    const correctAnswers = unsalvageable ? [] : degraded ? [keyCell] : parsedAnswers;
    const correctAnswer = summarizeAnswers(correctAnswers);

    if (!questionText) issues.push("Question is blank");
    if (unsalvageable) {
      issues.push("Every choice is keyed correct — add a wrong answer to make it select-all");
    } else if (correctAnswers.length === 0) {
      issues.push("Correct answer is blank");
    }

    const distractors =
      answerMode === "multi"
        ? multiDistractors
        : rawChoices.filter((choice) => normalize(choice) !== normalize(correctAnswer));
    const hasImportedChoices = distractors.length > 0;

    if (degraded && !unsalvageable) {
      issues.push("Several answers keyed but no wrong ones — imported as a single answer");
    }
    if (rawChoices.length > 0 && !hasImportedChoices && correctAnswers.length > 0) {
      issues.push("Every imported choice matches the correct answer");
    }
    if (!hasImportedChoices && correctAnswers.length > 0) {
      issues.push("No wrong choices — distractors will be generated");
    }
    // A stem promising several answers next to a one-answer key is the shape
    // a miskeyed select-all import takes, and it grades as wrong every time.
    if (answerMode === "single" && !degraded && SELECT_ALL.test(questionText)) {
      issues.push("Stem asks for several answers but only one is keyed");
    }
    if (mapping.topic !== null && !(row[mapping.topic] ?? "").trim()) {
      issues.push("Missing topic");
    }

    const key = normalize(questionText);
    let duplicateOf: number | null = null;
    if (key && seen.has(key)) duplicateOf = seen.get(key)!;
    else if (key) seen.set(key, rowNumber);

    return {
      rowNumber,
      questionText,
      correctAnswer,
      correctAnswers,
      answerMode,
      distractors,
      explanation: mapping.explanation === null ? "" : (row[mapping.explanation] ?? "").trim(),
      topic: mapping.topic === null ? "" : (row[mapping.topic] ?? "").trim(),
      // Multi-select cannot fall back to generated distractors, but a row that
      // would have none has already degraded to single above, so a question
      // and an answer are all a row needs — as before.
      valid: Boolean(questionText) && correctAnswers.length > 0,
      issues,
      duplicateOf,
      hasImportedChoices,
    };
  });
}

export function summarize(rows: readonly ParsedRow[]): ImportSummary {
  const valid = rows.filter((row) => row.valid);
  return {
    totalRows: rows.length,
    valid: valid.length,
    invalid: rows.length - valid.length,
    withImportedChoices: valid.filter((row) => row.hasImportedChoices).length,
    needGeneratedDistractors: valid.filter((row) => !row.hasImportedChoices).length,
    duplicates: rows.filter((row) => row.duplicateOf !== null).length,
    multiSelect: valid.filter((row) => row.answerMode === "multi").length,
  };
}
