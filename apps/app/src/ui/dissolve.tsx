import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

/** Long enough to watch it go, short enough that the list moves on at once. */
export const DISSOLVE_MS = 750;

const COLUMNS = 30;
const ROWS = 5;
/** How far into the run the sweep reaches the right edge; the rest is the last dust drifting. */
const SWEEP = 0.5;

const FILL = { bottom: 0, left: 0, position: "absolute", right: 0, top: 0 } as const;

/** A repeatable 0..1 per index: the dust scatters the same way every time. */
const noise = (seed: number): number => {
  const value = Math.sin(seed * 12.9898) * 43_758.5453;
  return value - Math.floor(value);
};

type Speck = {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  /** Where in the run (0..1) the sweep reaches it. */
  readonly start: number;
  readonly dx: number;
  readonly dy: number;
};

const specksOf = (width: number, height: number): readonly Speck[] =>
  Array.from({ length: COLUMNS * ROWS }, (_, index) => {
    const column = index % COLUMNS;
    const row = Math.floor(index / COLUMNS);
    return {
      dx: 14 + noise(index * 4 + 1) * 40,
      dy: -(8 + noise(index * 4 + 2) * 34),
      size: 2 + noise(index * 4 + 3) * 2.5,
      start: (column / COLUMNS) * SWEEP + noise(index * 4 + 4) * 0.08,
      x: ((column + noise(index * 7)) / COLUMNS) * width,
      y: ((row + noise(index * 9)) / ROWS) * height,
    };
  });

/** One speck: it appears when the sweep reaches it, then drifts up and right as it fades. */
const SpeckView = ({
  color,
  progress,
  speck,
}: {
  readonly color: string;
  readonly progress: SharedValue<number>;
  readonly speck: Speck;
}) => {
  const style = useAnimatedStyle(() => {
    const local = Math.min(Math.max((progress.value - speck.start) / (1 - speck.start), 0), 1);
    return {
      opacity: local === 0 ? 0 : 1 - local,
      transform: [
        { translateX: speck.dx * local },
        { translateY: speck.dy * local },
        { scale: 1 - local * 0.5 },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        {
          backgroundColor: color,
          borderRadius: speck.size / 2,
          height: speck.size,
          left: speck.x,
          position: "absolute",
          top: speck.y,
          width: speck.size,
        },
        style,
      ]}
    />
  );
};

/**
The row's content turning to dust, as a deleted message does in Telegram: a sweep from left
to right replaces it with specks that drift up and away. `onDone` runs once it is gone. With
reduced motion it simply goes.
*/
export const Dissolve = ({
  children,
  color,
  isActive,
  onDone,
}: {
  readonly children: React.ReactNode;
  /** The specks' color: the row's ink. */
  readonly color: string;
  readonly isActive: boolean;
  readonly onDone: () => void;
}) => {
  const [size, setSize] = useState({ height: 0, width: 0 });
  const progress = useSharedValue(0);
  // The latest `onDone`: a new closure each render must not restart the run.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });
  useEffect(() => {
    if (!isActive) {
      return;
    }
    // Reduced motion makes the timing instant: the row simply goes.
    progress.value = withTiming(1, {
      duration: DISSOLVE_MS,
      easing: Easing.out(Easing.quad),
      reduceMotion: ReduceMotion.System,
    });
    const timer = setTimeout(() => {
      onDoneRef.current();
    }, DISSOLVE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [isActive, progress]);
  const contentStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(progress.value / (SWEEP + 0.1), 1),
  }));
  return (
    <View
      onLayout={(event) => {
        const { height, width } = event.nativeEvent.layout;
        setSize({ height, width });
      }}
    >
      <Animated.View style={contentStyle}>{children}</Animated.View>
      {isActive ? (
        <View pointerEvents="none" style={FILL}>
          {specksOf(size.width, size.height).map((speck, index) => (
            // eslint-disable-next-line @eslint-react/no-array-index-key -- the specks are a fixed grid
            <SpeckView color={color} key={index} progress={progress} speck={speck} />
          ))}
        </View>
      ) : null}
    </View>
  );
};
