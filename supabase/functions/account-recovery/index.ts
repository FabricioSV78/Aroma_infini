import { createAccountRecoveryHandler } from '../_shared/account-recovery-handler.ts'

declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

Deno.serve(
  createAccountRecoveryHandler({
    supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
    publishableKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    allowedOrigins: (Deno.env.get('ACCOUNT_ACTION_ALLOWED_ORIGINS') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
    rateLimitSecret: Deno.env.get('RECOVERY_RATE_LIMIT_SECRET') ?? '',
  }),
)
