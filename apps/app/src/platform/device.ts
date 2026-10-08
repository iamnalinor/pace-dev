import { Platform } from "react-native";

/** The Android app, as opposed to the web build: phone data, permissions and notifications. */
export const IS_PHONE = Platform.OS !== "web";
