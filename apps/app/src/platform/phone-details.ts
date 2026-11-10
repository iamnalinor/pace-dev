import * as Device from "expo-device";

type Details = {
  readonly deviceBrand?: string;
  readonly deviceModel?: string;
  readonly osVersion?: string;
};

const known = (value: null | string): string | undefined => {
  const text = (value ?? "").trim();
  return text === "" ? undefined : text;
};

/** What this phone says about itself at login (maker, model, Android version); unknown parts are left out. */
export const phoneDetails = (): Details => {
  const deviceBrand = known(Device.brand);
  const deviceModel = known(Device.modelName);
  const osVersion = known(Device.osVersion);
  return {
    ...(deviceBrand !== undefined && { deviceBrand }),
    ...(deviceModel !== undefined && { deviceModel }),
    ...(osVersion !== undefined && { osVersion }),
  };
};
