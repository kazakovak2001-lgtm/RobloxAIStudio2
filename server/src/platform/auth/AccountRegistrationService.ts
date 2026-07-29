import type { LoginResult, UserRole } from "./AuthTypes";
import { AuthService } from "./AuthService";
import {
  DurableStorageConflictError,
  type StorageProvider,
} from "../storage/StorageProvider";
import {
  UserRepository,
  type CreateUserInput,
} from "../users/UserRepository";
import type { User } from "../users/UserTypes";

const CREDENTIALS_COLLECTION = "auth_credentials";

export interface RegisterAccountInput extends CreateUserInput {
  password: string;
  role?: UserRole;
}

export interface RegisteredAccount {
  user: User;
  loginResult: LoginResult;
}

export class AccountRegistrationConflictError extends Error {
  constructor(readonly email: string) {
    super("Email already registered");
    this.name = "AccountRegistrationConflictError";
  }
}

/**
 * Owns the cross-domain account creation transaction. User, credentials, role,
 * session and refresh index are either all committed or all absent.
 */
export class AccountRegistrationService {
  constructor(
    private readonly storage: StorageProvider,
    private readonly users = new UserRepository(storage),
    private readonly auth = new AuthService(storage),
  ) {}

  async register(input: RegisterAccountInput): Promise<RegisteredAccount> {
    const preparedUser = this.users.prepareCreate(input);
    const preparedAuth = this.auth.prepareRegistration(
      preparedUser.user.email,
      input.password,
      preparedUser.user.id,
      input.role ?? "creator",
    );

    if (this.users.getByEmail(preparedAuth.normalizedEmail)) {
      throw new AccountRegistrationConflictError(
        preparedAuth.normalizedEmail,
      );
    }

    try {
      await this.storage.mutateDurably([
        preparedUser.mutation,
        ...preparedAuth.mutations,
      ]);
    } catch (error) {
      if (
        error instanceof DurableStorageConflictError &&
        error.collection === CREDENTIALS_COLLECTION &&
        error.id === preparedAuth.normalizedEmail
      ) {
        throw new AccountRegistrationConflictError(
          preparedAuth.normalizedEmail,
        );
      }
      throw error;
    }

    return {
      user: preparedUser.user,
      loginResult: preparedAuth.loginResult,
    };
  }
}
