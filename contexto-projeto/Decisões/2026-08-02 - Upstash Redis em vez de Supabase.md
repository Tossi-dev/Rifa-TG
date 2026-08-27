---
tipo: decisao
projeto: Rifa TG
data: 2026-08-02
impacto: alto
resumo: "Reserva de cotas vai para Upstash Redis, não Supabase — exceção consciente ao padrão do vault."
tags: [decisao, projeto/rifa-tg, conceito/arquitetura]
status: ativo
---

# Upstash Redis em vez de Supabase

## Contexto

O padrão de backend da operação é **Supabase** ([[preferencias-guilherme]]). A Rifa TG precisa garantir que dois compradores simultâneos nunca recebam o mesmo número — é o requisito mais duro do projeto, porque envolve dinheiro de terceiro e um sorteio público.

## Decisão

Usar **Upstash Redis (REST)** para a reserva de cotas, o controle de expiração e os freios de abuso. Supabase fica de fora deste projeto.

## Por quê

- A operação inteira se resume a **contadores e conjuntos atômicos**: `INCRBY` para o cursor de números, `LPOP count` para a fila de reciclados, `ZADD`/`ZRANK` para os freios, `SET NX EX` para a trava de confirmação, `ZREM` como posse da reserva. Em Postgres isso viraria transação com `SELECT ... FOR UPDATE` ou RPC — mais peça para manter, sem ganho.
- **A rifa é efêmera:** acaba em 31/10/2026. Não há relatório histórico, não há usuário logado, não há relacionamento entre tabelas. Depois do sorteio, o dado interessa por umas semanas.
- **Supabase free pausa por inatividade** ([[supabase-free-tier-pausa-projeto-idle]]) e exigiria `/api/keepalive` ([[supabase-free-tier-operacional]]). Uma rifa tem picos de divulgação e vales longos — é exatamente o perfil que apanha da pausa.
- O REST do Upstash funciona em serverless sem pool de conexão.

## Consequências

- **Exceção registrada ao padrão do vault.** Projeto novo com necessidade de dado relacional continua indo para Supabase.
- Sem `UPSTASH_REDIS_REST_URL`/`_TOKEN` o app cai num fallback em memória via `globalThis` — bom para demonstração, **inútil em produção** (some a cada deploy). O README avisa.
- A conciliação do organizador é lida do próprio Redis (`GET /api/admin/conciliacao`), com export CSV. Não há painel SQL para recorrer.
- Fica uma dívida honesta: **nada rodou contra Upstash real**. Os 56 testes passam contra um falso com latência artificial que imita a semântica dos comandos usados.

## Alternativa descartada

Supabase com RPC transacional. Descartada pelo custo operacional (keepalive, migrations, tipos gerados) num projeto de 3 meses de vida cujo dado é um contador.

## Fontes

- Sessão [[Sessões/2026-08-02-0230]]
- [[Conhecimento/aprendizados/supabase-free-tier-operacional]]
- [[Conhecimento/erros-e-solucoes/supabase-free-tier-pausa-projeto-idle]]
