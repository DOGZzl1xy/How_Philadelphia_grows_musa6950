// Every data URL carries the build version, so Cloudflare and browsers can cache /data/* for a year (see
// public/_headers) and a new deploy is still fetched fresh. In development the version is the page-load time.
/* global __DATA_V__ */
export const V = typeof __DATA_V__ !== "undefined" ? __DATA_V__ : String(Date.now());
export const v = (url) => `${url}${url.includes("?") ? "&" : "?"}v=${V}`;
