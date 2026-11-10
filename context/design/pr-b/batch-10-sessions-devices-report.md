# Batch 10: sessions show the real device

**Shipped:** `userAgentDetails` (apps/api/src/auth/user-agent.ts, unit tests over real UAs); D1 migration 0009
(`device_brand`, `device_model`, `os_version` on `sessions` and `login_nonces`); nonce-create accepts optional
`deviceBrand`/`deviceModel`/`osVersion` (old bodies still pass); `GET /api/sessions` returns optional `device`
(phone app: its own fields, `os: "Android"`; browser: parsed UA); client `sessionRows` titles by device and puts
OS/browser under it; phone app sends `expo-device` details; RU string `sessions.browserOn`.

**Tests:** user-agent unit, nonce unit, auth int (list returns details; the old login test still passes),
client view-model, app sessions screen.

**Deviations/deferred:** no tablet icon in the kit; PWA not detectable from the UA; the MCP cloud-tools are unchanged
(they print usage `deviceName`, untouched). Verify on hardware: a real phone login stores brand/model/version.
