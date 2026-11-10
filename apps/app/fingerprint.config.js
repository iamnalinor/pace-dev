const { existsSync } = require("node:fs");
const path = require("node:path");

/** Add certificate contents without excluding Expo's default native/config/autolinking sources. */
module.exports = {
  extraSources: existsSync(path.join(__dirname, "ota/publisher-certificate.pem"))
    ? [
        {
          type: "file",
          filePath: "ota/publisher-certificate.pem",
          reasons: ["otaCodeSigningCertificate"],
        },
      ]
    : [],
};
