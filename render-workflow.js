import { WorkflowEntrypoint } from 'cloudflare:workers';

export class RenderWorkflow extends WorkflowEntrypoint {
  async run(event, env) {
    const { payload, initialState } = event.params;
    if (initialState === 'SLEEPING') {
      await this.step.do('check-and-wake', async () => {
        await fetch(`https://${env.HF_SPACE_ID.replace('/', '.')}.hf.space`, {
          method: "GET",
          signal: AbortSignal.timeout(5000)
        })
        .catch(() => {});
      });
    }
    
    await this.step.do('wait-for-server-ready', async () => {
      for (let ready, attempt = 0; !ready && attempt < 40; attempt++) {
        try {
          const ping = await fetch(`https://${env.HF_SPACE_ID.replace('/', '.')}.hf.space/ping`, {
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

    await this.step.do('final-dispatch', async () => {
      const response = await fetch(`https://${env.HF_SPACE_ID.replace('/', '.')}.hf.space/direct-dispatch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json", 
          "x-engine-key": env.ENGINE_API_KEY
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error('Dispatch failed with status: ' + response.status);
      }
    });
  }
}
