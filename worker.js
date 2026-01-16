export default {
  async fetch(request, env) {
    // Discord only sends POSTs
    if (request.method !== "POST") {
      return new Response("OK", { status: 200 });
    }

    // Required Discord headers
    const signature = request.headers.get("X-Signature-Ed25519");
    const timestamp = request.headers.get("X-Signature-Timestamp");

    if (!signature || !timestamp) {
      return new Response("Missing signature", { status: 401 });
    }

    // IMPORTANT: read raw body first
    const body = await request.text();

    // Verify request
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

    /* ------------------ */
    /* 1️⃣ Discord PING   */
    /* ------------------ */
    if (interaction.type === 1) {
      return new Response(
        JSON.stringify({ type: 1 }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    /* ------------------ */
    /* 2️⃣ Slash command */
    /* ------------------ */
    if (interaction.type === 2 && interaction.data.name === "echo") {
      const text = interaction.data.options?.[0]?.value ?? "";
      const user = interaction.member.user.username;

      // Fire GitHub Actions (do NOT await results)
      await fetch(
        "https://api.github.com/repos/this-username-is-no-longer-allowed/replaybot-backend/actions/workflows/echo.yml/dispatches",
        {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            ref: "main",
            inputs: {
              user,
              text
            }
          })
        }
      );

      // Defer reply (Discord shows "thinking…")
      return new Response(
        JSON.stringify({ type: 5 }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("Unhandled interaction", { status: 400 });
  }
};

/* ================================================= */
/* 🔐 Discord signature verification (REQUIRED)      */
/* ================================================= */

async function verifyDiscordRequest(body, signature, timestamp, publicKey) {
  const encoder = new TextEncoder();

  const message = encoder.encode(timestamp + body);
  const sig = hexToUint8Array(signature);
  const key = hexToUint8Array(publicKey);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key,
    { name: "Ed25519", namedCurve: "Ed25519" },
    false,
    ["verify"]
  );

  return crypto.subtle.verify(
    "Ed25519",
    cryptoKey,
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
