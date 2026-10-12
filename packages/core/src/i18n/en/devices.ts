/** Devices: the phone's and the computers' data in the cloud, and connecting a computer. */
export const enDevices = {
  "devices.title": "Devices",
  "devices.hint":
    "Phones and computers that tell Pace which app is on screen (names and times only, never what is in them), so Day and Week show where you sat.",
  "devices.loading": "Loading the devices…",
  "devices.failed": "Could not load the devices. Check the connection.",
  "devices.empty": "Nothing sends app usage yet.",
  "devices.computer": "Computer",
  "devices.phone": "Phone",
  "devices.lastActivity": "Last data {duration} ago",
  "devices.justNow": "Last data just now",
  "devices.nothingYet": "Nothing sent yet",
  "devices.connected": "Connected {date}",
  "devices.disconnect": "Disconnect",
  "devices.disconnectConfirm": "Disconnect {name}? Its token stops working at once.",
  "devices.disconnectFailed": "Could not disconnect. Try again.",
  "devices.add": "Add a computer",
  "devices.name": "Name",
  "devices.defaultName": "My computer",
  "devices.create": "Create the token",
  "devices.createFailed": "Could not create the token. Check the connection.",
  "devices.step1":
    "1. Install ActivityWatch on that computer and start it: it records which app is in front. Turn on “Start on login” in its tray menu.",
  "devices.openActivityWatch": "Open activitywatch.net",
  "devices.step2":
    "2. Paste this into a terminal there. It downloads the bridge, saves this computer's token and sends every 5 minutes:",
  "devices.step3": "3. Within 5 minutes its line in the list shows when it last sent data.",
  "devices.tokenOnce":
    "The token is in the command and is shown only now. Lost it? Disconnect the computer and add it again.",
  "devices.copy": "Copy the command",
  "devices.copied": "Copied",
  "devices.share": "Send the command",
  "devices.otherSystems":
    "macOS or Windows: run the same python3 command; without systemd, schedule “pace_aw_bridge.py run” every 5 minutes (launchd, Task Scheduler).",
  "devices.calendar": "Send this phone's calendar",
  "devices.calendarHint":
    "Your own and accepted events go to Pace, so the web and the week show them. Turning it off deletes the copy.",
  "devices.done": "Done",
} as const;
