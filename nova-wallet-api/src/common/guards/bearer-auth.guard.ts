import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Request } from "express";
import { verifyToken } from "../jwt.util";
import { ApiException } from "../exceptions/api.exception";

// Static dev-mode token, kept working alongside real per-user JWTs so
// existing wallet/transfer clients never need to log in. Overridable via env.
const API_TOKEN = process.env.API_TOKEN || "novapay-dev-token";

@Injectable()
export class BearerAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.header("authorization") || request.header("Authorization");
    if (!header || !header.startsWith("Bearer ")) {
      throw new ApiException(401, "Missing or malformed Authorization header");
    }

    const token = header.slice("Bearer ".length).trim();
    if (token === API_TOKEN) {
      return true;
    }

    try {
      verifyToken(token);
      return true;
    } catch {
      throw new ApiException(401, "Invalid bearer token");
    }
  }
}
