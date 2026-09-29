"use client";

import { useMemo, useRef, useState, useTransition } from "react";

import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Field,
  Input,
  Select,
  Stat,
  Textarea,
  cn,
} from "@/components/ui";
import { importQuestions, type ImportQuestion, type ImportTarget } from "@/lib/actions/import";
import {
  buildRows,
  detectColumns,
  readWorkbook,
  summarize,
  type ColumnMapping,
  type ParsedRow,
  type SheetData,
} from "@/lib/spreadsheet";
import type { Course, Deck } from "@/lib/types";

type DeckWithCourse = Deck & { course: Course | null };

type SingleRole = "question" | "correctAnswer" | "explanation" | "topic";

const SINGLE_ROLES: { key: SingleRole; label: string }[] = [
  { key: "question", label: "Question" },
  { key: "correctAnswer", label: "Correct answer" },
  { key: "explanation", label: "Explanation" },
  { key: "topic", label: "Topic" },
];

const STEPS = ["Upload", "Map columns", "Preview"];

const NEW_COURSE = "__new__";

/** Issues from the parser that actually make a row unimportable. */
const BLOCKING_ISSUES = new Set(["Question is blank", "Correct answer is blank"]);

const headerLabel = (headers: string[], index: number) => headers[index]?.trim() || `Column ${index + 1}`;

