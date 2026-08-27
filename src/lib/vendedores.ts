/* =========================================================================
 *  Regras puras dos vendedores.
 *
 *  Separado do banco de propósito: código, nome e link são as partes que
 *  precisam ser testadas com precisão, e testar isso não deveria exigir um
 *  Redis no meio.
 * ========================================================================= */

import type { Vendedor } from "./store";

/** Tamanho máximo do código no link. Curto porque vai por WhatsApp. */
const MAX_CODIGO = 32;

/**
 * Transforma o nome no código que vai aparecer no link.
 *
 * "José da Silva Júnior" vira "jose-da-silva-junior". Sem acento, sem
 * maiúscula e sem espaço, porque o link vai ser digitado à mão por gente que
 * viu ele num story de Instagram — e `%C3%BA` no meio de uma URL é um convite
 * a erro de digitação.
 */
export function codigoDoNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_CODIGO)
    .replace(/-+$/g, "");
}

/** Aceita só o formato que `codigoDoNome` produz. */
export function codigoValido(codigo: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(codigo) && codigo.length <= MAX_CODIGO;
}

/**
 * Código livre dentro da lista, acrescentando sufixo quando repete.
 *
 * Dois "João Silva" numa turma de 48 não é hipótese remota, é quase certeza.
 * Sem isto o segundo cadastro sobrescreveria o primeiro — e as vendas de um
 * apareceriam no placar do outro.
 */
export function codigoDisponivel(
  nome: string,
  existentes: ReadonlyArray<string>
): string {
  const base = codigoDoNome(nome);
  if (!base) return "";
  const usados = new Set(existentes);
  if (!usados.has(base)) return base;
  for (let n = 2; n < 100; n++) {
    const tentativa = `${base}-${n}`.slice(0, MAX_CODIGO).replace(/-+$/g, "");
    if (!usados.has(tentativa)) return tentativa;
  }
  return "";
}

/** Primeiro nome, para placar público não expor o nome completo de ninguém. */
export function primeiroNome(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  if (partes.length === 1) return partes[0];
  // "João S." distingue dois Joões sem entregar o sobrenome inteiro.
  return `${partes[0]} ${partes[partes.length - 1][0].toUpperCase()}.`;
}

export const linkDoVendedor = (base: string, codigo: string): string =>
  `${base.replace(/\/+$/, "")}/v/${codigo}`;

export const linkDoPlacar = (base: string, codigo: string): string =>
  `${base.replace(/\/+$/, "")}/placar/${codigo}`;

/**
 * Limpa uma lista de nomes colada de qualquer lugar.
 *
 * Ninguém digita 48 nomes num formulário, um por um. A lista vem de uma
 * planilha, de um print da chamada ou de uma mensagem do grupo — e vem suja:
 * numeração ("1. João Silva"), marcador ("- João"), linha em branco, espaço
 * duplo e o mesmo nome repetido. Tratar isso aqui é a diferença entre colar e
 * sair conferindo 48 linhas à mão.
 */
export function nomesDaLista(texto: string): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];

  for (const bruto of texto.split(/[\n;]+/)) {
    const limpo = bruto
      // Numeração ou marcador no começo: "1.", "12)", "-", "•", "*".
      .replace(/^\s*(\d{1,3}\s*[.)\-\u2013]\s*|[-\u2013\u2022*]\s+)/, "")
      .replace(/\s+/g, " ")
      .trim();

    if (limpo.length < 3) continue;
    /* A duplicata é conferida pelo CÓDIGO, não pelo texto: "João Silva" e
       "joao silva" são a mesma pessoa colada duas vezes, não dois vendedores
       — e cadastrar os dois criaria um "joao-silva-2" fantasma que nunca
       venderia nada. */
    const chave = codigoDoNome(limpo);
    if (!chave || vistos.has(chave)) continue;
    vistos.add(chave);
    saida.push(limpo);
  }

  return saida;
}

/**
 * Mensagem que o organizador manda para o vendedor.
 *
 * Leva o link do PLACAR, não o de venda. É o link que nunca precisa ser
 * reenviado: lá dentro está o link de venda para copiar, quanto a pessoa já
 * vendeu e a posição dela na turma. Mandar o link de venda direto obrigaria o
 * organizador a reenviar toda vez que alguém perdesse a mensagem — 48 vezes,
 * repetidamente, durante três meses de campanha.
 */
