const COLOR_FUNCTION = /^(?:rgb|rgba|hsl|hsla)\(/i;
const HEX = /^#[\da-f]{3,8}$/i;

/** Keys whose string value is a colour: `color`, `backgroundColor`, `tintColor`, `fill`, `stroke`. */
const COLOR_KEY = /(?:color|^fill|^stroke)$/i;

/** CSS named colours (`transparent`, `inherit`, `currentColor` are not raw palette values). */
const NAMED_COLORS: ReadonlySet<string> = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet
  brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan
  darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta
  darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue
  darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey
  dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray
  green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush
  lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray
  lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray
  lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon
  mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue
  mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
  navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen
  paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple
  rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna
  silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle
  tomato turquoise violet wheat white whitesmoke yellow yellowgreen`.split(/\s+/),
);

/**
A hex or functional colour in any string (`"#fff"`, `"rgba(0,0,0,.5)"`). Known false-positive
risk: a whole string that is a bare hex-looking word, such as the issue reference `"#abc"` or
`"#bad"`; use a template or a different text there.
*/
export const isColorString = (value: string): boolean =>
  value.startsWith("#") ? HEX.test(value) : COLOR_FUNCTION.test(value);

/** A CSS colour name used as the value of a colour-ish key. */
export const isNamedColorValue = (key: string, value: string): boolean =>
  COLOR_KEY.test(key) && NAMED_COLORS.has(value.trim().toLowerCase());
