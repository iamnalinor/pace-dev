/** Every jest run, however it is started (a bare `bunx jest`, an IDE), runs in a zone that is not UTC. */
module.exports = function setZone() {
  process.env.TZ = "America/Los_Angeles";
};
