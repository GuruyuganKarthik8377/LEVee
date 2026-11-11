// The error Levee's own checks throw, so a route can tell a bad request from a failure.
// Named, so a route can still recognise it when the website's bundler has loaded this file more than once and instanceof fails.
export class LeveeError extends Error {
  name = "LeveeError";
}
