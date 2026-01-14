export default {
  async fetch(request, env) {
    // Discord sends POST requests
    if (request.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    // Required headers for verification
    const signature = request.headers.get("X-Signature-Ed25519");
    const timestamp = request.headers.get("X-Signature-Timestamp");

    if (!signature || !timestamp) {
      return new Response("Bad Request", { status: 400 });
    }

    const body = await request.text();

    // Verify Discord signature
    const isValid = await verifyDiscordRequest(
      body,
      signature,
      timestamp,
      env.DISCORD_PUBLIC_KEY
    );

    if (!isValid) {
      return new Response("Invalid request", { status: 401 });
    }

    const interaction = JSON.parse(body);

    // Discord PING check (required)
    if (interaction.type === 1) {
      return new Response(
        JSON.stringify({ type: 1 }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // Slash command response
    if (interaction.type === 2) {
      return new Response(
        JSON.stringify({
          type: 4,
          data: {
            content: "Hello from Cloudflare Workers 👋"
          }
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("Unhandled interaction", { status: 400 });
  }
};
async function verifyDiscordRequest(body, signature, timestamp, publicKey) {
  const encoder = new TextEncoder();

  const message = encoder.encode(timestamp + body);
  const sig = hexToUint8Array(signature);
  const key = hexToUint8Array(publicKey);

  return crypto.subtle.verify(
    "Ed25519",
    await crypto.subtle.importKey(
      "raw",
      key,
      { name: "Ed25519", namedCurve: "Ed25519" },
      false,
      ["verify"]
    ),
    sig,
    message
  );
}

function hexToUint8Array(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}