export function mensagemParaVendedor(
  nome: string,
  linkPlacar: string,
  titulo: string
): string {
  const primeiro = nome.trim().split(/\s+/)[0];
  return [
    `Oi, ${primeiro}! Este é o seu painel de vendas da ${titulo}:`,
    "",
    linkPlacar,
    "",
    "Guarde este link. Dentro dele tem o seu link de venda para compartilhar, quantas cotas você já vendeu e como está a turma.",
    "Toda compra feita pelo seu link entra na sua conta automaticamente.",
  ].join("\n");
}

/** Mensagem pronta que o vendedor dispara para os compradores dele. */
export function mensagemDeVenda(
  linkVenda: string,
  titulo: string,
  premio: string,
  preco: string,
  dataSorteio: string
): string {
  return [
    `${titulo} — concorra a uma ${premio} 0km.`,
    "",
    `Cada número custa ${preco} e o sorteio é em ${dataSorteio}.`,
    "O pagamento é por Pix e os números aparecem na hora, na própria tela.",
    "",
    linkVenda,
  ].join("\n");
}

/**
 * Abre o WhatsApp com o texto pronto; quem envia escolhe o contato.
 *
 * Sem número no link de propósito: cadastrar o telefone de 48 pessoas seria
 * mais trabalho do que resolve, e o seletor de contato do próprio WhatsApp já
 * faz isso melhor.
 */
export const linkWhatsApp = (texto: string): string =>
  `https://wa.me/?text=${encodeURIComponent(texto)}`;

/**
 * Soma por vendedor a partir dos pedidos pagos.
 *
 * Repare que NÃO existe contador por vendedor no banco. É a mesma regra do
 * `vendidas = cursor − devolvidos`: um total que se calcula do fato não pode
 * divergir do fato. Um contador paralelo, incrementado no fluxo de pagamento,
 * derraparia no primeiro estorno e ninguém perceberia até alguém reclamar de
 * comissão.
 */
export interface LinhaVendedor {
  codigo: string;
  nome: string;
  ativo: boolean;
  pedidos: number;
  cotas: number;
  valor: number;
}

export function rankingVendedores(
  vendedores: ReadonlyArray<Vendedor>,
  pagos: ReadonlyArray<{ vendedor: string | null; cotas: number; valor: number }>
): LinhaVendedor[] {
  const porCodigo = new Map<string, LinhaVendedor>();
  for (const v of vendedores) {
    porCodigo.set(v.codigo, {
      codigo: v.codigo,
      nome: v.nome,
      ativo: v.ativo,
      pedidos: 0,
      cotas: 0,
      valor: 0,
    });
  }

  for (const pedido of pagos) {
    const codigo = pedido.vendedor;
    if (!codigo) continue;
    /* Venda de um vendedor que foi apagado do cadastro à mão. Aparece com o
       código no lugar do nome, em vez de sumir da soma — dinheiro que entrou
       não pode evaporar do relatório porque um cadastro mudou. */
    const linha =
      porCodigo.get(codigo) ??
      porCodigo
        .set(codigo, {
          codigo,
          nome: codigo,
          ativo: false,
          pedidos: 0,
          cotas: 0,
          valor: 0,
        })
        .get(codigo)!;
    linha.pedidos += 1;
    linha.cotas += pedido.cotas;
    linha.valor = Number((linha.valor + pedido.valor).toFixed(2));
  }

  return [...porCodigo.values()].sort(
    (a, b) => b.cotas - a.cotas || a.nome.localeCompare(b.nome, "pt-BR")
  );
}

/** Cotas e valor que entraram sem nenhum vendedor marcado. */
export function vendaDireta(
  pagos: ReadonlyArray<{ vendedor: string | null; cotas: number; valor: number }>
): { pedidos: number; cotas: number; valor: number } {
  const soltos = pagos.filter((p) => !p.vendedor);
  return {
    pedidos: soltos.length,
    cotas: soltos.reduce((s, p) => s + p.cotas, 0),
    valor: Number(soltos.reduce((s, p) => s + p.valor, 0).toFixed(2)),
  };
}
