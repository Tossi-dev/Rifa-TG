---
tipo: estado
projeto: Rifa TG
atualizado: 2026-08-04
status: "ativo"
saude: "amarelo"
fase: "F4 — site no ar com banco; painel completo. Falta só o Mercado Pago."
proximo_passo: "Obter com o titular da conta do Mercado Pago o MP_ACCESS_TOKEN (produção, começa com APP_USR-) e o MP_WEBHOOK_SECRET, cadastrar na Vercel e publicar. Webhook no evento PAGAMENTOS (topic payment), NUNCA Order."
bloqueio: "Mercado Pago depende de terceiro (o Tossi não tem acesso à conta que recebe). Enquanto isso o Pix é fictício — QR dá 'código inválido' no celular, e isso é esperado."
url_producao: "https://rifa-tg.vercel.app"
repo: "C:\\dev\\Repositorios\\Rifa TG"
deploy: "Vercel projeto `rifa-tg`, scope guilhermes-projects-7de72796 — publicado 03/08 com o código novo, Upstash e ADMIN_TOKEN ativos"
ultima_sessao: "2026-08-04"
---

# 📌 Onde parei

> "Save game" do projeto. Atualizado ao fim de sessões importantes; LER PRIMEIRO ao voltar.

## 🎯 Estado atual

**O site funciona ponta a ponta em produção, menos o dinheiro.** O comprador escolhe a quantidade, preenche os dados, chega no QR Code e o pedido persiste (Upstash cadastrado). O `/admin` abre com o `ADMIN_TOKEN`.

O que falta é uma coisa só: as **credenciais do Mercado Pago**, que dependem do titular da conta que vai receber. Enquanto elas não entram, o site anuncia MODO DEMONSTRAÇÃO e o QR é fictício — apontar o celular nele dá "código inválido", e isso é o comportamento correto, não um defeito.

Modelo: escolher cotas → nome/WhatsApp/CPF → Pix → pagamento confirmado → **aí** os próximos números livres são atribuídos. Ver [[Decisões/2026-08-02 - Numero so sai com pagamento confirmado]].

## ✅ Concluído nesta sessão (03–04/08)

- **Upstash, `ADMIN_TOKEN` e `NEXT_PUBLIC_BASE_URL` cadastrados na Vercel** e deploy publicado com o código novo. O 404 da tela de pagamento acabou.
- **Painel do organizador reconstruído** com as skills `dashboard-mc` e `diagnostico-comercial`: 3 níveis de leitura, 6 KPIs, 6 gráficos (4 tipos distintos), paleta aprovada no validador da skill `dataviz`.
- **Todos os KPIs viraram botões.** Clicar abre a memória de cálculo: a conta, de onde vem o dado, como é calculado, onde conferir por fora, e a comparação. Um número sozinho é afirmação de autoridade; agora dá para auditar em dois segundos.
- **Botão de demonstração.** Liga uma simulação com 52 pedidos e 776 cotas (77,6% do lote) para ver como o painel fica cheio. Faixa tracejada âmbar "SIMULAÇÃO — nenhum destes números é real", CSV bloqueado enquanto estiver ligado, e o teto de 78% impede que a simulação mostre um estado impossível.
- Correções de texto que apareciam com zero vendas: "vendas de **sem vendas registradas**" e "1 **cobranças** geradas".
- 3ª rodada de checker sobre o painel: 13 achados, todos fechados (escala do eixo, estouro no celular, média vitalícia disfarçada de ritmo, KPI desonesto com zero venda, chave duplicada no React).
- **82 testes**, lint, `tsc` e build limpos. Painel renderizado e conferido no Playwright em 4 estados, sem erro no console.

## ✅ Rodada de design (04/08)

