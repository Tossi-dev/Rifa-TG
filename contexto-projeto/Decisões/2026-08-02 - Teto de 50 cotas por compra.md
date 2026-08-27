---
tipo: decisao
projeto: Rifa TG
data: 2026-08-02
impacto: medio
resumo: "maxCotasPorCompra baixado de 200 para 50: o produto teto × pendentes é o que um CPF consegue travar da rifa."
tags: [decisao, projeto/rifa-tg, conceito/seguranca]
status: ativo
---

# Teto de 50 cotas por compra

## Contexto

O checker demonstrou que `maxCotasPorCompra: 200` combinado com o teto de 3 pedidos pendentes por CPF permitia **travar a rifa inteira** com uma rajada trivial. Reprodução dele, com 10 requisições simultâneas de um mesmo CPF:

```
{"201":5, "429:Muitos pedidos para este":5}
pendentes desse CPF: 5   (teto declarado: 3)
resumo depois: {"reservadas":1000,"disponiveis":0}
```

Duas causas somadas: `pendentesDoCpf` era leia-depois-age (furava o teto sob concorrência) e, mesmo com o teto funcionando, 200 × 3 = 600 de 1.000 cotas. O site passa a mostrar `disponiveis: 0` e todo comprador real leva 409, em janelas de 30 minutos, repetíveis — e CPF é só dígito verificador, gera-se um novo a cada 10 minutos.

Nenhum centavo em risco e nada contado em dobro: a varredura devolve tudo sozinha. É negação de serviço, não fraude.

## Decisão

Duas correções, ambas aplicadas:

1. **`maxCotasPorCompra: 200 → 50`** em `src/lib/config.ts`. Pacotes ajustados de `1,5,10,20,50,100` para `1,5,10,20,30,50`.
2. **`pendentesDoCpf` atômico**, com o mesmo padrão `ZADD` + `ZRANK` já usado nos freios por IP/CPF. A marca é devolvida ao pagar, ao expirar e em todo caminho de erro (429, 409, 502 do Pix).

Depois: `{"201":3, ...}`, `pendentes: 3`, `reservadas: 150` de 1.000 — a rifa continua vendendo durante o ataque.

## Regra que fica

**O produto `maxCotasPorCompra` × `LIMITES.pendentesPorCpf` é o quanto um único CPF consegue tirar de circulação.** Hoje 50 × 3 = 150 (15%). Se o organizador pedir para vender lotes maiores, baixar `pendentesPorCpf` na mesma proporção — nunca mexer só num dos dois.

## Consequência de produto

O pacote de 100 cotas sumiu da página. Se o cliente quiser vender lote grande, o caminho é atendimento direto pelo WhatsApp, não subir o teto sem compensar.

## Fontes

- Sessão [[Sessões/2026-08-02-0230]] — rodada 3 do checker
