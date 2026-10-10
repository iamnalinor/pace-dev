/** The time-tracking layer of @pace/core: activities, the time bar's buttons, the timeline. */
export {
  type ButtonChoice,
  choiceById,
  TIME_BUTTONS,
  type TimeButton,
  timeButton,
} from "./tracking/buttons.ts";
export {
  ACTIVITY_CATEGORIES,
  CATEGORY_COLORS,
  CATEGORY_EXPECT,
  FOCUS_CATEGORIES,
} from "./tracking/categories.ts";
export {
  type Defaults,
  defaultsFor,
  paceStatus,
  type PaceStatus,
  REMIND_FACTOR,
  remindAt,
} from "./tracking/expect.ts";
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
  type ActivityCategory,
  INITIAL_TIME_STATE,
  type TimeState,
} from "./tracking/model.ts";
export {
  type FocusSleepDay,
  focusVsSleep,
  type Fragmentation,
  fragmentation,
  productiveHours,
  SHORT_FOCUS_MINUTES,
} from "./tracking/patterns.ts";
export {
  type AppMinutes,
  appUsage,
  detectSleep,
  type Interval,
  type PhoneEvent,
  phonePickupAt,
  screenOnIntervals,
  type SleepCandidate,
} from "./tracking/phone.ts";
export { timeReducer } from "./tracking/time-reducer.ts";
export {
  type Gap,
  GAP_MINUTES,
  type Range,
  runningActivities,
  runningActivity,
  type Segment,
  timeline,
  type Timeline,
} from "./tracking/timeline.ts";
export { typedActivity, type TypedActivity } from "./tracking/typed.ts";
