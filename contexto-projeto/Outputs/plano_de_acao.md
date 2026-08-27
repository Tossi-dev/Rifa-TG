# Plano de ação — Rifa do Tiro de Guerra 02-017

**Data:** 02/08/2026 · **Sorteio:** 31/10/2026 (90 dias) · **Meta:** R$ 20.000,00

Ritmo que a meta exige, a partir de hoje e do zero: **14,8 cotas por dia**,
cerca de **R$ 222,00 por dia**, durante os 90 dias.

---

## Esta semana — destravar a venda (sem isso, nada mais importa)

| # | Ação | Onde | Quem |
|---|---|---|---|
| 1 | Criar o banco: Storage → Create Database → Upstash for Redis, conectado ao projeto `rifa-tg` | Painel da Vercel | Tossi |
| 2 | Cadastrar `ADMIN_TOKEN` com senha longa e aleatória, digitada direto no painel | Vercel → Settings → Environment Variables | Tossi |
| 3 | Publicar de novo (`deploy-vercel.bat`) — variável nova só vale no próximo deploy | Máquina do Tossi | Tossi |
| 4 | Comprar 1 cota de teste, pagar, e conferir o número no `/admin` pela busca do ganhador | Site publicado | Tossi |
| 5 | Pedir ao Tiro de Guerra as credenciais de produção do Mercado Pago (`MP_ACCESS_TOKEN` e `MP_WEBHOOK_SECRET`) | WhatsApp com o comando | Tossi |

Enquanto a etapa 5 não fecha, o site continua anunciando que o Pix é fictício —
ou seja, **não dá para divulgar o link**.

## Antes de divulgar — decisões que são do cliente, não do sistema

| # | Decisão | Por quê |
|---|---|---|
| 6 | Definir o gatilho de abertura do 2º lote: em quantos por cento do lote atual? A sugestão é **85%**, com o lote novo já preparado | Se esgotar sem lote novo pronto, a página fica "esgotada" no melhor momento da campanha |
| 7 | Definir se o aumento de lote é comunicado aos compradores anteriores, e como | A chance de cada um cai quando o total sobe; melhor combinar antes de acontecer |
| 8 | Confirmar o enquadramento legal (ação entre amigos ou autorização) com o comando | O rodapé já traz o texto de ação beneficente, mas quem assume isso é o organizador |
| 9 | Preencher os dados reais em `src/lib/config.ts`: WhatsApp do responsável, ficha técnica da moto, fotos definitivas do Espaço Famma | Hoje há placeholder no WhatsApp e recorte de cartaz nas fotos |

## Primeiras duas semanas de venda — o que olhar no painel

| # | Ação | Gatilho no painel |
|---|---|---|
| 10 | Ajustar o horário do disparo no WhatsApp para a janela de maior pagamento | Gráfico "Em que hora do dia as pessoas compram", depois de ~30 vendas |
| 11 | Se o ritmo ficar abaixo do necessário por 5 dias seguidos, aumentar a frequência de divulgação antes de mexer em preço | Indicador "Ritmo de venda (últimos 7 dias)" — é média móvel, então cai de verdade quando a campanha para |
| 12 | Se a faixa de 21 a 50 concentrar a arrecadação, subir os pacotes grandes para o topo dos botões da página; se a concentração for em 1 a 5, o caminho é volume de divulgação | Gráfico "Quais pacotes as pessoas escolhem" (agrupado por faixa) |
| 13 | Se "Cobranças que foram pagas" ficar abaixo de 70%, investigar a tela de pagamento antes de comprar mais tráfego | Indicador de conversão — hoje sem referência, ganha base própria depois de ~50 cobranças. Reembolso conta como pago, então queda aqui é problema de checkout, não de estoque |
| 14 | Zerar a fila "Pagamentos a devolver" no mesmo dia em que aparecer alguém | Cartão "A devolver" — é dinheiro de terceiro parado |

## No dia do sorteio

| # | Ação |
|---|---|
| 15 | Baixar o CSV pelo painel **antes** da extração da Loteria Federal, e guardar |
| 16 | Rodar o número sorteado na busca do ganhador do `/admin` e conferir contra o CSV |
| 17 | Contato com o ganhador pelo WhatsApp cadastrado, e divulgação nas redes do Tiro de Guerra |

---

## O que este plano deliberadamente não traz

Nenhuma ação de "melhorar a conversão", "otimizar a campanha" ou "aumentar o
engajamento". Sem uma única venda registrada, recomendação desse tipo seria
palpite com cara de método. As ações 10 a 14 estão amarradas a um **gatilho
específico no painel** justamente para só entrarem em cena quando houver dado
que as sustente.
