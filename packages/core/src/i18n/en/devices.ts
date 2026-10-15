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
  "devices.os": "The computer's system",
  "devices.osWindows": "Windows",
  "devices.osMacos": "macOS",
  "devices.osLinux": "Linux",
  "devices.step1Windows":
    "1. On that computer, open PowerShell: press Start, type “PowerShell” and press Enter.",
  "devices.step1Macos":
    "1. On that Mac, open Terminal: press ⌘ Space, type “Terminal” and press Enter.",
  "devices.step1Linux": "1. On that computer, open a terminal (Ctrl+Alt+T on Ubuntu and Mint).",
  "devices.linuxPackages":
    "The agent needs xdotool and xprintidle. Install them with the line for your system:",
  "devices.step2Windows":
    "2. Paste this there and press Enter. Without Python it installs Python first (winget may ask to allow it), then Pace's agent asks for the token:",
  "devices.step2":
    "2. Paste this there and press Enter. It downloads Pace's agent, which then asks for the token:",
  "devices.tokenPrompt":
    "When the hidden prompt appears, copy this token and paste it there, then press Enter. Nothing appears as you paste:",
  "devices.macPython":
    "If the Mac offers to install the command line developer tools, agree: they bring python3. Then paste the line again.",
  "devices.step3":
    "3. It starts with the computer; it sends app names and times every 5 minutes — never window titles or URLs.",
  "devices.step4": "4. To see what it sends:",
  "devices.waylandGnome":
    "GNOME on Wayland does not let other programs see which window is in front, so the agent cannot work there: choose “GNOME on Xorg” at the login screen. KDE Plasma on Wayland works once kdotool is installed.",
  "devices.checkList": "Within 5 minutes its line in the list shows when it last sent data.",
  "devices.tokenOnce":
    "The token is shown only now. It stays out of the install command and terminal history, but is saved on the computer. It can only upload app usage; Disconnect revokes it. Lost it? Disconnect the computer and add it again.",
  "devices.copy": "Copy the command",
  "devices.copyToken": "Copy the token",
  "devices.shareToken": "Send the token",
  "devices.copied": "Copied",
  "devices.share": "Send the command",
  "devices.calendar": "Send this phone's calendar",
  "devices.calendarHint":
    "Your own and accepted events go to Pace, so the web and the week show them. Turning it off deletes the copy.",
  "devices.done": "Done",
} as const;
