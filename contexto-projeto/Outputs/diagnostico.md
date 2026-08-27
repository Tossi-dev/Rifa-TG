# Diagnóstico — Rifa do Tiro de Guerra 02-017

**Data:** 02/08/2026 · **Sorteio:** 31/10/2026 (90 dias) · **Meta:** R$ 20.000,00

---

## Antes de tudo: o que este diagnóstico NÃO é

A rifa tem **zero venda registrada** até agora. Não existe dado de comportamento
de comprador, de canal ou de horário — então não há como dizer o que está
funcionando ou o que precisa mudar na oferta. Qualquer afirmação nesse sentido
seria invenção, e o painel foi construído justamente para não produzir esse tipo
de número.

O que segue são três achados **estruturais**, que existem independentemente de
venda e que precisam de decisão antes de a divulgação começar.

---

## Achado 1 — A meta não cabe no lote atual (bloqueante de planejamento)

A meta é R$ 20.000,00. A configuração atual da rifa é 1.000 cotas a R$ 15,00,
que somam **R$ 15.000,00 mesmo vendendo tudo** — 25% abaixo da meta.

Para R$ 20.000,00 são necessárias **1.334 cotas**. Com 90 dias até o sorteio,
isso significa um ritmo de **14,8 cotas por dia**, ou cerca de **R$ 222,00 por
dia**, todos os dias, sem folga.

Isso não é um erro de configuração: a decisão registrada é usar o lote de 1.000
como **alavanca de escassez**, abrindo mais quando estiver perto de esgotar. O
painel foi construído em torno disso — o indicador "Cotas vendidas" mostra o
progresso dentro do lote atual, e um aviso permanente lembra que a meta exige
mais de um lote.

O ponto de atenção é o **momento** de abrir o segundo lote, não a estratégia. Se
o lote esgotar e a página ficar anunciando "esgotado" por alguns dias, esse é o
período de maior interesse da campanha sendo desperdiçado.

## Achado 2 — Zero venda hoje é estado do sistema, não sinal de mercado

O site está publicado, mas **sem banco de dados configurado**. Na prática, quem
preenche o formulário recebe "página não encontrada" na tela de pagamento, e o
Mercado Pago ainda não está conectado — o Pix gerado é fictício.

Ou seja: não existe funil para diagnosticar porque ainda não existe funil. O
primeiro número real do painel só aparece depois de `UPSTASH_REDIS_REST_URL`,
`UPSTASH_REDIS_REST_TOKEN`, `ADMIN_TOKEN` e `MP_ACCESS_TOKEN` estarem cadastrados
e o deploy refeito.

**Nenhuma conclusão comercial deve ser tirada da ausência de vendas até lá.**

## Achado 3 — Aumentar o lote tem três efeitos que precisam ser decididos, não descobertos

A estratégia de abrir mais números é legítima e comum. Mas três consequências
saem de graça e é melhor decidi-las agora, com calma, do que no dia em que o
lote esgotar:

1. **A chance de quem já comprou cai.** Quem comprou quando havia 1.000 números
   concorria a 1 em 1.000. Com 1.400, passa a 1 em 1.400. É a consequência mais
   sensível, porque a página promete "quanto mais números, mais chances" e o
   comprador não tem como saber que o total vai mudar. Vale decidir com o
   comando do Tiro de Guerra se isso é comunicado antes, e como.

2. **A barra de progresso rebasa.** Quem viu "88% vendido" na quinta-feira pode
   ver "63%" na sexta. Como a barra é exatamente o gatilho de urgência da
   página, o efeito colateral é o oposto do pretendido: some a escassez no
   momento em que ela estava trabalhando a favor.

3. **Passar de 9.999 muda a largura do número.** Os comprovantes já emitidos
   mostram quatro dígitos (`0847`); a partir daí sairiam cinco (`10847`). Não
   quebra nada, mas dois comprovantes da mesma rifa ficam com formatos
   diferentes. Abaixo de 9.999 não há esse problema.

Nenhum dos três impede a estratégia. Os três pedem uma decisão explícita.

---

## O que o painel passa a medir quando as vendas começarem

Estes são os indicadores que vão sustentar o próximo diagnóstico — este aqui
não pode respondê-los ainda:

- **Ritmo real contra o ritmo necessário.** É o único indicador que responde
  "vamos chegar?". Tudo o mais é contexto. No painel ele é a média dos
  **últimos 7 dias**, e não a média desde o começo — média vitalícia nunca
  desce depois de um bom início, e uma campanha parada continuaria verde.
- **Mix de pacotes, por faixa.** Se a maior parte da arrecadação vier da faixa
  de 21 a 50 cotas, a página deve dar mais destaque aos pacotes grandes; se
  vier de 1 a 5, o caminho é volume de divulgação, não tamanho de ticket.
- **Hora do dia.** Rifa vendida por WhatsApp concentra pagamento em janelas
  curtas. Saber quais são elas decide o horário do disparo.
- **Cobranças que foram pagas.** Se muita gente gera o Pix e não paga, o
  problema está na tela de pagamento ou na confiança, não no tráfego. Pagamento
  que entrou sem cota disponível conta como pago aqui: é falta de estoque, não
  falha de checkout.

## Ressalva de método

Este documento foi escrito a partir da configuração real do sistema e da meta
informada pelo organizador. Não há planilha de origem nem histórico anterior:
não existe período de comparação. Por isso dois indicadores nascem
declaradamente **sem referência** no painel — conversão e valor médio por
pedido — em vez de ganharem um benchmark inventado. Cada um explica o motivo
no próprio cartão.
