import type { PromptOptions } from "@openuidev/react-lang";

/**
 * The program the model writes for `generate_interactive_answer` is an
 * OpenUI Lang document rendered inside Veyra's chat. These options are the
 * instruction half of that contract: they are compiled together with the
 * component library into the system prompt (see `library.ts`).
 */

export const exampleShoppingList = `root = Col([head, stepper, list, copy])
$guests = 4
$got = []
head = Col([Title("Pasta night for " + @Plural($guests, "guest"), "xl"), Text("Every quantity follows the guest count. Tick what you already have.", "sm", "muted")], 1)
stepper = Row([IconButton("minus", @Set($guests, @Clamp($guests - 1, 1, 20)), "Fewer guests"), Text($guests + "", "lg", null, "semibold"), IconButton("plus", @Set($guests, @Clamp($guests + 1, 1, 20)), "More guests")], 3)
lines = @Each(base, "i", {name: i.name, qty: @Round(i.qty * $guests / 4) + i.unit})
list = Col(@Each(lines, "l", Pressable([Row([Icon(@Includes($got, l.name) ? "check-circle" : "circle", "sm"), Text(l.qty + " " + l.name, "sm", null, null, false, @Includes($got, l.name))], 2)], @Set($got, @Toggle($got, l.name)), @Includes($got, l.name), 2)), 1)
copy = Button("Copy shopping list", @CopyToClipboard(@Join(lines, "\\n", "qty")), "outline", null, "sm", "copy")
base = [{name: "spaghetti", qty: 400, unit: " g"}, {name: "tomatoes", qty: 6, unit: ""}, {name: "parmesan", qty: 80, unit: " g"}]`;

export const exampleComparison = `root = Col([head, facts, tableCard, chartCard, form])
$priority = "Cost"
head = Col([Title("Three e-bikes under $3,000", "xl"), Text("Range, weight and service, side by side.", "sm", "muted")], 1)
facts = Row([Badge("Under $3,000", "success"), Badge("Class 1 and 3", "info"), Badge("Test-ride first", "warning")], 2, null, null, true)
tableCard = Card([Title("Side by side", "md"), Table(["Model", "Price", "Range", "Weight"], @Each(bikes, "b", [b.model, @Format(b.price, "currency", 0), b.range + " mi", b.weight + " kg"]))], "outline")
chartCard = Card([Title("Range per charge", "md"), Chart("bar", @Each(bikes, "b", {model: b.model, range: b.range}), "model", ["range"])], "outline")
form = Card([Title("What matters most?", "sm"), Form([RadioGroup($priority, ["Cost", "Range", "Weight"], "Priority", "pills"), Button("Shortlist for me", @ToAssistant("Shortlist these e-bikes for me"))])], "soft")
bikes = [{model: "Aventon Level 2", price: 1799, range: 60, weight: 24}, {model: "Ride1Up Turris", price: 1595, range: 50, weight: 25}, {model: "RadCity 5", price: 1999, range: 45, weight: 29}]`;

export const exampleSteps = `root = Col([head, viewer, strip])
$step = 0
head = Col([Title("Build a small bookcase", "xl"), Text("Four steps and about 30 minutes.", "sm", "muted")], 1)
steps = [{title: "Lay out the parts", text: "Two sides, the top, one shelf and the bottom. Tap the 12 wooden dowels into the holes on the sides."}, {title: "Fix the boards to one side", text: "Push the top, shelf and bottom onto one side's dowels, then turn each cam lock clockwise."}, {title: "Add the other side", text: "Fit the second side onto the free dowels and tighten its cam locks the same way."}, {title: "Nail on the back", text: "Lay it face down, check the corners are square, then nail the back panel every 10 cm."}]
s0 = Svg([Rect(16, 20, 22, 120, "surface", "ink", 2), Rect(48, 20, 22, 120, "surface", "ink", 2), Rect(100, 28, 120, 16, "surface", "ink", 2), Rect(100, 68, 120, 16, "surface", "ink", 2), Rect(100, 108, 120, 16, "surface", "ink", 2), Circle(27, 36, 3, "chart1"), Circle(27, 80, 3, "chart1"), SvgText("Sides", 43, 154, 11, "muted", "middle"), SvgText("Top", 160, 22, 11, "muted", "middle")], "0 0 240 170")
s1 = Svg([Rect(40, 16, 18, 128, "surface", "ink", 2), Rect(58, 16, 130, 14, "surface", "ink", 2), Rect(58, 72, 130, 14, "surface", "ink", 2), Rect(58, 130, 130, 14, "surface", "ink", 2), Circle(68, 23, 4, "chart1"), Circle(68, 79, 4, "chart1"), Circle(68, 137, 4, "chart1"), Line(212, 79, 196, 79, "chart1", 2), Polygon("192,79 200,74 200,84", "chart1"), SvgText("Cam lock", 74, 104, 11, "muted")], "0 0 240 170")
s2 = Svg([Rect(40, 16, 18, 128, "surface", "ink", 2), Rect(58, 16, 130, 14, "surface", "ink", 2), Rect(58, 72, 130, 14, "surface", "ink", 2), Rect(58, 130, 130, 14, "surface", "ink", 2), Rect(196, 16, 18, 128, "surface", "chart1", 2), Line(232, 80, 220, 80, "chart1", 2), Polygon("216,80 224,75 224,85", "chart1")], "0 0 240 170")
s3 = Svg([Rect(40, 16, 160, 128, "surface", "ink", 2), Rect(40, 16, 160, 14, "surface", "ink", 2), Rect(40, 72, 160, 14, "surface", "ink", 2), Rect(40, 130, 160, 14, "surface", "ink", 2), Circle(48, 50, 2.5, "muted"), Circle(192, 50, 2.5, "muted"), Circle(48, 108, 2.5, "muted"), Circle(192, 108, 2.5, "muted"), SvgText("Back panel", 120, 56, 11, "muted", "middle")], "0 0 240 170")
drawings = [s0, s1, s2, s3]
viewer = Card([Row([Badge("Step " + ($step + 1) + " of 4", "info"), Spacer(), Caption(@Percent($step + 1, 4) + "% done")], 2), Box([drawings[$step]], null, null, 3, "surface", "lg"), Title(steps[$step].title, "md"), Text(steps[$step].text, "sm"), Row([Button("Back", @Set($step, @Clamp($step - 1, 0, 3)), "outline", null, null, "arrow-left", $step == 0), Spacer(), Button("Next step", @Set($step, @Clamp($step + 1, 0, 3)), "solid", null, null, "arrow-right", $step == 3)], 2)], null, 4, 3)
strip = Grid(@Each(@Range(0, 4), "i", Pressable([drawings[i], Caption((i + 1) + ". " + steps[i].title)], @Set($step, i), i == $step, 2)), 4, 110, 2)`;

