import jwt from "jsonwebtoken";

// Dev-mode default, overridable via env - same pattern as API_TOKEN.
const JWT_SECRET = process.env.JWT_SECRET || "novapay-dev-jwt-secret";
const JWT_EXPIRES_IN = "1d";

export interface JwtPayload {
  sub: string; // user id
  email: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// Throws if the token is malformed, incorrectly signed, or expired - callers
// decide how to translate that into an HTTP response.
export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
