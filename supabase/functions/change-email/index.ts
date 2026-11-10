import { createChangeEmailHandler } from '../_shared/change-email-handler.ts'

// Deno is provided by the Supabase Edge Runtime, not by the browser bundle.
declare const Deno: {
  env: { get(name: string): string | undefined }
  serve(handler: (request: Request) => Promise<Response>): void
}

const handler = createChangeEmailHandler({
  supabaseUrl: Deno.env.get('SUPABASE_URL') ?? '',
  publishableKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  serviceRoleKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  allowedOrigins: (Deno.env.get('ACCOUNT_ACTION_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
})

Deno.serve(handler)
