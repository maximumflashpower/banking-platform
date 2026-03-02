console.log("banking-platform running on Docker (Node fixed).");
require("http")
  .createServer((req, res) => res.end("OK\n"))
  .listen(3000, () => console.log("Listening on :3000"));
