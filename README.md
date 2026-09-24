# blip-cs-checkout

Checkout mobile (Next.js) que recebe um link com prazo de expiração, assunto, CNPJ/codcli e
nota/pedido criptografados, e usa a API do Gama/GSync (documentação "Integração Blip - Módulo CS")
pra abrir um chamado de CS. Pensado pra abrir dentro do navegador do WhatsApp.

## Como rodar

```bash
npm install
npm run dev
```

Preencha o `.env` (veja `.env.example`):

- `GSYNC_BASE_URL`, `GSYNC_LOGIN`, `GSYNC_PASSWORD` - credenciais da conta de serviço.
- `LINK_SECRET` - chave AES-256 (hex, 64 caracteres) usada pra criptografar o token do link.
- `INTERNAL_API_KEY` - chave que autoriza gerar links novos (`POST /api/links`).
- `PUBLIC_BASE_URL` - domínio público usado para montar a URL final do link.

## Deploy (Cloudflare Workers)

A config do worker está versionada em `wrangler.jsonc`. No painel do Cloudflare (Workers & Pages →
gama-suporte → Settings → Build):

- **Build command:** `npx opennextjs-cloudflare build` (o `npm run build` sozinho só roda o Next e o
  deploy falha com "Could not find compiled Open Next config")
- **Deploy command:** `npx wrangler deploy`

Precisa existir o bucket R2 `gama-suporte-anexos`. `GSYNC_BASE_URL` e `PUBLIC_BASE_URL` vêm do
`wrangler.jsonc`; as credenciais são **secrets** criados no painel (`GSYNC_LOGIN`, `GSYNC_PASSWORD`,
`LINK_SECRET`, `INTERNAL_API_KEY`). Não use variáveis de texto para elas: cada deploy apaga as
variáveis de texto que não estão no `wrangler.jsonc`, e o repositório é público.

## Gerando um link de teste

```bash
node scripts/gerar-link.js --codcli 31940 --numnota 695380 --min 30
```

Isso chama `POST /api/links` (autenticado com `INTERNAL_API_KEY`) e devolve a URL pronta pra
mandar pro cliente, algo como `https://.../c/<token>`.

Parâmetros aceitos: `--cnpj` ou `--codcli`, `--numnota` ou `--numped`, `--min` (expiração em
minutos), `--assunto` (id de `/assuntos`; default `32` = "PREÇO ERRADO", usado no teste inicial).

## Integração com o fluxo da Blip (ação "Enviar Requisição HTTP")

Quem gera o valor pra preencher a URL é o próprio `POST /api/links` (já pronto, seção acima). Dentro
do Blip Builder, quem faz chamada de rede é a ação **"Enviar Requisição HTTP" / "Send Request"** -
o **Execute Script** não tem acesso à internet, só serve pra manipular texto/variáveis, então não dá
pra chamar a API de dentro dele. Configure a ação HTTP assim, depois que o fluxo já tiver
identificado o cliente e a nota (via `/identificar-pedido` ou `/ultimas-notas`, seguindo o fluxo
descrito na documentação da API):

**Método:** `POST`
**URL:** `https://<seu-worker>.workers.dev/api/links` (troque pelo domínio real do deploy)

**Headers:**
```
Content-Type: application/json
X-Internal-Key: <o mesmo valor de INTERNAL_API_KEY configurado no Cloudflare>
```

**Corpo (JSON)** - troque pelas variáveis de contexto que o fluxo já coletou (só um de cada par é
obrigatório: `cnpj` ou `codcli`; `numnota` ou `numped`):
```json
{
  "expira_em_min": 30,
  "cnpj": "{{context.cnpj}}",
  "numnota": {{context.numnota}},
  "id_assunto": 32
}
```

**Resposta:**
```json
{
  "success": true,
  "url": "https://.../c/<token>",
  "expira_em": "2026-09-11T20:00:00.000Z",
  "assunto": "PREÇO ERRADO"
}
```

Salve o campo `url` numa variável de contexto (ex: `link_checkout`) e use ela na mensagem final,
por exemplo: `"Segue o link pra revisar o preço divergente: {{context.link_checkout}}"`.

A `X-Internal-Key` é um segredo do servidor - ela só fica dentro da configuração da ação HTTP no
builder (nunca aparece pro cliente final).

## Como funciona o link

O token na URL (`/c/<token>`) é o payload `{ cnpj|codcli, numnota|numped, id_assunto, exp, iat }`
criptografado com AES-256-GCM (`lib/linkToken.js`) - não é só um id, então não dá pra adivinhar
ou alterar os dados sem o `LINK_SECRET`. A expiração (`exp`) é conferida a cada chamada
(`lib/loadLink.js`) antes de qualquer request à API do Gama/GSync.

Cada link só pode abrir **um** chamado: depois do primeiro `POST /submit` bem-sucedido, o token
fica marcado como usado (`lib/linkStore.js`, no R2 em `links-usados/`; local, em `data/used-links.json`) e qualquer nova
tentativa (reload, double-tap) devolve o mesmo chamado já criado em vez de duplicar.

## Fluxo do checkout (5 etapas, com timeline)

1. **Dados** - confirma empresa, nota/pedido e assunto (vindos de `identificar-pedido`).
2. **Produtos** - lista os produtos da nota (`/produtos`); o cliente marca os que vieram com
   preço errado e informa o preço correto de cada um.
3. **Descrição** - campo opcional de observações; o texto enviado à API é sempre montado
   automaticamente a partir dos produtos selecionados.
4. **Contato** - escolhe um contato já cadastrado (`/contatos`) ou cadastra um novo.
5. **Revisão** - confirma tudo antes de enviar; "Enviar chamado" chama `POST /chamados`.

## Notas da integração (coisas que a documentação não deixava claro)

- A API só devolve JSON de erro se o request mandar `Accept: application/json` - sem esse
  header ela redireciona (302) pra uma página HTML. Isso já está tratado em `lib/gsyncClient.js`.
- Campos como `codprod`, `qt`, `valor_nf_unit` e `valor_nf_total` vêm como **string**, não número
  - normalizado no front (`CheckoutWizard.js`) logo depois de buscar os dados.
- `id_assunto` da "PREÇO ERRADO" no ambiente atual é `32` (confirmado via `GET /assuntos`).

## Estrutura

```
lib/              # config, cliente da API Gama/GSync, criptografia do link, store de uso único
app/api/links/           # POST - gera o link (protegido por X-Internal-Key)
app/api/checkout/[token] # GET dados / GET+POST contatos / POST submit (abre o chamado)
app/c/[token]/           # a página do checkout (client component "CheckoutWizard")
scripts/gerar-link.js    # helper de linha de comando pra gerar links de teste
```
