import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Request } from "express";
import { ApiException } from "../exceptions/api.exception";

// Runs as a Guard (before the body ValidationPipe) so a missing
// Idempotency-Key is rejected before the request body is even validated,
// matching the original handler's check ordering.
@Injectable()
export class IdempotencyKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = request.header("Idempotency-Key");
    if (!key || !key.trim()) {
      throw new ApiException(400, "Idempotency-Key header is required");
    }
    return true;
  }
}
