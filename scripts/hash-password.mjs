// Generate the bcrypt hash for SITE_PASSWORD_HASH / ADMIN_PASSWORD_HASH.
//   npm run hash -- "my password"
//
// Prints two forms, because they need different escaping:
//   - .env files go through dotenv-expand, so every "$" must be written "\$"
//   - the Vercel dashboard and CLI take the value verbatim
import bcrypt from "bcryptjs";

const password = process.argv.slice(2).join(" ");

if (!password) {
  console.error('Usage: npm run hash -- "the password"');
  process.exit(1);
}
if (password.length < 6) {
  console.error("Use at least 6 characters.");
  process.exit(1);
}

const hash = bcrypt.hashSync(password, 12);

console.log("\nFor .env.local  (escaped — paste this into the file):\n");
console.log("  " + hash.replaceAll("$", "\\$"));
console.log("\nFor Vercel / any dashboard  (raw):\n");
console.log("  " + hash + "\n");
