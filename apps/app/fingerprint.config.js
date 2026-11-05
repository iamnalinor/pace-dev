/** Add certificate contents without excluding Expo's default native/config/autolinking sources. */
module.exports = {
  extraSources: [
    {
      type: "file",
      filePath: "ota/publisher-certificate.pem",
      reasons: ["otaCodeSigningCertificate"],
    },
  ],
};
