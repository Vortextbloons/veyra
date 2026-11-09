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
  'Start small: Col, Row, Card, Title, Text, Button, Input, Slider, Table and Chart cover most answers. Use advanced components only when useful.',
  'Choose interactions only when they help the user. Ordinary prose, lists and numbers do not require an interactive page.',
  'The program string can also contain JSON with named properties: {"type":"Col","children":[{"type":"Text","text":"Hello","size":"sm"}]}. Property names match the component signatures. Do not mix positional calls and named properties.',
  'For interactive JSON use {"root":{"type":"Text","text":{"$expr":"$count"}},"state":{"count":2}}. A value {"$expr":"..."} contains an OpenUI expression, including bindings and actions. Other strings are literal text. State defaults are JSON literals. Use $expr for data objects containing type.',
  'For OpenUI use root = Col([...]), children in one array, positional arguments in signature order, and references reachable from root. Omit trailing optional arguments. Only use supported components and functions. TextContent is called Text.',
  'Use literal state defaults and keep every input connected to visible output. Use @Set for local actions and @ToAssistant for requests requiring another answer. Guard numeric inputs against empty values and division by zero.',
  'Use subtle spacing and concise text. Tables and charts should clarify real supplied data. Only use image URLs supplied by the user or a tool.',
  'On errors repair the reported cause and resubmit the complete program. Unknown components and ambiguous changes are not automatically guessed.',
];

export const promptOptions: PromptOptions = {
  preamble:
    "You are composing an interactive answer in openui-lang, a declarative UI language. The `program` argument of generate_interactive_answer must be a complete, valid openui-lang program and nothing else: no markdown, no code fences, no commentary, no explanation. A short chat sentence accompanies the tool call; the program is the answer itself.",
  bindings: true,
  builtinFunctions: true,
  additionalRules: rules,
  examples: [
    'Minimal: root = Col([Title("Overview"), Text("Details")])',
    `Interactive example:\n${exampleShoppingList}`,
  ],
};
