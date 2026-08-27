/* =========================================================================
 *  Visão do organizador: quem pagou, quem está devendo, o que expirou e
 *  quais pagamentos precisam de reembolso.
 *
 *  É por aqui que se confere o caixa e se sorteia.
 * ========================================================================= */

import {
  buscarPedido,
  listarConflitos,
  listarIdsPedidos,
  pedidoDoNumero,
  resumo,
  type Conflito,
  type Pedido,
  type StatusPedido,
} from "./store";

export interface LinhaConciliacao {
  id: string;
  status: StatusPedido;
  nome: string;
  whatsapp: string;
  cotas: number;
  valor: number;
  numeros: number[];
  criadoEm: number;
  pagoEm: number | null;
  idPagamento: string | null;
  /** Código de quem vendeu; `null` quando a compra veio direto pelo site. */
  vendedor: string | null;
}

export interface Conciliacao {
  gerado: number;
  resumo: Awaited<ReturnType<typeof resumo>>;
  totais: {
    pedidos: number;
    pagos: number;
    pendentes: number;
    expirados: number;
    /** Pagamentos recebidos sem cota para entregar (devolver o dinheiro). */
    reembolsar: number;
    conflitos: number;
    valorPago: number;
    cotasPagas: number;
    /** Cotas de cobranças abertas E dentro do prazo. Não seguram nada. */
    cotasAguardando: number;
    valorAReembolsar: number;
  };
  pagos: LinhaConciliacao[];
  pendentes: LinhaConciliacao[];
  expirados: LinhaConciliacao[];
  reembolsar: LinhaConciliacao[];
  conflitos: Conflito[];
}

const linha = (p: Pedido): LinhaConciliacao => ({
  id: p.id,
  status: p.status,
  nome: p.nome,
  whatsapp: p.whatsapp,
  cotas: p.cotas,
  valor: p.valor,
  numeros: p.numeros,
  criadoEm: p.criadoEm,
  pagoEm: p.pagoEm,
  idPagamento: p.idPagamento,
  vendedor: p.vendedor ?? null,
});

const somaValor = (linhas: LinhaConciliacao[]): number =>
  Number(linhas.reduce((soma, p) => soma + p.valor, 0).toFixed(2));

/**
 * Status como o organizador precisa ver.
 *
 * Um pedido só é marcado `expirado` no banco quando alguém abre a tela dele —
 * e quem abandona a compra nunca mais abre. Sem esta correção na leitura, um
 * Pix de dois meses atrás apareceria para sempre como "aguardando pagamento",
 * inflando o painel e escondendo quem de fato ainda pode pagar. O estado é
 * reconstruível pela data, então não precisa de varredura para isso.
 */
const statusReal = (p: Pedido): StatusPedido =>
  p.status === "pendente" && Date.now() > p.expiraEm ? "expirado" : p.status;

/** Quantas leituras simultâneas ao Redis por lote. */
const LOTE = 25;

export async function montarConciliacao(limite = 500): Promise<Conciliacao> {
  const ids = await listarIdsPedidos(limite);

  const pagos: LinhaConciliacao[] = [];
  const pendentes: LinhaConciliacao[] = [];
  const expirados: LinhaConciliacao[] = [];
  const reembolsar: LinhaConciliacao[] = [];

  /* Em lotes, não um a um: 600 pedidos em série são 600 idas ao Upstash em
     sequência — uns 30 segundos, justamente no dia do sorteio, que é quando
     esta tela precisa abrir. */
  for (let i = 0; i < ids.length; i += LOTE) {
    const bloco = await Promise.all(
      ids.slice(i, i + LOTE).map((id) => buscarPedido(id))
    );
    for (const pedido of bloco) {
      if (!pedido) continue;
      const status = statusReal(pedido);
      const registro = { ...linha(pedido), status };
      if (status === "pago") pagos.push(registro);
      else if (status === "pendente") pendentes.push(registro);
      else if (status === "reembolsar") reembolsar.push(registro);
      else expirados.push(registro);
    }
  }

  const conflitos = await listarConflitos();

  return {
    gerado: Date.now(),
    resumo: await resumo(),
    totais: {
      pedidos:
        pagos.length + pendentes.length + expirados.length + reembolsar.length,
      pagos: pagos.length,
      pendentes: pendentes.length,
      expirados: expirados.length,
      reembolsar: reembolsar.length,
      conflitos: conflitos.length,
      valorPago: somaValor(pagos),
      cotasPagas: pagos.reduce((soma, p) => soma + p.cotas, 0),
      cotasAguardando: pendentes.reduce((soma, p) => soma + p.cotas, 0),
      valorAReembolsar: somaValor(reembolsar),
    },
    pagos,
    pendentes,
    expirados,
    reembolsar,
    conflitos,
  };
}

export interface Ganhador {
  numero: number;
  encontrado: boolean;
  pedido: LinhaConciliacao | null;
}

/**
 * Quem ficou com o número sorteado.
 *
 * Só devolve pedido PAGO — `pedidoDoNumero` confere o índice contra o próprio
 * pedido antes de responder, para que nenhuma sobra de estorno vire ganhador.
 */
export async function buscarGanhador(numero: number): Promise<Ganhador> {
  const pedido = await pedidoDoNumero(numero);
  return {
    numero,
    encontrado: Boolean(pedido),
    pedido: pedido ? linha(pedido) : null,
  };
}

/**
 * Escapa um campo do CSV.
 *
 * Além das aspas, neutraliza injeção de fórmula: um nome digitado como
 * `=cmd|'/c calc'!A1` viraria fórmula ao abrir a planilha no Excel/Sheets —
 * e o README manda o organizador abrir exatamente esse arquivo. Campo que
 * começa com `= + - @`, tab ou CR ganha um apóstrofo na frente, que a
 * planilha trata como texto puro.
 */
const escapar = (valor: string | number): string => {
  const texto = String(valor);
  const perigoso = /^[=+\-@\t\r]/.test(texto);
  return `"${(perigoso ? `'${texto}` : texto).replace(/"/g, '""')}"`;
};

const dataBr = (ms: number | null): string =>
  ms ? new Date(ms).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";

/** CSV com tudo que o organizador precisa para conferir e sortear. */
export function conciliacaoEmCsv(dados: Conciliacao): string {
  const cabecalho = [
    "pedido",
    "status",
    "nome",
    "whatsapp",
    "cotas",
    "valor",
    "numeros",
    "criado_em",
    "pago_em",
    "id_pagamento",
    "vendedor",
  ].join(";");

  const linhas = [
    ...dados.pagos,
    ...dados.reembolsar,
    ...dados.pendentes,
    ...dados.expirados,
  ].map((p) =>
    [
      escapar(p.id),
      escapar(p.status),
      escapar(p.nome),
      escapar(p.whatsapp),
      p.cotas,
      escapar(p.valor.toFixed(2).replace(".", ",")),
      escapar(p.numeros.join(" ")),
      escapar(dataBr(p.criadoEm)),
      escapar(dataBr(p.pagoEm)),
      escapar(p.idPagamento ?? ""),
      escapar(p.vendedor ?? ""),
    ].join(";")
  );

  const conflitos = dados.conflitos.map((c) =>
    [
      escapar(c.pedido),
      escapar("conflito"),
      escapar(c.nome),
      escapar(c.whatsapp),
      c.cotas,
      escapar(c.valor.toFixed(2).replace(".", ",")),
      escapar(""),
      escapar(dataBr(c.quando)),
      escapar(""),
      escapar(c.pagamento ?? ""),
      escapar(""),
    ].join(";")
  );

  return [cabecalho, ...linhas, ...conflitos].join("\n");
}
