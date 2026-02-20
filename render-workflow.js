import { WorkflowEntrypoint } from 'cloudflare:workers';

export class RenderWorkflow extends WorkflowEntrypoint {
  async run(event, step) {
    console.log('workflow begin');
    const { payload, initialState } = event.payload;
    if (initialState === 'SLEEPING') {
      await step.do('check-and-wake', async () => {
        await fetch(`https://${this.env.HF_SPACE_ID.replace('/', '.')}.hf.space`, {
          headers: {
            "Authorization": `Bearer ${this.env.HF_TOKEN}`
          },
          method: "GET",
          signal: AbortSignal.timeout(5000)
        })
        .catch(() => {});
      });
    }
    
    await step.do('wait-for-server-ready', async () => {
      for (let ready, attempt = 0; !ready && attempt < 40; attempt++) {
        try {
          const ping = await fetch(`https://${this.env.HF_SPACE_ID.replace('/', '.')}.hf.space/ping`, {
            headers: {
              "Authorization": `Bearer ${this.env.HF_TOKEN}`
            },
            method: 'GET',
            signal: AbortSignal.timeout(3000)
          });

          if (ping.ok) {
            ready = true;
          }
        } catch {
          await this.sleep('5 seconds');
        }
      }
    });

    await step.do('final-dispatch', async () => {
      const response = await fetch(`https://${this.env.HF_SPACE_ID.replace('/', '.')}.hf.space/direct-dispatch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json", 
          "x-engine-key": this.env.ENGINE_API_KEY,
          "Authorization": `Bearer ${this.env.HF_TOKEN}`
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error('Dispatch failed with status: ' + response.status);
      }
    });
  }
}
