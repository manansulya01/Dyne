import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = (__ENV.DYNE_BASE_URL || "").replace(/\/$/, "");
const session = __ENV.DYNE_SESSION_COOKIE || "";
const fullStress = __ENV.DYNE_FULL_STRESS === "1";

export const options = {
  stages: fullStress
    ? [
        { duration: "2m", target: 100 },
        { duration: "3m", target: 300 },
        { duration: "5m", target: 1000 },
        { duration: "5m", target: 2000 },
        { duration: "5m", target: 3300 },
        { duration: "5m", target: 3300 },
        { duration: "3m", target: 0 },
      ]
    : [
        { duration: "30s", target: 25 },
        { duration: "1m", target: 50 },
        { duration: "1m", target: 100 },
        { duration: "30s", target: 0 },
      ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<500", "p(99)<1500"],
  },
};

const readEndpoints = [
  "/api/posts?limit=20",
  "/api/study-materials?sort=newest&limit=20",
  "/api/announcements?limit=20",
  "/api/notifications?limit=20",
];

export function setup() {
  if (!baseUrl) throw new Error("Set DYNE_BASE_URL to a staging/preview deployment URL.");
  if (!session) throw new Error("Set DYNE_SESSION_COOKIE to a dedicated test account session.");
  const response = http.get(`${baseUrl}/api/health/db`, {
    headers: { Cookie: `dyne_session=${session}` },
    tags: { endpoint: "database-health" },
  });
  check(response, {
    "database health responds successfully": (r) => r.status === 200,
  });
  if (response.status !== 200) throw new Error("Database health check failed; load test stopped.");
  return { baseUrl };
}

export default function (data) {
  // Spread simulated users over the main read paths rather than hammering one
  // route. Each VU retains a dedicated test account session cookie.
  const endpoint = readEndpoints[(__VU - 1) % readEndpoints.length];
  const response = http.get(`${data.baseUrl}${endpoint}`, {
    headers: {
      Cookie: `dyne_session=${session}`,
      Accept: "application/json",
    },
    tags: { endpoint },
  });
  check(response, {
    "authenticated read returns 200": (r) => r.status === 200,
  });
  sleep(3);
}
