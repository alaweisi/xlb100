"use strict";

const securedVersions = Object.freeze({
  "brace-expansion": "5.0.8",
  "fast-uri": "4.1.1",
  "find-my-way": "9.7.0",
  "postcss": "8.5.23",
});

function secureDependencyVersions(pkg) {
  for (const field of ["dependencies", "devDependencies", "optionalDependencies"]) {
    const dependencies = pkg[field];
    if (!dependencies) continue;
    for (const [name, version] of Object.entries(securedVersions)) {
      if (Object.hasOwn(dependencies, name)) {
        dependencies[name] = version;
      }
    }
  }
  return pkg;
}

module.exports = {
  hooks: {
    readPackage: secureDependencyVersions,
  },
};
