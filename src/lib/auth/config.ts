import "server-only";
import { betterAuth, APIError } from "better-auth";
import { createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { emailOTP, phoneNumber } from "better-auth/plugins";
import { getPool } from "@/lib/db/pool";
import { sendMail } from "@/lib/mail/send";
import { siteUrl } from "@/lib/site";
import { sendPhoneOtp } from "./sms";

const timestamps = { createdAt: "created_at", updatedAt: "updated_at" };

function createAuth() {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret || secret.length < 32)
    throw new Error("AUTH_SECRET must contain at least 32 characters");
  return betterAuth({
    appName: "OshiNest",
    baseURL: siteUrl(),
    secret,
    database: getPool("auth"),
    advanced: {
      database: { generateId: "uuid" },
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },
    user: {
      modelName: "app_users",
      fields: { ...timestamps, emailVerified: "email_verified" },
    },
    session: {
      modelName: "auth_sessions",
      fields: {
        ...timestamps,
        userId: "user_id",
        expiresAt: "expires_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
      },
    },
    account: {
      modelName: "auth_accounts",
      fields: {
        ...timestamps,
        userId: "user_id",
        accountId: "account_id",
        providerId: "provider_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
      },
    },
    verification: {
      modelName: "auth_verifications",
      fields: { ...timestamps, expiresAt: "expires_at" },
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "auth_rate_limits",
      fields: { lastRequest: "last_request" },
      customRules: { "/phone-number/send-otp": { window: 60, max: 1 } },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    emailVerification: {
      autoSignInAfterVerification: true,
      sendOnSignIn: true,
    },
    // These features are not part of the product. Keep the auth HTTP surface small.
    disabledPaths: [
      "/sign-in/phone-number",
      "/phone-number/request-password-reset",
      "/phone-number/reset-password",
      "/sign-in/email-otp",
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (!ctx.path.startsWith("/phone-number/")) return;
        const session = await getSessionFromCtx(ctx);
        if (!session || session.session.expiresAt <= new Date())
          throw new APIError("UNAUTHORIZED");
        // Phone verification may update the authenticated user's number only.
        if (ctx.path === "/phone-number/verify") {
          ctx.body.updatePhoneNumber = true;
          ctx.body.disableSession = true;
        }
      }),
    },
    plugins: [
      emailOTP({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        storeOTP: "hashed",
        overrideDefaultEmailVerification: true,
        sendVerificationOnSignUp: true,
        rateLimit: { window: 60, max: 1 },
        async sendVerificationOTP({ email, otp }) {
          const result = await sendMail({
            to: email,
            subject: "OshiNest 確認コード",
            text: `確認コードは ${otp} です。10分以内に入力してください。`,
          });
          if (!result.ok) throw new Error("確認メールを送信できませんでした");
        },
      }),
      phoneNumber({
        otpLength: 6,
        expiresIn: 600,
        allowedAttempts: 5,
        phoneNumberValidator: (phone) => /^\+81[789]0\d{8}$/.test(phone),
        schema: {
          user: {
            fields: {
              phoneNumber: "phone",
              phoneNumberVerified: "phone_verified",
            },
          },
        },
        sendOTP: ({ phoneNumber, code }) => sendPhoneOtp(phoneNumber, code),
      }),
      nextCookies(),
    ],
  });
}

let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return (instance ??= createAuth());
}
