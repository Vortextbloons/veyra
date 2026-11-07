import { createLibrary } from "@openuidev/react-lang";
import { actions } from "./actions";
import { functions } from "./functions";
import { Button, Checkbox, IconButton, Input, Pressable, RadioGroup, SegmentedControl, Select, Slider, TextArea } from "./controls";
import { Chart, Progress, Table } from "./data";
import { Box, Card, Col, Divider, Form, Grid, Row, Spacer } from "./layout";
import { Icon, Image } from "./media";
import { Circle, Ellipse, G, Line, Path, Polygon, Polyline, Rect, Svg, SvgText } from "./svg";
import { Badge, Caption, Code, Label, Link, List, ListItem, Markdown, MathBlock, Quote, Text, Title } from "./text";

/**
 * The component library an interactive answer may use. Layout is never fixed
 * here: the model arranges these primitives into a page, holds its own state in
 * `$variables`, and computes what it shows with the library's `@`-functions.
 */
export const components = [
  // Layout
  Col,
  Row,
  Box,
  Grid,
  Card,
  Divider,
  Spacer,
  Form,
  // Text
  Title,
  Text,
  Caption,
  Label,
  Badge,
  Link,
  List,
  ListItem,
  Markdown,
  Quote,
  Code,
  MathBlock,
  // Inputs
  Button,
  IconButton,
  Pressable,
  Slider,
  SegmentedControl,
  Checkbox,
  Input,
  TextArea,
  Select,
  RadioGroup,
  // Data and media
  Table,
  Chart,
  Progress,
  Icon,
  Image,
  // Drawing
  Svg,
  G,
  Circle,
  Ellipse,
  Rect,
  Line,
  Path,
  Polyline,
  Polygon,
  SvgText,
];

const componentGroups = [
  {
    name: "Layout",
    components: ["Col", "Row", "Box", "Grid", "Card", "Divider", "Spacer", "Form"],
    notes: [
      "- gap and padding count 4px steps. Length is px or a CSS length like \"50%\". Radius is \"sm\", \"md\", \"lg\", \"xl\", \"full\" or px.",
      '- Color is "ink", "muted", "faint", "surface", "border", "info", "success", "warning", "danger", "accent", "chart1" to "chart6", or a CSS color. As a background, status colors are soft tints.',
      "- Leave gap unset on the root Col and inside Card: the app applies the page's spacing tiers there.",
    ],
  },
  {
    name: "Text",
    components: ["Title", "Text", "Caption", "Label", "Badge", "Link", "List", "ListItem", "Markdown", "Quote", "Code", "Math"],
  },
  {
    name: "Inputs",
    components: ["Button", "IconButton", "Pressable", "Slider", "SegmentedControl", "Checkbox", "Input", "TextArea", "Select", "RadioGroup"],
    notes: [
      "- An input's first argument is its value, usually a $variable that other statements read.",
      '- Every input either changes something shown on the page, or sits in a Form whose submit Button sends a short first-person @ToAssistant ("Help me choose a bike"); the form values go with it. No dead inputs.',
      "- A checkbox bound to a $variable tracks one flag. For a list of tickable rows, use Pressable with @Set($done, @Toggle($done, row.name)) and @Includes($done, row.name).",
    ],
  },
  {
    name: "Data and media",
    components: ["Table", "Chart", "Progress", "Icon", "Image"],
    notes: ['- Icon takes a lucide name from a fixed set, e.g. "map-pin", "clock", "check-circle", "star".'],
  },
  {
    name: "Drawing",
    components: ["Svg", "G", "Circle", "Ellipse", "Rect", "Line", "Path", "Polyline", "Polygon", "SvgText"],
    notes: ["- Shapes need a fill or a stroke to be visible."],
  },
];

export const library = createLibrary({
  root: "Col",
  components,
  functions,
  actions,
  componentGroups,
});

