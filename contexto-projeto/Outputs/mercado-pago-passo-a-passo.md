# Como liberar o Pix automático da rifa

Passo a passo para o responsável pela conta do Mercado Pago que vai **receber o
dinheiro da rifa** do Tiro de Guerra 02-017.

Leva uns 15 minutos. Não precisa saber nada de programação.

---

## Antes de começar, três coisas importantes

**1. A conta que faz isso é a conta que recebe.** O dinheiro das vendas cai na
conta do Mercado Pago que gerar os códigos abaixo. Se a rifa é do Tiro de
Guerra, o ideal é que seja uma conta da instituição (CNPJ), e não a conta
pessoal de alguém.

**2. O código que você vai gerar é uma senha.** Ele dá acesso à cobrança dessa
conta. **Não mande por WhatsApp, e-mail ou mensagem.** O melhor jeito é fazer
esta configuração junto com o Tossi, por chamada de vídeo com a tela
compartilhada: você digita, ele orienta, e o código vai direto para o lugar
certo sem passar por lugar nenhum.

**3. Se por algum motivo o código chegar a circular por mensagem**, avise — dá
para gerar um novo no mesmo painel, e o antigo deixa de valer.

---

## Parte 1 — Criar a aplicação

1. Entre em **mercadopago.com.br/developers** e faça login **na conta que vai
   receber o dinheiro**.
2. No canto superior direito, clique em **Suas integrações**.
3. Clique em **Criar aplicação**.
4. Dê um nome (por exemplo, `Rifa TG 02-017`).
5. Quando perguntar o tipo de solução, escolha **Pagamentos online**, e depois
   a opção de integração por **API / Checkout Transparente** (o nome varia um
   pouco conforme a tela; é a opção de integrar pagamentos no próprio site, não
   a de usar uma maquininha ou um link pronto).
6. Salve.

## Parte 2 — Ativar e copiar a credencial de produção

1. Dentro da aplicação recém-criada, no menu da esquerda, procure
   **Produção → Credenciais de produção**.
2. Elas vêm bloqueadas. Preencha o que a tela pedir:
   - **Indústria / ramo do negócio**
   - **Website** (obrigatório) — use `https://rifa-tg.vercel.app`
   - Aceite a Declaração de Privacidade e os Termos
   - Marque o reCAPTCHA
3. Clique em **Ativar credenciais de produção**.
4. Vai aparecer uma lista de códigos. O que interessa é o **Access Token**.

> **Atenção ao mais confundido:** existem **credenciais de teste** e
> **credenciais de produção**, em abas parecidas. As de teste não recebem
> dinheiro de verdade. O Access Token **de produção** começa com `APP_USR-`.
> Confira antes de copiar.

Esse é o **primeiro valor** necessário.

## Parte 3 — Configurar o aviso de pagamento (webhook)

É o que faz a tela do comprador confirmar sozinha, sem ninguém conferir
comprovante.

1. Ainda dentro da mesma aplicação, no menu da esquerda, clique em
   **Webhooks → Configurar notificações**.
2. No campo de URL de produção, cole exatamente:

   ```
   https://rifa-tg.vercel.app/api/webhooks/mercadopago
   ```

   (Se a rifa já estiver num domínio próprio, use o endereço definitivo. O
   Tossi confirma qual é.)

3. Na lista de eventos, marque **Pagamentos**.

> **Este passo decide se a rifa funciona.** Existe uma opção parecida chamada
> **Order** logo ao lado. Se marcar Order em vez de Pagamentos, o pagamento cai
> na conta e a tela do comprador **nunca confirma** — e ninguém percebe, porque
> não dá erro em lugar nenhum. Tem que ser **Pagamentos**.

4. Salve. A tela vai gerar uma **assinatura secreta** exclusiva dessa
   aplicação. Clique para revelar e copie.

Esse é o **segundo valor** necessário.

## Parte 4 — Entregar os dois valores

Os dois códigos são:

| O quê | Onde estava |
|---|---|
| **Access Token de produção** (começa com `APP_USR-`) | Produção → Credenciais de produção |
| **Assinatura secreta** do webhook | Webhooks → Configurar notificações |

Eles vão ser cadastrados no painel do site (Vercel). **O melhor é colar
diretamente lá, na mesma chamada**, sem passar por mensagem. O Tossi mostra
onde.

---

## Depois de tudo cadastrado

O site publica de novo e, a partir daí:

- Some do site o aviso de "MODO DEMONSTRAÇÃO".
- Cada comprador recebe um QR Code próprio, com o valor exato da compra dele.
- Quando o Pix é pago, a tela dele mostra os números na hora, sozinha.
- O dinheiro fica no **saldo do Mercado Pago** — não vai direto para o banco.
  A transferência para a conta bancária é um passo separado, feito por você.

## Duas perguntas que sempre aparecem

**"Preciso cadastrar alguma chave Pix no site?"**
Não. A chave Pix fica cadastrada dentro da sua conta do Mercado Pago, uma vez
só. O site nunca vê a sua chave — ele pede um QR Code ao Mercado Pago a cada
compra, e o Mercado Pago devolve pronto.

**"Uso uma chave aleatória para não expor meus dados?"**
Pode, e é uma boa ideia: ela esconde CPF, telefone e e-mail. Só saiba que o
**nome do titular da conta continua aparecendo** para quem paga — isso é regra
do Pix e nenhum tipo de chave muda. É mais um motivo para a conta ser da
instituição e não pessoal.

## Uma última: taxa

O Mercado Pago cobra uma taxa sobre cada Pix recebido, e ela varia conforme a
conta e o prazo de recebimento escolhido. Dá para conferir a sua no app, em
**Menu → Taxas**, ou no site em **Seu negócio → Taxas**. Vale olhar antes, para
a meta de arrecadação da rifa ser combinada já com esse desconto em mente.
