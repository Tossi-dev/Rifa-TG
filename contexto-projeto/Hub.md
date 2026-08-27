---
tipo: projeto-claude
status: ativo
criado: 2026-08-02
ultima_sessao: 2026-08-02
proximo_passo: "Criar o Upstash Redis na Vercel e cadastrar ADMIN_TOKEN; publicar o código novo por `deploy-vercel.bat` (o que está no ar é o modelo antigo e sem banco); depois os dados do cliente em `src/lib/config.ts`."
tags: [projeto, claude, projeto/rifa-tg, cliente/gremio-tg]
---

# Rifa TG

> **Objetivo do projeto:** sales page da rifa do Tiro de Guerra 02-017 (Itararé - SP) com checkout Pix automático — o comprador escolhe a quantidade de cotas, paga o Pix, e o sistema atribui os próximos números disponíveis **na confirmação do pagamento**, entregando-os na tela.

## 🎯 Contexto essencial

_(o que o Claude precisa saber em TODA sessão para não esquecer)_

- **Quem é o cliente:** Tiro de Guerra 02-017, Itararé - SP. Mesmo cliente do [[Projetos/Gremio TG/Hub|Gremio TG]] (PWA da cantina), mas **outro produto** — projeto separado por ter prazo próprio e stack diferente.
- **Por que esse projeto existe:** a rifa é vendida hoje na mão, por atirador. A página tira o intermediário do fluxo de pagamento: Pix automático, confirmação por webhook, número entregue na hora.
- **Prazo duro:** sorteio em **31/10/2026**, pela extração da Loteria Federal da mesma data. Depois disso a página perde a função.
- **Prêmios:** 1º moto elétrica Full Electric FW2 1000W (0km) · 2º diária no Espaço Famma · 3º voucher de R$ 100 na The Best Açaí. Cota a R$ 15,00, 1.000 números.
- **Restrições/regras inegociáveis:** dinheiro de terceiro no fluxo — número duplicado, pagamento confirmado indevidamente ou cota que some depois de paga são falhas graves. CPF é exigido pelo banco para emitir o Pix. Segredos só em `.env`, nunca no código nem no vault.
- **Stack:** Next.js 16 (App Router, `--webpack`) + React 19 + TypeScript estrito + Tailwind 4 + shadcn/ui · Upstash Redis (REST) para a atribuição atômica · Mercado Pago para o Pix · Vercel.
- **Regra de arquitetura (02/08):** número só é atribuído com pagamento confirmado. Não existe reserva, prazo de guarda nem varredura — ver [[Decisões/2026-08-02 - Numero so sai com pagamento confirmado]].
- **Código:** `C:\Dev\Repositorios\Rifa TG` (fora do vault, conforme CLAUDE.md §0).

## ⚠️ Pendências com o cliente (bloqueiam a divulgação)

- **WhatsApp real** do responsável — hoje está o placeholder `(15) 99999-8888` em `src/lib/config.ts`.
- **Total de cotas e preço** confirmados com o organizador (hoje: 1.000 × R$ 15,00).
- **Ficha técnica real da moto** — só o que estava no cartaz foi usado; não achei fonte confiável para a FW2 e não inventei specs.
- **Fotos do Espaço Famma** — hoje é um recorte do cartaz, provisório.
- **Enquadramento legal:** rifa com venda de números exige autorização (SECAP/Ministério da Fazenda) ou enquadramento como ação entre amigos. O rodapé já traz o texto de ação beneficente — o organizador precisa confirmar.

## 📌 Onde parei

![[Onde parei]]

## 🧭 Decisões tomadas

```dataview
TABLE data as "Data", impacto as "Impacto", resumo as "Resumo"
FROM "Projetos/Rifa TG/Decisões"
SORT data DESC
```

## 📚 Sessões

```dataview
TABLE data as "Data", resumo as "Resumo"
FROM "Projetos/Rifa TG/Sessões"
SORT data DESC
LIMIT 10
```

## 📎 Outputs gerados

```dataview
LIST
FROM "Projetos/Rifa TG/Outputs"
SORT file.mtime DESC
```

## 🔗 Links relacionados

- [[Projetos/Gremio TG/Hub|Gremio TG]] — mesmo cliente, outro produto
- [[Conhecimento/erros-e-solucoes/vercel-serverless-mata-background-fire-and-forget|Background em serverless morre]] — por isso a confirmação do Pix é síncrona dentro do handler
- [[Conhecimento/erros-e-solucoes/vercel-env-var-newline-trailing|Env var com \n]] — `baseUrl()` normaliza por causa disso
- [[Conhecimento/erros-e-solucoes/turbopack-onedrive-jest-worker-crash|Turbopack + OneDrive]] — motivo do `--webpack`
- [[../../00_MOC|↩ Voltar ao MOC]]