export function Importer({ courses, decks }: { courses: Course[]; decks: DeckWithCourse[] }) {
  const bufferRef = useRef<ArrayBuffer | null>(null);

  const [step, setStep] = useState(1);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  const [sheet, setSheet] = useState<SheetData | null>(null);
  const [autoMapping, setAutoMapping] = useState<ColumnMapping | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);

  const [duplicateMode, setDuplicateMode] = useState<"both" | "skip">("both");

  const [destination, setDestination] = useState<"existing" | "new">(
    decks.length > 0 ? "existing" : "new",
  );
  const [deckId, setDeckId] = useState(decks[0]?.id ?? "");
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [courseChoice, setCourseChoice] = useState(courses[0]?.id ?? NEW_COURSE);
  const [newCourseName, setNewCourseName] = useState("");
  const [deckName, setDeckName] = useState("");
  const [deckDescription, setDeckDescription] = useState("");

  const [pending, startTransition] = useTransition();
  const [importError, setImportError] = useState<string | null>(null);
  const [result, setResult] = useState<{ deckId: string; inserted: number } | null>(null);

  const rows = useMemo(() => (sheet && mapping ? buildRows(sheet, mapping) : []), [sheet, mapping]);
  const summary = useMemo(() => summarize(rows), [rows]);

  const selectedRows = useMemo(
    () => rows.filter((row) => row.valid && (duplicateMode === "both" || row.duplicateOf === null)),
    [rows, duplicateMode],
  );

  const invalidRows = useMemo(() => rows.filter((row) => !row.valid).slice(0, 10), [rows]);
  const duplicateRows = useMemo(() => rows.filter((row) => row.duplicateOf !== null), [rows]);

  const detected = useMemo(() => {
    if (!sheet || !mapping) return [];
    const entries: { header: string; role: string; auto: boolean }[] = [];
    const push = (index: number | null, role: string, autoIndex: number | null | undefined) => {
      if (index === null) return;
      entries.push({ header: headerLabel(sheet.headers, index), role, auto: autoIndex === index });
    };
    push(mapping.question, "Question", autoMapping?.question);
    push(mapping.correctAnswer, "Correct answer", autoMapping?.correctAnswer);
    mapping.choices.forEach((index, i) => {
      entries.push({
        header: headerLabel(sheet.headers, index),
        role: `Answer choice ${i + 1}`,
        auto: autoMapping?.choices.includes(index) ?? false,
      });
    });
    push(mapping.explanation, "Explanation", autoMapping?.explanation);
    push(mapping.topic, "Topic", autoMapping?.topic);
    return entries;
  }, [sheet, mapping, autoMapping]);

  function loadWorkbook(buffer: ArrayBuffer, sheetName?: string) {
    const data = readWorkbook(buffer, sheetName);
    const auto = detectColumns(data);
    setSheet(data);
    setAutoMapping(auto);
    setMapping(auto);
    setParseError(null);
    setResult(null);
    setImportError(null);
  }

  async function handleFile(file: File) {
    setFileName(file.name);
    try {
      const buffer = await file.arrayBuffer();
      bufferRef.current = buffer;
      loadWorkbook(buffer);
    } catch (error) {
      setSheet(null);
      setMapping(null);
      setAutoMapping(null);
      setParseError(error instanceof Error ? error.message : "That file could not be read.");
    }
  }

  function handleSheetChange(sheetName: string) {
    const buffer = bufferRef.current;
    if (!buffer) return;
    try {
      loadWorkbook(buffer, sheetName);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "That sheet could not be read.");
    }
  }

  function setSingle(key: SingleRole, value: number | null) {
    setMapping((previous) => (previous ? { ...previous, [key]: value } : previous));
  }

  function toggleChoice(index: number) {
    setMapping((previous) => {
      if (!previous) return previous;
      const choices = previous.choices.includes(index)
        ? previous.choices.filter((i) => i !== index)
        : [...previous.choices, index].sort((a, b) => a - b);
      return { ...previous, choices };
    });
  }

  const target: ImportTarget | null = useMemo(() => {
    if (destination === "existing") return deckId ? { kind: "existing", deckId } : null;
    const name = deckName.trim();
    const description = deckDescription.trim() || null;
    if (!name) return null;
    if (courseChoice === NEW_COURSE) {
      return newCourseName.trim()
        ? { kind: "new-course", courseName: newCourseName.trim(), deckName: name, deckDescription: description }
        : null;
    }
    return { kind: "new", courseId: courseChoice, deckName: name, deckDescription: description };
  }, [destination, deckId, deckName, deckDescription, courseChoice, newCourseName]);

  function runImport() {
    if (!target || selectedRows.length === 0) return;
    const questions: ImportQuestion[] = selectedRows.map((row) => ({
      questionText: row.questionText,
      correctAnswer: row.correctAnswer,
      distractors: row.distractors,
      explanation: row.explanation || null,
      topic: row.topic || null,
    }));
    setImportError(null);
    startTransition(async () => {
      try {
        const outcome = await importQuestions(target, questions, {
          replaceExisting: destination === "existing" && replaceExisting,
        });
        setResult(outcome);
      } catch (error) {
        setImportError(error instanceof Error ? error.message : "The import failed. Please try again.");
      }
    });
  }

  if (result) {
    return (
      <Card className="tint-success space-y-4">
        <div>
          <p className="text-lg font-medium">Imported {result.inserted} questions</p>
          <p className="mt-1 text-sm text-muted">The deck is ready to study.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/decks/${result.deckId}`} variant="secondary">
            Open deck
          </ButtonLink>
          <ButtonLink href={`/decks/${result.deckId}/learn`}>Start Learn</ButtonLink>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" aria-label="Import steps">
        {STEPS.map((name, index) => {
          const number = index + 1;
          return (
            <li key={name} className="flex items-center gap-2">
              {index > 0 ? <span className="text-muted">·</span> : null}
              <span
                className={cn(
                  "flex items-center gap-1.5",
                  number === step ? "font-medium text-ink" : "text-muted",
                )}
                aria-current={number === step ? "step" : undefined}
              >
                <span
                  className={cn(
                    "flex size-5 items-center justify-center rounded-full text-xs tabular-nums",
                    number === step ? "bg-accent text-accent-fg" : "bg-sunken text-muted",
                  )}
                >
                  {number}
                </span>
                {name}
              </span>
            </li>
          );
        })}
      </ol>

      {step === 1 ? (
        <div className="space-y-4">
          <label
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files[0];
              if (file) void handleFile(file);
            }}
            className={cn(
              "block rounded-2xl border-2 border-dashed border-line-strong bg-surface p-10 text-center",
              "cursor-pointer transition-colors duration-150 hover:bg-surface-2",
              dragging && "tint-accent",
            )}
          >
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
            <span className="block font-medium">Drop a .csv or .xlsx file, or click to choose</span>
            <span className="mt-1 block text-sm text-muted">
              Nothing is uploaded until you confirm the import.
            </span>
          </label>

          {fileName ? (
            <p className="text-sm">
              <span className="text-muted">Selected file: </span>
              <span className="font-medium">{fileName}</span>
            </p>
          ) : null}

          {parseError ? (
            <div role="alert" className="tint-danger rounded-2xl border p-4 text-sm text-danger">
              {parseError}
            </div>
          ) : null}

          {sheet && sheet.sheetNames.length > 1 ? (
            <Field label="Sheet" hint="This workbook has more than one sheet.">
              <Select value={sheet.sheetName} onChange={(event) => handleSheetChange(event.target.value)}>
                {sheet.sheetNames.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          <p className="text-sm text-muted">
            Two layouts are recognised. The full layout is{" "}
            <span className="text-ink">Question | Choice A–D | Correct Answer | Explanation | Topic</span>,
            which keeps your own answer choices. The minimal layout is{" "}
            <span className="text-ink">Question | Answer</span>, where wrong choices are generated
            automatically from the other answers in the deck. Extra columns are ignored and you can change
            any column in the next step.
          </p>

          <Button onClick={() => setStep(2)} disabled={!sheet || !mapping}>
            Continue
          </Button>
        </div>
      ) : null}

      {step === 2 && sheet && mapping ? (
        <div className="space-y-6">
          <Card className="space-y-4">
            <h2 className="font-medium">Detected columns</h2>
            {detected.length === 0 ? (
              <p className="text-sm text-muted">No columns are mapped yet.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {detected.map((entry) => (
                  <li key={`${entry.role}-${entry.header}`} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{entry.header}</span>
                    <span className="text-muted" aria-hidden="true">
                      →
                    </span>
                    <span className="text-muted">{entry.role}</span>
                    {entry.auto ? <Badge tone="success">auto</Badge> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="space-y-4">
            <h2 className="font-medium">Change the mapping</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {SINGLE_ROLES.map(({ key, label }) => (
                <Field key={key} label={label}>
                  <Select
                    value={mapping[key] === null ? "" : String(mapping[key])}
                    onChange={(event) =>
                      setSingle(key, event.target.value === "" ? null : Number(event.target.value))
                    }
                  >
                    <option value="">— none —</option>
                    {sheet.headers.map((_, index) => (
                      <option key={index} value={index}>
                        {headerLabel(sheet.headers, index)}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Answer choice columns</legend>
              <p className="text-xs text-muted">
                Pick every column that holds an answer option. Leave all of them off to generate wrong
                choices automatically.
              </p>
              <div className="flex flex-wrap gap-2">
                {sheet.headers.map((_, index) => {
                  const active = mapping.choices.includes(index);
                  return (
                    <button
                      key={index}
                      type="button"
                      aria-pressed={active}
                      onClick={() => toggleChoice(index)}
                      className={cn(
                        "min-h-11 rounded-xl border px-3 py-2 text-sm transition-colors duration-150",
                        active ? "tint-accent text-ink" : "border-line-strong bg-surface text-muted hover:bg-surface-2",
                      )}
                    >
                      {headerLabel(sheet.headers, index)}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </Card>

          {mapping.question === null ? (
            <div role="alert" className="tint-danger rounded-2xl border p-4 text-sm text-danger">
              Unable to detect a Question column. Please select which column contains the question text.
            </div>
          ) : null}

          <Card className="space-y-3">
            <h2 className="font-medium">First rows</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {sheet.headers.map((_, index) => (
                      <th
                        key={index}
                        scope="col"
                        className="max-w-48 truncate border-b border-line px-2 py-2 font-medium"
                      >
                        {headerLabel(sheet.headers, index)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sheet.rows.slice(0, 5).map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {sheet.headers.map((_, index) => (
                        <td key={index} className="max-w-48 truncate border-b border-line px-2 py-2 text-muted">
                          {row[index]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={() => setStep(3)} disabled={mapping.question === null}>
              Continue
            </Button>
          </div>
        </div>
      ) : null}

      {step === 3 && sheet && mapping ? (
        <div className="space-y-6">
          <Card className="space-y-4">
            <h2 className="font-medium">Import preview</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat value={summary.totalRows} label="questions detected" />
              <Stat value={summary.withImportedChoices} label="have complete answer choices" tone="success" />
              <Stat value={summary.needGeneratedDistractors} label="require automatic distractors" tone="accent" />
              {summary.invalid > 0 ? (
                <div>
                  <p className="text-xl font-semibold tabular-nums text-danger">{summary.invalid}</p>
                  <p className="text-xs text-muted">rows contain missing answers</p>
                </div>
              ) : (
                <Stat value={0} label="rows contain missing answers" tone="muted" />
              )}
            </div>
          </Card>

          {invalidRows.length > 0 ? (
            <div className="tint-danger space-y-2 rounded-2xl border p-4 text-sm">
              <p className="font-medium text-danger">These rows will be skipped</p>
              <ul className="space-y-1 text-muted">
                {invalidRows.map((row) => (
                  <li key={row.rowNumber}>
                    Row {row.rowNumber}: {blockingIssues(row).join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {duplicateRows.length > 0 ? (
            <div className="tint-accent space-y-3 rounded-2xl border p-4 text-sm">
              <p className="font-medium">Possible duplicates</p>
              <ul className="space-y-1 text-muted">
                {duplicateRows.slice(0, 10).map((row) => (
                  <li key={row.rowNumber} className="truncate">
                    Row {row.rowNumber} duplicates row {row.duplicateOf}: {row.questionText}
                  </li>
                ))}
              </ul>
              <fieldset className="space-y-1.5">
                <legend className="sr-only">How to handle duplicates</legend>
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    name="duplicates"
                    className="size-4 accent-accent"
                    checked={duplicateMode === "both"}
                    onChange={() => setDuplicateMode("both")}
                  />
                  <span>Import both</span>
                </label>
                <label className="flex min-h-11 items-center gap-2">
                  <input
                    type="radio"
                    name="duplicates"
                    className="size-4 accent-accent"
                    checked={duplicateMode === "skip"}
                    onChange={() => setDuplicateMode("skip")}
                  />
                  <span>Skip duplicates</span>
                </label>
              </fieldset>
            </div>
          ) : null}

          <Card className="space-y-4">
            <h2 className="font-medium">Where should these go?</h2>
            <fieldset className="space-y-1.5">
              <legend className="sr-only">Destination</legend>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="destination"
                  className="size-4 accent-accent"
                  checked={destination === "existing"}
                  onChange={() => setDestination("existing")}
                  disabled={decks.length === 0}
                />
                <span>Add to an existing deck</span>
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="destination"
                  className="size-4 accent-accent"
                  checked={destination === "new"}
                  onChange={() => setDestination("new")}
                />
                <span>Create a new deck</span>
              </label>
            </fieldset>

            {destination === "existing" ? (
              decks.length === 0 ? (
                <p className="text-sm text-muted">There are no decks yet — create a new one instead.</p>
              ) : (
                <div className="space-y-3">
                  <Field label="Deck">
                    <Select value={deckId} onChange={(event) => setDeckId(event.target.value)}>
                      {decks.map((deck) => (
                        <option key={deck.id} value={deck.id}>
                          {deck.course ? `${deck.course.name} · ${deck.name}` : deck.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <label className="flex min-h-11 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4 accent-accent"
                      checked={replaceExisting}
                      onChange={(event) => setReplaceExisting(event.target.checked)}
                    />
                    <span>Replace the questions already in this deck</span>
                  </label>
                  {replaceExisting ? (
                    <p className="text-xs text-danger">
                      Every question currently in this deck will be deleted, along with the progress recorded
                      against it.
                    </p>
                  ) : null}
                </div>
              )
            ) : (
              <div className="space-y-3">
                <Field label="Course">
                  <Select value={courseChoice} onChange={(event) => setCourseChoice(event.target.value)}>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.name}
                      </option>
                    ))}
                    <option value={NEW_COURSE}>+ New course</option>
                  </Select>
                </Field>
                {courseChoice === NEW_COURSE ? (
                  <Field label="New course name">
                    <Input
                      value={newCourseName}
                      onChange={(event) => setNewCourseName(event.target.value)}
                      placeholder="e.g. Biology 101"
                    />
                  </Field>
                ) : null}
                <Field label="Deck name">
                  <Input
                    value={deckName}
                    onChange={(event) => setDeckName(event.target.value)}
                    placeholder="Lecture 4 — Microbial growth"
                    required
                  />
                </Field>
                <Field label="Deck description" hint="Optional.">
                  <Textarea
                    value={deckDescription}
                    onChange={(event) => setDeckDescription(event.target.value)}
                  />
                </Field>
              </div>
            )}
          </Card>

          {importError ? (
            <div role="alert" className="tint-danger rounded-2xl border p-4 text-sm text-danger">
              {importError}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button
              size="lg"
              onClick={runImport}
              disabled={summary.valid === 0 || !target || pending}
            >
              {pending ? "Importing…" : `Import ${selectedRows.length} questions`}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function blockingIssues(row: ParsedRow): string[] {
  const blocking = row.issues.filter((issue) => BLOCKING_ISSUES.has(issue));
  return blocking.length > 0 ? blocking : row.issues;
}
