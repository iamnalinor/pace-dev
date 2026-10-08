/** The time-tracking layer of @pace/core: activities, the time bar's buttons, the timeline. */
export { DEFAULT_BUTTONS, effectiveButtons } from "./tracking/buttons.ts";
export {
  ACTIVITY_CATEGORIES,
  CATEGORY_COLORS,
  CATEGORY_DEFAULTS,
  type ExpectLimit,
} from "./tracking/categories.ts";
export {
  type Defaults,
  defaultsFor,
  NEAR_LIMIT_MINUTES,
  paceStatus,
  type PaceStatus,
} from "./tracking/expect-limit.ts";
export {
  type CategoryRow,
  type EstimateRow,
  estimateVsTracked,
  onTimeByProject,
  type OnTimeRow,
  type ProjectRow,
  taskTrackedMinutes,
  timeByCategory,
  timeByProject,
  weeklyProjectMinutes,
} from "./tracking/insights.ts";
export {
  type Activity,
  type ActivityButton,
  type ActivityCategory,
  INITIAL_TIME_STATE,
  type TimeState,
} from "./tracking/model.ts";
export {
  type AppMinutes,
  appUsage,
  detectSleep,
  type Interval,
  type PhoneEvent,
  screenOnIntervals,
  type SleepCandidate,
} from "./tracking/phone.ts";
export { timeReducer } from "./tracking/time-reducer.ts";
export {
  type Gap,
  GAP_MINUTES,
  type Range,
  runningActivity,
  type Segment,
  timeline,
  type Timeline,
} from "./tracking/timeline.ts";
