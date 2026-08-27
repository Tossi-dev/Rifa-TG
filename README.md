# Rifa TG — Itararé/SP

Sales page de rifa com Pix automático e confirmação em tempo real. Os números
só saem com o pagamento confirmado — cobrança aberta não segura cota nenhuma.
Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui.

## Rodar na sua máquina

Windows: dê dois cliques em **`rodar-local.bat`**.

Ou pelo terminal:

```bash
npm install
npm run dev
```

Abra <http://localhost:3000>.

Sem variáveis de ambiente o site sobe em **MODO DEMONSTRAÇÃO**: o Pix é fictício
e existe um botão "Simular pagamento aprovado" para testar o fluxo inteiro.

> Esse botão é **desligado automaticamente em produção**. Se não fosse, subir o
> site antes de cadastrar o `MP_ACCESS_TOKEN` deixaria qualquer visitante
> confirmar os próprios pedidos e levar a rifa de graça. Para demonstrar em um
> ambiente publicado, cadastre `PERMITIR_SIMULACAO_EM_PRODUCAO=sim`.

## Scripts

| Script              | O que faz                                  |
| ------------------- | ------------------------------------------ |
| `npm run dev`       | Ambiente de desenvolvimento (webpack)      |
| `npm run build`     | Build de produção (webpack)                |
| `npm run start`     | Sobe o build de produção                   |
| `npm run lint`      | ESLint                                     |
| `npm run typecheck` | TypeScript sem emitir arquivos             |
| `npm test`          | Testes com Vitest                          |

> O `--webpack` nos scripts é obrigatório: no Next 16 o Turbopack virou padrão e
> quebra em pastas sincronizadas (OneDrive). Não remova.

## Configurar a rifa

Quase tudo (preço, total de cotas, prêmios, FAQ, contatos, data do sorteio) fica
em **`src/lib/config.ts`**. É o único arquivo que precisa ser editado para
publicar uma nova rifa.

As imagens dos prêmios ficam em `public/img/`.

## Variáveis de ambiente

Copie `.env.example` para `.env.local` (ou cadastre na Vercel):

| Variável                   | Para quê                                        |
| -------------------------- | ----------------------------------------------- |
| `NEXT_PUBLIC_BASE_URL`     | Endereço público (usado no webhook do MP)       |
| `MP_ACCESS_TOKEN`          | Token do Mercado Pago — sem ele, modo demo      |
| `MP_WEBHOOK_SECRET`        | Valida a assinatura HMAC das notificações       |
| `UPSTASH_REDIS_REST_URL`   | Banco (sem ele os números ficam só em memória)  |
| `UPSTASH_REDIS_REST_TOKEN` | Token do Upstash                                |
| `ADMIN_TOKEN`              | Senha do painel `/admin` — sem ela, área off    |

> **O Upstash não é opcional em produção.** Sem ele o app guarda tudo na
> memória do processo, e na Vercel cada requisição pode cair numa instância
> diferente: o pedido criado no `POST` some antes de a tela de pagamento abrir.
> O sintoma é exatamente "página não encontrada" depois de preencher o
> formulário.

## Publicar

Windows: dê dois cliques em **`deploy-vercel.bat`**.

Ou: `npx vercel deploy --prod`.

Depois do primeiro deploy, cadastre o webhook no painel do Mercado Pago
apontando para `https://SEU-DOMINIO/api/webhooks/mercadopago`.

## Como o sistema funciona

Toda decisão de "quem fica com o quê" acontece em **um único comando atômico**
do Redis. Nunca em "leio, penso, escrevo" — entre a leitura e a escrita existe
latência de rede, e é ali que dois compradores (ou dois webhooks) se atropelam.

- **Número só sai pago**: o pedido nasce com `numeros: []`. A atribuição
  acontece dentro de `confirmarPagamento`, e é o único lugar do sistema que
  consome cota. Quem abre a tela e desiste não tira número de ninguém — some
  junto a reserva, o prazo a vigiar, a varredura e o cron.
- **Atribuição atômica** (`src/lib/store.ts`): os números saem de uma fila de
  devolvidos (`LPOP`) e, quando ela acaba, de um contador sequencial reservado
  por um script (`EVAL`) que só incrementa **se couber no total**. Um script em
  vez de `INCRBY` + `DECRBY` porque, entre os dois comandos, o contador ficaria
  inflado — e outro comprador que cabia veria "esgotado" e iria para reembolso.
- **Uma decisão por pedido**: `confirmarPagamento` e `expirarPedido` elegem um
  único decisor com `SET rifa:decisao:<id> <crachá> NX EX 60`. A trava guarda o
  crachá do dono e só é solta por ele (script de compare-and-del): um `DEL`
  cego apagaria a trava de quem assumiu o pedido depois de a nossa vencer.
