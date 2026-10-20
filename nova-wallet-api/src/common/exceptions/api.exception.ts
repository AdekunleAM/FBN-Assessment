import { HttpException } from "@nestjs/common";

// Carries a status + message through Nest's exception pipeline while keeping
// the response body shaped as `{ error: message }`, matching the API's
// documented error envelope.
export class ApiException extends HttpException {
  constructor(status: number, message: string) {
    super({ error: message }, status);
  }
}