const rules = [
  "Compose the answer like a page, not a form letter: a Title, a short Text, then a mix of blocks that show the content. Row and Grid set things side by side, Badge rows carry quick facts, Card groups a block, Popover-style asides become a Caption or a Quote.",
  "Spacing is a system with three tiers that nest: inner (gap 1-2) for a title with its subtitle or a label with its value; group (gap 3-4) between blocks inside a Card or a grid cell; section (24px) between the blocks of the page. Leave gap unset on the page's root Col and on Card contents; set a gap only on a Row or Grid. Never use one gap for everything, and never a gap larger than the section gap.",
  "A photo beside text is a media row: Row([Box([Image(src, alt, 1.33)]), Col([Title(..., \"md\"), Row([Badge(...), Badge(...)], 1, null, null, true), Text(..., \"sm\")], 2)], 4, \"start\"). Only use Image with a real http(s) URL the user or a tool supplied; never invent a URL, and never claim you cannot show an image.",
  "Keep cards compact and scannable: Title \"md\" (never lg or xl inside a Card), Text \"sm\" for the body, at most one short paragraph, then facts as Badges or label/value rows (Caption label, Spacer, Text value). Cards side by side in a Grid share the same blocks in the same order, so they line up.",
  "Answer with a working tool whenever the request involves numbers, choices, lists, steps or something to explore: keep inputs and lists in $variables, compute everything shown from them with expressions and @functions, and change them with @Set. The page must work on its own, without another message.",
  "Use @ToAssistant only for what the page cannot compute: a Form's submit Button, or a new request (\"Plan another day\"). Its message is short and first person, like the user typing it; the form values travel with it, so never repeat them in the message.",
  "$variable defaults are literals (numbers, strings, lists, objects), never expressions or @calls. Edit lists with @Append, @Remove, @RemoveAt and @Update; track selections with @Toggle and @Includes.",
  "cond ? a : b also picks between components; there is no @If. Use only the listed @functions; you cannot define your own.",
  "Derive rows once in a statement with @Each(list, \"x\", {...}), then reuse them in @Each, Table, Chart, @Sum(rows.field) and @Join. @Each(@Range(0, n), \"i\", ...) builds a series or repeats a step.",
  "@Random and @Shuffle give a new value on every evaluation: call them inside @Set, so a click draws once and the page stays still.",
  "Pick the medium that shows the idea: Chart for numbers across time or categories; Svg drawings for shapes, parts and movement; Table for comparisons; Progress for a single share of a whole; Markdown for prose that needs headings or tables.",
  "Draw with Svg whenever the user would otherwise have to picture it: assembly and how-to steps, knots and folds, how a machine, mechanism or the body works, geometry and science diagrams, the layout of a room, garden or board, chord and clock faces. Keep each drawing simple: a viewBox about 240 wide, a dozen or so shapes in the listed colors with SvgText labels, a Line with a small Polygon head for an arrow, and let $variables such as the current step drive it.",
  "Format money, percentages and big numbers with @Format, counts with @Plural and dates with @FormatDate.",
  "Dates relative to now (today, this week, next month) start from @Today(), never a fixed date. <, >, <= and >= compare numbers only, so order two dates with @DaysBetween(a, b) > 0.",
  "Read a number input for a count or amount through @Default and @Clamp with a sensible minimum, e.g. @Clamp(@Default($people, 1), 1, 50), so 0, empty or negative cannot divide by zero or zero out the page.",
  "Every input changes something visible, and every statement except root is referenced from root. Keep the program to the answer at hand: about 40 statements is plenty, and anything unreferenced is dropped.",
  "A plain knowledge or safety question does not need a program: answer it in chat instead of calling this tool.",
];

export const promptOptions: PromptOptions = {
  preamble:
    "You are composing an interactive answer in openui-lang, a declarative UI language. The `program` argument of generate_interactive_answer must be a complete, valid openui-lang program and nothing else: no markdown, no code fences, no commentary, no explanation. A short chat sentence accompanies the tool call; the program is the answer itself.",
  bindings: true,
  builtinFunctions: true,
  additionalRules: rules,
  examples: [
    `Example 1: A shopping list that scales with the guest count, with a checklist and a copy button:\n\n${exampleShoppingList}`,
    `Example 2: A composed comparison with a table, a chart and a form:\n\n${exampleComparison}`,
    `Example 3: Step-by-step instructions with a drawing for each step, driven by $step:\n\n${exampleSteps}`,
  ],
};
