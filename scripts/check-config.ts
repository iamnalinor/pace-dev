import { FirebaseConfigPolicySchema, validateFirebaseConfig } from "@pace/core";

const args = process.argv.slice(2);
const expectation = args[0];
if (
  args.length > 1 ||
  (expectation !== undefined &&
    expectation !== "--expect=configured" &&
    expectation !== "--expect=disabled")
) {
  console.error("invalid-arguments");
  process.exit(1);
}

const policy = FirebaseConfigPolicySchema.optional().safeParse(
  process.env["PACE_FIREBASE_CONFIG_POLICY"],
);
if (!policy.success) {
  console.error("invalid-config-policy");
  process.exit(1);
}

const result = validateFirebaseConfig({
  FIREBASE_ANDROID_CONFIG: process.env["FIREBASE_ANDROID_CONFIG"] ?? "",
  FIREBASE_SERVICE_ACCOUNT: process.env["FIREBASE_SERVICE_ACCOUNT"] ?? "",
});
if (!result.ok) {
  console.error(result.error);
  process.exit(1);
}

const state = result.value === null ? "disabled" : "configured";
if (expectation === "--expect=configured" && state === "disabled") {
  console.error("expected-configured");
  process.exit(1);
}
if (expectation === "--expect=disabled" && state === "configured") {
  console.error("expected-disabled");
  process.exit(1);
}
console.log(state);
