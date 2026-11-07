import { defineFunction } from "@openuidev/react-lang";
import { z } from "zod/v4";

/**
 * `@`-functions available inside an interactive answer. They let a program
 * compute everything it shows from its own state, so the answer works without
 * another message. Names avoid the runtime's built-ins (@Count, @Sum, @Avg,
 * @Min, @Max, @Round, @Abs, @Floor, @Ceil, @First, @Last, @Sort, @Filter, @Each).
 */

const num = z.number();
const text = z.string();
const list = z.array(z.any());
const agg = z.enum(["sum", "avg", "count", "min", "max"]);

const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const field = (item: unknown, key: string): unknown =>
  item && typeof item === "object" ? (item as Record<string, unknown>)[key] : undefined;
const asNumber = (value: unknown): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const asText = (value: unknown): string => (value == null ? "" : String(value));

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const trimmed = value.trim();
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

const isoDay = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function aggregate(rows: unknown[], key: string, fieldKey?: string, mode = "sum"): { key: string; value: number }[] {
  const groups = new Map<string, number[]>();
  for (const row of rows) {
    const groupKey = asText(field(row, key));
    const bucket = groups.get(groupKey) ?? [];
    bucket.push(fieldKey ? asNumber(field(row, fieldKey)) : 1);
    groups.set(groupKey, bucket);
  }
  return [...groups.entries()].map(([groupKey, values]) => {
    const total = values.reduce((sum, value) => sum + value, 0);
    const value =
      mode === "count"
        ? values.length
        : mode === "avg"
          ? total / Math.max(1, values.length)
          : mode === "min"
            ? Math.min(...values)
            : mode === "max"
              ? Math.max(...values)
              : total;
    return { key: groupKey, value };
  });
}

// Lists

