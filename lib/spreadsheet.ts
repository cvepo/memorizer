import * as XLSX from "xlsx";

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
  correctAnswer: string;
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

export function readWorkbook(data: ArrayBuffer, sheetName?: string): SheetData {
  const workbook = XLSX.read(data, { type: "array", cellDates: true });
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

export function buildRows(sheet: SheetData, mapping: ColumnMapping): ParsedRow[] {
  const seen = new Map<string, number>();
  const firstDataRowNumber = sheet.headerRowIndex + 2; // 1-based, header excluded

  return sheet.rows.map((row, i) => {
    const rowNumber = firstDataRowNumber + i;
    const issues: string[] = [];

    const questionText = mapping.question === null ? "" : (row[mapping.question] ?? "").trim();
    const rawChoices = mapping.choices.map((index) => (row[index] ?? "").trim()).filter(Boolean);
    let correctAnswer = mapping.correctAnswer === null ? "" : (row[mapping.correctAnswer] ?? "").trim();

    // Answer keys are frequently a letter rather than the answer text.
    const asLetter = letterIndex(correctAnswer);
    if (asLetter !== null && mapping.choices.length > 0) {
      const target = (row[mapping.choices[asLetter]] ?? "").trim();
      if (target) correctAnswer = target;
    }

    if (!questionText) issues.push("Question is blank");
    if (!correctAnswer) issues.push("Correct answer is blank");

    const distractors = rawChoices.filter((choice) => normalize(choice) !== normalize(correctAnswer));
    const hasImportedChoices = distractors.length > 0;

    if (rawChoices.length > 0 && !hasImportedChoices && correctAnswer) {
      issues.push("Every imported choice matches the correct answer");
    }
    if (!hasImportedChoices && correctAnswer) {
      issues.push("No wrong choices — distractors will be generated");
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
      distractors,
      explanation: mapping.explanation === null ? "" : (row[mapping.explanation] ?? "").trim(),
      topic: mapping.topic === null ? "" : (row[mapping.topic] ?? "").trim(),
      valid: Boolean(questionText) && Boolean(correctAnswer),
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
  };
}
