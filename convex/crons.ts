import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Hourly rather than daily so a deadline set in the afternoon does not wait
// until the following midnight to be chased.
crons.interval("chase stalled claims", { hours: 1 }, internal.chase.sweep, {});

export default crons;