const listFunctions = [
  defineFunction({
    name: "Append",
    description: "Copy of the list with item added at the end",
    params: z.object({ list, item: z.any() }),
    fn: ({ list: items, item }) => [...asList(items), item],
  }),
  defineFunction({
    name: "Prepend",
    description: "Copy of the list with item added at the start",
    params: z.object({ list, item: z.any() }),
    fn: ({ list: items, item }) => [item, ...asList(items)],
  }),
  defineFunction({
    name: "Concat",
    description: "Joins two lists",
    params: z.object({ list, more: list }),
    fn: ({ list: items, more }) => [...asList(items), ...asList(more)],
  }),
  defineFunction({
    name: "Remove",
    description: 'Copy without the items whose field equals value; field "" compares the items themselves',
    params: z.object({ list, field: text, value: z.any() }),
    fn: ({ list: items, field: key, value }) =>
      asList(items).filter((item) => (key ? field(item, key) !== value : item !== value)),
  }),
  defineFunction({
    name: "RemoveAt",
    description: "Copy without the item at index (0-based; negative counts from the end)",
    params: z.object({ list, index: num }),
    fn: ({ list: items, index }) => {
      const copy = [...asList(items)];
      const position = index < 0 ? copy.length + index : index;
      copy.splice(position, 1);
      return copy;
    },
  }),
  defineFunction({
    name: "Update",
    description: "Copy where items whose field equals value get setField set to setValue",
    params: z.object({ list, field: text, value: z.any(), setField: text, setValue: z.any() }),
    fn: ({ list: items, field: key, value, setField, setValue }) =>
      asList(items).map((item) =>
        field(item, key) === value && item && typeof item === "object"
          ? { ...(item as Record<string, unknown>), [setField]: setValue }
          : item,
      ),
  }),
  defineFunction({
    name: "Toggle",
    description: "Adds item if missing, removes it if present (a set of strings or numbers)",
    params: z.object({ list, item: z.any() }),
    fn: ({ list: items, item }) => {
      const current = asList(items);
      return current.includes(item) ? current.filter((entry) => entry !== item) : [...current, item];
    },
  }),
  defineFunction({
    name: "Includes",
    description: "True if the list has item, or the text contains it",
    params: z.object({ list: z.union([list, text]), item: z.any() }),
    returns: z.boolean(),
    fn: ({ list: items, item }) =>
      typeof items === "string" ? items.includes(asText(item)) : asList(items).includes(item),
  }),
  defineFunction({
    name: "Find",
    description: "First item whose field equals value, or null",
    params: z.object({ list, field: text, value: z.any() }),
    fn: ({ list: items, field: key, value }) =>
      asList(items).find((item) => field(item, key) === value) ?? null,
  }),
  defineFunction({
    name: "IndexOf",
    description: "Index of item in the list, or -1",
    params: z.object({ list, item: z.any() }),
    fn: ({ list: items, item }) => asList(items).indexOf(item),
  }),
  defineFunction({
    name: "Take",
    description: "The first n items; a negative n takes the last n",
    params: z.object({ list, n: num }),
    fn: ({ list: items, n }) => (n < 0 ? asList(items).slice(n) : asList(items).slice(0, n)),
  }),
  defineFunction({
    name: "Slice",
    description: "Items, or characters of text, from start up to end (not included); negative counts from the end",
    params: z.object({ list: z.union([list, text]), start: num, end: num.optional() }),
    fn: ({ list: items, start, end }) =>
      typeof items === "string" ? items.slice(start, end) : asList(items).slice(start, end),
  }),
  defineFunction({
    name: "Unique",
    description: "Distinct items in first-seen order",
    params: z.object({ list }),
    fn: ({ list: items }) => [...new Set(asList(items))],
  }),
  defineFunction({
    name: "Reverse",
    description: "Copy in reverse order",
    params: z.object({ list }),
    fn: ({ list: items }) => [...asList(items)].reverse(),
  }),
  defineFunction({
    name: "Range",
    description: "Numbers from start up to end (not included) by step (default 1), e.g. @Range(0, 3) is [0, 1, 2]",
    params: z.object({ start: num, end: num, step: num.optional() }),
    fn: ({ start, end, step }) => {
      const increment = step && step !== 0 ? Math.abs(step) : 1;
      const direction = end >= start ? 1 : -1;
      const result: number[] = [];
      for (let value = start; direction > 0 ? value < end : value > end; value += increment * direction) {
        if (result.length > 5_000) break;
        result.push(value);
      }
      return result;
    },
  }),
  defineFunction({
    name: "Flatten",
    description: "One list from a list of lists, e.g. [[1, 2], [3]] is [1, 2, 3]",
    params: z.object({ list }),
    fn: ({ list: items }) => asList(items).flat(),
  }),
  defineFunction({
    name: "Chunk",
    description: "The list cut into lists of size items, e.g. for weeks of 7 days or pages",
    params: z.object({ list, size: num }),
    fn: ({ list: items, size }) => {
      const step = Math.max(1, Math.round(size));
      const source = asList(items);
      const result: unknown[][] = [];
      for (let index = 0; index < source.length; index += step) result.push(source.slice(index, index + step));
      return result;
    },
  }),
];

// Numbers

