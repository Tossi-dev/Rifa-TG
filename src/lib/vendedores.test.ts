/* =========================================================================
 *  Testes do rateio por vendedor.
 *
 *  São 48 pessoas dividindo o crédito da mesma campanha. Erro aqui não
 *  quebra tela nenhuma — dá a venda de uma pessoa para outra, e isso vira
 *  discussão dentro do pelotão.
 * ========================================================================= */

import { describe, expect, it } from "vitest";

import type { Vendedor } from "./store";
import {
  codigoDisponivel,
  codigoDoNome,
  codigoValido,
  linkWhatsApp,
  mensagemDeVenda,
  mensagemParaVendedor,
  nomesDaLista,
  primeiroNome,
  rankingVendedores,
  vendaDireta,
} from "./vendedores";

const vendedor = (codigo: string, nome: string, ativo = true): Vendedor => ({
  codigo,
  nome,
  ativo,
  criadoEm: 0,
});

const pago = (vendedor: string | null, cotas: number) => ({
  vendedor,
  cotas,
  valor: Number((cotas * 15).toFixed(2)),
});

describe("código do vendedor", () => {
  it("tira acento e maiúscula — o link vai ser digitado à mão", () => {
    expect(codigoDoNome("José da Silva Júnior")).toBe("jose-da-silva-junior");
    expect(codigoDoNome("Ana  Paula   Ribeiro")).toBe("ana-paula-ribeiro");
    expect(codigoDoNome("  Márcio Nunes  ")).toBe("marcio-nunes");
  });

  it("não deixa traço sobrando na ponta nem no corte de tamanho", () => {
    /* Um código terminado em traço vira `/v/joao-` — e a primeira pessoa que
       copiar o link sem o traço final cai numa página que não existe. */
    expect(codigoDoNome("João!!!")).toBe("joao");
    const longo = codigoDoNome("a".repeat(31) + " Silva");
    expect(longo.endsWith("-")).toBe(false);
    expect(codigoValido(longo)).toBe(true);
  });

  it("recusa código fora do formato", () => {
    expect(codigoValido("joao-silva")).toBe(true);
    expect(codigoValido("Joao")).toBe(false);
    expect(codigoValido("joao_silva")).toBe(false);
    expect(codigoValido("-joao")).toBe(false);
    expect(codigoValido("joao--silva")).toBe(false);
    expect(codigoValido("a".repeat(40))).toBe(false);
  });

  it("dá códigos diferentes para nomes iguais", () => {
    /* Dois "João Silva" numa turma de 48 é quase certeza. Sem sufixo, o
       segundo cadastro sobrescreveria o primeiro e as vendas de um
       apareceriam no placar do outro. */
    const existentes: string[] = [];
    const a = codigoDisponivel("João Silva", existentes);
    existentes.push(a);
    const b = codigoDisponivel("Joao Silva", existentes);
    existentes.push(b);
    const c = codigoDisponivel("JOÃO SILVA", existentes);

    expect(a).toBe("joao-silva");
    expect(b).toBe("joao-silva-2");
    expect(c).toBe("joao-silva-3");
    expect(new Set([a, b, c]).size).toBe(3);
  });

  it("nome sem nenhuma letra não vira código", () => {
    expect(codigoDisponivel("!!! ???", [])).toBe("");
  });
});

describe("nome no placar público", () => {
  it("mostra primeiro nome e inicial, nunca o sobrenome inteiro", () => {
    expect(primeiroNome("Ana Paula Ribeiro")).toBe("Ana R.");
    expect(primeiroNome("Marcos")).toBe("Marcos");
  });
});

describe("ranking", () => {
  it("soma cotas e valor por vendedor, do maior para o menor", () => {
    const ranking = rankingVendedores(
      [vendedor("ana", "Ana Souza"), vendedor("bruno", "Bruno Lima")],
      [pago("ana", 10), pago("bruno", 3), pago("ana", 7), pago(null, 50)]
    );

    expect(ranking.map((l) => l.codigo)).toEqual(["ana", "bruno"]);
    expect(ranking[0]).toMatchObject({ pedidos: 2, cotas: 17, valor: 255 });
    expect(ranking[1]).toMatchObject({ pedidos: 1, cotas: 3, valor: 45 });
  });

  it("vendedor sem venda aparece com zero, não some da lista", () => {
    const ranking = rankingVendedores(
      [vendedor("ana", "Ana Souza"), vendedor("bruno", "Bruno Lima")],
      [pago("ana", 5)]
    );

    /* Quem não vendeu precisa aparecer: é justamente a informação que o
       organizador usa para cobrar. Uma lista só de quem vendeu esconde o
       problema. */
    expect(ranking).toHaveLength(2);
    expect(ranking[1]).toMatchObject({ codigo: "bruno", cotas: 0, valor: 0 });
  });

  it("venda de vendedor apagado do cadastro não evapora do relatório", () => {
    const ranking = rankingVendedores([vendedor("ana", "Ana Souza")], [
      pago("ana", 4),
      pago("sumiu", 6),
    ]);

    /* Dinheiro que entrou não pode desaparecer da soma porque alguém mexeu no
       cadastro. Aparece com o código no lugar do nome, marcado como inativo. */
    const orfao = ranking.find((l) => l.codigo === "sumiu");
    expect(orfao).toMatchObject({ nome: "sumiu", cotas: 6, ativo: false });
  });

  it("desempate é alfabético, não a ordem em que chegou", () => {
    const ranking = rankingVendedores(
      [vendedor("z", "Zeca"), vendedor("a", "Ana")],
      [pago("z", 5), pago("a", 5)]
    );
    expect(ranking.map((l) => l.nome)).toEqual(["Ana", "Zeca"]);
  });

  it("centavos não derrapam ao somar muitos pedidos", () => {
    const pedidos = Array.from({ length: 30 }, () => ({
      vendedor: "ana",
      cotas: 1,
      valor: 0.1,
    }));
    const [linha] = rankingVendedores([vendedor("ana", "Ana")], pedidos);
    // 0.1 somado 30 vezes em ponto flutuante dá 2.9999999999999996.
    expect(linha.valor).toBe(3);
  });

  it("ranking sem nenhum pedido pago devolve todos zerados", () => {
    const ranking = rankingVendedores([vendedor("ana", "Ana")], []);
    expect(ranking).toEqual([
      { codigo: "ana", nome: "Ana", ativo: true, pedidos: 0, cotas: 0, valor: 0 },
    ]);
  });
});

