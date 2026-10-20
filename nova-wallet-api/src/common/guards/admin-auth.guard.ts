import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Request } from "express";
import { ApiException } from "../exceptions/api.exception";

// Strict by design: unlike BearerAuthGuard, this does NOT accept a per-user
// JWT, even a valid one - only the exact static admin token. This endpoint
// is destructive, so "any authenticated caller" is deliberately not enough.
const API_TOKEN = process.env.API_TOKEN || "novapay-dev-token";

@Injectable()
export class AdminAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.header("authorization") || request.header("Authorization");
    if (!header || !header.startsWith("Bearer ")) {
      throw new ApiException(401, "Missing or malformed Authorization header");
    }

    const token = header.slice("Bearer ".length).trim();
    if (token !== API_TOKEN) {
      throw new ApiException(403, "This endpoint requires the admin token");
    }

    return true;
  }
}