const numberFunctions = [
  defineFunction({
    name: "Pow",
    description: "base raised to exponent",
    params: z.object({ base: num, exponent: num }),
    fn: ({ base, exponent }) => {
      const value = base ** exponent;
      return Number.isFinite(value) ? value : null;
    },
  }),
  defineFunction({
    name: "Sqrt",
    description: "Square root; null for a negative number",
    params: z.object({ number: num }),
    fn: ({ number }) => (number < 0 ? null : Math.sqrt(number)),
  }),
  defineFunction({
    name: "Random",
    description: "Random number from min to max (integer true: a whole number, max included); call it inside @Set",
    params: z.object({ min: num, max: num, integer: z.boolean().optional() }),
    fn: ({ min, max, integer }) => {
      const low = Math.min(min, max);
      const high = Math.max(min, max);
      if (integer) return Math.floor(low + Math.random() * (high - low + 1));
      return low + Math.random() * (high - low);
    },
  }),
  defineFunction({
    name: "Clamp",
    description: "number kept between min and max",
    params: z.object({ number: num, min: num, max: num }),
    fn: ({ number, min, max }) => Math.min(Math.max(number, Math.min(min, max)), Math.max(min, max)),
  }),
  defineFunction({
    name: "Percent",
    description: "part / total * 100, e.g. @Percent(3, 4) is 75; 0 when total is 0",
    params: z.object({ part: num, total: num }),
    fn: ({ part, total }) => (total === 0 ? 0 : (part / total) * 100),
  }),
  defineFunction({
    name: "Lerp",
    description: "The value a fraction t of the way from a to b",
    params: z.object({ a: num, b: num, t: num }),
    fn: ({ a, b, t }) => a + (b - a) * t,
  }),
  defineFunction({
    name: "Allocate",
    description: "Splits total in proportion to weights, rounded to decimals (default 2), so the parts add up to exactly total",
    params: z.object({ total: num, weights: z.array(num), decimals: num.optional() }),
    fn: ({ total, weights, decimals }) => {
      const places = Math.min(6, Math.max(0, Math.round(decimals ?? 2)));
      const factor = 10 ** places;
      const weightSum = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0) || 1;
      const raw = weights.map((weight) => (Math.max(0, weight) / weightSum) * total);
      const rounded = raw.map((value) => Math.round(value * factor) / factor);
      const drift = Math.round((total - rounded.reduce((sum, value) => sum + value, 0)) * factor);
      if (rounded.length && drift !== 0) rounded[0] = Math.round((rounded[0] + drift / factor) * factor) / factor;
      return rounded;
    },
  }),
  defineFunction({
    name: "Payment",
    description: "Payment per period that repays principal over periods at rate percent per period",
    params: z.object({ principal: num, rate: num, periods: num }),
    fn: ({ principal, rate, periods }) => {
      if (periods <= 0) return null;
      const monthly = rate / 100;
      if (monthly === 0) return principal / periods;
      return (principal * monthly) / (1 - (1 + monthly) ** -periods);
    },
  }),
  defineFunction({
    name: "MixColor",
    description: "The hex color a fraction t of the way from one hex color to another, e.g. for a heatmap or tint",
    params: z.object({ from: text, to: text, t: num }),
    returns: z.string(),
    fn: ({ from, to, t }) => {
      const parse = (value: string) => {
        const hex = /^#?([\da-f]{6}|[\da-f]{3})$/i.exec(value.trim());
        if (!hex) return null;
        const digits = hex[1].length === 3 ? hex[1].replace(/./g, "$&$&") : hex[1];
        return [0, 2, 4].map((index) => Number.parseInt(digits.slice(index, index + 2), 16));
      };
      const start = parse(from);
      const end = parse(to);
      if (!start || !end) return "";
      const ratio = Math.min(1, Math.max(0, t));
      return `#${start
        .map((channel, index) => Math.round(channel + (end[index] - channel) * ratio).toString(16).padStart(2, "0"))
        .join("")}`;
    },
  }),
];

// Text

