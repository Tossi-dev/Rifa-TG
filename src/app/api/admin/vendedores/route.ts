import { NextResponse } from "next/server";

import { barrarSeNaoForAdmin } from "@/lib/admin";
import {
  desativarVendedor,
  listarVendedores,
  reativarVendedor,
  salvarVendedor,
} from "@/lib/store";
import { textoDoCorpo } from "@/lib/validacao";
import { codigoDisponivel, codigoValido, nomesDaLista } from "@/lib/vendedores";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const erro = (mensagem: string, status: number) =>
  NextResponse.json({ erro: mensagem }, { status });

const semCache = { "Cache-Control": "no-store" };

/** Todos os vendedores, ativos e inativos — o painel precisa dos dois. */
export async function GET(req: Request) {
  const recusa = await barrarSeNaoForAdmin(req);
  if (recusa) return recusa;
  return NextResponse.json(
    { vendedores: await listarVendedores() },
    { headers: semCache }
  );
}

/** Teto por chamada: uma turma inteira cabe, um script maluco não. */
const MAX_POR_VEZ = 100;

/**
 * Cadastra um vendedor (`nome`) ou uma turma inteira (`lista`).
 *
 * A lista é o caminho normal: são 48 pessoas, e cadastrar uma por uma no
 * formulário é meia hora de trabalho manual com chance de erro em cada linha.
 */
export async function POST(req: Request) {
  const recusa = await barrarSeNaoForAdmin(req);
  if (recusa) return recusa;

  let corpo: { nome?: unknown; lista?: unknown };
  try {
    corpo = (await req.json()) as { nome?: unknown; lista?: unknown };
  } catch {
    return erro("Requisição inválida.", 400);
  }

  /* A lista NÃO passa por `textoDoCorpo`: aquele helper achata `\s+` em um
     espaço só, e achatar a quebra de linha transformaria os 48 nomes colados
     numa única string gigante — um vendedor só, com o nome de todo mundo. */
  const lista =
    typeof corpo?.lista === "string" ? corpo.lista.slice(0, 8000) : null;
  const nome = textoDoCorpo(corpo?.nome, 60);
  const nomes = lista
    ? nomesDaLista(lista)
    : nomesDaLista(nome ?? "");

  if (nomes.length === 0) {
    return erro("Informe o nome do vendedor (mínimo 3 letras).", 400);
  }
  if (nomes.length > MAX_POR_VEZ) {
    return erro(`Máximo de ${MAX_POR_VEZ} nomes por vez.`, 400);
  }

  /* Os códigos já cadastrados são lidos UMA vez e o acumulador cresce dentro
     do laço. Reler a cada nome não só custaria 48 idas ao banco como abriria
     espaço para dois "João Silva" da mesma colagem receberem o mesmo código. */
  const existentes = (await listarVendedores()).map((v) => v.codigo);
  const criados = [];
  const recusados: string[] = [];

  for (const cru of nomes) {
    const codigo = codigoDisponivel(cru, existentes);
    if (!codigo) {
      recusados.push(cru);
      continue;
    }
    existentes.push(codigo);
    const vendedor = { codigo, nome: cru, ativo: true, criadoEm: Date.now() };
    await salvarVendedor(vendedor);
    criados.push(vendedor);
  }

  if (criados.length === 0) {
    return erro(
      "Não consegui gerar código a partir desses nomes. Use letras e números.",
      400
    );
  }

  return NextResponse.json(
    { vendedores: criados, vendedor: criados[0], recusados },
    { status: 201, headers: semCache }
  );
}

/**
 * Liga e desliga um vendedor.
 *
 * Não existe apagar de propósito: o pedido guarda o código de quem vendeu, e
 * remover o cadastro deixaria as vendas antigas órfãs no ranking.
 */
export async function PATCH(req: Request) {
  const recusa = await barrarSeNaoForAdmin(req);
  if (recusa) return recusa;

  let corpo: { codigo?: unknown; ativo?: unknown };
  try {
    corpo = (await req.json()) as { codigo?: unknown; ativo?: unknown };
  } catch {
    return erro("Requisição inválida.", 400);
  }

  const codigo = textoDoCorpo(corpo?.codigo, 40);
  if (!codigo || !codigoValido(codigo)) return erro("Código inválido.", 400);
  if (typeof corpo?.ativo !== "boolean") return erro("Informe ativo.", 400);

  const ok = corpo.ativo
    ? await reativarVendedor(codigo)
    : await desativarVendedor(codigo);
  if (!ok) return erro("Vendedor não encontrado.", 404);

  return NextResponse.json({ ok: true }, { headers: semCache });
}
