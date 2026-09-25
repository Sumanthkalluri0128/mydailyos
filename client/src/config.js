const rawApiUrl =
  import.meta.env.API_URL || "https://mydailyos.onrender.com";

export const API_API_URL = rawApiUrl.replace(/\/+$/, "");
export const API_URL = API_API_URL;
