export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export function getToken() {
  if (typeof window === "undefined") {
    return null;
  }

  return localStorage.getItem("collabcode.token");
}

export function getStoredUser() {
  if (typeof window === "undefined") {
    return null;
  }

  const rawUser = localStorage.getItem("collabcode.user");

  if (!rawUser) {
    return null;
  }

  return JSON.parse(rawUser) as SessionUser;
}

export function logout() {
  localStorage.removeItem("collabcode.token");
  localStorage.removeItem("collabcode.user");
  window.location.href = "/login";
}
