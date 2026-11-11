export function generateTemporaryPassword(): string {
  // 256 bits of cryptographic randomness plus guaranteed character classes
  // required by the frontend password policy. Never log or persist this value.
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join(
    "",
  );
  const random = btoa(binary).replaceAll("+", "-").replaceAll("/", "_")
    .replaceAll("=", "");
  return `${random}A1a`;
}
