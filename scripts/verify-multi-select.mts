import { readWorkbook, detectColumns, buildRows, summarize } from "@/lib/spreadsheet";
import { isAnswerCorrect, toggleSelection, summarizeAnswers, optionState } from "@/lib/grading";
import { generateChoices, maxAvailableChoices } from "@/lib/distractors";
import type { StudyQuestion } from "@/lib/types";

let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) { pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (extra ? "  — " + extra : "")); }
};

const csv = (rows: string[][]) =>
  new TextEncoder().encode(rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\r\n")).buffer;

const parse = (rows: string[][]) => {
  const sheet = readWorkbook(csv(rows));
  return { rows: buildRows(sheet, detectColumns(sheet)), sheet };
};

console.log("\n== importer: answer-key shapes ==");
const H = ["Question", "Choice A", "Choice B", "Choice C", "Choice D", "Correct Answer"];

let r = parse([H, ["Q1", "Filtration", "Chlorination", "Boiling", "Freezing", "A, B"]]).rows[0];
ok("letters 'A, B' -> two answers", r.answerMode === "multi" && r.correctAnswers.length === 2, JSON.stringify(r.correctAnswers));
ok("letters resolve to choice text", r.correctAnswers.join("|") === "Filtration|Chlorination", r.correctAnswers.join("|"));
ok("summary reads naturally", r.correctAnswer === "Filtration and Chlorination", r.correctAnswer);
ok("correct answers excluded from distractors", r.distractors.join("|") === "Boiling|Freezing", r.distractors.join("|"));

r = parse([H, ["Q2", "Filtration", "Chlorination", "Boiling", "Freezing", "Filtration|Chlorination"]]).rows[0];
ok("pipe-separated text -> multi", r.answerMode === "multi" && r.correctAnswers.length === 2);

r = parse([H, ["Q3", "Filtration", "Chlorination", "Boiling", "Freezing", "B"]]).rows[0];
ok("single letter stays single", r.answerMode === "single" && r.correctAnswer === "Chlorination", r.correctAnswer);

// The comma-splitting guard: prose answers must survive intact.
r = parse([H, ["Q4", "Water availability, wildfires and heat", "Snow", "Rain", "Fog", "Water availability, wildfires and heat"]]).rows[0];
ok("prose answer with commas is NOT split", r.answerMode === "single" && r.correctAnswers.length === 1, JSON.stringify(r.correctAnswers));

r = parse([H, ["Q5", "Alpha", "Beta", "Gamma", "Delta", "Alpha, Gamma"]]).rows[0];
ok("comma splits when every part is a real choice", r.answerMode === "multi" && r.correctAnswers.join("|") === "Alpha|Gamma", r.correctAnswers.join("|"));

console.log("\n== importer: validation ==");
r = parse([H, ["Select all that apply: which are fungi?", "Yeast", "Mould", "Virus", "Bacterium", "A"]]).rows[0];
ok("select-all stem with one key is flagged", r.issues.some(i => /only one is keyed/.test(i)), r.issues.join("; "));

// Nothing wrong to pick means every option would be correct, so the row keeps
// the single-answer shape it had before rather than being dropped.
r = parse([["Question", "Correct Answer"], ["Q6", "Alpha|Beta"]]).rows[0];
ok("multi with no wrong answers degrades to single", r.answerMode === "single" && r.valid, JSON.stringify(r.issues));
ok("degraded row keeps the key intact", r.correctAnswer === "Alpha|Beta", r.correctAnswer);
ok("degraded row explains itself", r.issues.some(i => /imported as a single answer/.test(i)));

const s = summarize(parse([H,
  ["Q7", "Filtration", "Chlorination", "Boiling", "Freezing", "A, B"],
  ["Q8", "Filtration", "Chlorination", "Boiling", "Freezing", "C"],
]).rows);
ok("summary counts multi-select rows", s.multiSelect === 1 && s.valid === 2, JSON.stringify(s));

// Letters are positional, so a blank column must not become a phantom answer.
r = parse([H, ["Q11", "Filtration", "Chlorination", "", "Freezing", "A, C"]]).rows[0];
ok("letter pointing at a blank cell is dropped", r.answerMode === "single" && r.correctAnswers.join("|") === "Filtration", JSON.stringify(r.correctAnswers));

console.log("\n== grading ==");
const choices = [
  { text: "Filtration", isCorrect: true },
  { text: "Chlorination", isCorrect: true },
  { text: "Boiling", isCorrect: false },
];
ok("exact set is correct", isAnswerCorrect(choices, ["Filtration", "Chlorination"]));
ok("order does not matter", isAnswerCorrect(choices, ["Chlorination", "Filtration"]));
ok("partial set is wrong", !isAnswerCorrect(choices, ["Filtration"]));
ok("superset is wrong", !isAnswerCorrect(choices, ["Filtration", "Chlorination", "Boiling"]));
ok("empty is wrong", !isAnswerCorrect(choices, []));
ok("single-answer case still works", isAnswerCorrect([{ text: "X", isCorrect: true }, { text: "Y", isCorrect: false }], ["X"]));

console.log("\n== selection + option states ==");
ok("multi toggles on", toggleSelection([], "A", true).join() === "A");
ok("multi toggles off", toggleSelection(["A", "B"], "A", true).join() === "B");
ok("single replaces", toggleSelection(["A"], "B", false).join() === "B");
ok("missed option shown after reveal", optionState(choices[1], ["Filtration"], true) === "missed");
ok("wrong pick shown after reveal", optionState(choices[2], ["Boiling"], true) === "incorrect");
ok("nothing revealed before submit", optionState(choices[1], ["Filtration"], false) === "idle");
ok("summarize joins readably", summarizeAnswers(["A", "B", "C"]) === "A, B and C", summarizeAnswers(["A","B","C"]));

console.log("\n== choice generation ==");
const mk = (over: Partial<StudyQuestion>): StudyQuestion => ({
  id: "q", deck_id: "d", question_text: "?", correct_answer: "", answer_mode: "single",
  explanation: null, topic: null, image_url: null, position: 0,
  created_at: "", updated_at: "", choices: [], progress: null, ...over,
} as StudyQuestion);

const multiQ = mk({
  answer_mode: "multi", correct_answer: "Filtration and Chlorination",
  choices: [
    { answer_text: "Filtration", is_correct: true },
    { answer_text: "Chlorination", is_correct: true },
    { answer_text: "Boiling", is_correct: false },
    { answer_text: "Freezing", is_correct: false },
    { answer_text: "Stirring", is_correct: false },
  ],
});
const other = mk({ id: "o", correct_answer: "Something borrowed" });
const built = generateChoices(multiQ, [multiQ, other]);
ok("multi keeps every stored option", built.length === 5, String(built.length));
ok("multi keeps both correct options", built.filter(c => c.isCorrect).length === 2);
ok("multi borrows nothing from the deck", !built.some(c => c.text === "Something borrowed"));
ok("maxAvailableChoices reports the real count", maxAvailableChoices(multiQ, [multiQ, other]) === 5, String(maxAvailableChoices(multiQ, [multiQ, other])));

const singleQ = mk({ correct_answer: "Right", choices: [] });
const singleBuilt = generateChoices(singleQ, [singleQ, other]);
ok("single mode still generates distractors", singleBuilt.length > 1 && singleBuilt.some(c => c.text === "Something borrowed"));
ok("single mode has exactly one correct", singleBuilt.filter(c => c.isCorrect).length === 1);

console.log("\n== joined-key giveaway ==");
// Sheets that write "A; B" in the key often repeat that exact string as a
// choice. It must not survive as a distractor.
r = parse([H, ["Q9", "Viruses; Bacteria", "Fungi", "Prions", "Algae", "Viruses; Bacteria"]]).rows[0];
ok("joined key is not offered as a distractor", !r.distractors.some(d => d.includes(";")), JSON.stringify(r.distractors));
ok("joined key still splits into correct answers", r.correctAnswers.join("|") === "Viruses|Bacteria", r.correctAnswers.join("|"));
ok("remaining wrong answers are kept", r.distractors.join("|") === "Fungi|Prions|Algae", r.distractors.join("|"));

// Every choice being correct leaves nothing to get wrong: degrade, don't drop.
r = parse([H, ["Q10", "Viruses; Bacteria; Parasites", "", "", "", "Viruses; Bacteria; Parasites"]]).rows[0];
ok("all-correct question still imports", r.valid && r.answerMode === "single", JSON.stringify(r.issues));
ok("all-correct question is explained", r.issues.some(i => /imported as a single answer/.test(i)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
