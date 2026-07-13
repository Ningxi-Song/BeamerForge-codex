(function init(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BeamerForgeOnboarding = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function factory() {
  "use strict";

  function shouldShow({ pathname, started }) {
    return pathname === "/welcome" || (pathname === "/" && !started);
  }

  function begin() {
    return { started: true, nextPath: "/start" };
  }

  return { shouldShow, begin };
});
