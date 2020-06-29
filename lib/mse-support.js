function checkMseSupport() {
  if ("MediaSource" in window) return;
  throw new Error("Media Source Extensions API not supported!");
}

