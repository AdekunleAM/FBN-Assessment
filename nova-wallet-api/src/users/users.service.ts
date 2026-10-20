import { Injectable } from "@nestjs/common";
import { signToken } from "../common/jwt.util";
import { StoreService } from "../store.service";
import { authenticateUser, createUser, toUserResponse } from "./user.model";

@Injectable()
export class UsersService {
  constructor(private readonly store: StoreService) {}

  async signUp(args: { email: string; fullName: string; password: string }) {
    const user = await this.store.withDb((db) => createUser(db, args));
    return toUserResponse(user);
  }

  login(args: { email: string; password: string }) {
    const db = this.store.readDb();
    const user = authenticateUser(db, args.email, args.password);
    const token = signToken({ sub: user.id, email: user.email });
    return { token, user: toUserResponse(user) };
  }

  getUserInfo(args: { email: string; password: string }) {
    const db = this.store.readDb();
    const user = authenticateUser(db, args.email, args.password);
    return toUserResponse(user);
  }
}
