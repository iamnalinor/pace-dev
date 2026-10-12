/*
What the shared code calls that Hermes (React Native 0.86 on Android) does not have, read from
the name table of the libhermesvm.so a release APK ships: on the phone each was "undefined is
not a function". core-js installs one only where it is missing, so a browser keeps its own.
Intl.PluralRules is missing too; @pace/core writes the plural rules out instead.
*/
import "core-js/es/array/to-sorted";
// Iterator helpers one by one: Metro takes core-js' `es.iterator.zip` for a .zip asset.
import "core-js/es/iterator/drop";
import "core-js/es/iterator/every";
import "core-js/es/iterator/filter";
import "core-js/es/iterator/find";
import "core-js/es/iterator/flat-map";
import "core-js/es/iterator/for-each";
import "core-js/es/iterator/map";
import "core-js/es/iterator/reduce";
import "core-js/es/iterator/some";
import "core-js/es/iterator/take";
import "core-js/es/iterator/to-array";
import "core-js/es/map/group-by";
import "core-js/es/object/group-by";

import "./random-values.ts";

/** What this installs where it is missing, by owner (the test takes each away and checks it). */
export const POLYFILLED = {
  arrayPrototype: ["toSorted"],
  iteratorPrototype: [
    "drop",
    "every",
    "filter",
    "find",
    "flatMap",
    "forEach",
    "map",
    "reduce",
    "some",
    "take",
    "toArray",
  ],
  map: ["groupBy"],
  object: ["groupBy"],
} as const;
