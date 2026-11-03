import { usePathname } from "expo-router";
import { View } from "react-native";

import { useT } from "../app-state.tsx";
import { useWaitingCount } from "../shared/use-waiting-count.ts";
import { CountBadge } from "./count-badge.tsx";
import { cx } from "./cx.ts";
import { Icon } from "./icon.tsx";
import { Link } from "./link.tsx";
import { Pressable } from "./pressable.tsx";
import {
  type DestinationLinkProps,
  DESTINATIONS,
  useDestinationLink,
  useNewTask,
} from "./sidebar.tsx";
import { Text } from "./text.tsx";

/** One destination: the icon over its caption, the current one on a `fill.3` pill. */
const RailLink = (props: DestinationLinkProps) => {
  const t = useT();
  const { count, destination, isCurrent } = props;
  const link = useDestinationLink(props);
  return (
    <Link {...link} className="w-full items-center gap-1 rounded-lg py-1">
      <View
        className={cx(
          "h-8 w-16 items-center justify-center rounded-pill",
          isCurrent && "bg-fill-3",
        )}
      >
        <Icon name={destination.icon} tone={isCurrent ? "primary" : "secondary"} />
        <View className="absolute -top-1 left-10">
          <CountBadge count={count} />
        </View>
      </View>
      <Text
        chrome
        className={cx("text-center", isCurrent && "font-semibold")}
        role="caption"
        tone={isCurrent ? "primary" : "secondary"}
      >
        {t(destination.label)}
      </Text>
    </Link>
  );
};

/**
The navigation of a `medium` window (600–1023: a tablet, an unfolded phone; spec §5.0.1): an 80
wide rail with New task as its top button and the eight destinations as icon and caption, links
with their addresses, the current one `aria-current="page"` on a pill (not colour alone).
*/
export const NavRail = () => {
  const t = useT();
  const path = usePathname();
  const waiting = useWaitingCount();
  const newTask = useNewTask();
  return (
    <View
      aria-label={t("nav.main")}
      className="w-rail items-center gap-2 border-r border-separator bg-sidebar px-1 pb-4 pt-5"
      role="navigation"
      testID="nav-rail"
    >
      <Pressable
        className="mb-3 h-12 w-12 items-center justify-center rounded-lg bg-fill-2"
        label={t("nav.newTask")}
        onPress={newTask}
        role="button"
      >
        <Icon name="plus" size="bar" tone="primary" />
      </Pressable>
      {DESTINATIONS.map((destination) => (
        <RailLink
          count={destination.countedLabel === undefined ? 0 : waiting}
          destination={destination}
          isCurrent={destination.owns(path)}
          key={destination.label}
        />
      ))}
    </View>
  );
};
