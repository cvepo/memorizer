function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

/**
 * Next.js runs dotenv-expand over .env files, so an unescaped bcrypt hash such
 * as `$2b$12$abc...` loses `$2b` and `$12` to variable expansion and silently
 * arrives truncated — every password then looks wrong with no clue why.
 * Catch it at startup instead. In .env files write `\$2b\$12\$...`;
 * values set through the Vercel dashboard or CLI need no escaping.
 */
function requiredHash(name: string): string {
  const value = required(name);
  if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value)) {
    throw new Error(
      `${name} is not a valid bcrypt hash (got ${JSON.stringify(
        value.slice(0, 12),
      )}...). If it is in a .env file, escape every "$" as "\\$" — ` +
        `Next.js otherwise expands them away. Regenerate with: npm run hash -- "your password"`,
    );
  }
  return value;
}

export const env = {
  get supabaseUrl() {
    return required("NEXT_PUBLIC_SUPABASE_URL");
  },
  get supabaseSecretKey() {
    return required("SUPABASE_SECRET_KEY");
  },
  get sessionSecret() {
    return required("SESSION_SECRET");
  },
  get sitePasswordHash() {
    return requiredHash("SITE_PASSWORD_HASH");
  },
  get adminEmail() {
    return required("ADMIN_EMAIL");
  },
  get adminPasswordHash() {
    return requiredHash("ADMIN_PASSWORD_HASH");
  },
};