- **Tema claro e escuro no `/admin`**, com três estados (claro, escuro, acompanhar o sistema), preferência guardada e script anti-flash no `<head>`. O escuro **não** vaza para a página de venda: a classe é aplicada só quando o caminho começa em `/admin` e é removida ao sair.
- **Gráficos refeitos** com um time de agentes de design (23 achados de direção de arte, uma especificação sintetizada): degradê na área e nas barras, curva suavizada com trava de amplitude, grade com linha do zero própria, guia vertical no cursor, balão de duas linhas seguindo o ponto, rosca com pontas arredondadas e percentual pago no miolo, barra horizontal com trilho e numeral de posição, estado vazio com a moldura do gráfico em vez de laje cinza, entrada animada de 420 ms com `prefers-reduced-motion`.
- **Busca do ganhador corrigida.** Ela consultava o banco real mesmo com a simulação ligada — o painel dizia "776 cotas vendidas" e a busca respondia "não foi vendido". Agora procura dentro da simulação e diz a faixa que existe lá.
- **Teto "1 a 1000" removido** do campo e da API: o lote sobe conforme a meta se aproxima, e um teto fixo envelheceria errado.
- Paleta categórica ganhou os quatro slots (o slot 2 era idêntico ao `--estado-bom` — categoria nasceria pintada de "está bom"); estados ganharam par de TEXTO porque `--estado-bom` dá 3,38:1 no branco e reprovava o AA como letra.
- **91 testes** (novos: curva sem overshoot, base da barra reta, margem do eixo), lint, `tsc` e build limpos, painel fotografado nos dois temas sem erro de console.

## ⏭ Próximo passo concreto

1. **Mercado Pago** — mandar o [[Outputs/mercado-pago-passo-a-passo]] para o titular da conta. Ele gera dois valores: `MP_ACCESS_TOKEN` (produção, `APP_USR-`) e `MP_WEBHOOK_SECRET`. **Combinar por chamada de vídeo com tela compartilhada** — código de acesso não passa por WhatsApp.
2. Cadastrar os dois na Vercel e rodar o `deploy-vercel.bat`. A faixa de demonstração some sozinha.
3. **Compra de verdade, de 1 cota**, e conferir o número no `/admin`. Build verde não prova que o dinheiro entra.
4. **Dados do cliente** em `src/lib/config.ts`: WhatsApp real, ficha técnica da moto, fotos definitivas do Espaço Famma.
5. Decidir **quando abrir o 2º lote** e como comunicar — subir o lote dilui a chance de quem já comprou.

## ⚠ Bloqueios / pendências

- **Mercado Pago depende de terceiro.** O Tossi não tem acesso à conta que recebe; sem o titular, não há como avançar. É o único bloqueio real hoje.
- **Nada rodou contra pagamento real ainda.** Os 82 testes usam o dublê do Upstash.
- **Tradeoff aceito:** se a gravação do pedido pago falhar **e** a releitura também falhar, o sistema prefere não devolver os números (evita venda dupla) e registra conflito para conferência à mão.
- Pastas `_to_delete/` (dentro do repo, vazia) e `_lixo-rifa-tg` (ao lado) — a ponte do Cowork não deleta. Apagar pelo Windows.

## 🧠 Contexto crítico para não esquecer

- **QR "código inválido" hoje é esperado.** É o modo demonstração. Só some com o `MP_ACCESS_TOKEN`.
- **Webhook do Mercado Pago tem que ser o evento "Pagamentos" (topic `payment`), nunca "Order".** Se marcar Order, o dinheiro cai e a tela do comprador nunca confirma — e não dá erro em lugar nenhum.
- **As 1.000 cotas são isca de escassez, não teto.** Perto da meta de R$ 20.000 o lote sobe, com plano novo. `totalCotas` em `src/lib/config.ts` tem três avisos antes da linha.
- **Número só sai com pagamento confirmado.** Propor "reservar por X minutos" reintroduz reserva, prazo, varredura e a classe inteira de bugs que custou 5 rodadas de checker.
- **`vendidas` NÃO tem contador próprio** — é `cursor − LLEN(rifa:livres)`.
- **Nunca devolver número sem reler o pedido antes.** [[compensacao-cega-cria-venda-dupla]].
- **Webhook nunca responde 200 sem ter decidido.** Incerteza é 500. [[incerteza-de-gateway-nao-e-recusa]].
- **Credenciais NUNCA dentro da pasta do projeto** — o deploy sobe a pasta inteira. Vivem em `C:\dev\Repositorios\_credenciais-rifa\`.
- **`--webpack` é obrigatório** em `dev` e `build` — [[turbopack-onedrive-jest-worker-crash]].
- Tudo que o cliente edita no dia a dia está em **um arquivo só**: `src/lib/config.ts`.

## 📅 Última sessão

- **Data:** 2026-08-04
- **Resumo:** Vercel configurada e publicada; painel do organizador com gráficos; KPIs clicáveis com memória de cálculo; botão de simulação. Único bloqueio restante é o Mercado Pago.
