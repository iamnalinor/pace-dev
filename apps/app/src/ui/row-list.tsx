import { View, type ViewProps } from "react-native";

/**
The box around rows that slide into place (`ROW_LAYOUT`), kept a view of its own on Android.
React Native's renderer drops ("flattens") a View that only lays out its children, which makes
the rows children of whatever holds the list: then a card appearing above it (the calendar's
"Attend or skip?" on Now, the sleep card on Day) moves each row's own frame, and every row runs
its layout transition from where it was. On the owner's phone those transitions stuck at their
start, so the rows stayed drawn over the card. Kept, the box moves as one and its rows stay put.
The web never flattens, so only Android ever showed it.
*/
export const RowList = (props: ViewProps) => <View {...props} collapsable={false} />;
