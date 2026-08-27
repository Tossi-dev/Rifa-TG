# Checklist da Vercel — o que só depende de você

Rifa do Tiro de Guerra 02-017 · atualizado em 02/08/2026

Nada aqui depende do Mercado Pago. Dá para fazer tudo hoje e deixar a rifa
pronta, esperando só a credencial de pagamento.

---

## 1. Banco de dados (Upstash Redis) — é o que destrava o site

**Sem isso o site continua quebrado.** O sintoma é exatamente o que você viu:
o comprador preenche o formulário e cai em "página não encontrada" na tela de
pagamento. Sem banco, o pedido nasce na memória de uma função e a tela seguinte
roda em outra, vazia.

Há dois caminhos. O segundo é mais chato e mais confiável — e é o que eu
recomendo, porque tira a dúvida do nome das variáveis.

### Caminho A — pelo painel da Vercel

1. Abra o projeto `rifa-tg` na Vercel.
2. Aba **Storage** → **Create Database** → escolha **Upstash for Redis** (hoje
   isso passa pelo Marketplace da Vercel; a Vercel descontinuou o KV próprio).
3. Conecte ao projeto `rifa-tg`, ambiente **Production**.
4. **CONFIRA OS NOMES.** Vá em **Settings → Environment Variables** e procure:

   ```
   UPSTASH_REDIS_REST_URL
   UPSTASH_REDIS_REST_TOKEN
   ```

   Se a integração tiver criado variáveis com **outros nomes** (`KV_REST_API_URL`,
   nomes com prefixo, etc.), o código não vai enxergar. Nesse caso copie os
   valores e crie as duas variáveis acima, manualmente, com o nome exato.

### Caminho B — direto no Upstash (recomendado)

1. Crie conta em `upstash.com` (o plano gratuito atende esta rifa com folga).
2. **Create Database** → região próxima (São Paulo, se houver) → tipo Redis.
3. Na tela do banco, seção **REST API**, copie os dois valores:
   `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`.
4. Na Vercel, **Settings → Environment Variables**, crie as duas com esses
   nomes exatos, ambiente **Production**.

Assim você sabe exatamente o que foi cadastrado, e o nome não pode divergir.

## 2. Senha do painel (`ADMIN_TOKEN`)

Na Vercel, **Settings → Environment Variables**, ambiente **Production**:

| Nome | Valor |
|---|---|
| `ADMIN_TOKEN` | uma senha longa e aleatória |

Gere no navegador mesmo, ou use um gerenciador de senhas. **Não use a mesma
senha do `.env.local`** da sua máquina — aquela é de desenvolvimento.

É essa senha que abre o `/admin`, e o que protege nome e WhatsApp de todos os
compradores. Sem ela cadastrada, a área inteira responde "não encontrado" — de
propósito.

## 3. Endereço público (`NEXT_PUBLIC_BASE_URL`)

| Nome | Valor |
|---|---|
| `NEXT_PUBLIC_BASE_URL` | o endereço final do site, **sem barra no fim** |

Hoje é `https://rifa-tg.vercel.app`. Se você comprar um domínio próprio, troque
aqui **antes** de divulgar — é deste endereço que sai o aviso de pagamento que
o Mercado Pago vai chamar. Errado aqui, o pagamento cai e a tela não confirma.

## 4. Publicar

Rode o **`deploy-vercel.bat`**. Variável nova só passa a valer no deploy
seguinte — cadastrar sem publicar não muda nada.

## 5. Conferir se funcionou

Nesta ordem:

1. Abra o site e compre 1 cota. A tela de pagamento tem que **abrir** (não pode
   dar "página não encontrada"). Se abriu, o banco está certo.
2. O site ainda vai mostrar a faixa "MODO DEMONSTRAÇÃO" — normal, o Mercado
   Pago ainda não entrou.
3. Abra `https://rifa-tg.vercel.app/admin` e entre com o `ADMIN_TOKEN`. Se o
   painel carregar, a senha está certa.

Se o passo 1 ainda der "página não encontrada", o problema é o nome das
variáveis do Upstash — volte ao item 1.4.

## 6. Depois, com o Mercado Pago

Quando o responsável pela conta gerar as credenciais (ver o outro documento):

| Nome | De onde vem |
|---|---|
| `MP_ACCESS_TOKEN` | Suas integrações → aplicação → Produção → Credenciais de produção |
| `MP_WEBHOOK_SECRET` | mesma aplicação → Webhooks → Configurar notificações → assinatura secreta |

Cadastre as duas, rode o `deploy-vercel.bat` de novo, e a faixa de demonstração
some sozinha. Aí faça **uma compra de verdade**, de 1 cota, e confira o número
no `/admin`. Build verde não prova que o dinheiro entra.

---

## Resumo das variáveis

| Variável | Obrigatória? | Sem ela |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` | sim | pedido some entre o formulário e o pagamento |
| `UPSTASH_REDIS_REST_TOKEN` | sim | idem |
| `ADMIN_TOKEN` | sim | painel `/admin` desligado |
| `NEXT_PUBLIC_BASE_URL` | sim | webhook do Mercado Pago vai para o lugar errado |
| `MP_ACCESS_TOKEN` | para vender de verdade | Pix fictício, modo demonstração |
| `MP_WEBHOOK_SECRET` | junto com a de cima | notificação não é validada |

`CRON_SECRET` não existe mais — foi removido junto com a varredura de reservas.
