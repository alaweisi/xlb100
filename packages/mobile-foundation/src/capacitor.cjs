"use strict";

function toCapacitorConfig(app) {
  return Object.freeze({
    appId: app.appId,
    appName: app.appName,
    webDir: "dist",
    loggingBehavior: "none",
    plugins: Object.freeze({
      CapacitorHttp: Object.freeze({
        enabled: true,
      }),
    }),
  });
}

module.exports = { toCapacitorConfig };
