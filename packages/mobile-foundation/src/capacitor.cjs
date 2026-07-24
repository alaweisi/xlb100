"use strict";

function toCapacitorConfig(app) {
  return Object.freeze({
    appId: app.appId,
    appName: app.appName,
    webDir: "dist",
  });
}

module.exports = { toCapacitorConfig };
