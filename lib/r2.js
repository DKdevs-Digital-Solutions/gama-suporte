// Bucket R2 quando o app roda no Cloudflare (ou no dev local com o R2 simulado pelo wrangler).
// Retorna null quando não há binding, e quem chama cai para o disco.
export async function getBucket() {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    return ctx?.env?.ANEXOS_BUCKET || null;
  } catch {
    return null;
  }
}