describe("venda direta", () => {
  it("separa o que entrou sem nenhum vendedor marcado", () => {
    const direta = vendaDireta([pago("ana", 10), pago(null, 4), pago(null, 6)]);
    expect(direta).toEqual({ pedidos: 2, cotas: 10, valor: 150 });
  });

  it("a soma do ranking mais a venda direta fecha com o total pago", () => {
    const pagos = [pago("ana", 10), pago("bruno", 3), pago(null, 7)];
    const ranking = rankingVendedores(
      [vendedor("ana", "Ana"), vendedor("bruno", "Bruno")],
      pagos
    );

    /* A conferência que importa: nenhuma cota pode ficar fora das duas
       colunas, senão o painel some com venda que existiu. */
    const somaRanking = ranking.reduce((s, l) => s + l.cotas, 0);
    const total = pagos.reduce((s, p) => s + p.cotas, 0);
    expect(somaRanking + vendaDireta(pagos).cotas).toBe(total);
  });
});

describe("lista colada", () => {
  it("limpa numeração, marcador e linha em branco", () => {
    /* É assim que a lista chega de verdade: copiada da chamada ou de uma
       mensagem do grupo. Sem a limpeza, o vendedor se chamaria "1. Joao Vitor
       Silva" e o link dele viraria `/v/1-joao-vitor-silva`. */
    const texto = `
      1. Joao Vitor Silva
      2) Ana Paula Ribeiro

      - Marcos Dias
      • Beatriz  Moraes
    `;
    expect(nomesDaLista(texto)).toEqual([
      "Joao Vitor Silva",
      "Ana Paula Ribeiro",
      "Marcos Dias",
      "Beatriz Moraes",
    ]);
  });

  it("descarta repetido mesmo com acento e caixa diferentes", () => {
    /* Colar a mesma pessoa duas vezes criaria um "joao-silva-2" fantasma, que
       nunca venderia nada e ainda apareceria zerado no ranking para sempre. */
    const lista = nomesDaLista("João Silva\njoao silva\nJOAO SILVA\nAna Souza");
    expect(lista).toEqual(["João Silva", "Ana Souza"]);
  });

  it("ignora linha curta demais para ser nome", () => {
    expect(nomesDaLista("Ana Souza\n-\n12\n\nok")).toEqual(["Ana Souza"]);
  });

  it("aceita ponto e vírgula como separador", () => {
    expect(nomesDaLista("Ana Souza; Bruno Lima")).toEqual([
      "Ana Souza",
      "Bruno Lima",
    ]);
  });

  it("não engole número que faz parte do nome", () => {
    // "Joao 2" não é numeração: o corte só vale no começo da linha.
    expect(nomesDaLista("Maria Joao 2 Silva")).toEqual(["Maria Joao 2 Silva"]);
  });
});

describe("mensagens prontas", () => {
  it("a mensagem para o vendedor leva o link do PLACAR, não o de venda", () => {
    const texto = mensagemParaVendedor(
      "Marcos Dias",
      "https://rifa-tg.vercel.app/placar/marcos-dias",
      "Rifa do Tiro de Guerra 02-017"
    );

    /* O placar é o único link que não precisa ser reenviado: o link de venda
       mora dentro dele. Mandar o de venda direto obrigaria o organizador a
       reenviar toda vez que alguém perdesse a mensagem — 48 pessoas, três
       meses de campanha. */
    expect(texto).toContain("/placar/marcos-dias");
    expect(texto).not.toContain("/v/marcos-dias");
    // Trata pelo primeiro nome: "Oi, Marcos Dias!" soa como cobrança.
    expect(texto.startsWith("Oi, Marcos!")).toBe(true);
  });

  it("a mensagem de venda leva preço, prêmio e o link do vendedor", () => {
    const texto = mensagemDeVenda(
      "https://rifa-tg.vercel.app/v/marcos-dias",
      "Rifa do Tiro de Guerra 02-017",
      "Full Electric FW2 1000W",
      "R$ 15,00",
      "31 de outubro de 2026"
    );
    expect(texto).toContain("R$ 15,00");
    expect(texto).toContain("Full Electric FW2 1000W");
    expect(texto).toContain("/v/marcos-dias");
  });

  it("o link do WhatsApp escapa a quebra de linha e o acento", () => {
    const url = linkWhatsApp("Oi, João!\nlink");
    expect(url.startsWith("https://wa.me/?text=")).toBe(true);
    // Sem escapar, a mensagem chega cortada na primeira quebra de linha.
    expect(url).toContain("%0A");
    expect(url).not.toContain("\n");
    expect(decodeURIComponent(url.split("text=")[1])).toBe("Oi, João!\nlink");
  });
});