- **Compensação que relê antes de desfazer**: se a gravação do pedido pago
  falhar, o código **relê o pedido** antes de devolver números para a rifa.
  Falha de rede tanto pode significar "não gravou" quanto "gravou e a resposta
  se perdeu" — e devolver à rifa números de um pedido que ficou pago é venda
  dupla. Na dúvida, registra conflito e não devolve.
- **Trava com validade (`EX 60`)**: se um processo morrer no meio, a trava
  vence sozinha e o próximo reenvio decide. Enquanto ela estiver presa, a
  confirmação devolve `indefinido` e o webhook responde **HTTP 500** — nunca
  200. Responder 200 aí faria o Mercado Pago parar de reenviar e o pagamento
  sumir sem rastro.
- **"Não sei" nunca vira "não pago"**: se a API do Mercado Pago responder
  429/5xx ou não responder, `consultarPagamento` devolve `indeterminado` e o
  webhook responde 500 para o MP reenviar. Tratar incerteza como recusa era o
  caminho mais curto para perder um pagamento em silêncio.
- **Pagamento fora do prazo continua valendo**: como nenhum número ficou preso
  esperando, um Pix pago depois do vencimento vira compra normal enquanto
  houver cota. O único desfecho ruim possível é a rifa ter esgotado no
  intervalo — aí o pedido vira `reembolsar` e entra em `rifa:conflitos`, com
  tela própria para o comprador, nunca em cota vendida.
- **Webhook**: a notificação do Mercado Pago nunca é usada como verdade — o
  pagamento é consultado na API antes de dar a cota como paga, a assinatura
  HMAC é validada quando há `MP_WEBHOOK_SECRET` e assinaturas antigas são
  recusadas (anti-replay).
- **Uma só fonte para o total vendido**: `vendidas = cursor - devolvidos`. Não
  existe contador paralelo, porque o mesmo comando que entrega o número já é a
  contagem — contador separado só criaria a chance de divergir do que foi
  entregue.
- **Índice do sorteio**: cada número vendido é gravado em `rifa:numeros`
  (número -> pedido), num único `HSET` por pedido. A busca do ganhador confere
  o índice contra o próprio pedido antes de responder, então sobra de estorno
  nunca vira ganhador.
- **Freio de abuso**: janela deslizante por IP e por CPF, mais um teto de
  pedidos pendentes simultâneos por CPF (`LIMITES` em `src/lib/config.ts`).
  A vaga é decidida pela posição na fila (`ZRANK`), então uma rajada
  simultânea não fura o teto; e é devolvida em todo caminho que não virar
  pedido, para quem tomou 429 não ficar preso atrás do próprio bloqueio.
  O **teto de pendentes por CPF usa o mesmo `ZADD` + `ZRANK`**: sem isso,
  dez requisições simultâneas passariam juntas e, com um teto de compra alto,
  abririam milhares de cobranças no gateway em segundos.
  O teto por IP é alto de propósito: celular brasileiro sai por CGNAT e um
  bairro inteiro pode compartilhar o mesmo IP.

## Painel do organizador

**`/admin`** — protegido por `ADMIN_TOKEN`. Mostra total, vendidos, aguardando
pagamento, disponíveis, valor arrecadado, últimas vendas e a **busca do ganhador
pelo número sorteado**. Tem também a lista de pagamentos a devolver e o download
do CSV de conciliação.

As rotas por trás são `GET /api/admin/conciliacao` e `GET /api/admin/ganhador`.
O token vai **só no cabeçalho** `Authorization: Bearer ...` — nunca na URL, que
acabaria no log de acesso da Vercel junto do direito de ler nome e WhatsApp de
todos os compradores. Sem `ADMIN_TOKEN` configurado a área responde 404, e as
tentativas de senha têm freio por IP.

O CSV é a planilha usada para conferir o dinheiro e fazer o sorteio. Campos que
começam com `= + - @` saem com apóstrofo na frente: nome de comprador não vira
fórmula quando a planilha é aberta no Excel.

## Estrutura

```
src/
  app/            rotas (landing, /pagamento/[id], /admin e as rotas de API)
  components/
    ui/           primitivos shadcn/ui (new-york)
    rifa/         seções da landing
    pagamento/    telas do fluxo de Pix
    admin/        painel do organizador
  lib/            regras de negócio (config, store, pagamento, webhook,
                  conciliação, validação)
    teste/        Upstash REST falso com latência, usado nos testes
```

## Testes

`npm test` sobe um **Upstash REST falso com latência artificial** e exercita os
caminhos que envolvem dinheiro com chamadas concorrentes (`Promise.all`):
atribuição sem colisão, confirmação idempotente, últimas cotas disputadas por
dois pagamentos, trava órfã de processo morto, pagamento atrasado sendo
resgatado, índice do sorteio, disponibilidade, rate limit e webhook.

O dublê também sabe **falhar de propósito** (`falso.sabotar(...)`), inclusive no
modo mais traiçoeiro: executar o comando e só então responder erro. É o que
cobre os caminhos de compensação — um banco que nunca cai esconde exatamente a
classe de defeito que custa dinheiro.
