const SESSION_KEY = 'lingerie-manager-session';

type Session = {
  email: string;
};

export async function signIn(email: string, password: string) {
  const user = await window.api.auth.login(email, password);
  const session: Session = { email: user.email };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return user;
}

export function getSession(): Session | null {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}
