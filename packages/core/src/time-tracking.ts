/** The time-tracking layer of @pace/core: activities, the time bar's buttons, the timeline. */
export {
  isAutoSleepId,
  sleepDiscardId,
  sleepNightOf,
  sleepReopenId,
  sleepStartId,
  sleepStopId,
} from "./ids.ts";
export {
  type ButtonChoice,
  choiceById,
  TIME_BUTTONS,
  type TimeButton,
  timeButton,
} from "./tracking/buttons.ts";
export {
  activityExpect,
  activityLabel,
  CALENDAR_LEAD_MINUTES,
  calendarAttend,
  type CalendarOccurrence,
  calendarStart,
  type CalendarStartPlan,
  isCalendarRun,
} from "./tracking/calendar-run.ts";
export {
  ACTIVITY_CATEGORIES,
  CATEGORY_EXPECT,
  CATEGORY_HUES,
  FOCUS_CATEGORIES,
  isRestClass,
  REST_CLASS,
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
  awakeSpells,
  BACK_TO_SLEEP_MINUTES,
  BEDTIME_FROM_HOUR,
  BEDTIME_UNTIL_HOUR,
  bedtimeFloor,
  type Interval,
  isBedtime,
  isLockedAt,
  isWakeUp,
  NIGHT_UNTIL_HOUR,
  type PhoneEvent,
  phoneUses,
  REST_MIN_MINUTES,
  SLEEP_MIN_MINUTES,
  WAKE_UP_MAX_MINUTES,
  WAKE_UP_UNTIL_HOUR,
} from "./tracking/phone-use.ts";
export {
  type AppMinutes,
  appSessions,
  appUsage,
  phonePickupAt,
  screenOnIntervals,
} from "./tracking/phone.ts";
export {
  decideSleep,
  type DeviceUse,
  type SleepActivity,
  type SleepDecision,
  type SleepInput,
} from "./tracking/sleep-auto.ts";
export { sleepEvents } from "./tracking/sleep-events.ts";
export { type SleepHorizon, sleepHorizon } from "./tracking/sleep-horizon.ts";
export { sleepInputOf, type SleepKnowledge } from "./tracking/sleep-input.ts";
export { AUTO_SLEEP_LABEL, shownLabel } from "./tracking/sleep-label.ts";
export { readSleepDecision, type SleepLogInputs, sleepRuleOf } from "./tracking/sleep-log.ts";
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
export { typedActivity, type TypedActivity, typedSpan, type TypedSpan } from "./tracking/typed.ts";
export { type SatRow, whereSat } from "./tracking/where-sat.ts";
