---
tipo: decisao
projeto: Rifa TG
data: 2026-08-02
impacto: alto
resumo: "Reserva de números eliminada: a atribuição passa a acontecer na confirmação do pagamento. Some prazo, carrinho abandonado, varredura e cron."
tags: [decisao, projeto/rifa-tg, conceito/arquitetura]
status: ativo
---

# Número só sai com pagamento confirmado

## Contexto

O modelo original reservava os próximos números livres **na criação do pedido** e os segurava por 30 minutos. Isso obrigava o sistema a carregar: um ZSET de reservas pontuado pelo vencimento, posse por `ZREM` para decidir quem podia expirar ou confirmar, varredura de vencidas em todo `POST /api/pedidos`, um cron a cada 5 minutos, e a regra `maxCotasPorCompra × pendentesPorCpf` para limitar quanto um CPF conseguia travar.

Os três bloqueantes de dinheiro da sessão anterior nasceram todos dessa mecânica: cota abandonada travada para sempre, contagem dupla na reconfirmação, e o mesmo número vendido duas vezes quando um pagamento chegava depois da revenda.

O próprio Tossi propôs a mudança: *"faria com que o cliente nem precisasse saber quais números vai receber antes de pagar"*.

Gatilho imediato: o plano Hobby da Vercel recusou o cron `*/5 * * * *` no primeiro deploy.

## Decisão

O pedido nasce com `numeros: []`. A atribuição acontece **dentro de `confirmarPagamento`**, que passa a ser o único ponto do sistema que consome cota.

Removidos: `rifa:reservas`, `registrarReserva`, `tomarPosseDaReserva`, `varrerReservasVencidas`, a rota `/api/cron/expirar`, o bloco `crons` do `vercel.json` e o `CRON_SECRET`.

Consequências diretas:

- **Carrinho abandonado custa zero.** Dez cobranças abertas não tiram um número da rifa.
- **Pix pago fora do prazo passa a valer.** Como nada ficava preso esperando, não há motivo para recusar — `expirado` deixou de ser estado terminal e o pagamento atrasado é resgatado.
- **`vendidas` deixou de ter contador próprio:** é `cursor − devolvidos`. O mesmo comando atômico que entrega o número já é a contagem, então não existe segunda fonte para divergir. Foi assim que a contagem dupla deixou de ser possível, não por trava.
- **Novo estado `reembolsar`**, o único desfecho ruim que sobrou: o pagamento entrou e a rifa esgotou no intervalo. Tem tela própria para o comprador e fila própria no painel do organizador.

## O que a mudança NÃO resolveu sozinha

Ela troca uma classe de problemas por outra, menor mas real. Duas rodadas de checker sobre a nova arquitetura acharam 18 defeitos, entre eles:

- Compensação que devolvia à rifa números de um pedido já gravado como pago (venda dupla). Ver [[compensacao-cega-cria-venda-dupla]].
- `INCRBY` + `DECRBY` para reservar no contador: janela em que o contador fica inflado e um comprador que cabia é mandado para reembolso; e um `DECRBY` perdido inflava a rifa para sempre. Resolvido com script Lua de compare-and-increment.
- Trava solta com `DEL` cego, apagando a trava de quem assumiu o pedido depois do TTL. Resolvido com crachá + compare-and-del.

## Regra que fica

**O recurso escasso só sai junto com a contrapartida.** Reservar antes de receber cria um estado intermediário que precisa de prazo, vigia, varredura e desempate — e cada um desses é uma chance nova de errar com dinheiro dos outros.

`maxCotasPorCompra × pendentesPorCpf` continua existindo como freio de abuso no gateway, mas **deixou de ser o teto de quanto um CPF trava da rifa** — esse risco não existe mais. A [[Decisões/2026-08-02 - Teto de 50 cotas por compra|decisão do teto de 50]] permanece válida por outro motivo.

## Fontes

- [[Sessões/2026-08-02-1600]]
