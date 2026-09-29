const API_BASE = (
  import.meta.env.VITE_API_URL ||
  "http://localhost:4000/api"
).replace(/\/$/, "");

async function request(
  url,
  options = {}
) {
  const response =
    await fetch(
      `${API_BASE}${url}`,
      {
        headers: {
          Accept:
            "application/json",
          ...(options.headers || {})
        },
        ...options
      }
    );

  let data;

  try {
    data =
      await response.json();
  } catch {
    throw new Error(
      `Server returned HTTP ${response.status} without valid JSON.`
    );
  }

  if (
    !response.ok ||
    data?.success === false
  ) {
    throw new Error(
      data?.error ||
      `Request failed with HTTP ${response.status}.`
    );
  }

  return data;
}

export function fetchAnalyticsOptions(
  signal
) {
  return request(
    "/analytics/options",
    {
      signal
    }
  );
}

export function fetchDescriptive(
  scope,
  signal
) {
  return request(
    "/analytics/descriptive",
    {
      method:
        "POST",

      signal,

      headers: {
        "Content-Type":
          "application/json"
      },

      body:
        JSON.stringify(scope)
    }
  );
}