const textFunctions = [
  defineFunction({
    name: "Format",
    description: 'Number as text: "number" 12,345.6, "currency" $12,345.68, "percent" 45 -> 45%, "compact" 1.2M',
    params: z.object({
      value: num,
      kind: z.enum(["number", "currency", "percent", "compact"]).optional(),
      decimals: num.optional(),
      currency: text.optional(),
    }),
    returns: z.string(),
    fn: ({ value, kind, decimals, currency }) => {
      const digits = decimals === undefined ? undefined : Math.min(6, Math.max(0, Math.round(decimals)));
      if (kind === "compact") {
        const compact = new Intl.NumberFormat("en-US", {
          notation: "compact",
          maximumFractionDigits: digits ?? 1,
          ...(currency ? { style: "currency" as const, currency } : {}),
        });
        return compact.format(value);
      }
      if (kind === "percent") return `${value.toLocaleString("en-US", { maximumFractionDigits: digits ?? 2 })}%`;
      if (kind === "currency") {
        try {
          return value.toLocaleString("en-US", {
            style: "currency",
            currency: currency || "USD",
            ...(digits === undefined ? {} : { maximumFractionDigits: digits, minimumFractionDigits: digits }),
          });
        } catch {
          return `$${value.toLocaleString("en-US", { maximumFractionDigits: digits ?? 2 })}`;
        }
      }
      return value.toLocaleString("en-US", { maximumFractionDigits: digits ?? 2 });
    },
  }),
  defineFunction({
    name: "Join",
    description: 'Joins the items (or their field) into text with sep (default ", "), skipping nulls',
    params: z.object({ list, sep: text.optional(), field: text.optional() }),
    returns: z.string(),
    fn: ({ list: items, sep, field: key }) =>
      asList(items)
        .map((item) => (key ? field(item, key) : item))
        .filter((value) => value != null && value !== "")
        .map(asText)
        .join(sep ?? ", "),
  }),
  defineFunction({
    name: "Plural",
    description: 'Count and word: @Plural(1, "guest") is "1 guest", 3 gives "3 guests"; plural defaults to word + "s"',
    params: z.object({ n: num, word: text, plural: text.optional() }),
    returns: z.string(),
    fn: ({ n, word, plural }) => `${n.toLocaleString("en-US")} ${n === 1 ? word : (plural ?? `${word}s`)}`,
  }),
  defineFunction({
    name: "Pad",
    description: 'Pads the start of value to length with char (default "0"), e.g. 7 -> "07"',
    params: z.object({ value: z.union([text, num]), length: num, char: text.optional() }),
    returns: z.string(),
    fn: ({ value, length, char }) => asText(value).padStart(Math.max(0, Math.round(length)), (char ?? "0").slice(0, 1)),
  }),
  defineFunction({
    name: "Upper",
    description: "Text in upper case",
    params: z.object({ text }),
    returns: z.string(),
    fn: ({ text: value }) => asText(value).toUpperCase(),
  }),
  defineFunction({
    name: "Lower",
    description: "Text in lower case",
    params: z.object({ text }),
    returns: z.string(),
    fn: ({ text: value }) => asText(value).toLowerCase(),
  }),
  defineFunction({
    name: "Trim",
    description: "Text without spaces at the start and end",
    params: z.object({ text }),
    returns: z.string(),
    fn: ({ text: value }) => asText(value).trim(),
  }),
  defineFunction({
    name: "Capitalize",
    description: 'Each word with a capital first letter, e.g. "new york" is "New York"',
    params: z.object({ text }),
    returns: z.string(),
    fn: ({ text: value }) =>
      asText(value).replace(/\b\p{L}/gu, (letter) => letter.toUpperCase()),
  }),
  defineFunction({
    name: "Split",
    description: 'List of the parts of text between sep (default ","), each trimmed, empty parts dropped',
    params: z.object({ text, sep: text.optional() }),
    fn: ({ text: value, sep }) =>
      asText(value)
        .split(sep ?? ",")
        .map((part) => part.trim())
        .filter(Boolean),
  }),
  defineFunction({
    name: "Replace",
    description: "Text with every find replaced by replacement",
    params: z.object({ text, find: text, replacement: text }),
    returns: z.string(),
    fn: ({ text: value, find, replacement }) => asText(value).split(find).join(replacement),
  }),
  defineFunction({
    name: "Duration",
    description: 'Seconds as text: "short" 1h 20m, 4m 05s, 45s (default); "clock" 1:20:00, 4:05',
    params: z.object({ seconds: num, style: z.enum(["short", "clock"]).optional() }),
    returns: z.string(),
    fn: ({ seconds, style }) => {
      const total = Math.max(0, Math.round(seconds));
      const hours = Math.floor(total / 3600);
      const minutes = Math.floor((total % 3600) / 60);
      const secs = total % 60;
      if (style === "clock") {
        return hours > 0
          ? `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
          : `${minutes}:${String(secs).padStart(2, "0")}`;
      }
      if (hours > 0) return `${hours}h ${minutes}m`;
      if (minutes > 0) return `${minutes}m ${String(secs).padStart(2, "0")}s`;
      return `${secs}s`;
    },
  }),
  defineFunction({
    name: "Default",
    description: 'value, or fallback when value is null, "" or not a number',
    params: z.object({ value: z.any(), fallback: z.any() }),
    fn: ({ value, fallback }) =>
      value === null || value === undefined || value === "" || (typeof value === "number" && !Number.isFinite(value))
        ? fallback
        : value,
  }),
];

// Dates

const dateFunctions = [
  defineFunction({
    name: "Now",
    description: "The current date and time as an ISO string",
    params: z.object({}),
    returns: z.string(),
    fn: () => new Date().toISOString(),
  }),
  defineFunction({
    name: "Today",
    description: "Today's date in the viewer's time zone, as \"YYYY-MM-DD\"",
    params: z.object({}),
    returns: z.string(),
    fn: () => isoDay(new Date()),
  }),
  defineFunction({
    name: "FormatDate",
    description:
      'A date as text: "date" Oct 9, 2026 (default), "short" Oct 9, "long" Friday, October 9, 2026, "weekday" Fri, "month" Oct 2026, "time" 9:30 PM, "datetime", "iso" 2026-10-09',
    params: z.object({
      date: z.union([text, num]),
      style: z.enum(["date", "short", "long", "weekday", "month", "time", "datetime", "iso"]).optional(),
    }),
    returns: z.string(),
    fn: ({ date, style }) => {
      const value = toDate(date);
      if (!value) return "";
      switch (style) {
        case "short":
          return value.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        case "long":
          return value.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
        case "weekday":
          return value.toLocaleDateString("en-US", { weekday: "short" });
        case "month":
          return value.toLocaleDateString("en-US", { month: "short", year: "numeric" });
        case "time":
          return value.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
        case "datetime":
          return value.toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "numeric",
            minute: "2-digit",
          });
        case "iso":
          return isoDay(value);
        default:
          return value.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      }
    },
  }),
  defineFunction({
    name: "AddDays",
    description: 'The date days later (negative: earlier), as "YYYY-MM-DD"',
    params: z.object({ date: z.union([text, num]), days: num }),
    returns: z.string(),
    fn: ({ date, days }) => {
      const value = toDate(date);
      if (!value) return "";
      const next = new Date(value);
      next.setDate(next.getDate() + Math.round(days));
      return isoDay(next);
    },
  }),
  defineFunction({
    name: "AddMonths",
    description: 'The date months later (negative: earlier), kept within the month, as "YYYY-MM-DD"',
    params: z.object({ date: z.union([text, num]), months: num }),
    returns: z.string(),
    fn: ({ date, months }) => {
      const value = toDate(date);
      if (!value) return "";
      const day = value.getDate();
      const next = new Date(value);
      next.setDate(1);
      next.setMonth(next.getMonth() + Math.round(months));
      const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(day, lastDay));
      return isoDay(next);
    },
  }),
  defineFunction({
    name: "DaysBetween",
    description: "Calendar days from one date to another (negative if to is earlier)",
    params: z.object({ from: z.union([text, num]), to: z.union([text, num]) }),
    fn: ({ from, to }) => {
      const start = toDate(from);
      const end = toDate(to);
      if (!start || !end) return null;
      const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
      return Math.round((endDay.getTime() - startDay.getTime()) / 86_400_000);
    },
  }),
];

// Data

const dataFunctions = [
  defineFunction({
    name: "GroupBy",
    description:
      'One row per distinct key, in first-seen order; value is agg of field (default "sum"), or the row count without a field',
    params: z.object({ rows: list, key: text, field: text.optional(), agg: agg.optional() }),
    fn: ({ rows, key, field: valueKey, agg: mode }) =>
      aggregate(asList(rows), key, valueKey, mode ?? (valueKey ? "sum" : "count")),
  }),
  defineFunction({
    name: "Top",
    description: 'The n rows with the largest field ("asc": the smallest)',
    params: z.object({ rows: list, field: text, n: num, direction: z.enum(["asc", "desc"]).optional() }),
    fn: ({ rows, field: key, n, direction }) => {
      const sorted = [...asList(rows)].sort((a, b) =>
        direction === "asc" ? asNumber(field(a, key)) - asNumber(field(b, key)) : asNumber(field(b, key)) - asNumber(field(a, key)),
      );
      return sorted.slice(0, Math.max(0, Math.round(n)));
    },
  }),
  defineFunction({
    name: "Between",
    description: "Rows whose field is from min to max, both included; leave min or max null for an open end",
    params: z.object({ rows: list, field: text, min: z.any(), max: z.any() }),
    fn: ({ rows, field: key, min, max }) =>
      asList(rows).filter((row) => {
        const value = field(row, key);
        if (typeof value === "number") {
          return (min == null || value >= asNumber(min)) && (max == null || value <= asNumber(max));
        }
        const asString = asText(value);
        return (min == null || asString >= asText(min)) && (max == null || asString <= asText(max));
      }),
  }),
  defineFunction({
    name: "Bucket",
    description:
      'Rows per day, week (from Monday) or month of dateField, in date order; key is "YYYY-MM-DD", or "YYYY-MM" for months',
    params: z.object({
      rows: list,
      dateField: text,
      unit: z.enum(["day", "week", "month"]),
      field: text.optional(),
      agg: agg.optional(),
    }),
    fn: ({ rows, dateField, unit, field: valueKey, agg: mode }) => {
      const buckets = new Map<string, number[]>();
      for (const row of asList(rows)) {
        const date = toDate(field(row, dateField));
        if (!date) continue;
        let bucketKey = isoDay(date);
        if (unit === "month") bucketKey = bucketKey.slice(0, 7);
        if (unit === "week") {
          const weekday = (date.getDay() + 6) % 7;
          const monday = new Date(date);
          monday.setDate(monday.getDate() - weekday);
          bucketKey = isoDay(monday);
        }
        const values = buckets.get(bucketKey) ?? [];
        values.push(valueKey ? asNumber(field(row, valueKey)) : 1);
        buckets.set(bucketKey, values);
      }
      return [...buckets.entries()]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([bucketKey, values]) => {
          const total = values.reduce((sum, value) => sum + value, 0);
          const value =
            mode === "count"
              ? values.length
              : mode === "avg"
                ? total / Math.max(1, values.length)
                : mode === "min"
                  ? Math.min(...values)
                  : mode === "max"
                    ? Math.max(...values)
                    : total;
          return { key: bucketKey, value };
        });
    },
  }),
  defineFunction({
    name: "Cumulative",
    description: 'Copy of the rows with field replaced by its running total (field "" for a list of numbers)',
    params: z.object({ rows: list, field: text }),
    fn: ({ rows, field: key }) => {
      let total = 0;
      return asList(rows).map((row) => {
        total += key ? asNumber(field(row, key)) : asNumber(row);
        return key && row && typeof row === "object" ? { ...(row as Record<string, unknown>), [key]: total } : total;
      });
    },
  }),
  defineFunction({
    name: "Change",
    description: "Percent change from previous to current, e.g. @Change(120, 100) is 20; null when previous is 0",
    params: z.object({ current: num, previous: num }),
    fn: ({ current, previous }) => (previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100),
  }),
  defineFunction({
    name: "Stats",
    description: "Summary of numbers: count, min, max, mean, median, stdev",
    params: z.object({ values: z.array(num) }),
    fn: ({ values }) => {
      const sorted = [...values].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
      if (!sorted.length) return { count: 0, min: 0, max: 0, mean: 0, median: 0, stdev: 0 };
      const count = sorted.length;
      const total = sorted.reduce((sum, value) => sum + value, 0);
      const mean = total / count;
      const median =
        count % 2 === 0 ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2 : sorted[(count - 1) / 2];
      const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / count;
      return { count, min: sorted[0], max: sorted[count - 1], mean, median, stdev: Math.sqrt(variance) };
    },
  }),
];

export const functions = [
  ...listFunctions,
  ...numberFunctions,
  ...textFunctions,
  ...dateFunctions,
  ...dataFunctions,
];
