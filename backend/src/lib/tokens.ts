import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";
import type { AuthUser } from "../types/auth.js";

type TokenPayload = {
  sub: string;
  email: string;
  name: string;
};

export function signAuthToken(user: AuthUser) {
  const options: SignOptions = {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions["expiresIn"],
    subject: user.id
  };

  return jwt.sign(
    {
      email: user.email,
      name: user.name
    },
    env.JWT_SECRET,
    options
  );
}

export function verifyAuthToken(token: string): AuthUser {
  const payload = jwt.verify(token, env.JWT_SECRET) as TokenPayload;

  return {
    id: payload.sub,
    email: payload.email,
    name: payload.name
  };
}
